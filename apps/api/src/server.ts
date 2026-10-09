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

/**
 * Live registry of every registered route and its response schema fragments.
 * Populated by the onRoute hook below. Used by the security suite to walk
 * ALL route schemas and assert no credential-shaped property is declared
 * anywhere except the documented show-once responses — so a future route
 * that forgets this discipline fails the test, not a user.
 */
export interface RegisteredRouteSchema {
  method: string;
  url: string;
  responseSchemas: unknown[];
}
export const registeredRouteSchemas: RegisteredRouteSchema[] = [];

export async function buildServer(options: ServerOptions): Promise<FastifyInstance> {
  const { logger = true, prisma } = options;

  // Initialize Fastify with logging
  const server = Fastify({
    logger: logger ? {
      level: process.env.LOG_LEVEL || 'info',
    } : false,
  });

  // Keep the exact bytes PayPal signed available to the webhook route
  // (Phase 7): parse JSON ourselves and stash the raw string on the request.
  // Behavior for all other routes is unchanged (body still parsed as JSON).
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as any).rawBody = body;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Register CORS middleware
  // CORS_ORIGIN accepts a single origin or a comma-separated list, so the
  // dashboard can be served as both http://localhost:3001 and
  // http://127.0.0.1:3001 without a restart dance between the two.
  const corsOriginEnv = (process.env.CORS_ORIGIN || '*').split(',').map((o) => o.trim()).filter(Boolean);
  await server.register(cors, {
    origin: corsOriginEnv.length === 1 ? corsOriginEnv[0] : corsOriginEnv,
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

  // Record every route's response schema for the security suite's walk.
  server.addHook('onRoute', (route) => {
    const response = (route.schema as any)?.response;
    if (!response) return;
    registeredRouteSchemas.push({
      method: String(route.method),
      url: route.url,
      responseSchemas: Object.values(response),
    });
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
  const { paypalWebhookRoutes } = await import('./routes/paypal-webhook.routes');
  const { paypalReturnRoutes } = await import('./routes/paypal-return.routes');

  await server.register(authRoutes);
  await server.register(accountRoutes);
  await server.register(paymentRoutes);
  await server.register(paymentRequestRoutes);
  await server.register(cardRoutes);
  await server.register(transactionRoutes);
  await server.register(webhookRoutes);
  await server.register(externalAccountRoutes);
  await server.register(paypalWebhookRoutes);
  await server.register(paypalReturnRoutes);

  return server;
}

// Extend Fastify types to include prisma and wsServer
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    wsServer: WebSocketServer;
  }
}
