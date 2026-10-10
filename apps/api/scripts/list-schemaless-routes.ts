/* Maintenance helper: prints every registered route and whether it declares
 * a response schema. The guardrail test
 * (src/routes/__tests__/response-schema-guardrail.test.ts) enforces this;
 * this script is the human-facing companion for triage when it fails.
 * Run: npx tsx apps/api/scripts/list-schemaless-routes.ts (no DB needed). */
import { prismaStub } from './prisma-stub';

async function main() {
  const { buildServer, registeredRouteSchemas } = await import('../src/server');
  const server = await buildServer({ logger: false, prisma: prismaStub as any });
  await server.ready();
  const missing = registeredRouteSchemas.filter((r) => !r.responseSchemas || r.responseSchemas.length === 0);
  const has = registeredRouteSchemas.filter((r) => r.responseSchemas && r.responseSchemas.length > 0);
  console.log('total                :', registeredRouteSchemas.length);
  console.log('routes with schema   :', has.length);
  console.log('routes w/o schema    :', missing.length);
  for (const r of has) console.log(`  [schema] ${r.method} ${r.url} (${r.responseSchemas.length})`);
  for (const r of missing) console.log(`  [no-schema] ${r.method} ${r.url}`);
  await server.close();
  server.wsServer.shutdown();
  setTimeout(() => process.exit(0), 50).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
