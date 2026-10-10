import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createPaymentProvider,
  PaymentProvider,
  PayPalPaymentProvider,
  UnknownWebhookEventError,
  WebhookEvent,
  WebhookVerificationError,
} from '../providers';
import { createWebhookService } from '../services/webhook/webhook.service';
import { PaymentService } from '../services/payment/payment.service';
import { errorResponse } from '../lib/serialize';

const TRANSMISSION_HEADERS = [
  'paypal-transmission-id',
  'paypal-transmission-time',
  'paypal-cert-url',
  'paypal-auth-algo',
  'paypal-transmission-sig',
] as const;

function errorPayload(code: string, message: string) {
  return {
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  };
}

export async function paypalWebhookRoutes(server: FastifyInstance) {
  const paymentProvider: PaymentProvider = createPaymentProvider();
  const webhookService = createWebhookService(server.prisma);
  const paymentService = new PaymentService(
    server.prisma,
    paymentProvider,
    webhookService,
    server.wsServer
  );

  /**
   * POST /webhooks/paypal — inbound PayPal webhook receiver (Phase 7).
   *
   * Deliberately NOT protected by MoltMoney agent API-key auth: PayPal calls
   * this endpoint directly. Every payload is verified against PayPal's
   * /v1/notifications/verify-webhook-signature before any processing, and
   * duplicate deliveries are deduplicated on
   * ProviderWebhookEvent.transmissionId.
   *
   * Logging: only the transmission id and event type are ever logged —
   * never full webhook bodies (Phase 14).
   */
  server.post(
    '/webhooks/paypal',
    {
      schema: {
        response: {
          // PayPal only needs a 2xx; the body is informational.
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              transactionId: { type: 'string', nullable: true },
            },
            required: ['status'],
          },
          // Raw-byte + header failures are 400s thrown by the content-type
          // parser before the handler; Fastify validates those against the
          // error schema too.
          400: errorResponse(),
          401: errorResponse(),
          503: errorResponse(),
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(paymentProvider instanceof PayPalPaymentProvider)) {
      return reply.status(503).send(
        errorPayload(
          'PROVIDER_NOT_ACTIVE',
          'PayPal provider is not active (PAYMENT_PROVIDER is not "paypal")'
        )
      );
    }

    const headers: Record<string, string> = {};
    for (const header of TRANSMISSION_HEADERS) {
      const value = request.headers[header];
      if (typeof value !== 'string' || !value) {
        request.log.warn({
          transmissionHeader: header,
          msg: 'PayPal webhook rejected: missing transmission header',
        });
        return reply
          .status(400)
          .send(
            errorPayload(
              'MISSING_WEBHOOK_HEADERS',
              'PayPal webhook is missing required transmission headers'
            )
          );
      }
      headers[header] = value;
    }
    const transmissionId = headers['paypal-transmission-id'];

    const rawBody = (request as any).rawBody;
    if (typeof rawBody !== 'string' || rawBody.length === 0) {
      return reply
        .status(400)
        .send(errorPayload('INVALID_WEBHOOK_PAYLOAD', 'PayPal webhook body could not be read'));
    }

    // Verify + parse. Unverified payloads are never processed (Phase 7).
    let event: WebhookEvent;
    try {
      event = await paymentProvider.parseWebhook(rawBody, headers);
    } catch (error) {
      if (error instanceof UnknownWebhookEventError) {
        // Validly signed but unrecognized event: record + acknowledge.
        try {
          await server.prisma.providerWebhookEvent.create({
            data: {
              provider: 'paypal',
              transmissionId,
              eventType: error.eventType,
              payload: JSON.parse(rawBody) as any,
            },
          });
        } catch (e: any) {
          if (e?.code !== 'P2002') {
            request.log.error({ msg: 'Failed to record unrecognized PayPal webhook event' });
          }
        }
        return reply.status(200).send({ status: 'ignored' });
      }

      request.log.warn({
        transmissionId,
        msg: 'PayPal webhook rejected',
        reason:
          error instanceof WebhookVerificationError
            ? 'signature_verification_failed'
            : 'invalid_payload',
      });
      return reply
        .status(401)
        .send(
          errorPayload(
            'WEBHOOK_VERIFICATION_FAILED',
            'PayPal webhook signature verification failed'
          )
        );
    }

    // Fast-path dedupe: identical transmission ids are acknowledged as
    // success without reprocessing (Phase 7, requirement 9).
    const existing = await server.prisma.providerWebhookEvent.findUnique({
      where: { transmissionId },
    });
    if (existing) {
      return reply.status(200).send({ status: 'already_processed' });
    }

    // Process first, then record: the reconciler is idempotent (advisory
    // locks + conditional updates), so a replay after a crash can never
    // double-apply a state change or balance movement.
    const result = await paymentService.handleProviderWebhook(event);

    try {
      await server.prisma.providerWebhookEvent.create({
        data: {
          provider: 'paypal',
          transmissionId,
          eventType: (event.data as any)?.eventType ?? 'unknown',
          payload: JSON.parse(rawBody) as any,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        // A concurrent delivery of the same transmission id won the race.
        return reply.status(200).send({ status: 'already_processed' });
      }
      throw e;
    }

    request.log.info({
      transmissionId,
      eventType: (event.data as any)?.eventType,
      status: result.status,
    });

    return reply
      .status(200)
      .send({ status: result.status, transactionId: result.transactionId });
  });
}