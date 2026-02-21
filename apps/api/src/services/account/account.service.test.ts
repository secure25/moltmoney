import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccountService } from './account.service';
import Decimal from 'decimal.js';

// Import PrismaClient from the generated client
const { PrismaClient } = require('@prisma/client');

describe('AccountService', () => {
  let prisma: any;
  let accountService: AccountService;
  let testOwnerId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    accountService = new AccountService(prisma, undefined);

    // Create a test owner
    const owner = await prisma.owner.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test Owner',
        password: 'hashed_password',
      },
    });
    testOwnerId = owner.id;
  });

  afterEach(async () => {
    // Clean up test data in correct order (webhooks before accounts)
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({
      where: { ownerId: testOwnerId },
    });
    await prisma.owner.delete({
      where: { id: testOwnerId },
    });
    await prisma.$disconnect();
  });

  describe('createAgentAccount', () => {
    it('should create agent and account atomically', async () => {
      const result = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      expect(result.agent).toBeDefined();
      expect(result.agent.name).toBe('Test Agent');
      expect(result.agent.platform).toBe('OpenClaw');
      expect(result.agent.apiKey).toBeDefined();
      expect(result.agent.apiKey.length).toBe(64); // 32 bytes hex = 64 chars

      expect(result.account).toBeDefined();
      expect(result.account.type).toBe('AGENT');
      expect(result.account.status).toBe('ACTIVE');
      expect(result.account.currency).toBe('USD');
      expect(new Decimal(result.account.balance.toString()).toNumber()).toBe(0);
      expect(result.account.agentId).toBe(result.agent.id);
    });
  });

  describe('getAccount', () => {
    it('should retrieve an existing account', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      const retrieved = await accountService.getAccount(account.id);
      expect(retrieved.id).toBe(account.id);
    });

    it('should throw error for non-existent account', async () => {
      await expect(
        accountService.getAccount('non-existent-id')
      ).rejects.toThrow('Account not found');
    });
  });

  describe('getBalance', () => {
    it('should return account balance', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      const balance = await accountService.getBalance(account.id);
      expect(balance.toNumber()).toBe(0);
    });
  });

  describe('fundAccount', () => {
    it('should increase account balance and create transaction', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      const fundAmount = new Decimal('100.50');
      const transaction = await accountService.fundAccount(account.id, fundAmount);

      expect(transaction.type).toBe('INBOUND');
      expect(transaction.status).toBe('COMPLETED');
      expect(new Decimal(transaction.amount.toString()).toNumber()).toBe(100.50);

      const newBalance = await accountService.getBalance(account.id);
      expect(newBalance.toNumber()).toBe(100.50);
    });

    it('should reject negative amounts', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await expect(
        accountService.fundAccount(account.id, new Decimal('-10'))
      ).rejects.toThrow('Amount must be positive and non-zero');
    });

    it('should reject zero amounts', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await expect(
        accountService.fundAccount(account.id, new Decimal('0'))
      ).rejects.toThrow('Amount must be positive and non-zero');
    });
  });

  describe('freezeAccount', () => {
    it('should freeze an active account', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      const frozen = await accountService.freezeAccount(account.id);
      expect(frozen.status).toBe('FROZEN');
    });
  });

  describe('unfreezeAccount', () => {
    it('should unfreeze a frozen account', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await accountService.freezeAccount(account.id);
      const unfrozen = await accountService.unfreezeAccount(account.id);
      expect(unfrozen.status).toBe('ACTIVE');
    });

    it('should throw error if account is not frozen', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await expect(
        accountService.unfreezeAccount(account.id)
      ).rejects.toThrow('Account is not frozen');
    });
  });

  describe('closeAccount', () => {
    it('should close an account with zero balance', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      const closed = await accountService.closeAccount(account.id);
      expect(closed.status).toBe('CLOSED');
    });

    it('should reject closing account with non-zero balance', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await accountService.fundAccount(account.id, new Decimal('100'));

      await expect(
        accountService.closeAccount(account.id)
      ).rejects.toThrow('Cannot close account with non-zero balance');
    });
  });

  describe('updateSpendingRules', () => {
    it('should update spending rules', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      const rules = {
        dailyLimit: '1000.00',
        perTransactionLimit: '500.00',
        blockedCategories: ['gambling', 'alcohol'],
      };

      const updated = await accountService.updateSpendingRules(account.id, rules);
      expect(updated.spendingRules).toEqual(rules);
    });
  });
});
