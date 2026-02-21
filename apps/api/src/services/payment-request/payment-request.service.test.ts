import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, RequestStatus, AccountStatus, AccountType, TxStatus, TxType } from '@moltmoney/database';
import Decimal from 'decimal.js';
import { PaymentRequestService } from './payment-request.service';
import crypto from 'crypto';

const prisma = new PrismaClient();
const paymentRequestService = new PaymentRequestService(prisma, undefined);

describe('PaymentRequestService', () => {
  let ownerId: string;
  let requesterAccountId: string;
  let payerAccountId: string;

  beforeEach(async () => {
    // Create owner
    const owner = await prisma.owner.create({
      data: {
        email: `test-${crypto.randomBytes(8).toString('hex')}@example.com`,
        name: 'Test Owner',
        password: 'hashedpassword',
      },
    });
    ownerId = owner.id;

    // Create requester agent and account
    const requesterAgent = await prisma.agent.create({
      data: {
        name: 'Requester Agent',
        platform: 'OpenClaw',
        apiKey: crypto.randomBytes(32).toString('hex'),
        ownerId,
      },
    });

    const requesterAccount = await prisma.account.create({
      data: {
        type: AccountType.AGENT,
        balance: new Decimal(100),
        currency: 'USD',
        status: AccountStatus.ACTIVE,
        agentId: requesterAgent.id,
      },
    });
    requesterAccountId = requesterAccount.id;

    // Create payer agent and account
    const payerAgent = await prisma.agent.create({
      data: {
        name: 'Payer Agent',
        platform: 'OpenClaw',
        apiKey: crypto.randomBytes(32).toString('hex'),
        ownerId,
      },
    });

    const payerAccount = await prisma.account.create({
      data: {
        type: AccountType.AGENT,
        balance: new Decimal(500),
        currency: 'USD',
        status: AccountStatus.ACTIVE,
        agentId: payerAgent.id,
      },
    });
    payerAccountId = payerAccount.id;
  });

  afterEach(async () => {
    // Clean up in correct order (webhooks before accounts)
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.owner.deleteMany({ where: { id: ownerId } });
  });

  describe('createRequest', () => {
    it('should create a payment request with valid details', async () => {
      const amount = new Decimal(50);
      const description = 'Payment for services';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        description,
        expiresAt,
        false
      );

      expect(request).toBeDefined();
      expect(request.amount.toString()).toBe('50');
      expect(request.description).toBe(description);
      expect(request.status).toBe(RequestStatus.PENDING);
      expect(request.fromAccountId).toBe(requesterAccountId);
      expect(request.toAccountId).toBe(payerAccountId);
      expect(request.paymentLink).toBeNull();
    });

    it('should create a payment request with payment link', async () => {
      const amount = new Decimal(50);
      const description = 'Payment for services';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        description,
        expiresAt,
        true
      );

      expect(request.paymentLink).toBeDefined();
      expect(request.paymentLink).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should reject negative amount', async () => {
      const amount = new Decimal(-50);
      const description = 'Invalid payment';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await expect(
        paymentRequestService.createRequest(
          requesterAccountId,
          payerAccountId,
          amount,
          description,
          expiresAt
        )
      ).rejects.toThrow('Amount must be positive and non-zero');
    });

    it('should reject zero amount', async () => {
      const amount = new Decimal(0);
      const description = 'Invalid payment';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await expect(
        paymentRequestService.createRequest(
          requesterAccountId,
          payerAccountId,
          amount,
          description,
          expiresAt
        )
      ).rejects.toThrow('Amount must be positive and non-zero');
    });

    it('should reject non-existent requester account', async () => {
      const amount = new Decimal(50);
      const description = 'Payment for services';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await expect(
        paymentRequestService.createRequest(
          'non-existent-id',
          payerAccountId,
          amount,
          description,
          expiresAt
        )
      ).rejects.toThrow('Requester account not found');
    });

    it('should reject non-existent recipient account', async () => {
      const amount = new Decimal(50);
      const description = 'Payment for services';
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await expect(
        paymentRequestService.createRequest(
          requesterAccountId,
          'non-existent-id',
          amount,
          description,
          expiresAt
        )
      ).rejects.toThrow('Recipient account not found');
    });
  });

  describe('payRequest', () => {
    it('should pay a valid payment request', async () => {
      // Create a payment request
      const amount = new Decimal(50);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      // Pay the request
      const result = await paymentRequestService.payRequest(request.id, payerAccountId);

      expect(result.request.status).toBe(RequestStatus.PAID);
      expect(result.transactionId).toBeDefined();

      // Verify balances updated
      const requesterAccount = await prisma.account.findUnique({
        where: { id: requesterAccountId },
      });
      const payerAccount = await prisma.account.findUnique({
        where: { id: payerAccountId },
      });

      expect(requesterAccount?.balance.toString()).toBe('150'); // 100 + 50
      expect(payerAccount?.balance.toString()).toBe('450'); // 500 - 50
    });

    it('should reject payment of non-existent request', async () => {
      await expect(
        paymentRequestService.payRequest('non-existent-id', payerAccountId)
      ).rejects.toThrow('Payment request not found');
    });

    it('should reject payment of already paid request', async () => {
      // Create and pay a request
      const amount = new Decimal(50);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      await paymentRequestService.payRequest(request.id, payerAccountId);

      // Try to pay again
      await expect(
        paymentRequestService.payRequest(request.id, payerAccountId)
      ).rejects.toThrow('Payment request is paid');
    });

    it('should reject payment of expired request', async () => {
      // Create a request that expires immediately
      const amount = new Decimal(50);
      const expiresAt = new Date(Date.now() - 1000); // Already expired
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      await expect(
        paymentRequestService.payRequest(request.id, payerAccountId)
      ).rejects.toThrow('Payment request has expired');

      // Verify status updated to expired
      const updatedRequest = await prisma.paymentRequest.findUnique({
        where: { id: request.id },
      });
      expect(updatedRequest?.status).toBe(RequestStatus.EXPIRED);
    });

    it('should reject payment from wrong account', async () => {
      // Create a payment request
      const amount = new Decimal(50);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      // Try to pay from requester account (wrong account)
      await expect(
        paymentRequestService.payRequest(request.id, requesterAccountId)
      ).rejects.toThrow('Only the recipient can pay this request');
    });

    it('should reject payment with insufficient balance', async () => {
      // Create a request for more than payer has
      const amount = new Decimal(1000);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      await expect(
        paymentRequestService.payRequest(request.id, payerAccountId)
      ).rejects.toThrow('Insufficient balance');
    });
  });

  describe('declineRequest', () => {
    it('should decline a pending payment request', async () => {
      // Create a payment request
      const amount = new Decimal(50);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      // Decline the request
      const declinedRequest = await paymentRequestService.declineRequest(
        request.id,
        payerAccountId
      );

      expect(declinedRequest.status).toBe(RequestStatus.DECLINED);

      // Verify balances unchanged
      const requesterAccount = await prisma.account.findUnique({
        where: { id: requesterAccountId },
      });
      const payerAccount = await prisma.account.findUnique({
        where: { id: payerAccountId },
      });

      expect(requesterAccount?.balance.toString()).toBe('100');
      expect(payerAccount?.balance.toString()).toBe('500');
    });

    it('should reject declining non-existent request', async () => {
      await expect(
        paymentRequestService.declineRequest('non-existent-id', payerAccountId)
      ).rejects.toThrow('Payment request not found');
    });

    it('should reject declining already paid request', async () => {
      // Create and pay a request
      const amount = new Decimal(50);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      await paymentRequestService.payRequest(request.id, payerAccountId);

      // Try to decline
      await expect(
        paymentRequestService.declineRequest(request.id, payerAccountId)
      ).rejects.toThrow('Payment request is paid');
    });

    it('should reject declining from wrong account', async () => {
      // Create a payment request
      const amount = new Decimal(50);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const request = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        amount,
        'Payment for services',
        expiresAt
      );

      // Try to decline from requester account (wrong account)
      await expect(
        paymentRequestService.declineRequest(request.id, requesterAccountId)
      ).rejects.toThrow('Only the recipient can decline this request');
    });
  });

  describe('listRequests', () => {
    it('should list all requests for an account', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create multiple requests
      await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        new Decimal(50),
        'Request 1',
        expiresAt
      );

      await paymentRequestService.createRequest(
        payerAccountId,
        requesterAccountId,
        new Decimal(30),
        'Request 2',
        expiresAt
      );

      // List requests for requester account
      const requests = await paymentRequestService.listRequests(requesterAccountId);

      expect(requests).toHaveLength(2);
    });

    it('should filter requests by status', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create and pay one request
      const request1 = await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        new Decimal(50),
        'Request 1',
        expiresAt
      );
      await paymentRequestService.payRequest(request1.id, payerAccountId);

      // Create another pending request
      await paymentRequestService.createRequest(
        requesterAccountId,
        payerAccountId,
        new Decimal(30),
        'Request 2',
        expiresAt
      );

      // List only pending requests
      const pendingRequests = await paymentRequestService.listRequests(
        requesterAccountId,
        RequestStatus.PENDING
      );

      expect(pendingRequests).toHaveLength(1);
      expect(pendingRequests[0].status).toBe(RequestStatus.PENDING);

      // List only paid requests
      const paidRequests = await paymentRequestService.listRequests(
        requesterAccountId,
        RequestStatus.PAID
      );

      expect(paidRequests).toHaveLength(1);
      expect(paidRequests[0].status).toBe(RequestStatus.PAID);
    });

    it('should return empty array for account with no requests', async () => {
      // Create a new account with no requests
      const newAgent = await prisma.agent.create({
        data: {
          name: 'New Agent',
          platform: 'OpenClaw',
          apiKey: crypto.randomBytes(32).toString('hex'),
          ownerId,
        },
      });

      const newAccount = await prisma.account.create({
        data: {
          type: AccountType.AGENT,
          balance: new Decimal(100),
          currency: 'USD',
          status: AccountStatus.ACTIVE,
          agentId: newAgent.id,
        },
      });

      const requests = await paymentRequestService.listRequests(newAccount.id);

      expect(requests).toHaveLength(0);
    });
  });
});

describe('processGuestPayment', () => {
  let ownerId: string;
  let agentId: string;
  let accountId: string;

  beforeEach(async () => {
    // Create owner
    const owner = await prisma.owner.create({
      data: {
        email: `guest-test-${Date.now()}@example.com`,
        name: 'Guest Test Owner',
        password: 'hashedpassword',
      },
    });
    ownerId = owner.id;

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        name: 'Guest Test Agent',
        platform: 'OpenClaw',
        apiKey: crypto.randomBytes(32).toString('hex'),
        ownerId,
      },
    });
    agentId = agent.id;

    // Create account
    const account = await prisma.account.create({
      data: {
        type: AccountType.AGENT,
        balance: new Decimal(100),
        currency: 'USD',
        status: AccountStatus.ACTIVE,
        agentId,
      },
    });
    accountId = account.id;
  });

  it('should process guest payment via payment link', async () => {
    // Create payment request with payment link
    const paymentRequest = await paymentRequestService.createRequest(
      accountId,
      accountId,
      new Decimal(50),
      'Test payment request',
      new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
      true // generate link
    );

    expect(paymentRequest.paymentLink).toBeDefined();

    // Process guest payment
    const result = await paymentRequestService.processGuestPayment(
      paymentRequest.paymentLink!,
      'John Doe'
    );

    expect(result.requestId).toBe(paymentRequest.id);
    expect(result.amount.toString()).toBe('50');
    expect(result.currency).toBe('USD');
    expect(result.status).toBe(TxStatus.COMPLETED);
    expect(result.requestStatus).toBe(RequestStatus.PAID);

    // Verify account balance increased
    const updatedAccount = await prisma.account.findUnique({
      where: { id: accountId },
    });
    expect(updatedAccount!.balance.toString()).toBe('150');

    // Verify transaction was created
    const transaction = await prisma.transaction.findUnique({
      where: { id: result.transactionId },
    });
    expect(transaction).toBeDefined();
    expect(transaction!.type).toBe(TxType.INBOUND);
    expect(transaction!.status).toBe(TxStatus.COMPLETED);
    expect(transaction!.merchantName).toBe('John Doe');
  });

  it('should reject payment for non-existent payment link', async () => {
    await expect(
      paymentRequestService.processGuestPayment(
        'non-existent-link',
        'John Doe'
      )
    ).rejects.toThrow('Payment request not found');
  });

  it('should reject payment for expired request', async () => {
    // Create expired payment request
    const paymentRequest = await paymentRequestService.createRequest(
      accountId,
      accountId,
      new Decimal(50),
      'Expired request',
      new Date(Date.now() - 1000), // Already expired
      true
    );

    await expect(
      paymentRequestService.processGuestPayment(
        paymentRequest.paymentLink!,
        'John Doe'
      )
    ).rejects.toThrow('Payment request has expired');
  });

  it('should reject payment for already paid request', async () => {
    // Create payment request
    const paymentRequest = await paymentRequestService.createRequest(
      accountId,
      accountId,
      new Decimal(50),
      'Test request',
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      true
    );

    // Pay it once
    await paymentRequestService.processGuestPayment(
      paymentRequest.paymentLink!,
      'John Doe'
    );

    // Try to pay again
    await expect(
      paymentRequestService.processGuestPayment(
        paymentRequest.paymentLink!,
        'John Doe'
      )
    ).rejects.toThrow('Payment request is already paid');
  });

  it('should reject payment for inactive account', async () => {
    // Create payment request
    const paymentRequest = await paymentRequestService.createRequest(
      accountId,
      accountId,
      new Decimal(50),
      'Test request',
      new Date(Date.now() + 24 * 60 * 60 * 1000),
      true
    );

    // Freeze the account
    await prisma.account.update({
      where: { id: accountId },
      data: { status: AccountStatus.FROZEN },
    });

    await expect(
      paymentRequestService.processGuestPayment(
        paymentRequest.paymentLink!,
        'John Doe'
      )
    ).rejects.toThrow('Recipient account is frozen');
  });
});
