import { PrismaClient } from '@moltmoney/database';
import Decimal from 'decimal.js';
import crypto from 'crypto';

/**
 * External Bank Account type (matches Prisma model)
 */
export interface ExternalBankAccount {
  id: string;
  routingNumber: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
  balance: Decimal;
  status: string;
  createdAt: Date;
}

/**
 * External Bank Account Service
 * Manages mock external bank accounts for payout testing
 */
export class ExternalBankAccountService {
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-cbc';
  private readonly encryptionKey: Buffer;

  constructor(
    private prisma: PrismaClient,
    encryptionSecret: string
  ) {
    // Derive a 32-byte key from the secret for AES-256
    this.encryptionKey = crypto.scryptSync(encryptionSecret, 'salt', 32);
  }

  /**
   * Encrypt account number using AES-256
   */
  private encryptAccountNumber(accountNumber: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    
    let encrypted = cipher.update(accountNumber, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted data
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt account number
   */
  private decryptAccountNumber(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Validate routing number format (9 digits)
   */
  validateRoutingNumber(routingNumber: string): boolean {
    const routingRegex = /^[0-9]{9}$/;
    return routingRegex.test(routingNumber);
  }

  /**
   * Validate account number format (8-17 digits)
   */
  validateAccountNumber(accountNumber: string): boolean {
    const accountRegex = /^[0-9]{8,17}$/;
    return accountRegex.test(accountNumber);
  }

  /**
   * Create a mock external bank account
   * Requirements: 3.1
   */
  async createMockAccount(
    routingNumber: string,
    accountNumber: string,
    accountHolder: string,
    accountType: 'CHECKING' | 'SAVINGS',
    initialBalance: Decimal = new Decimal(0)
  ): Promise<ExternalBankAccount> {
    // Validate inputs
    if (!this.validateRoutingNumber(routingNumber)) {
      throw new Error('Invalid routing number format. Must be exactly 9 digits.');
    }

    if (!this.validateAccountNumber(accountNumber)) {
      throw new Error('Invalid account number format. Must be 8-17 digits.');
    }

    if (!accountHolder || accountHolder.trim().length < 2) {
      throw new Error('Account holder name must be at least 2 characters.');
    }

    if (accountHolder.length > 100) {
      throw new Error('Account holder name must not exceed 100 characters.');
    }

    if (initialBalance.lessThan(0)) {
      throw new Error('Initial balance cannot be negative.');
    }

    // Encrypt account number before storing
    const encryptedAccountNumber = this.encryptAccountNumber(accountNumber);

    // Create external bank account
    const account = await this.prisma.externalBankAccount.create({
      data: {
        id: crypto.randomUUID(),
        routingNumber,
        accountNumber: encryptedAccountNumber,
        accountHolder: accountHolder.trim(),
        accountType,
        balance: initialBalance,
        status: 'ACTIVE',
      },
    });

    // Return account with decrypted number
    return {
      ...account,
      accountNumber,
    };
  }

  /**
   * Verify if an external bank account exists
   * Requirements: 3.2
   */
  async verifyAccount(
    routingNumber: string,
    accountNumber: string
  ): Promise<boolean> {
    // Validate inputs
    if (!this.validateRoutingNumber(routingNumber)) {
      return false;
    }

    if (!this.validateAccountNumber(accountNumber)) {
      return false;
    }

    // Find all accounts with matching routing number
    const accounts = await this.prisma.externalBankAccount.findMany({
      where: { routingNumber },
    });

    // Check if any account matches the decrypted account number
    for (const account of accounts) {
      try {
        const decryptedNumber = this.decryptAccountNumber(account.accountNumber);
        if (decryptedNumber === accountNumber && account.status === 'ACTIVE') {
          return true;
        }
      } catch {
        // Skip accounts that fail to decrypt
        continue;
      }
    }

    return false;
  }

  /**
   * Get external bank account details
   * Requirements: 3.3
   */
  async getAccount(
    routingNumber: string,
    accountNumber: string
  ): Promise<ExternalBankAccount | null> {
    // Validate inputs
    if (!this.validateRoutingNumber(routingNumber)) {
      throw new Error('Invalid routing number format.');
    }

    if (!this.validateAccountNumber(accountNumber)) {
      throw new Error('Invalid account number format.');
    }

    // Find all accounts with matching routing number
    const accounts = await this.prisma.externalBankAccount.findMany({
      where: { routingNumber },
    });

    // Find account with matching decrypted account number
    for (const account of accounts) {
      try {
        const decryptedNumber = this.decryptAccountNumber(account.accountNumber);
        if (decryptedNumber === accountNumber) {
          return {
            ...account,
            accountNumber: decryptedNumber,
          };
        }
      } catch {
        // Skip accounts that fail to decrypt
        continue;
      }
    }

    return null;
  }

  /**
   * Credit an external bank account (update balance)
   * Requirements: 3.4
   */
  async creditAccount(
    routingNumber: string,
    accountNumber: string,
    amount: Decimal
  ): Promise<void> {
    if (amount.lessThanOrEqualTo(0)) {
      throw new Error('Credit amount must be positive.');
    }

    // Get the account
    const account = await this.getAccount(routingNumber, accountNumber);

    if (!account) {
      throw new Error('External bank account not found.');
    }

    if (account.status !== 'ACTIVE') {
      throw new Error('Cannot credit inactive account.');
    }

    // Update balance
    const newBalance = new Decimal(account.balance.toString()).plus(amount);

    await this.prisma.externalBankAccount.update({
      where: { id: account.id },
      data: {
        balance: newBalance,
      },
    });
  }

  /**
   * List all external bank accounts
   * Requirements: 3.1
   */
  async listAccounts(): Promise<ExternalBankAccount[]> {
    const accounts = await this.prisma.externalBankAccount.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Decrypt account numbers for response
    return accounts.map((account) => {
      try {
        const decryptedNumber = this.decryptAccountNumber(account.accountNumber);
        return {
          ...account,
          accountNumber: decryptedNumber,
        };
      } catch {
        // If decryption fails, return with masked number
        return {
          ...account,
          accountNumber: '****' + account.accountNumber.slice(-4),
        };
      }
    });
  }
}
