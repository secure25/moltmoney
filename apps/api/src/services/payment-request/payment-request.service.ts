import { PrismaClient, PaymentRequest, RequestStatus, AccountStatus, TxType, TxStatus } from '@moltmoney/database';
import Decimal from 'decimal.js';
import { isValidAmount } from '@moltmoney/shared';
import crypto from 'crypto';
import { WebSocketServer, RealtimeEventType } from '../../websocket';

export class PaymentRequestService {
  constructor(
    private prisma: PrismaClient,
    private wsServer?: WebSocketServer
  ) {}

  /**
   * Create a payment request with unique payment link generation
   * Requirements: 8.1, 8.2
   */
  async createRequest(
    fromAccountId: string,
    toAccountId: string | null, // null means fund request to owner
    amount: Decimal,
    description: string,
    expiresAt: Date,
    generateLink: boolean = false
  ): Promise<PaymentRequest> {
    // Validate amount
    if (!isValidAmount(amount)) {
      throw new Error('Amount must be positive and non-zero');
    }

    // Verify from account exists
    const fromAccount = await this.prisma.account.findUnique({
      where: { id: fromAccountId },
    });

    if (!fromAccount) {
      throw new Error('Requester account not found');
    }

    // If toAccountId provided, verify it exists
    if (toAccountId) {
      const toAccount = await this.prisma.account.findUnique({
        where: { id: toAccountId },
      });

      if (!toAccount) {
        throw new Error('Recipient account not found');
      }
    }

    // Generate unique payment link if requested
    let paymentLink: string | null = null;
    if (generateLink) {
      paymentLink = crypto.randomBytes(32).toString('hex');
    }

    // Create payment request
    const paymentRequest = await this.prisma.paymentRequest.create({
      data: {
        amount,
        currency: 'USD',
        description,
        status: RequestStatus.PENDING,
        paymentLink,
        fromAccountId,
        ...(toAccountId && { toAccountId }), // Only include toAccountId if it's not null
        expiresAt,
      },
    });

    // Broadcast payment_request_received event via WebSocket (Requirement 16.2, 17.5)
    if (this.wsServer) {
      try {
        if (toAccountId) {
          // Regular payment request - broadcast to recipient account
          await this.wsServer.broadcast(toAccountId, {
            type: RealtimeEventType.PAYMENT_REQUEST_RECEIVED,
            data: {
              requestId: paymentRequest.id,
              amount: paymentRequest.amount.toString(),
              description: paymentRequest.description,
              fromAccountId,
              expiresAt: paymentRequest.expiresAt.toISOString(),
            },
            timestamp: new Date(),
          });
        } else {
          // Fund request to owner - broadcast to owner
          const fromAccountWithAgent = await this.prisma.account.findUnique({
            where: { id: fromAccountId },
            include: { Agent: true },
          });
          
          if (fromAccountWithAgent?.Agent?.ownerId) {
            await this.wsServer.broadcastToOwner(fromAccountWithAgent.Agent.ownerId, {
              type: RealtimeEventType.PAYMENT_REQUEST_RECEIVED,
              data: {
                requestId: paymentRequest.id,
                amount: paymentRequest.amount.toString(),
                description: paymentRequest.description,
                fromAccountId,
                expiresAt: paymentRequest.expiresAt.toISOString(),
              },
              timestamp: new Date(),
            });
          }
        }
      } catch (error) {
        console.error('WebSocket broadcast failed:', error);
      }
    }

    return paymentRequest;
  }

  /**
   * Pay a payment request (process payment and update status)
   * Requirements: 8.3
   */
  async payRequest(
    requestId: string,
    payerAccountId: string
  ): Promise<{ request: PaymentRequest; transactionId: string }> {
    // Get the payment request
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: {
        Account_PaymentRequest_fromAccountIdToAccount: true,
        Account_PaymentRequest_toAccountIdToAccount: true,
      },
    });

    if (!request) {
      throw new Error('Payment request not found');
    }

    // Verify request is pending
    if (request.status !== RequestStatus.PENDING) {
      throw new Error(`Payment request is ${request.status.toLowerCase()}`);
    }

    // Check if request has expired
    if (new Date() > request.expiresAt) {
      // Update status to expired
      await this.prisma.paymentRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.EXPIRED },
      });
      throw new Error('Payment request has expired');
    }

    // Verify payer account matches the toAccount
    if (payerAccountId !== request.toAccountId) {
      throw new Error('Only the recipient can pay this request');
    }

    // Get payer account
    const payerAccount = await this.prisma.account.findUnique({
      where: { id: payerAccountId },
    });

    if (!payerAccount) {
      throw new Error('Payer account not found');
    }

    // Check payer account is active
    if (payerAccount.status !== AccountStatus.ACTIVE) {
      throw new Error(`Payer account is ${payerAccount.status.toLowerCase()}`);
    }

    // Check requester account is active
    if (request.Account_PaymentRequest_fromAccountIdToAccount.status !== AccountStatus.ACTIVE) {
      throw new Error(`Requester account is ${request.Account_PaymentRequest_fromAccountIdToAccount.status.toLowerCase()}`);
    }

    // Check sufficient balance
    const payerBalance = new Decimal(payerAccount.balance.toString());
    const amount = new Decimal(request.amount.toString());

    if (payerBalance.lessThan(amount)) {
      throw new Error('Insufficient balance');
    }

    // Process payment atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct from payer balance
      const newPayerBalance = payerBalance.minus(amount);
      await tx.account.update({
        where: { id: payerAccountId },
        data: { balance: newPayerBalance },
      });

      // Add to requester balance
      const requesterBalance = new Decimal(request.Account_PaymentRequest_fromAccountIdToAccount.balance.toString());
      const newRequesterBalance = requesterBalance.plus(amount);
      await tx.account.update({
        where: { id: request.fromAccountId },
        data: { balance: newRequesterBalance },
      });

      // Create transaction record
      const transaction = await tx.transaction.create({
        data: {
          amount,
          currency: 'USD',
          type: TxType.INTERNAL,
          status: TxStatus.COMPLETED,
          description: `Payment for request: ${request.description}`,
          fromAccountId: payerAccountId,
          toAccountId: request.fromAccountId,
          approvalRequired: false,
        },
      });

      // Update payment request status
      const updatedRequest = await tx.paymentRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.PAID },
      });

      return { request: updatedRequest, transactionId: transaction.id };
    });

    return result;
  }

  /**
   * Decline a payment request
   * Requirements: 8.5
   */
  async declineRequest(requestId: string, accountId: string | null): Promise<PaymentRequest> {
    // Get the payment request
    const request = await this.prisma.paymentRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error('Payment request not found');
    }

    // Verify request is pending
    if (request.status !== RequestStatus.PENDING) {
      throw new Error(`Payment request is ${request.status.toLowerCase()}`);
    }

    // If accountId is null, this is an owner declining a fund request
    // If accountId is provided, verify the account is the recipient (toAccount)
    if (accountId !== null && accountId !== request.toAccountId) {
      throw new Error('Only the recipient can decline this request');
    }

    // Update status to declined
    const updatedRequest = await this.prisma.paymentRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.DECLINED },
    });

    return updatedRequest;
  }

  /**
   * List payment requests with status filtering
   * Requirements: 8.6
   */
  async listRequests(
    accountId: string,
    status?: RequestStatus
  ): Promise<PaymentRequest[]> {
    // Build filter
    const where: any = {
      OR: [
        { fromAccountId: accountId },
        { toAccountId: accountId },
      ],
    };

    if (status) {
      where.status = status;
    }

    // Query payment requests
    const requests = await this.prisma.paymentRequest.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return requests;
  }

  /**
   * Generate a payment link for a request
   * This is a helper method to get the payment link URL
   */
  generatePaymentLinkUrl(paymentLink: string, baseUrl: string): string {
    return `${baseUrl}/payments/guest/${paymentLink}`;
  }

  /**
   * Process a guest payment via payment link
   * Requirements: 10.1, 10.2, 10.3
   */
  async processGuestPayment(
    paymentLink: string,
    cardholderName: string
  ): Promise<{
    requestId: string;
    transactionId: string;
    amount: Decimal;
    currency: string;
    status: string;
    requestStatus: string;
  }> {
    // Validate inputs
    if (typeof cardholderName !== 'string') {
      throw new Error('Cardholder name must be a string');
    }

    // Find payment request by payment link
    const request = await this.prisma.paymentRequest.findUnique({
      where: { paymentLink },
      include: {
        Account_PaymentRequest_fromAccountIdToAccount: true,
        Account_PaymentRequest_toAccountIdToAccount: true,
      },
    });

    if (!request) {
      throw new Error('Payment request not found');
    }

    // Verify request is pending
    if (request.status !== RequestStatus.PENDING) {
      throw new Error(`Payment request is already ${request.status.toLowerCase()}`);
    }

    // Check if request has expired
    if (new Date() > request.expiresAt) {
      // Update status to expired
      await this.prisma.paymentRequest.update({
        where: { id: request.id },
        data: { status: RequestStatus.EXPIRED },
      });
      throw new Error('Payment request has expired');
    }

    // Check requester account is active
    if (request.Account_PaymentRequest_fromAccountIdToAccount.status !== AccountStatus.ACTIVE) {
      throw new Error(`Recipient account is ${request.Account_PaymentRequest_fromAccountIdToAccount.status.toLowerCase()}`);
    }

    const amount = new Decimal(request.amount.toString());

    // Process payment atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // Add to requester balance (the account that created the request receives the funds)
      const requesterBalance = new Decimal(request.Account_PaymentRequest_fromAccountIdToAccount.balance.toString());
      const newRequesterBalance = requesterBalance.plus(amount);
      await tx.account.update({
        where: { id: request.fromAccountId },
        data: { balance: newRequesterBalance },
      });

      // Create transaction record for the inbound payment
      const transaction = await tx.transaction.create({
        data: {
          amount,
          currency: 'USD',
          type: TxType.INBOUND,
          status: TxStatus.COMPLETED,
          description: `Guest payment for: ${request.description}`,
          fromAccountId: request.fromAccountId, // The account receiving the funds
          merchantName: cardholderName,
          approvalRequired: false,
        },
      });

      // Update payment request status
      const updatedRequest = await tx.paymentRequest.update({
        where: { id: request.id },
        data: { status: RequestStatus.PAID },
      });

      return {
        requestId: updatedRequest.id,
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        requestStatus: updatedRequest.status,
      };
    });

    // Broadcast balance_updated event to recipient via WebSocket
    if (this.wsServer) {
      try {
        await this.wsServer.broadcast(request.fromAccountId, {
          type: RealtimeEventType.BALANCE_UPDATED,
          data: {
            accountId: request.fromAccountId,
            newBalance: (await this.prisma.account.findUnique({
              where: { id: request.fromAccountId },
            }))!.balance.toString(),
          },
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('WebSocket broadcast failed:', error);
      }
    }

    return result;
  }
}
