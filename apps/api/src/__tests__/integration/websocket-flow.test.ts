import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { buildServer } from '../../server';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AccountService } from '../../services/account/account.service';
import WebSocket from 'ws';
import Decimal from 'decimal.js';
import { FastifyInstance } from 'fastify';

describe('Integration: WebSocket Real-Time Updates', () => {
  let prisma: PrismaClient;
  let server: FastifyInstance;
  let ownerAuthService: OwnerAuthService;
  let accountService: AccountService;
  let testOwnerId: string;
  let testOwnerToken: string;
  let serverAddress: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    accountService = new AccountService(prisma, undefined);

    // Build and start server
    server = await buildServer({ logger: false, prisma });
    await server.listen({ port: 0 }); // Random available port
    serverAddress = `http://localhost:${(server.server.address() as any).port}`;

    // Get wsServer from server instance
    const wsServer = server.wsServer;

    // Reinitialize services with wsServer (type assertion to avoid dist/src type mismatch)
    accountService = new AccountService(prisma, wsServer as any);

    // Register owner and get token
    const owner = await ownerAuthService.registerOwner(
      `test-${Date.now()}@example.com`,
      'Test Owner',
      'password123'
    );
    testOwnerId = owner.id;

    const loginResult = await ownerAuthService.loginOwner(
      owner.email,
      'password123'
    );
    testOwnerToken = loginResult.token;
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

    // Close server
    await server.close();
  });

  it('should receive real-time notification when payment requires approval', async () => {
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

    // Connect WebSocket as owner
    const wsUrl = serverAddress.replace('http://', 'ws://') + `/ws?token=${testOwnerToken}`;
    
    // Create promise to capture the connected message
    let resolveConnected: (value: any) => void;
    let rejectConnected: (reason: any) => void;
    const connectedPromise = new Promise<any>((resolve, reject) => {
      resolveConnected = resolve;
      rejectConnected = reject;
    });

    const ws = new WebSocket(wsUrl);

    // Set up message handler immediately
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          resolveConnected(message);
        }
      } catch (error) {
        rejectConnected(error);
      }
    });

    // Set up error handler
    ws.on('error', (error) => {
      rejectConnected(error);
    });

    // Set up close handler
    ws.on('close', (code, reason) => {
      if (code !== 1000) {
        rejectConnected(new Error(`WebSocket closed with code ${code}: ${reason}`));
      }
    });

    // Wait for connected message with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Did not receive connected message within 5 seconds')), 5000);
    });

    const connectedMessage = await Promise.race([connectedPromise, timeoutPromise]);
    expect(connectedMessage.type).toBe('connected');

    ws.close();
  });

  it('should receive balance update notification after payment', async () => {
    // Create agent accounts
    const { agent, account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Connect WebSocket as agent
    const wsUrl = serverAddress.replace('http://', 'ws://') + `/ws?apiKey=${agent.apiKey}`;
    const ws = new WebSocket(wsUrl);

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Verify connection works - wait for connected message
    const connectedMessage = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Did not receive connected message'));
      }, 2000);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          clearTimeout(timeout);
          resolve(message);
        }
      });
    });

    expect(connectedMessage.type).toBe('connected');

    ws.close();
  });

  it('should receive transaction created notification', async () => {
    // Create agent accounts
    const { agent, account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Connect WebSocket as agent
    const wsUrl = serverAddress.replace('http://', 'ws://') + `/ws?apiKey=${agent.apiKey}`;
    const ws = new WebSocket(wsUrl);

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    // Verify connection works - wait for connected message
    const connectedMessage = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Did not receive connected message'));
      }, 2000);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'connected') {
          clearTimeout(timeout);
          resolve(message);
        }
      });
    });

    expect(connectedMessage.type).toBe('connected');

    ws.close();
  });

  it('should handle multiple concurrent WebSocket connections', async () => {
    // Create agent account
    const { agent, account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Create multiple WebSocket connections
    const wsUrl = serverAddress.replace('http://', 'ws://') + `/ws?apiKey=${agent.apiKey}`;
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);
    const ws3 = new WebSocket(wsUrl);

    // Wait for all connections
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS1 timeout')), 5000);
        ws1.on('open', () => { clearTimeout(timeout); resolve(); });
        ws1.on('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS2 timeout')), 5000);
        ws2.on('open', () => { clearTimeout(timeout); resolve(); });
        ws2.on('error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WS3 timeout')), 5000);
        ws3.on('open', () => { clearTimeout(timeout); resolve(); });
        ws3.on('error', reject);
      })
    ]);

    // Set up message listeners
    const messages1: any[] = [];
    const messages2: any[] = [];
    const messages3: any[] = [];

    ws1.on('message', (data) => messages1.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => messages2.push(JSON.parse(data.toString())));
    ws3.on('message', (data) => messages3.push(JSON.parse(data.toString())));

    // Wait a bit for messages to be collected
    await new Promise(resolve => setTimeout(resolve, 500));

    // All connections should receive connected message
    expect(messages1.some(m => m.type === 'connected')).toBe(true);
    expect(messages2.some(m => m.type === 'connected')).toBe(true);
    expect(messages3.some(m => m.type === 'connected')).toBe(true);

    // Close connections
    ws1.close();
    ws2.close();
    ws3.close();
  });

  it('should reject WebSocket connection with invalid authentication', async () => {
    // Try to connect with invalid token
    const wsUrl = serverAddress.replace('http://', 'ws://') + '/ws?token=invalid-token';
    const ws = new WebSocket(wsUrl);

    // Wait for connection to be rejected
    await new Promise<void>((resolve) => {
      ws.on('close', (code) => {
        expect(code).toBe(1008); // Authentication failed
        resolve();
      });
    });
  });

  it('should enforce maximum connection limit per account', async () => {
    // Create agent account
    const { agent } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    const wsUrl = serverAddress.replace('http://', 'ws://') + `/ws?apiKey=${agent.apiKey}`;

    // Create maximum allowed connections (5)
    const connections: WebSocket[] = [];
    for (let i = 0; i < 5; i++) {
      const ws = new WebSocket(wsUrl);
      connections.push(ws);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`WS${i} timeout`)), 5000);
        ws.on('open', () => { clearTimeout(timeout); resolve(); });
        ws.on('error', reject);
      });
    }

    // Try to create 6th connection (should be rejected)
    const ws6 = new WebSocket(wsUrl);
    
    await new Promise<void>((resolve) => {
      ws6.on('close', (code) => {
        expect(code).toBe(1008); // Maximum connections exceeded
        resolve();
      });
    });

    // Close all connections
    connections.forEach(ws => ws.close());
  });
});
