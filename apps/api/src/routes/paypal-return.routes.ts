import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TxStatus } from '@prisma/client';

/**
 * GET /payments/paypal/return and GET /payments/paypal/cancel —
 * buyer-facing redirect targets for the PayPal redirect approval flow
 * (Phase 5).
 *
 * resolveCallbackUrl() builds these URLs from the existing BASE_URL
 * configuration:
 *     ${BASE_URL}/payments/paypal/return
 *     ${BASE_URL}/payments/paypal/cancel
 *
 * PayPal redirects the buyer's browser to the return URL after the payer
 * approves on paypal.com (query: ?token=<orderId>&PayerID=<payerId>), or to
 * the cancel URL when the buyer backs out. For a local deployment BASE_URL is
 * the API's own address (e.g. http://localhost:3000); for a remote buyer,
 * point BASE_URL at a publicly reachable address — no URL is hardcoded here.
 *
 * These endpoints are deliberately NOT protected by agent API-key auth: the
 * caller is the buyer's browser, which carries no MoltMoney credentials.
 *
 * Safety contract:
 *   - Strictly READ-ONLY. No transaction state changes, no captures, no
 *     balance movement ever happens here. Capture remains a separate,
 *     explicitly-authenticated, idempotent API call
 *     (POST /payments/paypal/orders/:orderId/capture).
 *   - The authoritative payer-approval reconciliation happens exclusively in
 *     the CHECKOUT.ORDER.APPROVED webhook path
 *     (payment.service.handleProviderWebhook), which verifies PayPal's
 *     signature and dedupes on the transmission id.
 *   - Only data the buyer already saw on the PayPal approval screen is
 *     displayed (amount, currency, description, merchant, status). No account
 *     ids, balances, or internal metadata are rendered.
 */
export async function paypalReturnRoutes(server: FastifyInstance) {
  // PayPal order ids are alphanumeric with dashes/underscores; the token in
  // the redirect query is the same id. Strict validation + HTML escaping
  // below means the page can never reflect arbitrary input.
  const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function esc(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function page(opts: {
    title: string;
    heading: string;
    bodyHtml: string;
    refreshSeconds?: number;
  }): string {
    const refresh = opts.refreshSeconds
      ? `<meta http-equiv="refresh" content="${opts.refreshSeconds}">`
      : '';
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${refresh}
<title>${esc(opts.title)}</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f5f6f8; margin: 0; }
  .card { max-width: 560px; margin: 8vh auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { color: #333; line-height: 1.5; margin: 8px 0; }
  .muted { color: #667; font-size: 14px; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; background: #e8f0fe; color: #1a56db; }
</style>
</head>
<body>
<div class="card">
<h1>${esc(opts.heading)}</h1>
${opts.bodyHtml}
</div>
</body>
</html>`;
  }

  async function findTransactionByToken(token: string) {
    if (!TOKEN_RE.test(token)) return null;
    return server.prisma.transaction.findFirst({ where: { providerRefId: token } });
  }

  server.get(
    '/payments/paypal/return',
    {
      schema: {
        response: {
          // Body is the self-contained HTML page (verified verbatim under a
          // {type:'string'} serializer schema).
          200: { type: 'string' },
          404: { type: 'string' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const q = (request.query ?? {}) as Record<string, string>;
    const token = String(q.token ?? '').trim();
    reply.header('cache-control', 'no-store');

    const tx = await findTransactionByToken(token);
    if (!tx) {
      return reply
        .status(404)
        .type('text/html; charset=utf-8')
        .send(
          page({
            title: 'Order not found',
            heading: 'We could not find this order',
            bodyHtml:
              '<p>This payment link does not match any open order.</p>' +
              '<p class="muted">Nothing has been charged.</p>',
          })
        );
    }

    const summary =
      `<p><span class="badge">${esc(tx.amount.toString())} ${esc(tx.currency)}</span></p>` +
      (tx.merchantName ? `<p class="muted">Merchant: ${esc(tx.merchantName)}</p>` : '') +
      (tx.description ? `<p class="muted">${esc(tx.description)}</p>` : '');

    let heading: string;
    let bodyHtml: string;
    let refreshSeconds: number | undefined;

    switch (tx.status) {
      case TxStatus.APPROVED:
        heading = 'PayPal order approved';
        bodyHtml =
          `${summary}` +
          '<p>Your PayPal approval was received successfully.</p>' +
          '<p><strong>The payment has not been captured yet — nothing has been charged.</strong> ' +
          'The final capture is a separate step completed by the store; it does not happen on this page.</p>' +
          '<p class="muted">This page updates automatically.</p>';
        refreshSeconds = 5;
        break;
      case TxStatus.COMPLETED:
        heading = 'Payment completed';
        bodyHtml = `${summary}<p>The payment has been captured and completed. Thank you.</p>`;
        break;
      case TxStatus.PENDING:
        heading = 'Confirming your PayPal approval';
        bodyHtml =
          `${summary}` +
          '<p>We have received your return from PayPal and are confirming the approval. ' +
          'Nothing has been charged yet.</p>' +
          '<p class="muted">This page updates automatically.</p>';
        refreshSeconds = 5;
        break;
      case TxStatus.DECLINED:
      case TxStatus.FAILED:
        heading = 'Payment could not be completed';
        bodyHtml = `${summary}<p>This payment did not go through. Nothing has been charged.</p>`;
        break;
      default:
        heading = 'PayPal order';
        bodyHtml = `${summary}<p>Nothing has been charged.</p>`;
    }

    return reply
      .type('text/html; charset=utf-8')
      .send(page({ title: 'PayPal checkout', heading, bodyHtml, refreshSeconds }));
    }
  );

  server.get(
    '/payments/paypal/cancel',
    {
      schema: {
        response: {
          200: { type: 'string' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
    const q = (request.query ?? {}) as Record<string, string>;
    const token = String(q.token ?? '').trim();
    reply.header('cache-control', 'no-store');

    const tx = await findTransactionByToken(token);
    const summary = tx
      ? `<p><span class="badge">${esc(tx.amount.toString())} ${esc(tx.currency)}</span></p>` +
        (tx.merchantName ? `<p class="muted">Merchant: ${esc(tx.merchantName)}</p>` : '')
      : '';

    return reply
      .type('text/html; charset=utf-8')
      .send(
        page({
          title: 'Payment canceled',
          heading: 'Payment canceled',
          bodyHtml:
            `${summary}` +
            '<p>You returned from PayPal without completing the approval. The order was not ' +
            'approved and <strong>nothing has been charged</strong>.</p>',
        })
      );
    }
  );
}
