import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AgentAuthService } from '../../services/auth/agent-auth.service';
import { AccountService } from '../../services/account/account.service';
import { ExternalBankAccountService } from '../../services/external-bank-account/external-bank-account.service';
import Decimal from 'decimal.js';

describe('Payment Routes - Payout', () => {
  let server: FastifyInstance;
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let agentAuthService: AgentAuthService;
  let accountService: AccountService;
  let externalBankAccountService: ExternalBankAccountService;
  let testOwnerId: string;
  let testOwnerToken: string;
  let testAgentId: string;
  let testAgentToken: string;
  let testAccountId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    agentAuthService = new AgentAuthService(prisma);

    // Build server
    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });

    accountService = new AccountService(prisma, server.wsServer);
    const encryptionSecret = process.env.ENCRYPTION_SECRET || 'default-secret-key-change-in-production';
    externalBankAccountService = new ExternalBankAccountService(prisma, encryptionSecret);

    // Create test owner
    const testOwnerEmail = `test-${Date.now()}@example.com`;
    const owner = await ownerAuthService.registerOwner(
      testOwnerEmail,
      'Test Owner',
      'password123'
    );
    testOwnerId = owner.id;

    const loginResult = await ownerAuthService.loginOwner(
      testOwnerEmail,
      'password123'
    );
    testOwnerToken = loginResult.token;

    // Create test agent and account
    const { agent, account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );
    testAgentId = agent.id;
    testAccountId = account.id;

    // Generate agent API key
    testAgentToken = await agentAuthService.generateApiKey(testAgentId);

    // Fund agent account
    await accountService.fundAccount(testAccountId, new Decimal(1000));
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.externalBankAccount.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.owner.deleteMany({});
    await prisma.$disconnect();

    // Close server
    await server.close();
  });

  describe('POST /payments/payout', () => {
    beforeEach(async () => {
      // Create external bank account for tests
      await externalBankAccountService.createMockAccount(
        '123456789',
        '9876543210',
        'John Doe',
        'CHECKING',
        new Decimal(500)
      );
    });

    it('should successfully send payout to external account', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '100.00',
          description: 'Payment for services',
        },
      });

      const body = JSON.parse(response.body);
      if (response.statusCode !== 201) {
        console.log('Error response:', body);
      }
      expect(response.statusCode).toBe(201);
      expect(body.transaction.id).toBeDefined();
      expect(body.transaction.amount).toBe('100');
      expect(body.transaction.type).toBe('PAYOUT');
      expect(body.transaction.status).toBe('COMPLETED');
      expect(body.transaction.recipientName).toBe('John Doe');
      expect(body.transaction.recipientAccount).toBe('****3210');
      expect(body.transaction.approvalRequired).toBe(false);
    });

    it('should require approval for payout exceeding spending rules', async () => {
      // Set spending rules
      await accountService.updateSpendingRules(testAccountId, {
        perTransactionLimit: '50',
      });

      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '100.00',
          description: 'Large payout',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.transaction.status).toBe('PENDING');
      expect(body.transaction.approvalRequired).toBe(true);
    });

    it('should reject payout with insufficient balance', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '2000.00', // More than balance
          description: 'Too large',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('INSUFFICIENT_BALANCE');
    });

    it('should reject payout to non-existent external account', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '999999999',
          accountNumber: '9999999999',
          accountHolder: 'Ghost',
          amount: '50.00',
          description: 'Should fail',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('ACCOUNT_NOT_FOUND');
    });

    it('should reject payout with invalid routing number', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '12345', // Too short
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'Invalid routing',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject payout with invalid account number', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '123', // Too short
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'Invalid account',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject payout with invalid account holder', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'A', // Too short
          amount: '50.00',
          description: 'Invalid holder',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject payout with zero amount', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '0.00',
          description: 'Zero amount',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject payout with negative amount', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '-50.00',
          description: 'Negative amount',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject payout from frozen account', async () => {
      // Freeze account
      await prisma.account.update({
        where: { id: testAccountId },
        data: { status: 'FROZEN' },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'From frozen account',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('ACCOUNT_FROZEN');
    });

    it('should reject payout without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'No auth',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should allow payout without description', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.transaction.status).toBe('COMPLETED');
    });

    it('should update balances correctly after payout', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '100.00',
          description: 'Balance test',
        },
      });

      expect(response.statusCode).toBe(201);

      // Check agent balance
      const agentBalance = await accountService.getBalance(testAccountId);
      expect(agentBalance.toNumber()).toBe(900); // 1000 - 100

      // Check external account balance
      const externalAccount = await externalBankAccountService.getAccount(
        '123456789',
        '9876543210'
      );
      expect(externalAccount?.balance.toNumber()).toBe(600); // 500 + 100
    });
  });

  describe('Authentication and Authorization', () => {
    beforeEach(async () => {
      // Create external bank account for tests
      await externalBankAccountService.createMockAccount(
        '123456789',
        '9876543210',
        'John Doe',
        'CHECKING',
        new Decimal(500)
      );
    });

    it('should reject payout with invalid token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: 'Bearer invalid-token',
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'Invalid token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject payout with owner token (requires agent)', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'Owner token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject payout without authorization header', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'No header',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should allow agent to send payout with valid token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/payments/payout',
        headers: {
          authorization: `Bearer ${testAgentToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          amount: '50.00',
          description: 'Valid agent token',
        },
      });

      expect(response.statusCode).toBe(201);
    });
  });
});
