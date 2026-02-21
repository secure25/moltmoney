import { PrismaClient, Agent, Account, AccountStatus, AccountType, Transaction, TxType, TxStatus } from '@moltmoney/database';
import Decimal from 'decimal.js';
import { add, isValidAmount } from '@moltmoney/shared';
import crypto from 'crypto';
import { WebSocketServer, RealtimeEventType } from '../../websocket';

export interface SpendingRules {
  dailyLimit?: string;
  perTransactionLimit?: string;
  blockedCategories?: string[];
  requireApprovalAbove?: string;
  allowedMerchants?: string[];
}

export class AccountService {
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-cbc';
  private readonly encryptionKey: Buffer;

  constructor(
    private prisma: PrismaClient,
    private wsServer?: WebSocketServer,
    encryptionSecret?: string
  ) {
    // Use same encryption secret as CardService
    const secret = encryptionSecret || process.env.CARD_ENCRYPTION_SECRET || 'development-secret-change-in-production';
    this.encryptionKey = crypto.scryptSync(secret, 'salt', 32);
  }

  /**
   * Encrypt card number using AES-256 (same as CardService)
   */
  private encryptCardNumber(cardNumber: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    
    let encrypted = cipher.update(cardNumber, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Create an agent account atomically (Agent + Account creation)
   * Requirements: 2.1, 2.3, 2.4, 2.5
   */
  async createAgentAccount(
    ownerId: string,
    name: string,
    platform: string
  ): Promise<{ agent: Agent; account: Account; virtualCard?: any }> {
    // Generate API key for the agent
    const apiKey = crypto.randomBytes(32).toString('hex');
    const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Generate account number (format: MOLT-XXXX-XXXX-XXXX)
    const accountNumber = `MOLT-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // Create Agent and Account atomically in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create Agent
      const agent = await tx.agent.create({
        data: {
          name,
          platform,
          apiKey: hashedApiKey,
          ownerId,
        },
      });

      // Create Account linked to Agent with account number
      const account = await tx.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(0),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
          accountNumber,
        },
      });
      
      // Auto-generate a virtual card for the account
      const cardNumber = this.generateCardNumber();
      const encryptedCardNumber = this.encryptCardNumber(cardNumber); // Encrypt before storing
      const cvv = Math.floor(100 + Math.random() * 900).toString();
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 3); // 3 years validity

      const virtualCard = await tx.virtualCard.create({
        data: {
          accountId: account.id,
          cardNumber: encryptedCardNumber, // Store encrypted
          cvv,
          expiryMonth: expiryDate.getMonth() + 1,
          expiryYear: expiryDate.getFullYear(),
          status: 'ACTIVE',
        },
      });

      return { agent, account, virtualCard, plainCardNumber: cardNumber };
    });

    // Return agent with plain API key (only time it's visible)
    return {
      agent: { ...result.agent, apiKey },
      account: result.account,
      virtualCard: {
        id: result.virtualCard.id,
        cardNumber: result.plainCardNumber, // Return plain text card number (only time it's visible)
        cvv: result.virtualCard.cvv,
        expiryMonth: result.virtualCard.expiryMonth,
        expiryYear: result.virtualCard.expiryYear,
        status: result.virtualCard.status,
      },
    };
  }
  
  /**
   * Generate a valid-looking card number (Luhn algorithm)
   */
  private generateCardNumber(): string {
    // MoltMoney BIN: 5555 55 (fake BIN for testing)
    const bin = '555555';
    let cardNumber = bin;
    
    // Generate 9 random digits
    for (let i = 0; i < 9; i++) {
      cardNumber += Math.floor(Math.random() * 10);
    }
    
    // Calculate Luhn check digit
    let sum = 0;
    let isEven = false;
    
    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);
      
      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }
      
      sum += digit;
      isEven = !isEven;
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return cardNumber + checkDigit;
  }

  /**
   * Get account by ID
   * Requirements: 2.6
   */
  async getAccount(accountId: string): Promise<Account> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    return account;
  }

  /**
   * Get account balance
   * Requirements: 4.1
   */
  async getBalance(accountId: string): Promise<Decimal> {
    const account = await this.getAccount(accountId);
    return new Decimal(account.balance.toString());
  }

  /**
   * Update spending rules for an account
   * Requirements: 6.1
   */
  async updateSpendingRules(accountId: string, rules: SpendingRules): Promise<Account> {
    // Verify account exists
    await this.getAccount(accountId);

    // Update spending rules (stored as JSON)
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        spendingRules: rules as any,
      },
    });

    return account;
  }

  /**
   * Freeze an account
   * Requirements: 13.1
   */
  async freezeAccount(accountId: string): Promise<Account> {
    // Verify account exists
    await this.getAccount(accountId);

    // Update status to FROZEN
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.FROZEN,
      },
    });

    return account;
  }

  /**
   * Unfreeze an account
   * Requirements: 13.3
   */
  async unfreezeAccount(accountId: string): Promise<Account> {
    // Verify account exists
    const existingAccount = await this.getAccount(accountId);

    // Only unfreeze if currently frozen
    if (existingAccount.status !== AccountStatus.FROZEN) {
      throw new Error('Account is not frozen');
    }

    // Update status to ACTIVE
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.ACTIVE,
      },
    });

    return account;
  }

  /**
   * Close an account
   * Requirements: 13.4
   */
  async closeAccount(accountId: string): Promise<Account> {
    // Verify account exists
    const existingAccount = await this.getAccount(accountId);

    // Prevent closing accounts with non-zero balance
    const balance = new Decimal(existingAccount.balance.toString());
    if (!balance.isZero()) {
      throw new Error('Cannot close account with non-zero balance');
    }

    // Update status to CLOSED
    const account = await this.prisma.account.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.CLOSED,
      },
    });

    return account;
  }

  /**
   * Fund an account (owner adds money to agent account)
   * Requirements: 3.1, 3.2, 3.5
   */
  async fundAccount(accountId: string, amount: Decimal): Promise<Transaction> {
    // Validate amount is positive and non-zero
    if (!isValidAmount(amount)) {
      throw new Error('Amount must be positive and non-zero');
    }

    // Verify account exists
    const account = await this.getAccount(accountId);

    // Use transaction to ensure atomicity
    const result = await this.prisma.$transaction(async (tx) => {
      // Calculate new balance using Decimal.js
      const currentBalance = new Decimal(account.balance.toString());
      const newBalance = add(currentBalance, amount);

      // Update account balance
      await tx.account.update({
        where: { id: accountId },
        data: {
          balance: newBalance,
        },
      });

      // Create INBOUND transaction with COMPLETED status
      const transaction = await tx.transaction.create({
        data: {
          amount: amount,
          currency: 'USD',
          type: TxType.INBOUND,
          status: TxStatus.COMPLETED,
          description: 'Account funding',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      return transaction;
    });

    // Broadcast balance_updated event via WebSocket (Requirement 16.2, 17.5)
    if (this.wsServer) {
      try {
        await this.wsServer.broadcast(accountId, {
          type: RealtimeEventType.BALANCE_UPDATED,
          data: {
            accountId,
            balance: add(new Decimal(account.balance.toString()), amount).toString(),
            transactionId: result.id,
          },
          timestamp: new Date(),
        });
      } catch (error) {
        // Log WebSocket errors but don't fail the transaction
        console.error('WebSocket broadcast failed:', error);
      }
    }

    return result;
  }
}
