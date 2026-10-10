#!/usr/bin/env node
/**
 * End-to-end smoke test for MoltMoney (no Docker required).
 *
 * Prerequisites:
 *   npm run db:up               (embedded Postgres on localhost:54329)
 *   npm run db:migrate:reset    (first run only)
 *   API server on http://localhost:3000  (npm run dev, or npm run start -w @moltmoney/api)
 *
 * Run: node scripts/smoke.mjs
 * Exits non-zero on the first failed assertion.
 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';

let passed = 0;
function ok(cond, label, extra = '') {
  if (cond) {
    passed++;
    console.log(`  PASS ${label}`);
  } else {
    console.error(`  FAIL ${label} ${extra}`);
    console.error(`\nSmoke test failed at step: ${label} (${passed} passed before failure)`);
    process.exit(1);
  }
}

async function api(method, path, { token, apiKey, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      // Only send Content-Type when there is a body — Fastify rejects empty
      // bodies carrying 'application/json'.
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

const email = `smoke-${Date.now()}@example.com`;

async function getBalance(accountId, auth) {
  const { json } = await api('GET', `/accounts/${accountId}/balance`, auth);
  return json?.balance;
}

async function main() {
  console.log(`Smoke testing MoltMoney API at ${BASE}\n`);

  // 1. Health
  const health = await api('GET', '/health');
  ok(health.status === 200, 'GET /health is 200');

  // 2. Register owner
  const reg = await api('POST', '/auth/register', {
    body: { email, name: 'Smoke Owner', password: 'smoke-password-123' },
  });
  ok(reg.status === 201 && reg.json?.token, 'POST /auth/register returns 201 + token');
  const ownerToken = reg.json.token;

  // 3. Create two agents
  const a1 = await api('POST', '/accounts', {
    token: ownerToken,
    body: { name: 'Smoke Agent 1', platform: 'OpenClaw' },
  });
  ok(a1.status === 201 && a1.json?.agent?.apiKey?.length === 64, 'POST /accounts creates agent 1 with 64-char API key');
  ok(!!a1.json?.virtualCard?.cardNumber, 'agent 1 gets a virtual card');
  const { apiKey: key1, id: acc1 } = { apiKey: a1.json.agent.apiKey, id: a1.json.account.id };

  const a2 = await api('POST', '/accounts', {
    token: ownerToken,
    body: { name: 'Smoke Agent 2', platform: 'OpenClaw' },
  });
  ok(a2.status === 201, 'POST /accounts creates agent 2');
  const { apiKey: key2, id: acc2 } = { apiKey: a2.json.agent.apiKey, id: a2.json.account.id };

  // 4. Fund agent 1 with 100
  const fund = await api('POST', `/accounts/${acc1}/fund`, {
    token: ownerToken,
    body: { amount: '100' },
  });
  ok(fund.status === 200 && fund.json?.transaction?.status === 'COMPLETED', 'fund 100 completes');
  ok((await getBalance(acc1, { apiKey: key1 })) === '100.00', 'agent 1 balance is 100.00');

  // 5. Pay merchant 25 — money must actually move
  const pay = await api('POST', '/payments/send', {
    apiKey: key1,
    body: { merchantName: 'OpenAI', amount: '25', description: 'smoke: API credits' },
  });
  ok(pay.status === 201 && pay.json?.transaction?.status === 'COMPLETED', 'merchant payment 25 completes');
  ok((await getBalance(acc1, { apiKey: key1 })) === '75.00', 'agent 1 balance dropped to 75.00');

  // 6. Insufficient funds — declined, balance unchanged
  const broke = await api('POST', '/payments/send', {
    apiKey: key1,
    body: { merchantName: 'TooExpensive', amount: '200' },
  });
  ok(broke.status >= 400, `payment of 200 declined (HTTP ${broke.status})`);
  ok((await getBalance(acc1, { apiKey: key1 })) === '75.00', 'balance unchanged after decline');

  // 7. Agent-to-agent transfer 10
  const fund2 = await api('POST', `/accounts/${acc2}/fund`, {
    token: ownerToken,
    body: { amount: '50' },
  });
  ok(fund2.status === 200, 'fund agent 2 with 50');
  const xfer = await api('POST', '/payments/send', {
    apiKey: key2,
    body: { toAccountId: acc1, amount: '10', description: 'smoke: transfer' },
  });
  ok(xfer.status === 201 && xfer.json?.transaction?.status === 'COMPLETED', 'agent2 -> agent1 transfer completes');
  ok((await getBalance(acc1, { apiKey: key1 })) === '85.00', 'agent 1 balance is 85.00');
  ok((await getBalance(acc2, { apiKey: key2 })) === '40.00', 'agent 2 balance is 40.00');

  // 8. Freeze blocks payments; unfreeze restores
  const freeze = await api('POST', `/accounts/${acc2}/freeze`, { token: ownerToken });
  ok(
    freeze.status === 200 && freeze.json?.account?.status === 'FROZEN',
    'freeze agent 2',
    `(HTTP ${freeze.status} ${JSON.stringify(freeze.json)})`
  );
  const frozenPay = await api('POST', '/payments/send', {
    apiKey: key2,
    body: { merchantName: 'Blocked', amount: '5' },
  });
  ok(frozenPay.status >= 400, 'frozen agent cannot pay');
  ok((await getBalance(acc2, { apiKey: key2 })) === '40.00', 'frozen balance untouched');
  await api('POST', `/accounts/${acc2}/unfreeze`, { token: ownerToken });
  ok((await getBalance(acc2, { apiKey: key2 })) === '40.00', 'unfrozen agent still has 40.00');

  console.log(`\nAll ${passed} smoke assertions passed. ✔`);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});
