import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AccountService } from '../../services/account/account.service';
import { PaymentService } from '../../services/payment/payment.service';
import { ExternalBankAccountService } from '../../services/external-bank-account/external-bank-account.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import { createWebhookService } from '../../services/webhook/webhook.service';
import { buildServer } from '../../server';
import Decimal from 'decimal.js';
import WebSocket from 'ws';
import { FastifyInstance } from 'fastify';

describe('Integration: Payout Flow', () => {
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let accountService: AccountService;
  let paymentService: PaymentService;
  let externalBankAccountService: ExternalBankAccountService;
  let mockProvider: MockPaymentProvider;
  let webhookService: ReturnType<typeof createWebhookService>;
  let server: FastifyInstance;
  let testOwnerId: string;
  let testOwnerEmail: string;
  let testOwnerToken: string;
  let serverAddress: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    mockProvider = new MockPaymentProvider();
    
    // Create external bank account service
    const encryptionSecret = process.env.ENCRYPTION_SECRET || 'test-secret-key-for-encryption';
    externalBankAccountService = new ExternalBankAccountService(prisma, encryptionSecret);
    
    // Create webhook service
    webhookService = createWebhookService(prisma);
    
    // Build and start server for WebSocket tests
    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });
    serverAddress = `http://localhost:${(server.server.address() as any).port}`;
    
    const wsServer = server.wsServer;
    
    // Initialize services with all dependencies
    accountService = new AccountService(prisma, wsServer as any);
    paymentService = new PaymentService(
      prisma,
      mockProvider,
      webhookService,
      wsServer as any,
      externalBankAccountService
    );

    // Register owner
    testOwnerEmail = `test-${Date.now()}@example.com`;
    const owner = await ownerAuthService.registerOwner(
      testOwnerEmail,
      'Test Owner',
      'password123'
    );
    testOwnerId = owner.id;
    
    // Get owner token for WebSocket tests
    const loginResult = await ownerAuthService.loginOwner(
      testOwnerEmail,
      'password123'
    );
    testOwnerToken = loginResult.token;
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

  it('should complete end-to-end payout from agent to external account', async () => {
    // Step 1: Create agent account
    const { agent, account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    expect(agent).toBeDefined();
    expect(account).toBeDefined();
    expect(account.status).toBe('ACTIVE');

    // Step 2: Fund agent account
    const fundAmount = new Decimal(500);
    await accountService.fundAccount(account.id, fundAmount);

    const balanceAfterFunding = await accountService.getBalance(account.id);
    expect(balanceAfterFunding.toNumber()).toBe(500);

    // Step 3: Create mock external bank account
    const externalAccount = await externalBankAccountService.createMockAccount(
      '123456789',
      '9876543210',
      'John Doe',
      'CHECKING',
      new Decimal(1000)
    );

    expect(externalAccount).toBeDefined();
    expect(externalAccount.routingNumber).toBe('123456789');
    expect(externalAccount.accountHolder).toBe('John Doe');
    expect(externalAccount.status).toBe('ACTIVE');

    // Step 4: Send payout to external account
    const payoutAmount = new Decimal(100);
    const payout = await paymentService.sendPayout(
      account.id,
      '123456789',
      '9876543210',
      'John Doe',
      payoutAmount,
      'Payment for services'
    );

    expect(payout).toBeDefined();
    expect(payout.type).toBe('PAYOUT');
    expect(payout.status).toBe('COMPLETED');
    expect(new Decimal(payout.amount.toString()).toNumber()).toBe(100);
    expect(payout.fromAccountId).toBe(account.id);
    expect(payout.merchantName).toBe('John Doe');

    // Step 5: Verify agent balance was deducted
    const finalAgentBalance = await accountService.getBalance(account.id);
    expect(finalAgentBalance.toNumber()).toBe(400); // 500 - 100

    // Step 6: Verify external account balance was credited
    const updatedExternalAccount = await externalBankAccountService.getAccount(
      '123456789',
      '9876543210'
    );
    expect(updatedExternalAccount).toBeDefined();
    expect(new Decimal(updatedExternalAccount!.balance.toString()).toNumber()).toBe(1100); // 1000 + 100

    // Step 7: Verify transaction history
    const transactions = await prisma.transaction.findMany({
      where: { fromAccountId: account.id },
      orderBy: { createdAt: 'asc' }
    });

    expect(transactions).toHaveLength(2); // funding + payout
    expect(transactions[0].type).toBe('INBOUND');
    expect(transactions[1].type).toBe('PAYOUT');
    expect(transactions[1].status).toBe('COMPLETED');
  });

  it('should require approval for payout exceeding spending rules', async () => {
    // Step 1: Create agent account with spending rules
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    // Step 2: Fund account
    await accountService.fundAccount(account.id, new Decimal(1000));

    // Step 3: Set spending rules with per-transaction limit
    await accountService.updateSpendingRules(account.id, {
      perTransactionLimit: '50'
    });

    // Step 4: Create mock external bank account
    await externalBankAccountService.createMockAccount(
      '123456789',
      '9876543210',
      'Jane Smith',
      'CHECKING',
      new Decimal(500)
    );

    // Step 5: Attempt payout exceeding per-transaction limit
    const payout = await paymentService.sendPayout(
      account.id,
      '123456789',
      '9876543210',
      'Jane Smith',
      new Decimal(100), // Exceeds limit of 50
      'Large payout'
    );

    // Verify transaction is pending
    expect(payout.status).toBe('PENDING');
    expect(payout.approvalRequired).toBe(true);
    expect(payout.type).toBe('PAYOUT');

    // Verify balances are unchanged
    const agentBalance = await accountService.getBalance(account.id);
    expect(agentBalance.toNumber()).toBe(1000);

    const externalAccount = await externalBankAccountService.getAccount(
      '123456789',
      '9876543210'
    );
    expect(new Decimal(externalAccount!.balance.toString()).toNumber()).toBe(500);

    // Step 6: Owner approves payout
    const approvedPayout = await paymentService.approvePayment(
      payout.id,
      testOwnerId
    );

    // Verify payout is completed
    expect(approvedPayout.status).toBe('COMPLETED');
    expect(approvedPayout.approvedAt).toBeDefined();

    // Verify balances are updated
    const finalAgentBalance = await accountService.getBalance(account.id);
    expect(finalAgentBalance.toNumber()).toBe(900); // 1000 - 100

    const finalExternalAccount = await externalBankAccountService.getAccount(
      '123456789',
      '9876543210'
    );
    expect(new Decimal(finalExternalAccount!.balance.toString()).toNumber()).toBe(600); // 500 + 100
  });

  it('should preserve balances when owner declines payout', async () => {
    // Step 1: Create agent account with spending rules
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    // Step 2: Fund account
    await accountService.fundAccount(account.id, new Decimal(1000));

    // Step 3: Set spending rules
    await accountService.updateSpendingRules(account.id, {
      perTransactionLimit: '50'
    });

    // Step 4: Create mock external bank account
    await externalBankAccountService.createMockAccount(
      '987654321',
      '1234567890',
      'Bob Johnson',
      'SAVINGS',
      new Decimal(200)
    );

    // Step 5: Create pending payout
    const payout = await paymentService.sendPayout(
      account.id,
      '987654321',
      '1234567890',
      'Bob Johnson',
      new Decimal(75),
      'Will be declined'
    );

    expect(payout.status).toBe('PENDING');

    // Step 6: Owner declines payout
    const declinedPayout = await paymentService.declinePayment(
      payout.id,
      testOwnerId
    );

    // Verify payout is declined
    expect(declinedPayout.status).toBe('DECLINED');

    // Verify balances are unchanged
    const agentBalance = await accountService.getBalance(account.id);
    expect(agentBalance.toNumber()).toBe(1000);

    const externalAccount = await externalBankAccountService.getAccount(
      '987654321',
      '1234567890'
    );
    expect(new Decimal(externalAccount!.balance.toString()).toNumber()).toBe(200);
  });

  it('should reject payout with insufficient balance', async () => {
    // Create agent with no funds
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Poor Agent',
      'OpenClaw'
    );

    // Create external account
    await externalBankAccountService.createMockAccount(
      '111222333',
      '4444555566',
      'Merchant',
      'CHECKING',
      new Decimal(0)
    );

    // Attempt payout with insufficient balance
    await expect(
      paymentService.sendPayout(
        account.id,
        '111222333',
        '4444555566',
        'Merchant',
        new Decimal(50),
        'Should fail'
      )
    ).rejects.toThrow('Insufficient balance');

    // Verify balances unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(0);
  });

  it('should reject payout to non-existent external account', async () => {
    // Create and fund agent account
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Attempt payout to non-existent account
    await expect(
      paymentService.sendPayout(
        account.id,
        '999999999',
        '9999999999',
        'Ghost Account',
        new Decimal(50),
        'Should fail'
      )
    ).rejects.toThrow('External bank account not found or inactive');

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(500);
  });

  it('should reject payout with invalid routing number', async () => {
    // Create and fund agent account
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Attempt payout with invalid routing number (not 9 digits)
    await expect(
      paymentService.sendPayout(
        account.id,
        '12345', // Invalid: only 5 digits
        '1234567890',
        'John Doe',
        new Decimal(50),
        'Should fail'
      )
    ).rejects.toThrow('Invalid routing number format');

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(500);
  });

  it('should reject payout with invalid account number', async () => {
    // Create and fund agent account
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Attempt payout with invalid account number (too short)
    await expect(
      paymentService.sendPayout(
        account.id,
        '123456789',
        '123', // Invalid: only 3 digits (need 8-17)
        'John Doe',
        new Decimal(50),
        'Should fail'
      )
    ).rejects.toThrow('Invalid account number format');

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(500);
  });

  it('should reject payout from frozen account', async () => {
    // Create and fund agent account
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Freeze the account
    await prisma.account.update({
      where: { id: account.id },
      data: { status: 'FROZEN' }
    });

    // Create external account
    await externalBankAccountService.createMockAccount(
      '123456789',
      '9876543210',
      'John Doe',
      'CHECKING',
      new Decimal(0)
    );

    // Attempt payout from frozen account
    await expect(
      paymentService.sendPayout(
        account.id,
        '123456789',
        '9876543210',
        'John Doe',
        new Decimal(50),
        'Should fail'
      )
    ).rejects.toThrow('Sender account is frozen');
  });

  it('should reject payout with invalid amount', async () => {
    // Create and fund agent account
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Create external account
    await externalBankAccountService.createMockAccount(
      '123456789',
      '9876543210',
      'John Doe',
      'CHECKING',
      new Decimal(0)
    );

    // Attempt payout with zero amount
    await expect(
      paymentService.sendPayout(
        account.id,
        '123456789',
        '9876543210',
        'John Doe',
        new Decimal(0),
        'Should fail'
      )
    ).rejects.toThrow('Amount must be positive and non-zero');

    // Attempt payout with negative amount
    await expect(
      paymentService.sendPayout(
        account.id,
        '123456789',
        '9876543210',
        'John Doe',
        new Decimal(-50),
        'Should fail'
      )
    ).rejects.toThrow('Amount must be positive and non-zero');
  });

  it('should deliver webhook event for completed payout', async () => {
    // Create and fund agent account
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Register webhook for payout events
    const webhook = await webhookService.registerWebhook(
      account.id,
      'http://localhost:3000/webhook',
      ['payout.completed']
    );

    expect(webhook).toBeDefined();
    expect(webhook.url).toBe('http://localhost:3000/webhook');
    expect(webhook.events).toContain('payout.completed');

    // Create external account
    await externalBankAccountService.createMockAccount(
      '123456789',
      '9876543210',
      'John Doe',
      'CHECKING',
      new Decimal(0)
    );

    // Send payout
    const payout = await paymentService.sendPayout(
      account.id,
      '123456789',
      '9876543210',
      'John Doe',
      new Decimal(100),
      'Test payout'
    );

    expect(payout.status).toBe('COMPLETED');

    // Verify webhook event was created
    const webhookEvents = await prisma.webhookEvent.findMany({
      where: {
        webhookId: webhook.id,
        eventType: 'payout.completed'
      }
    });

    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0].eventType).toBe('payout.completed');
    expect(webhookEvents[0].attempts).toBeGreaterThan(0);

    // Verify event payload
    const payload = webhookEvents[0].payload as any;
    expect(payload.transactionId).toBe(payout.id);
    expect(payload.amount).toBe('100');
    expect(payload.recipientName).toBe('John Doe');
    expect(payload.recipientAccount).toBe('****3210');
    expect(payload.routingNumber).toBe('123456789');
  });

  it('should deliver webhook event for approved payout', async () => {
    // Create agent account with spending rules
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(1000));
    await accountService.updateSpendingRules(account.id, {
      perTransactionLimit: '50'
    });

    // Register webhook
    const webhook = await webhookService.registerWebhook(
      account.id,
      'http://localhost:3000/webhook',
      ['payout.completed']
    );

    // Create external account
    await externalBankAccountService.createMockAccount(
      '123456789',
      '9876543210',
      'Jane Smith',
      'CHECKING',
      new Decimal(0)
    );

    // Create pending payout
    const payout = await paymentService.sendPayout(
      account.id,
      '123456789',
      '9876543210',
      'Jane Smith',
      new Decimal(100),
      'Needs approval'
    );

    expect(payout.status).toBe('PENDING');

    // Approve payout
    await paymentService.approvePayment(payout.id, testOwnerId);

    // Verify webhook event was created for completed payout
    const webhookEvents = await prisma.webhookEvent.findMany({
      where: {
        webhookId: webhook.id,
        eventType: 'payout.completed'
      }
    });

    expect(webhookEvents).toHaveLength(1);
    
    const payload = webhookEvents[0].payload as any;
    expect(payload.transactionId).toBe(payout.id);
    expect(payload.approved).toBe(true);
    expect(payload.approvedAt).toBeDefined();
  });
});
