import { PrismaClient, VirtualCard, CardStatus, Account, AccountStatus } from '@moltmoney/database';
import Decimal from 'decimal.js';
import crypto from 'crypto';
import { WebhookEventType } from '@moltmoney/shared';
import { CardIssuingProvider } from '../../providers/payment-provider.interface';
import { SpendingRules } from '../account/account.service';
import { WebhookService } from '../webhook';

/**
 * Result of card payment authorization
 */
export interface AuthorizationResult {
  approved: boolean;
  reason?: string;
  transactionId?: string;
}

/**
 * Card service for managing virtual cards
 * Requirements: 11.1, 11.2, 11.4, 11.5, 11.6
 */
export class CardService {
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-cbc';
  private readonly encryptionKey: Buffer;

  constructor(
    private prisma: PrismaClient,
    private paymentProvider: CardIssuingProvider,
    encryptionSecret: string,
    private webhookService?: WebhookService
  ) {
    // Derive a 32-byte key from the secret for AES-256
    this.encryptionKey = crypto.scryptSync(encryptionSecret, 'salt', 32);
  }

  /**
   * Encrypt card number using AES-256
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
   * Decrypt card number
   */
  private decryptCardNumber(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, this.encryptionKey, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Issue a virtual card for an account
   * Requirements: 11.1, 11.2
   */
  async issueCard(accountId: string, spendLimit?: Decimal): Promise<VirtualCard> {
    // Verify account exists and is active
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    if (account.status !== AccountStatus.ACTIVE) {
      throw new Error('Cannot issue card for inactive account');
    }

    // Delegate to payment provider to generate card details
    const cardDetails = await this.paymentProvider.issueVirtualCard(accountId);

    // Encrypt card number before storing
    const encryptedCardNumber = this.encryptCardNumber(cardDetails.cardNumber);

    // Create virtual card record
    const card = await this.prisma.virtualCard.create({
      data: {
        cardNumber: encryptedCardNumber,
        expiryMonth: cardDetails.expiryMonth,
        expiryYear: cardDetails.expiryYear,
        cvv: cardDetails.cvv,
        status: CardStatus.ACTIVE,
        spendLimit: spendLimit || null,
        accountId,
      },
    });

    // Send webhook notification for card issuance (Requirement 15.4)
    if (this.webhookService) {
      try {
        await this.webhookService.deliverEvent(
          WebhookEventType.CARD_ISSUED,
          {
            cardId: card.id,
            accountId: card.accountId,
            last4: cardDetails.cardNumber.slice(-4),
            expiryMonth: card.expiryMonth,
            expiryYear: card.expiryYear,
            spendLimit: card.spendLimit?.toString(),
          },
          accountId
        );
      } catch (error) {
        console.error('Webhook delivery failed:', error);
      }
    }

    // Return card with decrypted number (only time full details are visible)
    return {
      ...card,
      cardNumber: cardDetails.cardNumber,
    };
  }

  /**
   * List all virtual cards for an account (excludes CVV)
   * Requirements: 11.2
   */
  async listCards(accountId: string): Promise<Omit<VirtualCard, 'cvv'>[]> {
    const cards = await this.prisma.virtualCard.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });

    // Decrypt card numbers and exclude CVV
    return cards.map((card) => {
      const { cvv, ...cardWithoutCvv } = card;
      return {
        ...cardWithoutCvv,
        cardNumber: this.decryptCardNumber(card.cardNumber),
      };
    });
  }

  /**
   * Freeze a virtual card
   * Requirements: 11.4
   */
  async freezeCard(cardId: string): Promise<VirtualCard> {
    // Verify card exists
    const existingCard = await this.prisma.virtualCard.findUnique({
      where: { id: cardId },
    });

    if (!existingCard) {
      throw new Error('Card not found');
    }

    if (existingCard.status === CardStatus.CANCELLED) {
      throw new Error('Cannot freeze a cancelled card');
    }

    // Update status to FROZEN
    const card = await this.prisma.virtualCard.update({
      where: { id: cardId },
      data: {
        status: CardStatus.FROZEN,
      },
    });

    // Send webhook notification for card freeze (Requirement 15.4)
    if (this.webhookService) {
      try {
        const decryptedNumber = this.decryptCardNumber(card.cardNumber);
        await this.webhookService.deliverEvent(
          WebhookEventType.CARD_FROZEN,
          {
            cardId: card.id,
            accountId: card.accountId,
            last4: decryptedNumber.slice(-4),
            status: card.status,
          },
          card.accountId
        );
      } catch (error) {
        console.error('Webhook delivery failed:', error);
      }
    }

    return {
      ...card,
      cardNumber: this.decryptCardNumber(card.cardNumber),
    };
  }

  /**
   * Unfreeze a virtual card
   * Requirements: 11.4
   */
  async unfreezeCard(cardId: string): Promise<VirtualCard> {
    // Verify card exists
    const existingCard = await this.prisma.virtualCard.findUnique({
      where: { id: cardId },
    });

    if (!existingCard) {
      throw new Error('Card not found');
    }

    if (existingCard.status !== CardStatus.FROZEN) {
      throw new Error('Card is not frozen');
    }

    // Update status to ACTIVE
    const card = await this.prisma.virtualCard.update({
      where: { id: cardId },
      data: {
        status: CardStatus.ACTIVE,
      },
    });

    return {
      ...card,
      cardNumber: this.decryptCardNumber(card.cardNumber),
    };
  }

  /**
   * Cancel a virtual card (permanent)
   * Requirements: 11.5
   */
  async cancelCard(cardId: string): Promise<VirtualCard> {
    // Verify card exists
    const existingCard = await this.prisma.virtualCard.findUnique({
      where: { id: cardId },
    });

    if (!existingCard) {
      throw new Error('Card not found');
    }

    if (existingCard.status === CardStatus.CANCELLED) {
      throw new Error('Card is already cancelled');
    }

    // Update status to CANCELLED
    const card = await this.prisma.virtualCard.update({
      where: { id: cardId },
      data: {
        status: CardStatus.CANCELLED,
      },
    });

    return {
      ...card,
      cardNumber: this.decryptCardNumber(card.cardNumber),
    };
  }

  /**
   * Authorize a card payment
   * Requirements: 11.6
   * Checks: card status, account status, balance, spend limit, spending rules
   */
  async authorizeCardPayment(
    cardNumber: string,
    amount: Decimal,
    merchantName: string,
    merchantCategory?: string
  ): Promise<AuthorizationResult> {
    // Find card by encrypted card number
    // We need to check all cards since we can't query encrypted data directly
    const allCards = await this.prisma.virtualCard.findMany({
      include: {
        Account: true,
      },
    });

    let card: VirtualCard & { Account: Account } | undefined;
    for (const c of allCards) {
      try {
        const decryptedNumber = this.decryptCardNumber(c.cardNumber);
        if (decryptedNumber === cardNumber) {
          card = c;
          break;
        }
      } catch {
        // Skip cards that fail to decrypt
        continue;
      }
    }

    if (!card) {
      return {
        approved: false,
        reason: 'Card not found',
      };
    }

    // Check card status
    if (card.status === CardStatus.FROZEN) {
      return {
        approved: false,
        reason: 'Card is frozen',
      };
    }

    if (card.status === CardStatus.CANCELLED) {
      return {
        approved: false,
        reason: 'Card is cancelled',
      };
    }

    // Check account status
    if (card.Account.status !== AccountStatus.ACTIVE) {
      return {
        approved: false,
        reason: 'Account is not active',
      };
    }

    // Check balance
    const balance = new Decimal(card.Account.balance.toString());
    if (balance.lessThan(amount)) {
      return {
        approved: false,
        reason: 'Insufficient balance',
      };
    }

    // Check card spend limit
    if (card.spendLimit) {
      const spendLimit = new Decimal(card.spendLimit.toString());
      if (amount.greaterThan(spendLimit)) {
        return {
          approved: false,
          reason: 'Exceeds card spend limit',
        };
      }
    }

    // Check spending rules
    const spendingRules = card.Account.spendingRules as SpendingRules | null;
    if (spendingRules) {
      // Check per-transaction limit
      if (spendingRules.perTransactionLimit) {
        const perTxLimit = new Decimal(spendingRules.perTransactionLimit);
        if (amount.greaterThan(perTxLimit)) {
          return {
            approved: false,
            reason: 'Exceeds per-transaction limit',
          };
        }
      }

      // Check blocked categories
      if (merchantCategory && spendingRules.blockedCategories) {
        if (spendingRules.blockedCategories.includes(merchantCategory)) {
          return {
            approved: false,
            reason: 'Merchant category is blocked',
          };
        }
      }

      // Check daily limit (sum of today's transactions)
      if (spendingRules.dailyLimit) {
        const dailyLimit = new Decimal(spendingRules.dailyLimit);
        
        // Get today's transactions
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const todayTransactions = await this.prisma.transaction.findMany({
          where: {
            fromAccountId: card.accountId,
            createdAt: {
              gte: startOfDay,
            },
            status: 'COMPLETED',
          },
        });

        // Sum today's spending
        const todaySpending = todayTransactions.reduce(
          (sum, tx) => sum.plus(new Decimal(tx.amount.toString())),
          new Decimal(0)
        );

        // Check if adding this amount would exceed daily limit
        if (todaySpending.plus(amount).greaterThan(dailyLimit)) {
          return {
            approved: false,
            reason: 'Exceeds daily spending limit',
          };
        }
      }
    }

    // All checks passed - authorize with payment provider
    const authResponse = await this.paymentProvider.authorizePayment(
      cardNumber,
      amount,
      merchantName,
      merchantCategory
    );

    if (!authResponse.approved) {
      return {
        approved: false,
        reason: authResponse.declineReason || 'Payment declined by provider',
      };
    }

    return {
      approved: true,
      transactionId: authResponse.authorizationId,
    };
  }
}
