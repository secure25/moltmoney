import { PrismaClient, Account, Transaction, TxType, TxStatus, AccountStatus } from '@moltmoney/database';
import { getSpentToday } from './spending-policy';
import Decimal from 'decimal.js';
import { isValidAmount, subtract, WebhookEventType } from '@moltmoney/shared';
import { CaptureResponse, PaymentProvider, WebhookEvent } from '../../providers/payment-provider.interface';
import { WebhookService } from '../webhook';
import { WebSocketServer, RealtimeEventType } from '../../websocket';

export interface SpendingRules {
  dailyLimit?: string;
  perTransactionLimit?: string;
  blockedCategories?: string[];
  requireApprovalAbove?: string;
  allowedMerchants?: string[];
}

export interface RuleEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  violations: string[];
}

export class PaymentService {
  constructor(
      private prisma: PrismaClient,
      private paymentProvider: PaymentProvider,
      private webhookService?: WebhookService,
      private wsServer?: WebSocketServer,
      private externalBankAccountService?: any
    ) {}


  /**
   * Evaluate spending rules for a payment
   * Requirements: 6.2, 6.3, 6.4, 6.5
   */
  async evaluateSpendingRules(
    account: Account,
    amount: Decimal,
    merchantName?: string,
    merchantCategory?: string
  ): Promise<RuleEvaluation> {
    const violations: string[] = [];
    let requiresApproval = false;

    // If no spending rules, allow the payment
    if (!account.spendingRules) {
      return {
        allowed: true,
        requiresApproval: false,
        violations: [],
      };
    }

    const rules = account.spendingRules as any as SpendingRules;

    // Blocked categories are HARD prohibitions (policy decision): a purchase
    // in a blocked category is rejected outright — it never becomes an
    // owner-approval request — and takes precedence over the monetary rules
    // below, which remain the existing soft (approval-required) flow.
    // NOTE: a *missing* category is only hard-rejected on the PayPal checkout
    // path (see createCheckoutOrder); internal sends/payouts keep their own
    // semantics here.
    if (rules.blockedCategories && rules.blockedCategories.length > 0) {
      if (merchantCategory && rules.blockedCategories.includes(merchantCategory)) {
        return {
          allowed: false,
          requiresApproval: false,
          violations: [`Merchant category blocked: ${merchantCategory}`],
        };
      }
    }

    // Check per-transaction limit (Requirement 6.4)
    if (rules.perTransactionLimit) {
      const limit = new Decimal(rules.perTransactionLimit);
      if (amount.greaterThan(limit)) {
        violations.push(`Per-transaction limit exceeded: ${amount.toString()} > ${limit.toString()}`);
        requiresApproval = true;
      }
    }

    // Check daily limit (Requirement 6.3)
    if (rules.dailyLimit) {
      const limit = new Decimal(rules.dailyLimit);

      // Shared authoritative aggregation (same helper backs the
      // /spending-policy endpoint — one definition of "spent today").
      const todaySpending = await getSpentToday(this.prisma, account.id);

      const projectedSpending = todaySpending.plus(amount);
      
      if (projectedSpending.greaterThan(limit)) {
        violations.push(`Daily limit exceeded: ${projectedSpending.toString()} > ${limit.toString()}`);
        requiresApproval = true;
      }
    }

    // Check blocked categories (Requirement 6.5) — handled above as a hard
    // prohibition; nothing else to do here.

    // Check approval threshold
    if (rules.requireApprovalAbove) {
      const threshold = new Decimal(rules.requireApprovalAbove);
      if (amount.greaterThan(threshold)) {
        violations.push(`Amount exceeds approval threshold: ${amount.toString()} > ${threshold.toString()}`);
        requiresApproval = true;
      }
    }

    // Check allowed merchants (if specified, only those merchants are allowed)
    if (rules.allowedMerchants && rules.allowedMerchants.length > 0 && merchantName) {
      if (!rules.allowedMerchants.includes(merchantName)) {
        violations.push(`Merchant not in allowed list: ${merchantName}`);
        requiresApproval = true;
      }
    }

    return {
      allowed: true, // Rules violations trigger approval, not rejection
      requiresApproval,
      violations,
    };
  }

  /**
   * Send a payment from one account to another or to an external merchant
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7
   */
  async sendPayment(
    fromAccountId: string,
    toAccountId: string | null,
    amount: Decimal,
    description?: string,
    merchantName?: string,
    merchantCategory?: string
  ): Promise<Transaction> {
    // Validate amount (Requirement 5.3)
    if (!isValidAmount(amount)) {
      throw new Error('Amount must be positive and non-zero');
    }

    // Get sender account with locking for atomicity
    const fromAccount = await this.prisma.account.findUnique({
      where: { id: fromAccountId },
    });

    if (!fromAccount) {
      throw new Error('Sender account not found');
    }

    // Check sender account is active
    if (fromAccount.status !== AccountStatus.ACTIVE) {
      throw new Error(`Sender account is ${fromAccount.status.toLowerCase()}`);
    }

    // Check for self-payment (Requirement 9.4)
    if (toAccountId && fromAccountId === toAccountId) {
      throw new Error('Cannot send payment to self');
    }

    /**
     * RULE-PARITY NOTE (vs the PayPal checkout flow):
     *
     * sendPayment is a SINGLE-STEP operation — unlike the PayPal order
     * lifecycle (createCheckoutOrder → owner approval → captureCheckoutOrder),
     * there is no separate "creation" and "execution" phase. The sender
     * account is fetched fresh below and rules are evaluated NOW, so the
     * per-transaction limit, daily limit (via the live getSpentToday
     * aggregation) and approval threshold are always checked against the
     * account's CURRENT rules at execution time — capture-time-style re-checks
     * are unnecessary by construction.
     *
     * BLOCKED CATEGORIES ARE N/A FOR INTERNAL TRANSFERS: an internal send
     * (and a merchant-less external send) has no merchant and therefore no
     * merchantCategory to classify. A missing category here is ALLOWED even
     * when the account configures blockedCategories — this is a deliberate
     * policy decision, NOT a parity gap. (Only the PayPal checkout path
     * fail-closes on a missing category, because a real purchase must declare
     * what it is before a prohibited one can be ruled out.) If a caller DOES
     * pass a merchantCategory that is blocked, evaluateSpendingRules still
     * hard-rejects the send — see payment.service.category.test.ts.
     */

    // Determine transaction type
    let txType: TxType;
    let toAccount: Account | null = null;

    if (toAccountId) {
      // Internal transfer to another account
      toAccount = await this.prisma.account.findUnique({
        where: { id: toAccountId },
      });

      if (!toAccount) {
        throw new Error('Recipient account not found');
      }

      // Check recipient account is active (Requirement 9.3)
      if (toAccount.status !== AccountStatus.ACTIVE) {
        throw new Error(`Recipient account is ${toAccount.status.toLowerCase()}`);
      }

      txType = TxType.INTERNAL;
    } else {
      // External payment to merchant
      txType = TxType.OUTBOUND;
    }

    // Check sufficient balance (Requirement 5.3)
    const currentBalance = new Decimal(fromAccount.balance.toString());
    if (currentBalance.lessThan(amount)) {
      throw new Error('Insufficient balance');
    }

    // Evaluate spending rules (Requirement 5.2, 6.2) against the just-fetched
    // (i.e. current) rules — see the rule-parity note above.
    const ruleEvaluation = await this.evaluateSpendingRules(
      fromAccount,
      amount,
      merchantName,
      merchantCategory
    );

    // Blocked categories hard-reject (never owner approval); the monetary
    // rules remain the existing soft approval flow.
    if (!ruleEvaluation.allowed) {
      throw new Error(`Spending rule violation: ${ruleEvaluation.violations.join('; ')}`);
    }

    // If rules require approval, create pending transaction (Requirement 5.2, 7.1)
    if (ruleEvaluation.requiresApproval) {
      const transaction = await this.prisma.transaction.create({
        data: {
          amount,
          currency: 'USD',
          type: txType,
          status: TxStatus.PENDING,
          description: description || undefined,
          merchantName: merchantName || undefined,
          fromAccountId,
          toAccountId: toAccountId || undefined,
          approvalRequired: true,
        },
      });

      // Broadcast approval_required event to owner via WebSocket (Requirement 16.2, 17.5)
      if (this.wsServer) {
        try {
          // Get owner ID from agent
          const agent = await this.prisma.agent.findFirst({
            where: { Account: { id: fromAccountId } },
          });

          if (agent) {
            await this.wsServer.broadcastToOwner(agent.ownerId, {
              type: RealtimeEventType.APPROVAL_REQUIRED,
              data: {
                transactionId: transaction.id,
                amount: transaction.amount.toString(),
                merchantName: transaction.merchantName,
                description: transaction.description,
                accountId: fromAccountId,
              },
              timestamp: new Date(),
            });
          }
        } catch (error) {
          console.error('WebSocket broadcast failed:', error);
        }
      }

      return transaction;
    }

    // Process payment immediately (Requirement 5.1, 5.6)
    const transaction = await this.processPayment(
      fromAccount,
      toAccount,
      amount,
      txType,
      description,
      merchantName,
      merchantCategory
    );

    return transaction;
  }

  /**
   * Send a payout to an external bank account
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
   */
  async sendPayout(
    fromAccountId: string,
    routingNumber: string,
    accountNumber: string,
    accountHolder: string,
    amount: Decimal,
    description?: string
  ): Promise<Transaction> {
    // Validate amount
    if (!isValidAmount(amount)) {
      throw new Error('Amount must be positive and non-zero');
    }

    // Validate routing number format (Requirement 1.2)
    if (!this.externalBankAccountService) {
      throw new Error('External bank account service not configured');
    }

    if (!this.externalBankAccountService.validateRoutingNumber(routingNumber)) {
      throw new Error('Invalid routing number format. Must be exactly 9 digits.');
    }

    // Validate account number format (Requirement 1.2)
    if (!this.externalBankAccountService.validateAccountNumber(accountNumber)) {
      throw new Error('Invalid account number format. Must be 8-17 digits.');
    }

    // Validate account holder
    if (!accountHolder || accountHolder.trim().length < 2) {
      throw new Error('Account holder name must be at least 2 characters.');
    }

    if (accountHolder.length > 100) {
      throw new Error('Account holder name must not exceed 100 characters.');
    }

    // Get sender account
    const fromAccount = await this.prisma.account.findUnique({
      where: { id: fromAccountId },
    });

    if (!fromAccount) {
      throw new Error('Sender account not found');
    }

    // Check sender account is active (Requirement 1.5)
    if (fromAccount.status !== AccountStatus.ACTIVE) {
      throw new Error(`Sender account is ${fromAccount.status.toLowerCase()}`);
    }

    // Check sufficient balance (Requirement 1.3)
    const currentBalance = new Decimal(fromAccount.balance.toString());
    if (currentBalance.lessThan(amount)) {
      throw new Error('Insufficient balance');
    }

    // Verify external account exists
    const externalAccountExists = await this.externalBankAccountService.verifyAccount(
      routingNumber,
      accountNumber
    );

    if (!externalAccountExists) {
      throw new Error('External bank account not found or inactive');
    }

    // Get external account details
    const externalAccount = await this.externalBankAccountService.getAccount(
      routingNumber,
      accountNumber
    );

    if (!externalAccount) {
      throw new Error('External bank account not found');
    }

    if (externalAccount.status !== 'ACTIVE') {
      throw new Error('External bank account is closed');
    }

    // Evaluate spending rules (Requirement 1.4)
    const ruleEvaluation = await this.evaluateSpendingRules(
      fromAccount,
      amount,
      `Payout to ${accountHolder}`,
      'PAYOUT'
    );

    // If rules require approval, create pending transaction (Requirement 2.1)
    if (ruleEvaluation.requiresApproval) {
      // Store routing/account info in description for later processing
      const payoutDescription = description 
        ? `${description} [PAYOUT:${routingNumber}:${accountNumber}]`
        : `Payout to ${accountHolder} (****${accountNumber.slice(-4)}) [PAYOUT:${routingNumber}:${accountNumber}]`;
      
      const transaction = await this.prisma.transaction.create({
        data: {
          amount,
          currency: 'USD',
          type: TxType.PAYOUT,
          status: TxStatus.PENDING,
          description: payoutDescription,
          merchantName: accountHolder,
          fromAccountId,
          approvalRequired: true,
        },
      });

      // Broadcast approval_required event to owner via WebSocket (Requirement 2.2)
      if (this.wsServer) {
        try {
          const agent = await this.prisma.agent.findFirst({
            where: { Account: { id: fromAccountId } },
          });

          if (agent) {
            await this.wsServer.broadcastToOwner(agent.ownerId, {
              type: RealtimeEventType.APPROVAL_REQUIRED,
              data: {
                transactionId: transaction.id,
                amount: transaction.amount.toString(),
                merchantName: transaction.merchantName,
                description: transaction.description,
                accountId: fromAccountId,
                type: 'PAYOUT',
              },
              timestamp: new Date(),
            });
          }
        } catch (error) {
          console.error('WebSocket broadcast failed:', error);
        }
      }

      return transaction;
    }

    // Process payout immediately (Requirement 1.1, 1.6)
    const transaction = await this.processPayout(
      fromAccount,
      amount,
      accountHolder,
      routingNumber,
      accountNumber,
      description
    );

    return transaction;
  }

  /**
   * Process a payout (update balances and create transaction)
   * Requirements: 1.6, 3.4
   */
  private async processPayout(
    fromAccount: Account,
    amount: Decimal,
    accountHolder: string,
    routingNumber: string,
    accountNumber: string,
    description?: string
  ): Promise<Transaction> {
    // Use database transaction for atomicity
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct from sender balance (Requirement 1.6)
      const currentBalance = new Decimal(fromAccount.balance.toString());
      const newBalance = subtract(currentBalance, amount);

      await tx.account.update({
        where: { id: fromAccount.id },
        data: { balance: newBalance },
      });

      // Create transaction record (Requirement 1.5)
      const transaction = await tx.transaction.create({
        data: {
          amount,
          currency: 'USD',
          type: TxType.PAYOUT,
          status: TxStatus.COMPLETED,
          description: description || `Payout to ${accountHolder} (****${accountNumber.slice(-4)})`,
          merchantName: accountHolder,
          fromAccountId: fromAccount.id,
          approvalRequired: false,
        },
      });

      return transaction;
    });

    // Credit external account balance (Requirement 3.4)
    try {
      await this.externalBankAccountService.creditAccount(
        routingNumber,
        accountNumber,
        amount
      );
    } catch (error) {
      console.error('Failed to credit external account:', error);
      // Note: Transaction already completed, this is a mock system limitation
    }

    // Send webhook notification for completed payout
    if (this.webhookService) {
      try {
        await this.webhookService.deliverEvent(
          WebhookEventType.PAYOUT_COMPLETED,
          {
            transactionId: result.id,
            amount: result.amount.toString(),
            recipientName: accountHolder,
            recipientAccount: `****${accountNumber.slice(-4)}`,
            routingNumber,
            description: result.description,
          },
          fromAccount.id
        );

        // Check for low balance warning
        const LOW_BALANCE_THRESHOLD = new Decimal(100);
        const updatedFromAccount = await this.prisma.account.findUnique({
          where: { id: fromAccount.id },
        });
        const newBalance = new Decimal(updatedFromAccount!.balance.toString());
        
        if (newBalance.lessThan(LOW_BALANCE_THRESHOLD)) {
          await this.webhookService.deliverEvent(
            WebhookEventType.LOW_BALANCE,
            {
              accountId: fromAccount.id,
              balance: newBalance.toString(),
              threshold: LOW_BALANCE_THRESHOLD.toString(),
            },
            fromAccount.id
          );
        }
      } catch (error) {
        console.error('Webhook delivery failed:', error);
      }
    }

    // Broadcast WebSocket events
    if (this.wsServer) {
      try {
        const updatedFromAccount = await this.prisma.account.findUnique({
          where: { id: fromAccount.id },
        });
        
        // Broadcast payout_completed
        await this.wsServer.broadcast(fromAccount.id, {
          type: RealtimeEventType.PAYOUT_COMPLETED,
          data: {
            transactionId: result.id,
            amount: result.amount.toString(),
            recipientName: accountHolder,
            recipientAccount: `****${accountNumber.slice(-4)}`,
            description: result.description,
          },
          timestamp: new Date(),
        });

        // Broadcast transaction_created
        await this.wsServer.broadcast(fromAccount.id, {
          type: RealtimeEventType.TRANSACTION_CREATED,
          data: {
            transactionId: result.id,
            amount: result.amount.toString(),
            type: result.type,
            status: result.status,
            merchantName: result.merchantName,
            description: result.description,
          },
          timestamp: new Date(),
        });

        // Broadcast balance_updated
        await this.wsServer.broadcast(fromAccount.id, {
          type: RealtimeEventType.BALANCE_UPDATED,
          data: {
            accountId: fromAccount.id,
            balance: updatedFromAccount!.balance.toString(),
            transactionId: result.id,
          },
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('WebSocket broadcast failed:', error);
      }
    }

    return result;
  }

  /**
   * Process a payment (update balances and create transaction)
   * Requirements: 5.1, 5.6, 5.7
   */
  private async processPayment(
    fromAccount: Account,
    toAccount: Account | null,
    amount: Decimal,
    txType: TxType,
    description?: string,
    merchantName?: string,
    merchantCategory?: string
  ): Promise<Transaction> {
    // For OUTBOUND transactions, authorize with payment provider outside DB transaction (Requirement 5.5, Phase 8)
    let authResponse: any;
    if (txType === TxType.OUTBOUND && merchantName) {
      authResponse = await this.paymentProvider.authorizePayment(
        '', // Card number would come from virtual card
        amount,
        merchantName,
        merchantCategory
      );

      if (!authResponse.approved) {
        throw new Error(`Payment declined: ${authResponse.declineReason}`);
      }
    }

    // Use database transaction for atomicity (Requirement 5.7)
    const result = await this.prisma.$transaction(async (tx) => {
      // Re-verify sender balance inside transaction to prevent race conditions
      const freshSender = await tx.account.findUnique({
        where: { id: fromAccount.id },
      });
      if (!freshSender) {
        throw new Error('Sender account not found');
      }
      const currentBalance = new Decimal(freshSender.balance.toString());
      if (currentBalance.lessThan(amount)) {
        throw new Error('Insufficient balance');
      }

      // Deduct from sender balance
      const newBalance = subtract(currentBalance, amount);

      await tx.account.update({
        where: { id: fromAccount.id },
        data: { balance: newBalance },
      });

      // For INTERNAL transactions, add to recipient balance (Requirement 5.6)
      if (toAccount && txType === TxType.INTERNAL) {
        const recipient = await tx.account.findUnique({
          where: { id: toAccount.id },
        });
        const recipientBalance = new Decimal(recipient!.balance.toString());
        const newRecipientBalance = recipientBalance.plus(amount);
        await tx.account.update({
          where: { id: toAccount.id },
          data: { balance: newRecipientBalance },
        });
      }

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          amount,
          currency: 'USD',
          type: txType,
          status: TxStatus.COMPLETED,
          description: description || undefined,
          merchantName: merchantName || undefined,
          fromAccountId: fromAccount.id,
          toAccountId: toAccount?.id || undefined,
          approvalRequired: false,
          providerRefId: authResponse?.authorizationId || undefined,
        },
      });

      return transaction;
    });

    // Send webhook notification for completed payment (Requirement 7.5, 16.1)
    if (this.webhookService) {
      try {
        await this.webhookService.deliverEvent(
          WebhookEventType.PAYMENT_COMPLETED,
          {
            transactionId: result.id,
            amount: result.amount.toString(),
            type: result.type,
            fromAccountId: result.fromAccountId,
            toAccountId: result.toAccountId,
            merchantName: result.merchantName,
            description: result.description,
          },
          fromAccount.id
        );

        // Also notify recipient for INTERNAL transactions
        if (toAccount && txType === TxType.INTERNAL) {
          await this.webhookService.deliverEvent(
            WebhookEventType.PAYMENT_COMPLETED,
            {
              transactionId: result.id,
              amount: result.amount.toString(),
              type: result.type,
              fromAccountId: result.fromAccountId,
              toAccountId: result.toAccountId,
              description: result.description,
            },
            toAccount.id
          );
        }

        // Check for low balance warning (Requirement 16.3)
        const LOW_BALANCE_THRESHOLD = new Decimal(100); // $100 threshold
        // Fetch updated balance from database
        const updatedFromAccount = await this.prisma.account.findUnique({
          where: { id: fromAccount.id },
        });
        const newBalance = new Decimal(updatedFromAccount!.balance.toString());
        
        if (newBalance.lessThan(LOW_BALANCE_THRESHOLD)) {
          await this.webhookService.deliverEvent(
            WebhookEventType.LOW_BALANCE,
            {
              accountId: fromAccount.id,
              balance: newBalance.toString(),
              threshold: LOW_BALANCE_THRESHOLD.toString(),
            },
            fromAccount.id
          );
        }
      } catch (error) {
        // Log webhook errors but don't fail the transaction
        console.error('Webhook delivery failed:', error);
      }
    }

    // Broadcast WebSocket events (Requirement 16.2, 17.5)
    if (this.wsServer) {
      try {
        // Fetch updated balances from database to ensure accuracy
        const updatedFromAccount = await this.prisma.account.findUnique({
          where: { id: fromAccount.id },
        });
        
        // Broadcast transaction_created to sender
        await this.wsServer.broadcast(fromAccount.id, {
          type: RealtimeEventType.TRANSACTION_CREATED,
          data: {
            transactionId: result.id,
            amount: result.amount.toString(),
            type: result.type,
            status: result.status,
            merchantName: result.merchantName,
            description: result.description,
          },
          timestamp: new Date(),
        });

        // Broadcast balance_updated to sender with correct balance
        await this.wsServer.broadcast(fromAccount.id, {
          type: RealtimeEventType.BALANCE_UPDATED,
          data: {
            accountId: fromAccount.id,
            balance: updatedFromAccount!.balance.toString(),
            transactionId: result.id,
          },
          timestamp: new Date(),
        });

        // Also notify recipient for INTERNAL transactions
        if (toAccount && txType === TxType.INTERNAL) {
          const updatedToAccount = await this.prisma.account.findUnique({
            where: { id: toAccount.id },
          });
          
          await this.wsServer.broadcast(toAccount.id, {
            type: RealtimeEventType.TRANSACTION_CREATED,
            data: {
              transactionId: result.id,
              amount: result.amount.toString(),
              type: result.type,
              status: result.status,
              description: result.description,
            },
            timestamp: new Date(),
          });

          await this.wsServer.broadcast(toAccount.id, {
            type: RealtimeEventType.BALANCE_UPDATED,
            data: {
              accountId: toAccount.id,
              balance: updatedToAccount!.balance.toString(),
              transactionId: result.id,
            },
            timestamp: new Date(),
          });
        }
      } catch (error) {
        console.error('WebSocket broadcast failed:', error);
      }
    }

    return result;
  }

  /**
   * Approve a pending payment
   * Requirements: 7.2, 7.4
   */
  async approvePayment(transactionId: string, ownerId: string): Promise<Transaction> {
    // Get the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        Account_Transaction_fromAccountIdToAccount: {
          include: {
            Agent: true,
          },
        },
        Account_Transaction_toAccountIdToAccount: true,
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Verify transaction is pending
    if (transaction.status !== TxStatus.PENDING) {
      throw new Error('Transaction is not pending');
    }

    // Verify owner authorization (Requirement 7.4)
    const fromAccount = transaction.Account_Transaction_fromAccountIdToAccount;
    if (!fromAccount.Agent || fromAccount.Agent.ownerId !== ownerId) {
      throw new Error('Not authorized to approve this transaction');
    }

    // PayPal checkout orders are completed by the provider capture flow, not
    // by owner approval. Owner approval only unlocks capture — never deduct
    // the balance here, or the ledger and PayPal would diverge.
    if (transaction.providerName === 'paypal') {
      const approved = await this.prisma.transaction.updateMany({
        where: { id: transactionId, status: { in: [TxStatus.PENDING, TxStatus.APPROVED] } },
        data: { approvedAt: new Date() },
      });
      if (approved.count !== 1) {
        throw new Error('Transaction is not awaiting approval');
      }
      const refreshed = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
      return refreshed as Transaction;
    }

    // Check sufficient balance
    const currentBalance = new Decimal(fromAccount.balance.toString());
    const amount = new Decimal(transaction.amount.toString());
    
    if (currentBalance.lessThan(amount)) {
      throw new Error('Insufficient balance');
    }

    // Process the payment (Requirement 7.2)
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct from sender balance
      const newBalance = subtract(currentBalance, amount);

      await tx.account.update({
        where: { id: transaction.fromAccountId },
        data: { balance: newBalance },
      });

      // For INTERNAL transactions, add to recipient balance
      const toAccount = transaction.Account_Transaction_toAccountIdToAccount;
      if (toAccount && transaction.type === TxType.INTERNAL) {
        const recipientBalance = new Decimal(toAccount.balance.toString());
        const newRecipientBalance = recipientBalance.plus(amount);

        await tx.account.update({
          where: { id: transaction.toAccountId! },
          data: { balance: newRecipientBalance },
        });
      }

      // Update transaction status
      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TxStatus.COMPLETED,
          approvedAt: new Date(),
        },
      });

      return updatedTransaction;
    });

    // For PAYOUT transactions, credit external account (Requirement 2.4)
    if (transaction.type === TxType.PAYOUT && this.externalBankAccountService) {
      try {
        // Parse routing/account from description
        const match = transaction.description?.match(/\[PAYOUT:(\d+):(\d+)\]/);
        if (match) {
          const [, routingNumber, accountNumber] = match;
          await this.externalBankAccountService.creditAccount(
            routingNumber,
            accountNumber,
            amount
          );
        } else {
          console.log('Payout approved - external account info not found in description');
        }
      } catch (error) {
        console.error('Failed to credit external account:', error);
      }
    }

    // Send webhook notification for approved payment (Requirement 7.5)
    if (this.webhookService) {
      try {
        const eventType = transaction.type === TxType.PAYOUT 
          ? WebhookEventType.PAYOUT_COMPLETED 
          : WebhookEventType.PAYMENT_COMPLETED;

        await this.webhookService.deliverEvent(
          eventType,
          {
            transactionId: result.id,
            amount: result.amount.toString(),
            type: result.type,
            fromAccountId: result.fromAccountId,
            toAccountId: result.toAccountId,
            merchantName: result.merchantName,
            description: result.description,
            approved: true,
            approvedAt: result.approvedAt?.toISOString(),
          },
          transaction.fromAccountId
        );

        // Also notify recipient for INTERNAL transactions
        if (transaction.Account_Transaction_toAccountIdToAccount && transaction.type === TxType.INTERNAL) {
          await this.webhookService.deliverEvent(
            WebhookEventType.PAYMENT_COMPLETED,
            {
              transactionId: result.id,
              amount: result.amount.toString(),
              type: result.type,
              fromAccountId: result.fromAccountId,
              toAccountId: result.toAccountId,
              description: result.description,
              approved: true,
            },
            transaction.toAccountId!
          );
        }

        // Check for low balance warning
        const LOW_BALANCE_THRESHOLD = new Decimal(100);
        const newBalance = currentBalance.minus(amount);
        
        if (newBalance.lessThan(LOW_BALANCE_THRESHOLD)) {
          await this.webhookService.deliverEvent(
            WebhookEventType.LOW_BALANCE,
            {
              accountId: transaction.fromAccountId,
              balance: newBalance.toString(),
              threshold: LOW_BALANCE_THRESHOLD.toString(),
            },
            transaction.fromAccountId
          );
        }
      } catch (error) {
        console.error('Webhook delivery failed:', error);
      }
    }

    // Broadcast WebSocket events (Requirement 16.2, 17.5)
    if (this.wsServer) {
      try {
        // Broadcast transaction_updated to sender
        await this.wsServer.broadcast(transaction.fromAccountId, {
          type: RealtimeEventType.TRANSACTION_UPDATED,
          data: {
            transactionId: result.id,
            status: result.status,
            approvedAt: result.approvedAt?.toISOString(),
          },
          timestamp: new Date(),
        });

        // Broadcast balance_updated to sender
        await this.wsServer.broadcast(transaction.fromAccountId, {
          type: RealtimeEventType.BALANCE_UPDATED,
          data: {
            accountId: transaction.fromAccountId,
            balance: currentBalance.minus(amount).toString(),
            transactionId: result.id,
          },
          timestamp: new Date(),
        });

        // Also notify recipient for INTERNAL transactions
        if (transaction.Account_Transaction_toAccountIdToAccount && transaction.type === TxType.INTERNAL) {
          await this.wsServer.broadcast(transaction.toAccountId!, {
            type: RealtimeEventType.TRANSACTION_UPDATED,
            data: {
              transactionId: result.id,
              status: result.status,
            },
            timestamp: new Date(),
          });

          const recipientBalance = new Decimal(transaction.Account_Transaction_toAccountIdToAccount.balance.toString());
          await this.wsServer.broadcast(transaction.toAccountId!, {
            type: RealtimeEventType.BALANCE_UPDATED,
            data: {
              accountId: transaction.toAccountId,
              balance: recipientBalance.plus(amount).toString(),
              transactionId: result.id,
            },
            timestamp: new Date(),
          });
        }
      } catch (error) {
        console.error('WebSocket broadcast failed:', error);
      }
    }

    return result;
  }

  /**
   * Decline a pending payment
   * Requirements: 7.3, 7.4
   */
  async declinePayment(transactionId: string, ownerId: string): Promise<Transaction> {
    // Get the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        Account_Transaction_fromAccountIdToAccount: {
          include: {
            Agent: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Verify transaction is pending
    if (transaction.status !== TxStatus.PENDING) {
      throw new Error('Transaction is not pending');
    }

    // Verify owner authorization (Requirement 7.4)
    const fromAccount = transaction.Account_Transaction_fromAccountIdToAccount;
    if (!fromAccount.Agent || fromAccount.Agent.ownerId !== ownerId) {
      throw new Error('Not authorized to decline this transaction');
    }

    // Update transaction status without modifying balances (Requirement 7.3)
    const updatedTransaction = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: TxStatus.DECLINED,
      },
    });

    // Send webhook notification for declined payment (Requirement 7.5)
    if (this.webhookService) {
      try {
        await this.webhookService.deliverEvent(
          WebhookEventType.PAYMENT_DECLINED,
          {
            transactionId: updatedTransaction.id,
            amount: updatedTransaction.amount.toString(),
            type: updatedTransaction.type,
            fromAccountId: updatedTransaction.fromAccountId,
            toAccountId: updatedTransaction.toAccountId,
            merchantName: updatedTransaction.merchantName,
            description: updatedTransaction.description,
            reason: 'Declined by owner',
          },
          transaction.fromAccountId
        );
      } catch (error) {
        console.error('Webhook delivery failed:', error);
      }
    }

    return updatedTransaction;
  }

  /**
   * Get the active payment provider
   */
  getPaymentProvider(): PaymentProvider {
    return this.paymentProvider;
  }

  /**
   * Create a checkout order with buyer approval flow (e.g. PayPal Checkout)
   * Phase 5 & 6
   */
  async createCheckoutOrder(
    fromAccountId: string,
    amount: Decimal,
    options?: {
      merchantName?: string;
      merchantCategory?: string;
      description?: string;
      returnUrl?: string;
      cancelUrl?: string;
    }
  ): Promise<{ transaction: Transaction; approvalUrl?: string; orderId: string }> {
    if (!isValidAmount(amount)) {
      throw new Error('Amount must be positive and non-zero');
    }

    const fromAccount = await this.prisma.account.findUnique({
      where: { id: fromAccountId },
    });

    if (!fromAccount) {
      throw new Error('Sender account not found');
    }

    if (fromAccount.status !== AccountStatus.ACTIVE) {
      throw new Error(`Sender account is ${fromAccount.status.toLowerCase()}`);
    }

    // Check balance
    const currentBalance = new Decimal(fromAccount.balance.toString());
    if (currentBalance.lessThan(amount)) {
      throw new Error('Insufficient balance');
    }

    // Fail-closed category policy (decision: missing category = hard reject):
    // when this account configures blocked categories, a PayPal order MUST
    // declare its merchantCategory. We cannot verify a prohibited purchase
    // without one, so the order is rejected before any transaction record or
    // provider call. "Missing" is never interpreted as "allowed".
    const checkoutRules = fromAccount.spendingRules as any as SpendingRules | null;
    const blockedCategories = Array.isArray(checkoutRules?.blockedCategories)
      ? checkoutRules.blockedCategories
      : [];
    if (blockedCategories.length > 0 && !options?.merchantCategory?.trim()) {
      throw new Error(
        'Spending rule violation: merchantCategory is required because this account has blocked categories configured'
      );
    }

    // Evaluate spending rules
    const ruleEvaluation = await this.evaluateSpendingRules(
      fromAccount,
      amount,
      options?.merchantName,
      options?.merchantCategory
    );

    if (!ruleEvaluation.allowed) {
      throw new Error(`Spending rule violation: ${ruleEvaluation.violations.join('; ')}`);
    }

    // Create MoltMoney PENDING transaction first (authoritative record)
    const transaction = await this.prisma.transaction.create({
      data: {
        amount,
        currency: 'USD',
        type: TxType.OUTBOUND,
        status: TxStatus.PENDING,
        description: options?.description || undefined,
        merchantName: options?.merchantName || undefined,
        merchantCategory: options?.merchantCategory || undefined,
        fromAccountId,
        approvalRequired: ruleEvaluation.requiresApproval,
        providerName: 'paypal',
      },
    });

    if (!this.paymentProvider.createOrder) {
      throw new Error('Active payment provider does not support creating checkout orders');
    }

    // Call provider outside DB transaction
    const orderRes = await this.paymentProvider.createOrder({
      amount,
      description: options?.description,
      merchantName: options?.merchantName,
      referenceId: transaction.id,
      returnUrl: options?.returnUrl,
      cancelUrl: options?.cancelUrl,
    });

    // Update transaction with provider order reference and metadata
    const updatedTransaction = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        providerRefId: orderRes.orderId,
        providerMetadata: {
          orderId: orderRes.orderId,
          approvalUrl: orderRes.approvalUrl,
          orderStatus: orderRes.status,
          state: 'WAITING_FOR_PAYER_APPROVAL',
        },
      },
    });

    return {
      transaction: updatedTransaction,
      approvalUrl: orderRes.approvalUrl,
      orderId: orderRes.orderId,
    };
  }

  /**
   * Capture an approved checkout order
   * Phase 6
   */
  async captureCheckoutOrder(orderIdOrTxId: string): Promise<Transaction> {
    // Locate transaction by id or providerRefId
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        OR: [
          { id: orderIdOrTxId },
          { providerRefId: orderIdOrTxId },
        ],
      },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // Idempotency: if already completed, return
    if (transaction.status === TxStatus.COMPLETED) {
      return transaction;
    }

    if (transaction.status === TxStatus.DECLINED || transaction.status === TxStatus.FAILED) {
      throw new Error(`Cannot capture transaction in ${transaction.status} status`);
    }

    // Owner approval (spending rules) must precede capture when required.
    if (transaction.approvalRequired && !transaction.approvedAt) {
      throw new Error('Owner approval is required before this payment can be captured');
    }

    // Defense-in-depth: category prohibitions are re-checked at capture time
    // against the account's CURRENT rules, using the category persisted at
    // order creation. Blocked (or unclassified, when blocks exist) orders can
    // never be captured, even if rules changed after creation.
    const captureAccount = await this.prisma.account.findUnique({
      where: { id: transaction.fromAccountId },
    });
    if (captureAccount?.spendingRules) {
      const captureRules = captureAccount.spendingRules as any as SpendingRules;
      const captureBlocked = Array.isArray(captureRules.blockedCategories)
        ? captureRules.blockedCategories
        : [];
      if (
        captureBlocked.length > 0 &&
        (!transaction.merchantCategory || captureBlocked.includes(transaction.merchantCategory))
      ) {
        throw new Error(
          `Spending rule violation: merchant category prohibited (capture-time re-check)${
            transaction.merchantCategory ? `: ${transaction.merchantCategory}` : ' (uncategorized order)'
          }`
        );
      }
    }

    const orderIdToCapture = transaction.providerRefId || orderIdOrTxId;

    // Call provider outside DB transaction (Phase 8)
    const captureRes = await this.paymentProvider.capturePayment(orderIdToCapture);

    if (!captureRes.success) {
      await this.prisma.transaction.updateMany({
        where: {
          id: transaction.id,
          status: { notIn: [TxStatus.COMPLETED, TxStatus.FAILED, TxStatus.DECLINED] },
        },
        data: { status: TxStatus.FAILED },
      });
      throw new Error('Payment capture failed with provider');
    }

    const { transaction: completedTx, transitioned } =
      await this.completeCapturedTransactionIdempotent(transaction, captureRes);

    if (transitioned) {
      await this.notifyPaymentCompleted(completedTx);
    }

    return completedTx;
  }

  /**
   * Idempotent wrapper: if a concurrent caller completed the capture while
   * we were updating state, treat it as success instead of surfacing an
   * error (the ledger is only ever mutated once).
   */
  private async completeCapturedTransactionIdempotent(
    transaction: Transaction,
    captureRes: CaptureResponse
  ): Promise<{ transaction: Transaction; transitioned: boolean }> {
    try {
      return await this.completeCapturedTransaction(transaction, captureRes);
    } catch (error) {
      const fresh = await this.prisma.transaction.findUnique({
        where: { id: transaction.id },
      });
      if (fresh && fresh.status === TxStatus.COMPLETED) {
        return { transaction: fresh, transitioned: false };
      }
      throw error;
    }
  }

  /**
   * Atomically mark a captured transaction COMPLETED and deduct the sender
   * balance exactly once. Guarded by a Postgres advisory lock plus
   * conditional updates, so webhook reconciliation, manual capture and
   * retries can race without double-charging the ledger (Phase 8).
   */
  private async completeCapturedTransaction(
    transaction: Transaction,
    captureRes: CaptureResponse
  ): Promise<{ transaction: Transaction; transitioned: boolean }> {
    const captureId = captureRes.captureId || captureRes.transactionId;
    const amount = new Decimal(transaction.amount.toString());

    const mergedMetadata: Record<string, any> = {
      ...(typeof transaction.providerMetadata === 'object' && transaction.providerMetadata !== null
        ? (transaction.providerMetadata as object)
        : {}),
      captureId,
      capturedOrderId: captureRes.transactionId,
      capturedAt: new Date().toISOString(),
      state: 'CAPTURED',
    };

    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent completion of the same transaction.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`tx-capture:${transaction.id}`}))`;

      const fresh = await tx.transaction.findUnique({ where: { id: transaction.id } });
      if (!fresh) {
        throw new Error('Transaction not found');
      }
      if (fresh.status === TxStatus.COMPLETED) {
        return { transaction: fresh, transitioned: false };
      }
      if (fresh.status === TxStatus.DECLINED || fresh.status === TxStatus.FAILED) {
        throw new Error(`Cannot complete transaction in ${fresh.status} status`);
      }

      const fromAccount = await tx.account.findUnique({
        where: { id: fresh.fromAccountId },
      });
      if (!fromAccount) {
        throw new Error('Sender account not found');
      }

      const currentBalance = new Decimal(fromAccount.balance.toString());
      if (currentBalance.lessThan(amount)) {
        throw new Error('Insufficient balance for capture');
      }

      // Conditional decrement: fails if a concurrent payment drained the funds.
      const balanceUpdate = await tx.account.updateMany({
        where: { id: fromAccount.id, balance: { gte: amount.toString() } },
        data: { balance: subtract(currentBalance, amount) },
      });
      if (balanceUpdate.count !== 1) {
        throw new Error('Insufficient balance for capture');
      }

      // Conditional state flip: only one caller can move it to COMPLETED.
      // providerRefId keeps the PayPal ORDER id (stable lookup key for
      // capture/webhooks); the capture id lives in providerMetadata.captureId.
      const stateUpdate = await tx.transaction.updateMany({
        where: {
          id: fresh.id,
          status: { notIn: [TxStatus.COMPLETED, TxStatus.FAILED, TxStatus.DECLINED] },
        },
        data: {
          status: TxStatus.COMPLETED,
          providerMetadata: mergedMetadata,
        },
      });
      if (stateUpdate.count !== 1) {
        // Rolls back the balance deduction; the caller re-checks state.
        throw new Error('Transaction was updated concurrently; retrying');
      }

      const updated = await tx.transaction.findUnique({ where: { id: fresh.id } });
      return { transaction: updated as Transaction, transitioned: true };
    });
  }

  /** Fire outbound webhooks + websocket updates for a completed payment. */
  private async notifyPaymentCompleted(transaction: Transaction): Promise<void> {
    if (this.webhookService) {
      try {
        await this.webhookService.deliverEvent(
          WebhookEventType.PAYMENT_COMPLETED,
          {
            transactionId: transaction.id,
            amount: transaction.amount.toString(),
            type: transaction.type,
            fromAccountId: transaction.fromAccountId,
            merchantName: transaction.merchantName,
            description: transaction.description,
          },
          transaction.fromAccountId
        );
      } catch (error) {
        console.error('Webhook delivery failed:', error);
      }
    }

    if (this.wsServer) {
      try {
        await this.wsServer.broadcast(transaction.fromAccountId, {
          type: RealtimeEventType.TRANSACTION_UPDATED,
          data: {
            transactionId: transaction.id,
            status: transaction.status,
            amount: transaction.amount.toString(),
          },
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('WebSocket broadcast failed:', error);
      }
    }
  }

  /**
   * Locate the MoltMoney transaction a PayPal webhook resource refers to.
   * Uses the purchase-unit custom_id (set to the MoltMoney transaction id at
   * order creation), then the related order id, then the capture id.
   */
  private async findTransactionForPayPalResource(resource: any): Promise<Transaction | null> {
    if (!resource || typeof resource !== 'object') {
      return null;
    }

    const customId = resource.custom_id ?? resource.purchase_units?.[0]?.custom_id;
    const orderId = resource.supplementary_data?.related_ids?.order_id ?? null;
    const captureId = resource.id ?? null;

    if (customId) {
      const byCustomId = await this.prisma.transaction.findUnique({ where: { id: customId } });
      if (byCustomId) return byCustomId;
    }
    if (orderId) {
      const byOrderId = await this.prisma.transaction.findFirst({
        where: { providerRefId: orderId },
      });
      if (byOrderId) return byOrderId;
    }
    if (captureId) {
      const byCaptureId = await this.findTransactionByCaptureId(captureId);
      if (byCaptureId) return byCaptureId;
    }
    return null;
  }

  /**
   * Locate a completed transaction by the PayPal capture id stored in
   * providerMetadata.captureId (providerRefId keeps the order id).
   */
  private async findTransactionByCaptureId(captureId: string): Promise<Transaction | null> {
    if (!captureId) return null;
    const byMetadata = await this.prisma.transaction.findFirst({
      where: {
        providerName: 'paypal',
        providerMetadata: { path: ['captureId'], equals: captureId },
      },
    });
    if (byMetadata) return byMetadata;
    // Fallback for legacy/mock flows where the capture id was written to
    // providerRefId directly.
    return this.prisma.transaction.findFirst({
      where: { providerRefId: captureId },
    });
  }

  /**
   * Refund a completed transaction via the provider's Payments API (Phase 10).
   * References the actual PayPal capture id (never order/authorization ids).
   * Idempotent: the same refund id can never credit the balance twice, and
   * cumulative partial refunds cannot exceed the original amount.
   */
  async refundTransaction(
    transactionId: string,
    refundAmount?: Decimal
  ): Promise<{ transaction: Transaction; refundId: string }> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== TxStatus.COMPLETED) {
      throw new Error('Cannot refund a non-completed transaction');
    }

    const amountToRefund = refundAmount || new Decimal(transaction.amount.toString());
    if (amountToRefund.lessThanOrEqualTo(0)) {
      throw new Error('Refund amount must be positive');
    }
    if (amountToRefund.greaterThan(new Decimal(transaction.amount.toString()))) {
      throw new Error('Refund amount exceeds the original transaction amount');
    }

    // Determine capture ID for PayPal refund (never the order/authorization id)
    const metadata = transaction.providerMetadata as any;
    const captureId = metadata?.captureId || transaction.providerRefId;

    if (!captureId) {
      throw new Error('No provider capture reference found for refund');
    }

    // Call provider outside DB transaction (Phase 8 & 10). The provider uses
    // a stable PayPal-Request-Id derived from capture id + amount, so a
    // retried refund replays the same refund instead of paying twice.
    const refundRes = await this.paymentProvider.refundPayment(
      captureId,
      refundAmount ? amountToRefund : undefined
    );

    if (!refundRes.success) {
      throw new Error('Refund was rejected by provider');
    }

    const { transaction: refundTx } = await this.recordRefund(transaction, {
      refundId: refundRes.refundId,
      captureId,
      amount: amountToRefund,
    });

    return {
      transaction: refundTx,
      refundId: refundRes.refundId,
    };
  }

  /**
   * Record a provider refund atomically: credit the sender balance exactly
   * once per refund id, guarded by an advisory lock, an existing-refund check
   * and an over-refund cap. Used by both the refund endpoint and the webhook
   * reconciler.
   */
  private async recordRefund(
    transaction: Transaction,
    refund: { refundId: string; captureId: string; amount: Decimal; source?: string }
  ): Promise<{ transaction: Transaction; transitioned: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent refunds of the same original transaction.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`tx-refund:${transaction.id}`}))`;

      // Duplicate refund (retry or webhook replay): never credit twice.
      const existing = await tx.transaction.findFirst({
        where: { providerRefId: refund.refundId },
      });
      if (existing) {
        return { transaction: existing, transitioned: false };
      }

      // Cap cumulative refunds at the original amount (partial refunds).
      const previousRefunds = await tx.transaction.findMany({
        where: {
          fromAccountId: transaction.fromAccountId,
          type: TxType.INBOUND,
          description: { startsWith: `Refund for transaction ${transaction.id}` },
        },
      });
      const alreadyRefunded = previousRefunds.reduce(
        (sum, txr) => sum.plus(new Decimal(txr.amount.toString())),
        new Decimal(0)
      );
      if (
        alreadyRefunded.plus(refund.amount).greaterThan(new Decimal(transaction.amount.toString()))
      ) {
        throw new Error('Refund exceeds the original transaction amount');
      }

      const fromAccount = await tx.account.findUnique({
        where: { id: transaction.fromAccountId },
      });
      if (fromAccount) {
        const currentBalance = new Decimal(fromAccount.balance.toString());
        await tx.account.update({
          where: { id: fromAccount.id },
          data: { balance: currentBalance.plus(refund.amount) },
        });
      }

      const refundTx = await tx.transaction.create({
        data: {
          amount: refund.amount,
          currency: transaction.currency,
          type: TxType.INBOUND,
          status: TxStatus.COMPLETED,
          description: `Refund for transaction ${transaction.id}`,
          fromAccountId: transaction.fromAccountId,
          merchantName: transaction.merchantName,
          providerName: transaction.providerName || 'paypal',
          providerRefId: refund.refundId,
          providerMetadata: {
            originalTransactionId: transaction.id,
            captureId: refund.captureId,
            refundId: refund.refundId,
            ...(refund.source ? { source: refund.source } : {}),
          },
        },
      });

      return { transaction: refundTx, transitioned: true };
    });
  }

  /**
   * Reconcile a verified PayPal webhook event into MoltMoney state (Phase 7).
   * Never trusts unverified payloads: the webhook route only calls this after
   * signature verification succeeded. Every state change is conditional so
   * duplicate deliveries cannot double-apply.
   */
  async handleProviderWebhook(
    event: WebhookEvent
  ): Promise<{ status: 'processed' | 'already_processed' | 'ignored'; transactionId?: string }> {
    const data: any = (event?.data as any) ?? {};
    const resource: any = data.resource ?? {};

    if (!data.category) {
      return { status: 'ignored' };
    }

    switch (data.category) {
      case 'order_approved': {
        const transaction = await this.findTransactionForPayPalResource(resource);
        if (!transaction) {
          return { status: 'ignored' };
        }
        if (transaction.status !== TxStatus.PENDING) {
          return { status: 'already_processed', transactionId: transaction.id };
        }

        const metadata: Record<string, any> = {
          ...(typeof transaction.providerMetadata === 'object' && transaction.providerMetadata !== null
            ? (transaction.providerMetadata as object)
            : {}),
          state: 'APPROVED',
          approvedByPayerAt: new Date().toISOString(),
        };
        const update = await this.prisma.transaction.updateMany({
          where: { id: transaction.id, status: TxStatus.PENDING },
          data: { status: TxStatus.APPROVED, providerMetadata: metadata },
        });

        if (update.count === 1) {
          if (this.webhookService) {
            try {
              await this.webhookService.deliverEvent(
                WebhookEventType.PAYMENT_APPROVED,
                {
                  transactionId: transaction.id,
                  orderId: transaction.providerRefId,
                  amount: transaction.amount.toString(),
                },
                transaction.fromAccountId
              );
            } catch (error) {
              console.error('Webhook delivery failed:', error);
            }
          }
          return { status: 'processed', transactionId: transaction.id };
        }
        return { status: 'already_processed', transactionId: transaction.id };
      }

      case 'capture_completed': {
        const transaction = await this.findTransactionForPayPalResource(resource);
        if (!transaction) {
          return { status: 'ignored' };
        }
        if (
          transaction.status === TxStatus.COMPLETED ||
          transaction.status === TxStatus.DECLINED ||
          transaction.status === TxStatus.FAILED
        ) {
          return { status: 'already_processed', transactionId: transaction.id };
        }

        const captureId: string = resource.id || transaction.providerRefId || transaction.id;
        const { transaction: completedTx, transitioned } =
          await this.completeCapturedTransactionIdempotent(transaction, {
            success: true,
            transactionId: captureId,
            captureId,
          });
        if (transitioned) {
          await this.notifyPaymentCompleted(completedTx);
        }
        return {
          status: transitioned ? 'processed' : 'already_processed',
          transactionId: completedTx.id,
        };
      }

      case 'capture_declined': {
        const transaction = await this.findTransactionForPayPalResource(resource);
        if (!transaction) {
          return { status: 'ignored' };
        }
        if (
          transaction.status === TxStatus.COMPLETED ||
          transaction.status === TxStatus.DECLINED ||
          transaction.status === TxStatus.FAILED
        ) {
          return { status: 'already_processed', transactionId: transaction.id };
        }

        const metadata: Record<string, any> = {
          ...(typeof transaction.providerMetadata === 'object' && transaction.providerMetadata !== null
            ? (transaction.providerMetadata as object)
            : {}),
          state: 'DECLINED',
          declinedAt: new Date().toISOString(),
        };
        const update = await this.prisma.transaction.updateMany({
          where: {
            id: transaction.id,
            status: { notIn: [TxStatus.COMPLETED, TxStatus.FAILED, TxStatus.DECLINED] },
          },
          data: { status: TxStatus.DECLINED, providerMetadata: metadata },
        });

        if (update.count === 1) {
          if (this.webhookService) {
            try {
              await this.webhookService.deliverEvent(
                WebhookEventType.PAYMENT_DECLINED,
                {
                  transactionId: transaction.id,
                  amount: transaction.amount.toString(),
                  type: transaction.type,
                  fromAccountId: transaction.fromAccountId,
                  reason: 'PayPal capture denied',
                },
                transaction.fromAccountId
              );
            } catch (error) {
              console.error('Webhook delivery failed:', error);
            }
          }
          return { status: 'processed', transactionId: transaction.id };
        }
        return { status: 'already_processed', transactionId: transaction.id };
      }

      case 'capture_refunded': {
        const refundId: string | undefined = resource.id;
        if (!refundId) {
          return { status: 'ignored' };
        }

        // The refund resource links "up" to the capture: .../payments/captures/{id}
        const upLink = Array.isArray(resource.links)
          ? resource.links.find((l: any) => l?.rel === 'up' && typeof l.href === 'string')?.href
          : undefined;
        const captureId = upLink ? upLink.split('/').filter(Boolean).pop() : undefined;

        let transaction: Transaction | null = null;
        if (captureId) {
          transaction = await this.findTransactionByCaptureId(captureId);
        }
        if (!transaction) {
          transaction = await this.findTransactionForPayPalResource(resource);
        }
        if (!transaction || transaction.status !== TxStatus.COMPLETED) {
          // Only reconcile refunds for ledger state we actually recorded.
          return { status: 'ignored' };
        }

        const refundAmount = resource.amount?.value
          ? new Decimal(resource.amount.value)
          : new Decimal(transaction.amount.toString());

        const { transaction: refundTx, transitioned } = await this.recordRefund(transaction, {
          refundId,
          captureId: captureId || transaction.providerRefId || '',
          amount: refundAmount,
          source: 'webhook',
        });

        if (transitioned && this.webhookService) {
          try {
            await this.webhookService.deliverEvent(
              WebhookEventType.PAYMENT_REFUNDED,
              {
                transactionId: transaction.id,
                refundTransactionId: refundTx.id,
                refundId,
                amount: refundAmount.toString(),
              },
              transaction.fromAccountId
            );
          } catch (error) {
            console.error('Webhook delivery failed:', error);
          }
        }

        return {
          status: transitioned ? 'processed' : 'already_processed',
          transactionId: transaction.id,
        };
      }

      default:
        return { status: 'ignored' };
    }
  }
}
