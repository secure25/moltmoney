// Enums matching Prisma schema

export enum AccountType {
  AGENT = 'AGENT',
  OWNER = 'OWNER',
  GUEST = 'GUEST',
}

export enum AccountStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
}

export enum TxType {
  INTERNAL = 'INTERNAL',
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
  PAYOUT = 'PAYOUT',
}

export enum TxStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  COMPLETED = 'COMPLETED',
  DECLINED = 'DECLINED',
  FAILED = 'FAILED',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  DECLINED = 'DECLINED',
}

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CANCELLED = 'CANCELLED',
}

export enum WebhookEventType {
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_DECLINED = 'payment.declined',
  PAYMENT_APPROVED = 'payment.approved',
  PAYMENT_REFUNDED = 'payment.refunded',
  LOW_BALANCE = 'account.low_balance',
  CARD_ISSUED = 'card.issued',
  CARD_FROZEN = 'card.frozen',
  PAYOUT_COMPLETED = 'payout.completed',
  PAYOUT_FAILED = 'payout.failed',
}

export enum RealtimeEventType {
  BALANCE_UPDATED = 'balance.updated',
  TRANSACTION_CREATED = 'transaction.created',
  TRANSACTION_UPDATED = 'transaction.updated',
  APPROVAL_REQUIRED = 'approval.required',
  PAYMENT_REQUEST_RECEIVED = 'payment_request.received',
  PAYOUT_INITIATED = 'payout.initiated',
  PAYOUT_COMPLETED = 'payout.completed',
  PAYOUT_FAILED = 'payout.failed',
}
