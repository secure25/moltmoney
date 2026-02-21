import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AccountService } from '../../services/account/account.service';
import { PaymentService } from '../../services/payment/payment.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import Decimal from 'decimal.js';

describe('Integration: Complete Payment Flow', () => {
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let accountService: AccountService;
  let paymentService: PaymentService;
  let mockProvider: MockPaymentProvider;
  let testOwnerId: string;
  let testOwnerEmail: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    mockProvider = new MockPaymentProvider();
    accountService = new AccountService(prisma, undefined);
    paymentService = new PaymentService(prisma, mockProvider, undefined);

    // Register owner
    testOwnerEmail = `test-${Date.now()}@example.com`;
    const owner = await ownerAuthService.registerOwner(
      testOwnerEmail,
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

  it('should complete full payment flow: register → create agent → fund → pay → verify', async () => {
    // Step 1: Create agent account
    const { agent: agent1, account: account1 } = await accountService.createAgentAccount(
      testOwnerId,
      'Agent 1',
      'OpenClaw'
    );

    expect(agent1).toBeDefined();
    expect(account1).toBeDefined();
    expect(account1.status).toBe('ACTIVE');
    expect(new Decimal(account1.balance.toString()).toNumber()).toBe(0);

    // Step 2: Create second agent for payment recipient
    const { agent: agent2, account: account2 } = await accountService.createAgentAccount(
      testOwnerId,
      'Agent 2',
      'OpenClaw'
    );

    expect(agent2).toBeDefined();
    expect(account2).toBeDefined();

    // Step 3: Fund first agent account
    const fundAmount = new Decimal(100);
    const fundTx = await accountService.fundAccount(account1.id, fundAmount);

    expect(fundTx).toBeDefined();
    expect(fundTx.type).toBe('INBOUND');
    expect(fundTx.status).toBe('COMPLETED');
    expect(new Decimal(fundTx.amount.toString()).toNumber()).toBe(100);

    // Verify balance after funding
    const balanceAfterFunding = await accountService.getBalance(account1.id);
    expect(balanceAfterFunding.toNumber()).toBe(100);

    // Step 4: Make payment from agent1 to agent2
    const paymentAmount = new Decimal(30);
    const payment = await paymentService.sendPayment(
      account1.id,
      account2.id,
      paymentAmount,
      'Test payment'
    );

    expect(payment).toBeDefined();
    expect(payment.type).toBe('INTERNAL');
    expect(payment.status).toBe('COMPLETED');
    expect(new Decimal(payment.amount.toString()).toNumber()).toBe(30);
    expect(payment.fromAccountId).toBe(account1.id);
    expect(payment.toAccountId).toBe(account2.id);

    // Step 5: Verify final balances
    const finalBalance1 = await accountService.getBalance(account1.id);
    const finalBalance2 = await accountService.getBalance(account2.id);

    expect(finalBalance1.toNumber()).toBe(70); // 100 - 30
    expect(finalBalance2.toNumber()).toBe(30); // 0 + 30

    // Step 6: Verify transaction history
    const account1Txs = await prisma.transaction.findMany({
      where: {
        OR: [
          { fromAccountId: account1.id },
          { toAccountId: account1.id }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });

    expect(account1Txs).toHaveLength(2); // funding + payment
    expect(account1Txs[0].type).toBe('INBOUND');
    expect(account1Txs[1].type).toBe('INTERNAL');
  });

  it('should reject payment with insufficient balance', async () => {
    // Create agent with no funds
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Poor Agent',
      'OpenClaw'
    );

    const { account: recipientAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Recipient Agent',
      'OpenClaw'
    );

    // Attempt payment with insufficient balance
    await expect(
      paymentService.sendPayment(
        account.id,
        recipientAccount.id,
        new Decimal(50),
        'Should fail'
      )
    ).rejects.toThrow('Insufficient balance');

    // Verify balances unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(0);
  });

  it('should handle multiple sequential payments correctly', async () => {
    // Create agent and fund
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Multi Payment Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(100));

    // Create multiple recipients
    const recipients = await Promise.all([
      accountService.createAgentAccount(testOwnerId, 'Recipient 1', 'OpenClaw'),
      accountService.createAgentAccount(testOwnerId, 'Recipient 2', 'OpenClaw'),
      accountService.createAgentAccount(testOwnerId, 'Recipient 3', 'OpenClaw')
    ]);

    // Make sequential payments
    await paymentService.sendPayment(account.id, recipients[0].account.id, new Decimal(20), 'Payment 1');
    await paymentService.sendPayment(account.id, recipients[1].account.id, new Decimal(30), 'Payment 2');
    await paymentService.sendPayment(account.id, recipients[2].account.id, new Decimal(10), 'Payment 3');

    // Verify final balances
    const senderBalance = await accountService.getBalance(account.id);
    expect(senderBalance.toNumber()).toBe(40); // 100 - 20 - 30 - 10

    const recipient1Balance = await accountService.getBalance(recipients[0].account.id);
    const recipient2Balance = await accountService.getBalance(recipients[1].account.id);
    const recipient3Balance = await accountService.getBalance(recipients[2].account.id);

    expect(recipient1Balance.toNumber()).toBe(20);
    expect(recipient2Balance.toNumber()).toBe(30);
    expect(recipient3Balance.toNumber()).toBe(10);

    // Verify total money conservation
    const totalBalance = senderBalance
      .plus(recipient1Balance)
      .plus(recipient2Balance)
      .plus(recipient3Balance);
    expect(totalBalance.toNumber()).toBe(100);
  });
});
