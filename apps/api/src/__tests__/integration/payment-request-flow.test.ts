import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AccountService } from '../../services/account/account.service';
import { PaymentRequestService } from '../../services/payment-request/payment-request.service';
import Decimal from 'decimal.js';

describe('Integration: Payment Request Flow', () => {
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let accountService: AccountService;
  let paymentRequestService: PaymentRequestService;
  let testOwnerId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    accountService = new AccountService(prisma, undefined);
    paymentRequestService = new PaymentRequestService(prisma);

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

  it('should complete full payment request flow: create → pay → verify', async () => {
    // Create requester agent
    const { account: requesterAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Requester Agent',
      'OpenClaw'
    );

    // Create payer agent and fund
    const { account: payerAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Payer Agent',
      'OpenClaw'
    );
    await accountService.fundAccount(payerAccount.id, new Decimal(500));

    // Step 1: Create payment request
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const request = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(100),
      'Payment for services',
      expiresAt,
      true // Generate payment link
    );

    expect(request).toBeDefined();
    expect(request.status).toBe('PENDING');
    expect(new Decimal(request.amount.toString()).toNumber()).toBe(100);
    expect(request.fromAccountId).toBe(requesterAccount.id);
    expect(request.toAccountId).toBe(payerAccount.id);
    expect(request.paymentLink).toBeDefined();

    // Step 2: Pay the request
    const result = await paymentRequestService.payRequest(
      request.id,
      payerAccount.id
    );

    expect(result.request.status).toBe('PAID');
    expect(result.transactionId).toBeDefined();

    // Verify transaction was created
    const transaction = result.transactionId ? await prisma.transaction.findUnique({
      where: { id: result.transactionId }
    }) : null;

    if (transaction) {
      expect(transaction.status).toBe('COMPLETED');
      expect(transaction.type).toBe('INTERNAL');
    }

    // Step 3: Verify balances
    const requesterBalance = await accountService.getBalance(requesterAccount.id);
    const payerBalance = await accountService.getBalance(payerAccount.id);

    expect(requesterBalance.toNumber()).toBe(100);
    expect(payerBalance.toNumber()).toBe(400); // 500 - 100

    // Step 4: Verify request status
    const updatedRequest = await prisma.paymentRequest.findUnique({
      where: { id: request.id }
    });
    expect(updatedRequest?.status).toBe('PAID');
  });

  it('should reject payment of expired request', async () => {
    // Create accounts
    const { account: requesterAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Requester Agent',
      'OpenClaw'
    );

    const { account: payerAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Payer Agent',
      'OpenClaw'
    );
    await accountService.fundAccount(payerAccount.id, new Decimal(500));

    // Create expired payment request
    const expiresAt = new Date(Date.now() - 1000); // Already expired
    const request = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(100),
      'Expired request',
      expiresAt
    );

    // Attempt to pay expired request
    await expect(
      paymentRequestService.payRequest(request.id, payerAccount.id)
    ).rejects.toThrow('expired');

    // Verify balances unchanged
    const requesterBalance = await accountService.getBalance(requesterAccount.id);
    const payerBalance = await accountService.getBalance(payerAccount.id);

    expect(requesterBalance.toNumber()).toBe(0);
    expect(payerBalance.toNumber()).toBe(500);
  });

  it('should handle declined payment request', async () => {
    // Create accounts
    const { account: requesterAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Requester Agent',
      'OpenClaw'
    );

    const { account: payerAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Payer Agent',
      'OpenClaw'
    );

    // Create payment request
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const request = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(100),
      'Will be declined',
      expiresAt
    );

    // Decline the request (must be called by recipient - the payer/toAccount)
    const declinedRequest = await paymentRequestService.declineRequest(
      request.id,
      payerAccount.id // toAccountId is the payer
    );

    expect(declinedRequest.status).toBe('DECLINED');

    // Attempt to pay declined request
    await expect(
      paymentRequestService.payRequest(request.id, payerAccount.id)
    ).rejects.toThrow();
  });

  it('should list payment requests with status filtering', async () => {
    // Create accounts
    const { account: requesterAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Requester Agent',
      'OpenClaw'
    );

    const { account: payerAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Payer Agent',
      'OpenClaw'
    );
    await accountService.fundAccount(payerAccount.id, new Decimal(1000));

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create multiple requests with different statuses
    const request1 = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(100),
      'Request 1',
      expiresAt
    );

    const request2 = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(200),
      'Request 2',
      expiresAt
    );

    const request3 = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(300),
      'Request 3',
      expiresAt
    );

    // Pay one request
    await paymentRequestService.payRequest(request1.id, payerAccount.id);

    // Decline another request (must be called by recipient - the payer/toAccount)
    await paymentRequestService.declineRequest(request2.id, payerAccount.id);

    // List all requests for requester
    const allRequests = await paymentRequestService.listRequests(requesterAccount.id);
    expect(allRequests).toHaveLength(3);

    // List only pending requests
    const pendingRequests = await paymentRequestService.listRequests(
      requesterAccount.id,
      'PENDING'
    );
    expect(pendingRequests).toHaveLength(1);
    expect(pendingRequests[0].id).toBe(request3.id);

    // List only paid requests
    const paidRequests = await paymentRequestService.listRequests(
      requesterAccount.id,
      'PAID'
    );
    expect(paidRequests).toHaveLength(1);
    expect(paidRequests[0].id).toBe(request1.id);

    // List only declined requests
    const declinedRequests = await paymentRequestService.listRequests(
      requesterAccount.id,
      'DECLINED'
    );
    expect(declinedRequests).toHaveLength(1);
    expect(declinedRequests[0].id).toBe(request2.id);
  });

  it('should reject payment request with insufficient balance', async () => {
    // Create accounts
    const { account: requesterAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Requester Agent',
      'OpenClaw'
    );

    const { account: payerAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Payer Agent',
      'OpenClaw'
    );
    // Fund with insufficient amount
    await accountService.fundAccount(payerAccount.id, new Decimal(50));

    // Create payment request for more than available balance
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const request = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(100),
      'Too expensive',
      expiresAt
    );

    // Attempt to pay with insufficient balance
    await expect(
      paymentRequestService.payRequest(request.id, payerAccount.id)
    ).rejects.toThrow('Insufficient balance');

    // Verify request still pending
    const stillPending = await prisma.paymentRequest.findUnique({
      where: { id: request.id }
    });
    expect(stillPending?.status).toBe('PENDING');

    // Verify balances unchanged
    const requesterBalance = await accountService.getBalance(requesterAccount.id);
    const payerBalance = await accountService.getBalance(payerAccount.id);

    expect(requesterBalance.toNumber()).toBe(0);
    expect(payerBalance.toNumber()).toBe(50);
  });

  it('should generate unique payment links for each request', async () => {
    // Create accounts
    const { account: requesterAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Requester Agent',
      'OpenClaw'
    );

    const { account: payerAccount } = await accountService.createAgentAccount(
      testOwnerId,
      'Payer Agent',
      'OpenClaw'
    );

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create multiple requests
    const request1 = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(100),
      'Request 1',
      expiresAt,
      true // Generate payment link
    );

    const request2 = await paymentRequestService.createRequest(
      requesterAccount.id,
      payerAccount.id,
      new Decimal(200),
      'Request 2',
      expiresAt,
      true // Generate payment link
    );

    // Verify payment links are unique
    expect(request1.paymentLink).toBeDefined();
    expect(request2.paymentLink).toBeDefined();
    expect(request1.paymentLink).not.toBe(request2.paymentLink);
  });
});
