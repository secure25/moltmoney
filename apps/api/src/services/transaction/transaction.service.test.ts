import { describe, it, expect, beforeEach } from 'vitest';
import Decimal from 'decimal.js';
import { TransactionService } from './transaction.service';
import { TxType, TxStatus } from '@moltmoney/shared';

// Import PrismaClient from the generated client
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const transactionService = new TransactionService(prisma);

describe('TransactionService', () => {
  let ownerId: string;
  let agentId: string;
  let accountId: string;
  let secondAccountId: string;

  beforeEach(async () => {
    // Clean up - delete in correct order to respect foreign key constraints
    await prisma.webhookEvent.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.virtualCard.deleteMany();
    await prisma.paymentRequest.deleteMany();
    await prisma.account.deleteMany();
    await prisma.agent.deleteMany();
    await prisma.owner.deleteMany();

    // Create test owner
    const owner = await prisma.owner.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test Owner',
        password: 'hashedpassword',
      },
    });
    ownerId = owner.id;

    // Create test agent and account
    const agent = await prisma.agent.create({
      data: {
        name: 'Test Agent',
        platform: 'OpenClaw',
        apiKey: `key-${Date.now()}`,
        ownerId,
      },
    });
    agentId = agent.id;

    const account = await prisma.account.create({
      data: {
        type: 'AGENT',
        balance: new Decimal(1000),
        currency: 'USD',
        status: 'ACTIVE',
        agentId,
      },
    });
    accountId = account.id;

    // Create second account for transfers
    const secondAgent = await prisma.agent.create({
      data: {
        name: 'Second Agent',
        platform: 'OpenClaw',
        apiKey: `key2-${Date.now()}`,
        ownerId,
      },
    });

    const secondAccount = await prisma.account.create({
      data: {
        type: 'AGENT',
        balance: new Decimal(500),
        currency: 'USD',
        status: 'ACTIVE',
        agentId: secondAgent.id,
      },
    });
    secondAccountId = secondAccount.id;
  });

  describe('listTransactions', () => {
    it('should list transactions for an account with default pagination', async () => {
      // Create test transactions
      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      await prisma.transaction.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          type: 'OUTBOUND',
          status: 'COMPLETED',
          merchantName: 'Test Merchant',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const result = await transactionService.listTransactions(accountId);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.hasMore).toBe(false);
    });

    it('should filter transactions by type', async () => {
      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      await prisma.transaction.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          type: 'OUTBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const result = await transactionService.listTransactions(accountId, {
        type: TxType.INBOUND,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe(TxType.INBOUND);
    });

    it('should filter transactions by status', async () => {
      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INTERNAL',
          status: 'COMPLETED',
          fromAccountId: accountId,
          toAccountId: secondAccountId,
          approvalRequired: false,
        },
      });

      await prisma.transaction.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          type: 'INTERNAL',
          status: 'PENDING',
          fromAccountId: accountId,
          toAccountId: secondAccountId,
          approvalRequired: true,
        },
      });

      const result = await transactionService.listTransactions(accountId, {
        status: TxStatus.PENDING,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(TxStatus.PENDING);
    });

    it('should filter transactions by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
          createdAt: yesterday,
        },
      });

      await prisma.transaction.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await transactionService.listTransactions(accountId, {
        startDate: today,
      });

      expect(result.data).toHaveLength(1);
    });

    it('should filter transactions by amount range', async () => {
      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      await prisma.transaction.create({
        data: {
          amount: new Decimal(500),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const result = await transactionService.listTransactions(accountId, {
        minAmount: new Decimal(200),
        maxAmount: new Decimal(600),
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].amount.toString()).toBe('500');
    });

    it('should filter transactions by merchant name', async () => {
      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'OUTBOUND',
          status: 'COMPLETED',
          merchantName: 'Amazon',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      await prisma.transaction.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          type: 'OUTBOUND',
          status: 'COMPLETED',
          merchantName: 'Walmart',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const result = await transactionService.listTransactions(accountId, {
        merchantName: 'Amazon',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].merchantName).toBe('Amazon');
    });

    it('should support pagination', async () => {
      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await prisma.transaction.create({
          data: {
            amount: new Decimal(100 + i),
            currency: 'USD',
            type: 'INBOUND',
            status: 'COMPLETED',
            fromAccountId: accountId,
            approvalRequired: false,
          },
        });
      }

      const page1 = await transactionService.listTransactions(accountId, {
        page: 1,
        pageSize: 2,
      });

      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await transactionService.listTransactions(accountId, {
        page: 2,
        pageSize: 2,
      });

      expect(page2.data).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      const page3 = await transactionService.listTransactions(accountId, {
        page: 3,
        pageSize: 2,
      });

      expect(page3.data).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it('should enforce maximum page size of 200', async () => {
      const result = await transactionService.listTransactions(accountId, {
        pageSize: 500,
      });

      expect(result.pageSize).toBe(200);
    });

    it('should include transactions where account is sender or receiver', async () => {
      // Transaction where account is sender
      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INTERNAL',
          status: 'COMPLETED',
          fromAccountId: accountId,
          toAccountId: secondAccountId,
          approvalRequired: false,
        },
      });

      // Transaction where account is receiver
      await prisma.transaction.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          type: 'INTERNAL',
          status: 'COMPLETED',
          fromAccountId: secondAccountId,
          toAccountId: accountId,
          approvalRequired: false,
        },
      });

      const result = await transactionService.listTransactions(accountId);

      expect(result.data).toHaveLength(2);
    });

    it('should order transactions by creation date descending', async () => {
      const tx1 = await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      // Wait a bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const tx2 = await prisma.transaction.create({
        data: {
          amount: new Decimal(200),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const result = await transactionService.listTransactions(accountId);

      expect(result.data[0].id).toBe(tx2.id);
      expect(result.data[1].id).toBe(tx1.id);
    });
  });

  describe('getTransaction', () => {
    it('should retrieve a transaction by ID', async () => {
      const created = await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          description: 'Test transaction',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const transaction = await transactionService.getTransaction(created.id);

      expect(transaction.id).toBe(created.id);
      expect(transaction.amount.toString()).toBe('100');
      expect(transaction.type).toBe(TxType.INBOUND);
      expect(transaction.status).toBe(TxStatus.COMPLETED);
      expect(transaction.description).toBe('Test transaction');
    });

    it('should throw NotFoundError for non-existent transaction', async () => {
      await expect(
        transactionService.getTransaction('non-existent-id')
      ).rejects.toThrow('Transaction not found');
    });

    it('should return complete transaction details', async () => {
      const created = await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INTERNAL',
          status: 'COMPLETED',
          description: 'Test payment',
          merchantName: 'Test Merchant',
          fromAccountId: accountId,
          toAccountId: secondAccountId,
          approvalRequired: true,
          approvedAt: new Date(),
        },
      });

      const transaction = await transactionService.getTransaction(created.id);

      expect(transaction.id).toBe(created.id);
      expect(transaction.amount.toString()).toBe('100');
      expect(transaction.currency).toBe('USD');
      expect(transaction.type).toBe(TxType.INTERNAL);
      expect(transaction.status).toBe(TxStatus.COMPLETED);
      expect(transaction.description).toBe('Test payment');
      expect(transaction.merchantName).toBe('Test Merchant');
      expect(transaction.fromAccountId).toBe(accountId);
      expect(transaction.toAccountId).toBe(secondAccountId);
      expect(transaction.approvalRequired).toBe(true);
      expect(transaction.approvedAt).toBeInstanceOf(Date);
      expect(transaction.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('exportTransactions', () => {
    beforeEach(async () => {
      // Create test transactions
      await prisma.transaction.create({
        data: {
          amount: new Decimal(100),
          currency: 'USD',
          type: 'INBOUND',
          status: 'COMPLETED',
          description: 'Funding',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      await prisma.transaction.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          type: 'OUTBOUND',
          status: 'COMPLETED',
          merchantName: 'Amazon',
          description: 'Purchase',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });
    });

    it('should export transactions as JSON', async () => {
      const result = await transactionService.exportTransactions(
        accountId,
        {},
        'json'
      );

      const data = JSON.parse(result);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect(data[0]).toHaveProperty('id');
      expect(data[0]).toHaveProperty('amount');
      expect(data[0]).toHaveProperty('type');
    });

    it('should export transactions as CSV', async () => {
      const result = await transactionService.exportTransactions(
        accountId,
        {},
        'csv'
      );

      const lines = result.split('\n');
      expect(lines[0]).toContain('ID,Amount,Currency,Type,Status');
      expect(lines).toHaveLength(3); // Header + 2 transactions
    });

    it('should escape CSV special characters', async () => {
      await prisma.transaction.create({
        data: {
          amount: new Decimal(75),
          currency: 'USD',
          type: 'OUTBOUND',
          status: 'COMPLETED',
          description: 'Payment with "quotes" and, commas',
          merchantName: 'Test, Inc.',
          fromAccountId: accountId,
          approvalRequired: false,
        },
      });

      const result = await transactionService.exportTransactions(
        accountId,
        {},
        'csv'
      );

      expect(result).toContain('"Payment with ""quotes"" and, commas"');
      expect(result).toContain('"Test, Inc."');
    });

    it('should apply filters to export', async () => {
      const result = await transactionService.exportTransactions(
        accountId,
        { type: TxType.INBOUND },
        'json'
      );

      const data = JSON.parse(result);
      expect(data).toHaveLength(1);
      expect(data[0].type).toBe(TxType.INBOUND);
    });

    it('should export all transactions without pagination', async () => {
      // Create many transactions
      for (let i = 0; i < 100; i++) {
        await prisma.transaction.create({
          data: {
            amount: new Decimal(10 + i),
            currency: 'USD',
            type: 'INBOUND',
            status: 'COMPLETED',
            fromAccountId: accountId,
            approvalRequired: false,
          },
        });
      }

      const result = await transactionService.exportTransactions(
        accountId,
        {},
        'json'
      );

      const data = JSON.parse(result);
      expect(data.length).toBeGreaterThan(50); // More than default page size
    });

    it('should return empty string for CSV with no transactions', async () => {
      // Use a different account with no transactions
      const newAgent = await prisma.agent.create({
        data: {
          name: 'Empty Agent',
          platform: 'OpenClaw',
          apiKey: `empty-${Date.now()}`,
          ownerId,
        },
      });

      const emptyAccount = await prisma.account.create({
        data: {
          type: 'AGENT',
          balance: new Decimal(0),
          currency: 'USD',
          status: 'ACTIVE',
          agentId: newAgent.id,
        },
      });

      const result = await transactionService.exportTransactions(
        emptyAccount.id,
        {},
        'csv'
      );

      expect(result).toBe('');
    });
  });
});
