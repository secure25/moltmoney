import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../server';
import { FastifyInstance } from 'fastify';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';

describe('External Account Routes', () => {
  let server: FastifyInstance;
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let testOwnerToken: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);

    // Build server
    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 });

    // Create test owner
    const testOwnerEmail = `test-${Date.now()}@example.com`;
    await ownerAuthService.registerOwner(
      testOwnerEmail,
      'Test Owner',
      'password123'
    );

    // Get owner token
    const loginResult = await ownerAuthService.loginOwner(
      testOwnerEmail,
      'password123'
    );
    testOwnerToken = loginResult.token;
  });

  afterEach(async () => {
    // Clean up test data in correct order (respecting foreign key constraints)
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.externalBankAccount.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.owner.deleteMany({});
    await prisma.$disconnect();

    // Close server
    await server.close();
  });

  describe('POST /external-accounts', () => {
    it('should create a mock external bank account', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
          initialBalance: '1000.00',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.routingNumber).toBe('123456789');
      expect(body.accountNumber).toBe('****3210'); // Masked
      expect(body.accountHolder).toBe('John Doe');
      expect(body.accountType).toBe('CHECKING');
      expect(body.balance).toBe('1000');
      expect(body.status).toBe('ACTIVE');
    });

    it('should create account with zero balance when initialBalance not provided', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '987654321',
          accountNumber: '1234567890',
          accountHolder: 'Jane Smith',
          accountType: 'SAVINGS',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.balance).toBe('0');
    });

    // Note: Duplicate account detection is not currently implemented due to encryption
    // using random IVs. This would require a hash-based lookup mechanism.

    it('should reject invalid routing number format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '12345', // Too short
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid account number format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '123', // Too short
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid account holder name', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'A', // Too short
          accountType: 'CHECKING',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject negative initial balance', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
          initialBalance: '-100.00',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject request without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /external-accounts/:routingNumber/:accountNumber', () => {
    it('should verify existing external bank account', async () => {
      // Create account first
      await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
          initialBalance: '500.00',
        },
      });

      // Verify account
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts/123456789/9876543210',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.exists).toBe(true);
      expect(body.accountHolder).toBe('John Doe');
      expect(body.accountType).toBe('CHECKING');
      expect(body.status).toBe('ACTIVE');
    });

    it('should return exists false for non-existent account', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts/999999999/9999999999',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.exists).toBe(false);
    });

    it('should reject request without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts/123456789/9876543210',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /external-accounts', () => {
    it('should list all external bank accounts', async () => {
      // Create multiple accounts
      await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '1111111111',
          accountHolder: 'Alice',
          accountType: 'CHECKING',
          initialBalance: '100.00',
        },
      });

      await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '987654321',
          accountNumber: '2222222222',
          accountHolder: 'Bob',
          accountType: 'SAVINGS',
          initialBalance: '200.00',
        },
      });

      // List accounts
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accounts).toHaveLength(2);
      expect(body.accounts[0].accountNumber).toMatch(/^\*{4}\d{4}$/); // Masked
      expect(body.accounts[1].accountNumber).toMatch(/^\*{4}\d{4}$/); // Masked
    });

    it('should return empty array when no accounts exist', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.accounts).toHaveLength(0);
    });

    it('should reject request without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should reject external account creation with invalid token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: 'Bearer invalid-token',
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject external account creation without authorization header', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should allow owner to create external account with valid token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/external-accounts',
        headers: {
          authorization: `Bearer ${testOwnerToken}`,
        },
        payload: {
          routingNumber: '123456789',
          accountNumber: '9876543210',
          accountHolder: 'John Doe',
          accountType: 'CHECKING',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('should reject account verification with invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts/123456789/9876543210',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject account listing with invalid token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/external-accounts',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
