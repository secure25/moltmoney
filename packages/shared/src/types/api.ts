// API request and response types
import { AccountStatus, TxType, TxStatus, RequestStatus } from './enums';
import { SpendingRules } from './models';

// Authentication
export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface RegisterResponse {
  owner: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  owner: {
    id: string;
    email: string;
    name: string;
  };
  token: string;
}

// Account Management
export interface CreateAccountRequest {
  name: string;
  platform: string;
}

export interface CreateAccountResponse {
  agent: {
    id: string;
    name: string;
    platform: string;
    apiKey: string;
  };
  account: {
    id: string;
    balance: string;
    currency: string;
    status: AccountStatus;
  };
}

export interface FundAccountRequest {
  amount: string;
}

export interface FundAccountResponse {
  account: {
    id: string;
    balance: string;
    currency: string;
  };
  transaction: {
    id: string;
    amount: string;
    type: TxType;
    status: TxStatus;
  };
}

export interface UpdateRulesRequest {
  dailyLimit?: string;
  perTransactionLimit?: string;
  blockedCategories?: string[];
  requireApprovalAbove?: string;
  allowedMerchants?: string[];
}

export interface UpdateRulesResponse {
  account: {
    id: string;
    spendingRules: SpendingRules;
  };
}

export interface BalanceResponse {
  balance: string;
  currency: string;
  status: AccountStatus;
}

// Payments
export interface SendPaymentRequest {
  fromAccountId: string;
  toAccountId?: string;
  amount: string;
  description?: string;
  merchantName?: string;
}

export interface SendPaymentResponse {
  transaction: {
    id: string;
    amount: string;
    type: TxType;
    status: TxStatus;
    approvalRequired: boolean;
  };
}

// Payment Requests
export interface CreatePaymentRequestRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  description: string;
  expiresAt: string;
}

export interface CreatePaymentRequestResponse {
  request: {
    id: string;
    amount: string;
    description: string;
    status: RequestStatus;
    paymentLink: string | null;
    expiresAt: string;
  };
}

// Transactions
export interface TransactionFilters {
  startDate?: string;
  endDate?: string;
  type?: TxType;
  status?: TxStatus;
  minAmount?: string;
  maxAmount?: string;
  merchantName?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Virtual Cards
export interface IssueCardRequest {
  accountId: string;
  spendLimit?: string;
}

export interface IssueCardResponse {
  card: {
    id: string;
    cardNumber: string;
    expiryMonth: number;
    expiryYear: number;
    cvv: string;
    status: string;
    spendLimit: string | null;
  };
}

// Payouts
export interface PayoutRequest {
  fromAccountId: string;
  routingNumber: string;
  accountNumber: string;
  accountHolder: string;
  amount: string;
  description?: string;
}

export interface PayoutResponse {
  transaction: {
    id: string;
    amount: string;
    type: TxType;
    status: TxStatus;
    description?: string;
    recipientName: string;
    recipientAccount: string;
    approvalRequired: boolean;
  };
}
