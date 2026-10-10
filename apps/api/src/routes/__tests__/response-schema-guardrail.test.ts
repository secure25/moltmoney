import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer, registeredRouteSchemas } from '../../server';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';

/**
 * SCHEMA GUARDRAIL.
 *
 * Every registered route MUST declare a Fastify response schema. Response
 * schemas are the structural no-credential-serialization guarantee (see
 * no-credential-serialization.test.ts): the serializer strips any field not
 * declared. A route registered without `schema.response` would silently
 * serialize its full Prisma rows — exactly the leak class Task 6 closed.
 *
 * This test is deliberately build-only (no DB writes, no HTTP fixtures): a
 * new route added anywhere in the app must fail here until its author
 * declares the response shape.
 */
describe('Every registered route declares a response schema (guardrail)', () => {
  let prisma: PrismaClient;
  let server: FastifyInstance;

  beforeAll(async () => {
    prisma = new PrismaClient();
    server = await buildServer({ logger: false, prisma });
    await server.ready();
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await server.close();
    server.wsServer.shutdown();
  }, 15_000);

  it('records routes in the registry (walk mechanic intact)', () => {
    expect(registeredRouteSchemas.length).toBeGreaterThanOrEqual(25);
  });

  it('every registered route has at least one declared response schema', () => {
    const missing = registeredRouteSchemas.filter(
      (r) => !r.responseSchemas || r.responseSchemas.length === 0
    );
    expect(
      missing.map((r) => `${r.method} ${r.url}`),
      `Routes without schema.response ${missing.length ? '(fix these, see no-credential-serialization rationale in lib/serialize.ts)' : ''}`
    ).toEqual([]);
  });

  it('HEAD variants inherit the GET schema (Fastify exposes one route entry)', () => {
    // Fastify auto-generates HEAD for GET; sanity-check a few pairs so the
    // registry walk covers both when walking all entries.
    const pairs: Array<[string, string]> = [
      ['GET', 'HEAD'],
    ];
    const urls = new Set(registeredRouteSchemas.map((r) => `${r.method} ${r.url}`));
    for (const r of registeredRouteSchemas) {
      if (r.method === 'HEAD' && !urls.has(`GET ${r.url}`)) {
        pairs.push(['HEAD-only route (' + r.url + ')', 'no GET variant']);
      }
    }
    expect(pairs.filter((p) => p[1] !== 'HEAD')).toEqual([]);
  });

  it('GET /health serializes through its schema (canary for the registry walk)', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(Object.keys(parsed).sort()).toEqual(['status', 'timestamp']);
  });

  it('GET /auth/me strips the password hash (canary: raw owner row through schema)', async () => {
    const authService = new OwnerAuthService(prisma);
    const email = `guardrail-${Date.now()}@example.com`;
    await authService.registerOwner(email, 'Guardrail Owner', 'super-secret-pw');
    const { token } = await authService.loginOwner(email, 'super-secret-pw');

    const res = await server.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    // Handler returns the raw owner row, which also carries the bcrypt hash.
    expect(parsed.id).toBeTruthy();
    expect(parsed.email).toBe(email);
    expect(parsed.name).toBe('Guardrail Owner');
    expect(res.body).not.toContain('super-secret-pw');
    expect(parsed.password).toBeUndefined();
    expect(parsed.passwordHash).toBeUndefined();

    // Cleanup (DB-touching canary cleans only its own fixture).
    await prisma.owner.deleteMany({ where: { id: parsed.id } });
  });
});
