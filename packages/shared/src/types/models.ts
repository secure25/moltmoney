// Core domain models
import Decimal from 'decimal.js';
import {
  AccountType,
  AccountStatus,
  TxType,
  TxStatus,
  RequestStatus,
  CardStatus,
} from './enums';

export interface SpendingRules {
  dailyLimit?: Decimal;
  perTransactionLimit?: Decimal;
  blockedCategories?: string[];
  requireApprovalAbove?: Decimal;
  allowedMerchants?: string[];
}

export interface Owner {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  platform: string;
  ownerId: string;
  createdAt: Date;
}

export interface Account {
  id: string;
  type: AccountType;
  balance: Decimal;
  currency: string;
  status: AccountStatus;
  spendingRules: SpendingRules | null;
  agentId: string | null;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  amount: Decimal;
  currency: string;
  type: TxType;
  status: TxStatus;
  description: string | null;
  merchantName: string | null;
  merchantCategory?: string | null;
  fromAccountId: string;
  toAccountId: string | null;
  approvalRequired: boolean;
  approvedAt: Date | null;
  providerName?: string | null;
  providerRefId?: string | null;
  providerMetadata?: any | null;
  createdAt: Date;
}

export interface ProviderWebhookEvent {
  id: string;
  provider: string;
  transmissionId: string;
  eventType: string;
  payload: any;
  processedAt: Date;
}

export interface PaymentRequest {
  id: string;
  amount: Decimal;
  currency: string;
  description: string;
  status: RequestStatus;
  paymentLink: string | null;
  fromAccountId: string;
  toAccountId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface VirtualCard {
  id: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv: string;
  status: CardStatus;
  spendLimit: Decimal | null;
  accountId: string;
  createdAt: Date;
}
