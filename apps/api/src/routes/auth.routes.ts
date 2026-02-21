import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { OwnerAuthService } from '../services/auth/owner-auth.service';
import { AgentAuthService } from '../services/auth/agent-auth.service';
import { createRateLimiter } from '../middleware/rate-limit.middleware';
import { requireOwner } from '../middleware/auth.middleware';

// Request schemas
const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const generateApiKeySchema = z.object({
  agentId: z.string().uuid(),
});

export async function authRoutes(server: FastifyInstance) {
  const ownerAuthService = new OwnerAuthService(server.prisma);
  const agentAuthService = new AgentAuthService(server.prisma);

  // Create rate limiter for auth endpoints
  // Development: 100 attempts per 1 minute (for testing)
  // Production: 5 attempts per 15 minutes
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const authRateLimiter = createRateLimiter(
    isDevelopment ? 100 : 5,
    isDevelopment ? 60 * 1000 : 15 * 60 * 1000
  );
  
  if (isDevelopment) {
    server.log.info('Auth rate limiter: 100 attempts per minute (development mode)');
  }

  /**
   * GET /auth/me - Get current user info
   */
  server.get(
    '/auth/me',
    {
      preHandler: requireOwner,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const owner = (request as any).owner;

      return reply.send({
        id: owner.id,
        email: owner.email,
        name: owner.name,
      });
    }
  );

  /**
   * POST /auth/register - Register a new owner
   * Requirements: 1.1
   */
  server.post(
    '/auth/register',
    {
      preHandler: authRateLimiter,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = registerSchema.parse(request.body);

      try {
        const owner = await ownerAuthService.registerOwner(
          body.email,
          body.name,
          body.password
        );

        // Generate token for immediate login
        const { token } = await ownerAuthService.loginOwner(body.email, body.password);

        return reply.status(201).send({
          owner: {
            id: owner.id,
            email: owner.email,
            name: owner.name,
          },
          token,
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          return reply.status(400).send({
            error: {
              code: 'DUPLICATE_EMAIL',
              message: 'An account with this email already exists',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw error;
      }
    }
  );

  /**
   * POST /auth/login - Authenticate owner
   * Requirements: 1.2
   */
  server.post(
    '/auth/login',
    {
      preHandler: authRateLimiter,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = loginSchema.parse(request.body);

      try {
        const { token, owner } = await ownerAuthService.loginOwner(
          body.email,
          body.password
        );

        return reply.send({
          owner: {
            id: owner.id,
            email: owner.email,
            name: owner.name,
          },
          token,
        });
      } catch (error: any) {
        if (error.message === 'Invalid credentials') {
          return reply.status(401).send({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password',
              timestamp: new Date().toISOString(),
            },
          });
        }
        throw error;
      }
    }
  );

  /**
   * POST /auth/agents/keys - Generate API key for agent
   * Requirements: 2.2
   */
  server.post(
    '/auth/agents/keys',
    {
      preHandler: requireOwner,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = generateApiKeySchema.parse(request.body);
      const owner = (request as any).owner;

      // Verify agent belongs to owner
      const agent = await server.prisma.agent.findUnique({
        where: { id: body.agentId },
      });

      if (!agent || agent.ownerId !== owner.id) {
        return reply.status(403).send({
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: 'You do not have permission to generate API keys for this agent',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const apiKey = await agentAuthService.generateApiKey(body.agentId);

      return reply.send({
        agentId: body.agentId,
        apiKey,
      });
    }
  );
}
