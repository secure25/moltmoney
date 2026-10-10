import {
  PayPalApiError,
  PayPalClientConfig,
  PayPalWebhookVerificationInput,
  PayPalWebhookVerificationResponse,
} from './types';

/** Refresh the cached token this many milliseconds before it actually expires. */
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Reads a JSON body defensively. Never throws on malformed responses.
 */
async function readJsonBody(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Builds a safe, loggable error message from a PayPal error response.
 * Only the HTTP status and PayPal's own `name`/`message`/`error_description`
 * fields are included — never request credentials or Authorization headers.
 */
function safeApiErrorMessage(context: string, status: number, body: any): string {
  const parts = [`${context} (HTTP ${status})`];
  if (body && typeof body === 'object') {
    if (typeof body.name === 'string' && body.name) parts.push(body.name);
    if (typeof body.message === 'string' && body.message) parts.push(body.message);
    if (typeof body.error_description === 'string' && body.error_description) {
      parts.push(body.error_description);
    }
  }
  return parts.join(': ');
}

/**
 * Low-level PayPal REST client.
 *
 * - OAuth 2.0 client-credentials token acquisition (POST /v1/oauth2/token)
 * - In-memory token cache with refresh before expiry (60s buffer)
 * - The access token is never written to disk, persisted, returned through
 *   an API, logged, or included in thrown error messages.
 */
export class PayPalClient {
  private readonly config: PayPalClientConfig;
  private readonly fetchFn: FetchLike;
  private cachedToken: { accessToken: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(config?: Partial<PayPalClientConfig>, fetchFn?: FetchLike) {
    const clientId = config?.clientId ?? process.env.PAYPAL_CLIENT_ID;
    const clientSecret = config?.clientSecret ?? process.env.PAYPAL_CLIENT_SECRET;
    const baseUrl = (
      config?.baseUrl ??
      process.env.PAYPAL_API_BASE_URL ??
      'https://api-m.sandbox.paypal.com'
    ).replace(/\/+$/, '');
    const webhookId = config?.webhookId ?? process.env.PAYPAL_WEBHOOK_ID ?? null;

    const missing: string[] = [];
    if (!clientId) missing.push('PAYPAL_CLIENT_ID');
    if (!clientSecret) missing.push('PAYPAL_CLIENT_SECRET');
    if (missing.length > 0) {
      throw new Error(
        `PayPal provider is not configured. Missing required environment variables: ${missing.join(', ')}`
      );
    }

    this.config = { clientId: clientId!, clientSecret: clientSecret!, baseUrl, webhookId };
    this.fetchFn = fetchFn ?? ((input, init) => fetch(input, init));
  }

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Returns a valid access token, refreshing it before expiry.
   * Concurrent callers share a single in-flight token request.
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS > now) {
      return this.cachedToken.accessToken;
    }

    if (!this.tokenRequest) {
      this.tokenRequest = this.requestNewToken().finally(() => {
        this.tokenRequest = null;
      });
    }
    return this.tokenRequest;
  }

  /** Internal: forget the cached token (used by tests to force a refresh). */
  clearTokenCache(): void {
    this.cachedToken = null;
  }

  private async requestNewToken(): Promise<string> {
    const basicAuth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
    } catch (error) {
      throw new PayPalApiError(
        'PayPal OAuth token request failed due to a network error',
        0
      );
    }

    const body = await readJsonBody(response);
    if (!response.ok) {
      throw new PayPalApiError(
        safeApiErrorMessage('PayPal OAuth authentication failed', response.status, body),
        response.status,
        body?.name
      );
    }

    const accessToken = body?.access_token;
    const expiresIn = Number(body?.expires_in);
    if (typeof accessToken !== 'string' || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new PayPalApiError(
        'PayPal OAuth token response was invalid',
        response.status
      );
    }

    this.cachedToken = {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return accessToken;
  }

  /**
   * Authenticated REST request.
   * @param opts.idempotencyKey sent as the `PayPal-Request-Id` header. Callers
   *   must pass a STABLE key for the same logical operation so retries are
   *   idempotent on PayPal's side.
   */
  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts?: { body?: unknown; idempotencyKey?: string }
  ): Promise<T> {
    const accessToken = await this.getAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (opts?.idempotencyKey) {
      headers['PayPal-Request-Id'] = opts.idempotencyKey;
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (error) {
      throw new PayPalApiError(
        `PayPal API request to ${path} failed due to a network error`,
        0
      );
    }

    if (!response.ok) {
      const body = await readJsonBody(response);
      throw new PayPalApiError(
        safeApiErrorMessage(`PayPal API request to ${path} failed`, response.status, body),
        response.status,
        body?.name
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const body = await readJsonBody(response);
    if (body === null) {
      throw new PayPalApiError(
        `PayPal API request to ${path} returned a malformed JSON response`,
        response.status
      );
    }
    return body as T;
  }

  /**
   * Verifies a webhook's transmission signature against PayPal.
   * Returns true only when PayPal answers verification_status === 'SUCCESS'.
   */
  async verifyWebhookSignature(input: PayPalWebhookVerificationInput): Promise<boolean> {
    if (!this.config.webhookId) {
      throw new PayPalApiError(
        'PayPal webhook verification is not configured (missing PAYPAL_WEBHOOK_ID)',
        0
      );
    }

    const result = await this.request<PayPalWebhookVerificationResponse>(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      {
        body: {
          auth_algo: input.authAlgo,
          cert_url: input.certUrl,
          transmission_id: input.transmissionId,
          transmission_sig: input.transmissionSig,
          transmission_time: input.transmissionTime,
          webhook_id: this.config.webhookId,
          webhook_event: input.webhookEvent,
        },
      }
    );

    return result?.verification_status === 'SUCCESS';
  }
}
