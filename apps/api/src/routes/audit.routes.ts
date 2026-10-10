import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireOwner } from '../middleware/auth.middleware';
import { errorResponse, str, DATE_TIME } from '../lib/serialize';

const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().max(64).optional(),
  actorType: z.enum(['owner', 'agent', 'system']).optional(),
  actorId: z.string().max(64).optional(),
});

/**
 * GET /audit-logs — owner-only audit trail listing, newest first.
 *
 * Optional filters: action (exact), actorType, actorId. Paginated
 * (page/pageSize, max 100). Every response row is pre-sanitized by the
 * writers (credential-shaped metadata keys were redacted at record time),
 * so nothing secretful can surface here.
 */
export async function auditRoutes(server: FastifyInstance) {
  server.get(
    '/audit-logs',
    {
      preHandler: requireOwner,
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: str,
                    actorType: str,
                    actorId: { anyOf: [str, { type: 'null' }] },
                    action: str,
                    targetType: { anyOf: [str, { type: 'null' }] },
                    targetId: { anyOf: [str, { type: 'null' }] },
                    metadata: { anyOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }] },
                    ip: { anyOf: [str, { type: 'null' }] },
                    createdAt: DATE_TIME,
                  },
                  required: ['id', 'actorType', 'action', 'createdAt'],
                },
              },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
            required: ['data', 'total', 'page', 'pageSize', 'hasMore'],
          },
          401: errorResponse(),
          403: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listAuditLogsSchema.parse(request.query);
      const owner = (request as any).owner;

      // Owners can see the whole trail (cross-agent) — audit is a control-plane
      // view; per-agent scoping is available via the actorId filter.
      const where: any = {};
      if (query.action) where.action = query.action;
      if (query.actorType) where.actorType = query.actorType;
      if (query.actorId) where.actorId = query.actorId;

      const skip = (query.page - 1) * query.pageSize;

      const [logs, total] = await Promise.all([
        server.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: query.pageSize,
        }),
        server.prisma.auditLog.count({ where }),
      ]);

      void owner; // requireOwner guarantees authorization above.

      return reply.send({
        data: logs.map((log) => ({
          id: log.id,
          actorType: log.actorType,
          actorId: log.actorId ?? null,
          action: log.action,
          targetType: log.targetType ?? null,
          targetId: log.targetId ?? null,
          metadata: log.metadata ?? null,
          ip: log.ip ?? null,
          createdAt: log.createdAt,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        hasMore: skip + logs.length < total,
      });
    }
  );
}
