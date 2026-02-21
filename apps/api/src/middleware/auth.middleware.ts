import { FastifyRequest, FastifyReply } from 'fastify';
import { Owner, Agent } from '@moltmoney/database';
import { OwnerAuthService } from '../services/auth/owner-auth.service';
import { AgentAuthService } from '../services/auth/agent-auth.service';

export interface AuthenticatedOwnerRequest extends FastifyRequest {
  owner: Owner;
}

export interface AuthenticatedAgentRequest extends FastifyRequest {
  agent: Agent;
}

export interface AuthenticatedRequest extends FastifyRequest {
  owner?: Owner;
  agent?: Agent;
}

/**
 * Middleware to require owner authentication
 * Requirements: 1.3
 */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Get Prisma client from Fastify instance
    const prisma = (request.server as any).prisma;
    const ownerAuthService = new OwnerAuthService(prisma);

    // Extract JWT token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token and get owner
    const owner = await ownerAuthService.verifyOwnerToken(token);

    // Attach owner to request
    (request as any).owner = owner;
  } catch (error) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: error instanceof Error ? error.message : 'Authentication failed',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Middleware to require agent authentication
 * Requirements: 1.3
 */
export async function requireAgent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Get Prisma client from Fastify instance
    const prisma = (request.server as any).prisma;
    const agentAuthService = new AgentAuthService(prisma);

    // Extract API key from Authorization header or X-API-Key header
    const authHeader = request.headers.authorization;
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    let apiKey: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing API key',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Verify API key and get agent
    const agent = await agentAuthService.verifyApiKey(apiKey);

    // Attach agent to request
    (request as any).agent = agent;
  } catch (error) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: error instanceof Error ? error.message : 'Authentication failed',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Middleware to require either owner or agent authentication
 * Requirements: 1.3
 */
export async function requireOwnerOrAgent(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    // Get Prisma client from Fastify instance
    const prisma = (request.server as any).prisma;
    const ownerAuthService = new OwnerAuthService(prisma);
    const agentAuthService = new AgentAuthService(prisma);

    const authHeader = request.headers.authorization;
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;

    if (!authHeader && !apiKeyHeader) {
      reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing authentication credentials',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Try owner authentication first (JWT token)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const owner = await ownerAuthService.verifyOwnerToken(token);
        (request as any).owner = owner;
        return;
      } catch {
        // If JWT verification fails, try API key
      }
    }

    // Try agent authentication (API key)
    let apiKey: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7);
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (apiKey) {
      try {
        const agent = await agentAuthService.verifyApiKey(apiKey);
        (request as any).agent = agent;
        return;
      } catch {
        // API key verification failed
      }
    }

    // Both authentication methods failed
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authentication credentials',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: error instanceof Error ? error.message : 'Authentication failed',
        timestamp: new Date().toISOString(),
      },
    });
  }
}
