import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@moltmoney/database';
import { ZodError } from 'zod';
import { AppError } from '@moltmoney/shared';
import { WebSocketServer } from './websocket';

export interface ServerOptions {
  logger?: boolean;
  prisma: PrismaClient;
}

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const { logger = true, prisma } = options;

  // Initialize Fastify with logging
  const server = Fastify({
    logger: logger ? {
      level: process.env.LOG_LEVEL || 'info',
    } : false,
  });

  // Register CORS middleware
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  // Register WebSocket support
  await server.register(websocket);

  // Attach Prisma client to server instance for use in routes
  server.decorate('prisma', prisma);

  // Initialize WebSocket server
  const wsServer = new WebSocketServer(prisma);
  wsServer.initialize(server);
  server.decorate('wsServer', wsServer);

  // Global error handler
  server.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    const timestamp = new Date().toISOString();

    // Log error with context
    request.log.error({
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors,
          timestamp,
        },
      });
    }

    // Handle custom application errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          timestamp,
        },
      });
    }

    // Handle rate limiting errors
    if ((error as any).statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: error.message || 'Too many requests',
          timestamp,
        },
      });
    }

    // Handle Prisma unique constraint violations
    if ((error as any).code === 'P2002') {
      return reply.status(400).send({
        error: {
          code: 'DUPLICATE_ERROR',
          message: 'A record with this value already exists',
          timestamp,
        },
      });
    }

    // Default internal server error
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        timestamp,
      },
    });
  });

  // Health check endpoint
  server.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register routes
  const { authRoutes } = await import('./routes/auth.routes');
  const { accountRoutes } = await import('./routes/account.routes');
  const { paymentRoutes } = await import('./routes/payment.routes');
  const { paymentRequestRoutes } = await import('./routes/payment-request.routes');
  const { cardRoutes } = await import('./routes/card.routes');
  const { transactionRoutes } = await import('./routes/transaction.routes');
  const { webhookRoutes } = await import('./routes/webhook.routes');
  const { externalAccountRoutes } = await import('./routes/external-account.routes');

  await server.register(authRoutes);
  await server.register(accountRoutes);
  await server.register(paymentRoutes);
  await server.register(paymentRequestRoutes);
  await server.register(cardRoutes);
  await server.register(transactionRoutes);
  await server.register(webhookRoutes);
  await server.register(externalAccountRoutes);

  return server;
}

// Extend Fastify types to include prisma and wsServer
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    wsServer: WebSocketServer;
  }
}
