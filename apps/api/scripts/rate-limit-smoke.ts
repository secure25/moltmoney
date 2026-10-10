/* Smoke: @fastify/rate-limit on this repo's Fastify (4.x). Verifies the
 * plugin registers (no fastify-plugin major-version rejection) and returns
 * 200s then a 429 with Retry-After. maintenances helper; kept for triage. */
const Fastify = require('fastify');
const rateLimit = require('@fastify/rate-limit');

async function main() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, { global: true, max: 3, timeWindow: 60_000 });
  app.get('/x', async () => 'ok');
  await app.ready();
  const codes: number[] = [];
  let retryAfter: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await app.inject({ method: 'GET', url: '/x' });
    codes.push(res.statusCode);
    if (res.statusCode === 429) retryAfter = res.headers['retry-after'] as string;
  }
  console.log('codes:', codes.join(','), 'retry-after:', retryAfter);
  const ok = codes.slice(0, 3).every(c => c === 200) && codes[3] === 429 && !!retryAfter;
  await app.close();
  process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
