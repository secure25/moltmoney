import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, RequestStatus, AccountStatus, AccountType } from '@moltmoney/database';
import Decimal from 'decimal.js';
import { ExpirePaymentRequestsJob } from './expire-payment-requests.job';
import crypto from 'crypto';

const prisma = new PrismaClient();
const expireJob = new ExpirePaymentRequestsJob(prisma);

describe('ExpirePaymentRequestsJob', () => {
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

  describe('execute', () => {
    it('should expire pending requests that have passed their expiration date', async () => {
      // Create an expired request
      const expiredRequest = await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          description: 'Expired request',
          status: RequestStatus.PENDING,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() - 1000), // Already expired
        },
      });

      // Create a non-expired request
      const validRequest = await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(30),
          currency: 'USD',
          description: 'Valid request',
          status: RequestStatus.PENDING,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires in 24 hours
        },
      });

      // Execute the job
      const count = await expireJob.execute();

      // Should have expired 1 request
      expect(count).toBe(1);

      // Verify the expired request status
      const updatedExpiredRequest = await prisma.paymentRequest.findUnique({
        where: { id: expiredRequest.id },
      });
      expect(updatedExpiredRequest?.status).toBe(RequestStatus.EXPIRED);

      // Verify the valid request is still pending
      const updatedValidRequest = await prisma.paymentRequest.findUnique({
        where: { id: validRequest.id },
      });
      expect(updatedValidRequest?.status).toBe(RequestStatus.PENDING);
    });

    it('should not expire already paid requests', async () => {
      // Create an expired but paid request
      await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          description: 'Paid request',
          status: RequestStatus.PAID,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() - 1000), // Already expired
        },
      });

      // Execute the job
      const count = await expireJob.execute();

      // Should not have expired any requests
      expect(count).toBe(0);
    });

    it('should not expire already declined requests', async () => {
      // Create an expired but declined request
      await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          description: 'Declined request',
          status: RequestStatus.DECLINED,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() - 1000), // Already expired
        },
      });

      // Execute the job
      const count = await expireJob.execute();

      // Should not have expired any requests
      expect(count).toBe(0);
    });

    it('should not expire already expired requests', async () => {
      // Create an already expired request
      await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          description: 'Already expired request',
          status: RequestStatus.EXPIRED,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() - 1000), // Already expired
        },
      });

      // Execute the job
      const count = await expireJob.execute();

      // Should not have expired any requests (already expired)
      expect(count).toBe(0);
    });

    it('should expire multiple requests at once', async () => {
      // Create multiple expired requests
      await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          description: 'Expired request 1',
          status: RequestStatus.PENDING,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(30),
          currency: 'USD',
          description: 'Expired request 2',
          status: RequestStatus.PENDING,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() - 2000),
        },
      });

      await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(20),
          currency: 'USD',
          description: 'Expired request 3',
          status: RequestStatus.PENDING,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() - 3000),
        },
      });

      // Execute the job
      const count = await expireJob.execute();

      // Should have expired 3 requests
      expect(count).toBe(3);
    });

    it('should return 0 when no requests need expiring', async () => {
      // Create a valid request
      await prisma.paymentRequest.create({
        data: {
          amount: new Decimal(50),
          currency: 'USD',
          description: 'Valid request',
          status: RequestStatus.PENDING,
          fromAccountId: requesterAccountId,
          toAccountId: payerAccountId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Execute the job
      const count = await expireJob.execute();

      // Should not have expired any requests
      expect(count).toBe(0);
    });
  });

  describe('startHourly', () => {
    it('should return an interval ID', () => {
      const intervalId = expireJob.startHourly();
      
      expect(intervalId).toBeDefined();
      
      // Clean up
      ExpirePaymentRequestsJob.stop(intervalId);
    });
  });

  describe('stop', () => {
    it('should stop the job', () => {
      const intervalId = expireJob.startHourly();
      
      // Should not throw
      expect(() => {
        ExpirePaymentRequestsJob.stop(intervalId);
      }).not.toThrow();
    });
  });
});
