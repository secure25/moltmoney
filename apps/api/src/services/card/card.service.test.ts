import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient, CardStatus, AccountStatus, AccountType } from '@moltmoney/database';
import Decimal from 'decimal.js';
import { CardService } from './card.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';

describe('CardService', () => {
  let prisma: PrismaClient;
  let cardService: CardService;
  let mockProvider: MockPaymentProvider;
  const encryptionSecret = 'test-encryption-secret-key-32-bytes-long';

  beforeEach(async () => {
    prisma = new PrismaClient();
    mockProvider = new MockPaymentProvider();
    cardService = new CardService(prisma, mockProvider, encryptionSecret);

    // Clean up database (order matters due to foreign key constraints)
    await prisma.virtualCard.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.paymentRequest.deleteMany(); // Must delete before accounts
    await prisma.webhookEvent.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.account.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.owner.deleteMany();
  });

  describe('issueCard', () => {
    it('should issue a virtual card for an active account', async () => {
      // Create owner, agent, and account
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      // Issue card
      const card = await cardService.issueCard(account.id);

      expect(card).toBeDefined();
      expect(card.accountId).toBe(account.id);
      expect(card.status).toBe(CardStatus.ACTIVE);
      expect(card.cardNumber).toMatch(/^\d{4}\s\d{4}\s\d{4}\s\d{4}$/);
      expect(card.expiryMonth).toBeGreaterThanOrEqual(1);
      expect(card.expiryMonth).toBeLessThanOrEqual(12);
      expect(card.expiryYear).toBeGreaterThan(new Date().getFullYear());
      expect(card.cvv).toMatch(/^\d{3}$/);
    });

    it('should issue a card with spend limit', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const spendLimit = new Decimal(500);
      const card = await cardService.issueCard(account.id, spendLimit);

      expect(card.spendLimit).toBeDefined();
      expect(new Decimal(card.spendLimit!.toString())).toEqual(spendLimit);
    });

    it('should throw error for non-existent account', async () => {
      await expect(cardService.issueCard('non-existent-id')).rejects.toThrow('Account not found');
    });

    it('should throw error for inactive account', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.FROZEN,
          agentId: agent.id,
        },
      });

      await expect(cardService.issueCard(account.id)).rejects.toThrow(
        'Cannot issue card for inactive account'
      );
    });
  });

  describe('listCards', () => {
    it('should list all cards for an account without CVV', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      // Issue two cards
      await cardService.issueCard(account.id);
      await cardService.issueCard(account.id);

      const cards = await cardService.listCards(account.id);

      expect(cards).toHaveLength(2);
      cards.forEach((card) => {
        expect(card.cvv).toBeUndefined();
        expect(card.cardNumber).toBeDefined();
        expect(card.status).toBeDefined();
      });
    });

    it('should return empty array for account with no cards', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const cards = await cardService.listCards(account.id);
      expect(cards).toHaveLength(0);
    });
  });

  describe('freezeCard', () => {
    it('should freeze an active card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      const frozenCard = await cardService.freezeCard(card.id);

      expect(frozenCard.status).toBe(CardStatus.FROZEN);
    });

    it('should throw error for non-existent card', async () => {
      await expect(cardService.freezeCard('non-existent-id')).rejects.toThrow('Card not found');
    });

    it('should throw error when freezing cancelled card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      await cardService.cancelCard(card.id);

      await expect(cardService.freezeCard(card.id)).rejects.toThrow(
        'Cannot freeze a cancelled card'
      );
    });
  });

  describe('unfreezeCard', () => {
    it('should unfreeze a frozen card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      await cardService.freezeCard(card.id);
      const unfrozenCard = await cardService.unfreezeCard(card.id);

      expect(unfrozenCard.status).toBe(CardStatus.ACTIVE);
    });

    it('should throw error when unfreezing non-frozen card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);

      await expect(cardService.unfreezeCard(card.id)).rejects.toThrow('Card is not frozen');
    });
  });

  describe('cancelCard', () => {
    it('should cancel an active card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      const cancelledCard = await cardService.cancelCard(card.id);

      expect(cancelledCard.status).toBe(CardStatus.CANCELLED);
    });

    it('should throw error when cancelling already cancelled card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      await cardService.cancelCard(card.id);

      await expect(cardService.cancelCard(card.id)).rejects.toThrow('Card is already cancelled');
    });
  });

  describe('authorizeCardPayment', () => {
    it('should authorize valid payment with sufficient balance', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(true);
      expect(result.transactionId).toBeDefined();
    });

    it('should decline payment for frozen card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      await cardService.freezeCard(card.id);

      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Card is frozen');
    });

    it('should decline payment for cancelled card', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      await cardService.cancelCard(card.id);

      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Card is cancelled');
    });

    it('should decline payment with insufficient balance', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(50),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id);
      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Insufficient balance');
    });

    it('should decline payment exceeding card spend limit', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
        },
      });

      const card = await cardService.issueCard(account.id, new Decimal(50));
      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Exceeds card spend limit');
    });

    it('should decline payment exceeding per-transaction limit', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
          spendingRules: {
            perTransactionLimit: '50',
          },
        },
      });

      const card = await cardService.issueCard(account.id);
      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Exceeds per-transaction limit');
    });

    it('should decline payment to blocked merchant category', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
          spendingRules: {
            blockedCategories: ['gambling', 'alcohol'],
          },
        },
      });

      const card = await cardService.issueCard(account.id);
      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant',
        'gambling'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Merchant category is blocked');
    });

    it('should decline payment exceeding daily limit', async () => {
      const owner = await prisma.owner.create({
        data: {
          email: 'test@example.com',
          name: 'Test Owner',
          password: 'hashedpassword',
        },
      });

      const agent = await prisma.agent.create({
        data: {
          name: 'Test Agent',
          platform: 'OpenClaw',
          apiKey: 'test-api-key',
          ownerId: owner.id,
        },
      });

      const account = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(1000),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: agent.id,
          spendingRules: {
            dailyLimit: '200',
          },
        },
      });

      // Create a completed transaction for today
      await prisma.transaction.create({
        data: {
          amount: new Decimal(150),
          currency: 'USD',
          type: 'OUTBOUND',
          status: 'COMPLETED',
          fromAccountId: account.id,
          merchantName: 'Previous Merchant',
        },
      });

      const card = await cardService.issueCard(account.id);
      const result = await cardService.authorizeCardPayment(
        card.cardNumber,
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Exceeds daily spending limit');
    });

    it('should return not found for non-existent card', async () => {
      const result = await cardService.authorizeCardPayment(
        '4111 1111 1111 1111',
        new Decimal(100),
        'Test Merchant'
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBe('Card not found');
    });
  });
});
