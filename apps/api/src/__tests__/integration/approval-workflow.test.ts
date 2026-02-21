import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AccountService } from '../../services/account/account.service';
import { PaymentService } from '../../services/payment/payment.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import Decimal from 'decimal.js';

describe('Integration: Approval Workflow', () => {
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let accountService: AccountService;
  let paymentService: PaymentService;
  let mockProvider: MockPaymentProvider;
  let testOwnerId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    mockProvider = new MockPaymentProvider();
    accountService = new AccountService(prisma, undefined);
    paymentService = new PaymentService(prisma, mockProvider, undefined);

    // Register owner
    const owner = await ownerAuthService.registerOwner(
      `test-${Date.now()}@example.com`,
      'Test Owner',
      'password123'
    );
    testOwnerId = owner.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.owner.deleteMany({});
    await prisma.$disconnect();
  });

  it('should create pending transaction when violating spending rules', async () => {
    // Create agent account
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    // Fund account
    await accountService.fundAccount(account.id, new Decimal(1000));

    // Set spending rules with per-transaction limit
    await accountService.updateSpendingRules(account.id, {
      perTransactionLimit: '50'
    });

    // Create recipient
    const { account: recipientAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Recipient Agent',
      'OpenClaw'
    );

    // Attempt payment exceeding per-transaction limit
    const payment = await paymentService.sendPayment(
      account.id,
      recipientAccount.id,
      new Decimal(100), // Exceeds limit of 50
      'Large payment'
    );

    // Verify transaction is pending
    expect(payment.status).toBe('PENDING');
    expect(payment.approvalRequired).toBe(true);

    // Verify balances are unchanged
    const senderBalance = await accountService.getBalance(account.id);
    const recipientBalance = await accountService.getBalance(recipientAccount.id);

    expect(senderBalance.toNumber()).toBe(1000);
    expect(recipientBalance.toNumber()).toBe(0);
  });

  it('should complete payment after owner approval', async () => {
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

    // Create recipient
    const { account: recipientAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Recipient Agent',
      'OpenClaw'
    );

    // Create pending payment
    const pendingPayment = await paymentService.sendPayment(
      account.id,
      recipientAccount.id,
      new Decimal(100),
      'Needs approval'
    );

    expect(pendingPayment.status).toBe('PENDING');

    // Owner approves payment
    const approvedPayment = await paymentService.approvePayment(
      pendingPayment.id,
      testOwnerId
    );

    // Verify payment is completed
    expect(approvedPayment.status).toBe('COMPLETED');
    expect(approvedPayment.approvedAt).toBeDefined();

    // Verify balances are updated
    const senderBalance = await accountService.getBalance(account.id);
    const recipientBalance = await accountService.getBalance(recipientAccount.id);

    expect(senderBalance.toNumber()).toBe(900); // 1000 - 100
    expect(recipientBalance.toNumber()).toBe(100);
  });

  it('should preserve balances when owner declines payment', async () => {
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

    // Create recipient
    const { account: recipientAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Recipient Agent',
      'OpenClaw'
    );

    // Create pending payment
    const pendingPayment = await paymentService.sendPayment(
      account.id,
      recipientAccount.id,
      new Decimal(100),
      'Will be declined'
    );

    expect(pendingPayment.status).toBe('PENDING');

    // Owner declines payment
    const declinedPayment = await paymentService.declinePayment(
      pendingPayment.id,
      testOwnerId
    );

    // Verify payment is declined
    expect(declinedPayment.status).toBe('DECLINED');

    // Verify balances are unchanged
    const senderBalance = await accountService.getBalance(account.id);
    const recipientBalance = await accountService.getBalance(recipientAccount.id);

    expect(senderBalance.toNumber()).toBe(1000);
    expect(recipientBalance.toNumber()).toBe(0);
  });

  it('should enforce authorization for approval actions', async () => {
    // Create first owner and agent
    const owner1 = await ownerAuthService.registerOwner(
      `owner1-${Date.now()}@example.com`,
      'Owner 1',
      'password123'
    );

    const { account: account1 } = await accountService.createAgentAccount(
      owner1.id,
      'Agent 1',
      'OpenClaw'
    );

    await accountService.fundAccount(account1.id, new Decimal(1000));
    await accountService.updateSpendingRules(account1.id, {
      perTransactionLimit: '50'
    });

    // Create second owner and agent
    const owner2 = await ownerAuthService.registerOwner(
      `owner2-${Date.now()}@example.com`,
      'Owner 2',
      'password123'
    );

    const { account: account2 } = await accountService.createAgentAccount(
      owner2.id,
      'Agent 2',
      'OpenClaw'
    );

    // Create pending payment from agent1
    const pendingPayment = await paymentService.sendPayment(
      account1.id,
      account2.id,
      new Decimal(100),
      'Cross-owner payment'
    );

    // Owner 2 attempts to approve payment for agent they don't own
    await expect(
      paymentService.approvePayment(pendingPayment.id, owner2.id)
    ).rejects.toThrow('Not authorized');

    // Verify payment is still pending
    const stillPending = await prisma.transaction.findUnique({
      where: { id: pendingPayment.id }
    });
    expect(stillPending?.status).toBe('PENDING');
  });

  it('should handle daily limit violations requiring approval', async () => {
    // Create agent account with daily limit
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(1000));
    await accountService.updateSpendingRules(account.id, {
      dailyLimit: '200' // Increase limit to make first payment clearly within bounds
    });

    // Create recipient
    const { account: recipientAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Recipient Agent',
      'OpenClaw'
    );

    // Make first payment within daily limit
    const payment1 = await paymentService.sendPayment(
      account.id,
      recipientAccount.id,
      new Decimal(50), // Well within 200 limit
      'First payment'
    );

    // First payment should complete since 50 < 200
    expect(payment1.status).toBe('COMPLETED');

    // Make second payment that would exceed daily limit
    const payment2 = await paymentService.sendPayment(
      account.id,
      recipientAccount.id,
      new Decimal(160), // 50 + 160 = 210 > 200 daily limit
      'Second payment'
    );

    expect(payment2.status).toBe('PENDING');
    expect(payment2.approvalRequired).toBe(true);

    // Approve the second payment
    const approvedPayment = await paymentService.approvePayment(
      payment2.id,
      testOwnerId
    );

    expect(approvedPayment.status).toBe('COMPLETED');

    // Verify final balances
    const senderBalance = await accountService.getBalance(account.id);
    const recipientBalance = await accountService.getBalance(recipientAccount.id);

    expect(senderBalance.toNumber()).toBe(790); // 1000 - 50 - 160
    expect(recipientBalance.toNumber()).toBe(210); // 50 + 160
  });

  it('should handle blocked category violations requiring approval', async () => {
    // Create agent account with blocked categories
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(1000));
    await accountService.updateSpendingRules(account.id, {
      blockedCategories: ['gambling', 'alcohol']
    });

    // Create recipient account for internal payment (spending rules apply to internal payments)
    const { account: recipientAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Recipient Agent',
      'OpenClaw'
    );

    // Attempt payment to blocked category
    const payment = await paymentService.sendPayment(
      account.id,
      recipientAccount.id,
      new Decimal(50),
      'Casino payment',
      'Gambling Casino', // Merchant name
      'gambling' // Merchant category - blocked
    );

    // Should require approval due to blocked category
    expect(payment.status).toBe('PENDING');
    expect(payment.approvalRequired).toBe(true);

    // Owner approves despite blocked category
    const approvedPayment = await paymentService.approvePayment(
      payment.id,
      testOwnerId
    );

    expect(approvedPayment.status).toBe('COMPLETED');

    // Verify balances updated
    const senderBalance = await accountService.getBalance(account.id);
    const recipientBalance = await accountService.getBalance(recipientAccount.id);
    
    expect(senderBalance.toNumber()).toBe(950); // 1000 - 50
    expect(recipientBalance.toNumber()).toBe(50);
  });
});
