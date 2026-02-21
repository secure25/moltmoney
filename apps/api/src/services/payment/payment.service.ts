import { PrismaClient, Account, Transaction, TxType, TxStatus, AccountStatus } from '@moltmoney/database';
import Decimal from 'decimal.js';
import { isValidAmount, subtract, WebhookEventType } from '@moltmoney/shared';
import { PaymentProvider } from '../../providers/payment-provider.interface';
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
      
      // Calculate today's spending
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // Sum all completed OUTBOUND, INTERNAL, and PAYOUT transactions for today
      const todayTransactions = await this.prisma.transaction.findMany({
        where: {
          fromAccountId: account.id,
          status: TxStatus.COMPLETED,
          type: {
            in: [TxType.OUTBOUND, TxType.INTERNAL, TxType.PAYOUT],
          },
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      });

      const todaySpending = todayTransactions.reduce(
        (sum, tx) => sum.plus(new Decimal(tx.amount.toString())),
        new Decimal(0)
      );

      const projectedSpending = todaySpending.plus(amount);
      
      if (projectedSpending.greaterThan(limit)) {
        violations.push(`Daily limit exceeded: ${projectedSpending.toString()} > ${limit.toString()}`);
        requiresApproval = true;
      }
    }

    // Check blocked categories (Requirement 6.5)
    if (rules.blockedCategories && rules.blockedCategories.length > 0 && merchantCategory) {
      if (rules.blockedCategories.includes(merchantCategory)) {
        violations.push(`Merchant category blocked: ${merchantCategory}`);
        requiresApproval = true;
      }
    }

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

    // Evaluate spending rules (Requirement 5.2, 6.2)
    const ruleEvaluation = await this.evaluateSpendingRules(
      fromAccount,
      amount,
      merchantName,
      merchantCategory
    );

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
    // Use database transaction for atomicity (Requirement 5.7)
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct from sender balance
      const currentBalance = new Decimal(fromAccount.balance.toString());
      const newBalance = subtract(currentBalance, amount);

            await tx.account.update({
        where: { id: fromAccount.id },
        data: { balance: newBalance },
      });

      // For INTERNAL transactions, add to recipient balance (Requirement 5.6)
      
      if (toAccount && txType === TxType.INTERNAL) {
        const recipientBalance = new Decimal(toAccount.balance.toString());
        const newRecipientBalance = recipientBalance.plus(amount);
        await tx.account.update({
          where: { id: toAccount.id },
          data: { balance: newRecipientBalance },
        });
      }

      // For OUTBOUND transactions, authorize with payment provider (Requirement 5.5)
      if (txType === TxType.OUTBOUND && merchantName) {
        const authResponse = await this.paymentProvider.authorizePayment(
          '', // Card number would come from virtual card
          amount,
          merchantName,
          merchantCategory
        );

        if (!authResponse.approved) {
          throw new Error(`Payment declined: ${authResponse.declineReason}`);
        }
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
}
