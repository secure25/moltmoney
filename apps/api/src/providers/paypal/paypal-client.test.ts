import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PayPalClient } from './paypal-client';
import { PayPalApiError } from './types';

/**
 * Unit tests for the PayPal OAuth client (Phase 4).
 * All HTTP is mocked — no live PayPal credentials are required.
 */

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeClient(fetchFn = vi.fn()): { client: PayPalClient; fetchFn: ReturnType<typeof vi.fn> } {
  const client = new PayPalClient(
    {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      baseUrl: 'https://api-m.sandbox.paypal.com',
      webhookId: 'test-webhook-id',
    },
    fetchFn as any
  );
  return { client, fetchFn };
}

/**
 * Temporarily remove real PayPal credentials from the TEST PROCESS env so
 * the "not configured" fallbacks can be exercised. vitest's dotenv setup
 * loads apps/api/.env (which contains real sandbox credentials); these tests
 * must isolate their environment rather than modify that file. The saved
 * values are always restored — production configuration is never touched.
 */
async function withoutPayPalEnv(run: () => void | Promise<void>): Promise<void> {
  const keys = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_API_BASE_URL', 'PAYPAL_WEBHOOK_ID'];
  const saved = keys.map((k) => [k, process.env[k]] as const);
  for (const k of keys) delete process.env[k];
  try {
    await run();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe('PayPalClient OAuth authentication', () => {
  let fetchFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchFn = vi.fn();
  });

  it('acquires a token with Basic auth and client_credentials grant', async () => {
    const { client } = makeClient(fetchFn);
    fetchFn.mockResolvedValueOnce(
      jsonResponse(200, { access_token: 'A21-token', expires_in: 32400, token_type: 'Bearer' })
    );

    const token = await client.getAccessToken();

    expect(token).toBe('A21-token');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
    expect(init.method).toBe('POST');
    // Basic auth = base64("client_id:client_secret")
    const expectedBasic = Buffer.from('test-client-id:test-client-secret').toString('base64');
    expect(init.headers.Authorization).toBe(`Basic ${expectedBasic}`);
    expect(init.body).toBe('grant_type=client_credentials');
  });

  it('reuses the cached token without new HTTP calls', async () => {
    const { client } = makeClient(fetchFn);
    fetchFn.mockResolvedValue(
      jsonResponse(200, { access_token: 'cached-token', expires_in: 32400 })
    );

    await client.getAccessToken();
    await client.getAccessToken();
    await client.getAccessToken();

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refreshes tokens that are about to expire', async () => {
    const { client } = makeClient(fetchFn);
    // expires_in well below the 60s refresh buffer -> must refresh
    fetchFn.mockResolvedValueOnce(jsonResponse(200, { access_token: 'short-lived', expires_in: 30 }));
    fetchFn.mockResolvedValueOnce(jsonResponse(200, { access_token: 'renewed', expires_in: 32400 }));

    const first = await client.getAccessToken();
    const second = await client.getAccessToken();

    expect(first).toBe('short-lived');
    expect(second).toBe('renewed');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('never exposes the client secret in auth failure errors', async () => {
    const { client } = makeClient(fetchFn);
    fetchFn.mockResolvedValue(
      jsonResponse(401, { name: 'UNAUTHENTICATED', message: 'Client credentials are invalid' })
    );

    await expect(client.getAccessToken()).rejects.toMatchObject({
      name: 'PayPalApiError',
      status: 401,
    });
    await expect(client.getAccessToken()).rejects.toThrow(/Client credentials are invalid/);

    try {
      await client.getAccessToken();
    } catch (error: any) {
      expect(error.message).not.toContain('test-client-secret');
      expect(JSON.stringify(error)).not.toContain('test-client-secret');
    }
  });

  it('converts network failures into PayPalApiError without leaking secrets', async () => {
    const { client } = makeClient(fetchFn);
    fetchFn.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(client.getAccessToken()).rejects.toMatchObject({
      name: 'PayPalApiError',
      status: 0,
    });
  });

  it('shares a single in-flight token request across concurrent callers', async () => {
    const { client } = makeClient(fetchFn);
    let resolveToken: (v: Response) => void = () => {};
    fetchFn.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveToken = resolve;
      })
    );

    const p1 = client.getAccessToken();
    const p2 = client.getAccessToken();
    resolveToken(jsonResponse(200, { access_token: 'shared', expires_in: 32400 }));

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('shared');
    expect(t2).toBe('shared');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('throws a safe error listing missing required env vars', async () => {
    await withoutPayPalEnv(() => {
      expect(() => new PayPalClient({ clientId: undefined as any })).toThrow(
        /PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET/
      );
      expect(() => new PayPalClient({ clientId: undefined as any })).not.toThrow(/secret/);
    });
  });
});

describe('PayPalClient.request', () => {
  let fetchFn: ReturnType<typeof vi.fn>;
  let client: PayPalClient;

  beforeEach(() => {
    fetchFn = vi.fn();
    ({ client } = makeClient(fetchFn));
    // One token for all requests
    fetchFn.mockImplementation(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return jsonResponse(200, { access_token: 'tok', expires_in: 32400 });
      }
      return jsonResponse(404, {});
    });
  });

  it('sends the bearer token and PayPal-Request-Id header', async () => {
    fetchFn.mockImplementation(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return jsonResponse(200, { access_token: 'tok', expires_in: 32400 });
      }
      return jsonResponse(200, { id: 'ORD-1' });
    });
    await client.request('POST', '/v2/checkout/orders', {
      body: { intent: 'CAPTURE' },
      idempotencyKey: 'stable-key-123',
    });

    const [url, init] = fetchFn.mock.calls[1];
    expect(url).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['PayPal-Request-Id']).toBe('stable-key-123');
  });

  it('surfaces API errors as PayPalApiError with status and safe message', async () => {
    fetchFn.mockResolvedValueOnce(
      jsonResponse(422, { name: 'UNPROCESSABLE_ENTITY', message: 'Amount is invalid' })
    );
    await expect(client.request('POST', '/v2/checkout/orders')).rejects.toMatchObject({
      name: 'PayPalApiError',
      status: 422,
    });
  });

  it('rejects malformed JSON responses instead of returning garbage', async () => {
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('unexpected end of json');
      },
    } as unknown as Response);

    await expect(client.request('GET', '/v2/checkout/orders/X')).rejects.toMatchObject({
      name: 'PayPalApiError',
    });
  });

  it('converts network failures on API calls into PayPalApiError', async () => {
    fetchFn.mockImplementation(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return jsonResponse(200, { access_token: 'tok', expires_in: 32400 });
      }
      throw new Error('socket hang up');
    });
    await expect(client.request('POST', '/v2/checkout/orders')).rejects.toMatchObject({
      name: 'PayPalApiError',
      status: 0,
    });
  });
});

describe('PayPalClient.verifyWebhookSignature', () => {
  it('returns true only for verification_status SUCCESS', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return jsonResponse(200, { access_token: 'tok', expires_in: 32400 });
      }
      return jsonResponse(200, { verification_status: 'SUCCESS' });
    });
    const { client } = makeClient(fetchFn);

    const result = await client.verifyWebhookSignature({
      authAlgo: 'SHA256withRSA',
      certUrl: 'https://api.paypal.com/v1/notifications/certs/CERT',
      transmissionId: 'tx-1',
      transmissionSig: 'sig',
      transmissionTime: '2026-01-01T00:00:00Z',
      webhookEvent: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    });

    expect(result).toBe(true);
    const [, init] = fetchFn.mock.calls[1];
    expect(init.body).toContain('test-webhook-id');
    expect(init.body).toContain('PAYMENT.CAPTURE.COMPLETED');
  });

  it('returns false when PayPal reports FAILURE', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith('/v1/oauth2/token')) {
        return jsonResponse(200, { access_token: 'tok', expires_in: 32400 });
      }
      return jsonResponse(200, { verification_status: 'FAILURE' });
    });
    const { client } = makeClient(fetchFn);

    const result = await client.verifyWebhookSignature({
      authAlgo: 'SHA256withRSA',
      certUrl: 'cert',
      transmissionId: 'tx-1',
      transmissionSig: 'bad-sig',
      transmissionTime: '2026-01-01T00:00:00Z',
      webhookEvent: {},
    });

    expect(result).toBe(false);
  });

  it('fails fast when PAYPAL_WEBHOOK_ID is not configured', async () => {
    // webhookId: null falls back to process.env.PAYPAL_WEBHOOK_ID, so the
    // real .env value must be isolated out for this test.
    await withoutPayPalEnv(async () => {
      const client = new PayPalClient(
        {
          clientId: 'id',
          clientSecret: 'secret',
          baseUrl: 'https://api-m.sandbox.paypal.com',
          webhookId: null,
        },
        vi.fn() as any
      );

      await expect(
        client.verifyWebhookSignature({
          authAlgo: 'a',
          certUrl: 'c',
          transmissionId: 't',
          transmissionSig: 's',
          transmissionTime: 'tt',
          webhookEvent: {},
        })
      ).rejects.toBeInstanceOf(PayPalApiError);
    });
  });
});
