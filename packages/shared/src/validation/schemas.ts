// Zod validation schemas
import { z } from 'zod';
import { TxType, TxStatus } from '../types/enums';

// Custom validators
const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal with up to 2 decimal places')
  .refine((val) => parseFloat(val) > 0, 'Must be greater than 0');

const optionalDecimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid decimal with up to 2 decimal places')
  .optional();

const email = z.string().email('Invalid email address');

const uuid = z.string().uuid('Invalid UUID');

// Authentication schemas
export const registerSchema = z.object({
  email,
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

// Account schemas
export const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  platform: z.string().min(1, 'Platform is required').max(100, 'Platform name too long'),
});

export const fundAccountSchema = z.object({
  amount: decimalString,
});

export const updateSpendingRulesSchema = z.object({
  dailyLimit: optionalDecimalString,
  perTransactionLimit: optionalDecimalString,
  blockedCategories: z.array(z.string()).optional(),
  requireApprovalAbove: optionalDecimalString,
  allowedMerchants: z.array(z.string()).optional(),
});

// Payment schemas
export const sendPaymentSchema = z.object({
  fromAccountId: uuid,
  toAccountId: uuid.optional(),
  amount: decimalString,
  description: z.string().max(500, 'Description too long').optional(),
  merchantName: z.string().max(255, 'Merchant name too long').optional(),
});

export const approvePaymentSchema = z.object({
  transactionId: uuid,
});

export const declinePaymentSchema = z.object({
  transactionId: uuid,
});

// Payment request schemas
export const createPaymentRequestSchema = z.object({
  fromAccountId: uuid,
  toAccountId: uuid,
  amount: decimalString,
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  expiresAt: z.string().datetime('Invalid datetime format'),
});

export const payRequestSchema = z.object({
  requestId: uuid,
});

// Transaction schemas
export const transactionFiltersSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.nativeEnum(TxType).optional(),
  status: z.nativeEnum(TxStatus).optional(),
  minAmount: optionalDecimalString,
  maxAmount: optionalDecimalString,
  merchantName: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
});

// Virtual card schemas
export const issueCardSchema = z.object({
  accountId: uuid,
  spendLimit: optionalDecimalString,
});

export const cardActionSchema = z.object({
  cardId: uuid,
});

// Webhook schemas
export const registerWebhookSchema = z.object({
  accountId: uuid,
  url: z.string().url('Invalid URL'),
  events: z.array(z.string()).min(1, 'At least one event type required'),
});

// Payout schemas
export const sendPayoutSchema = z.object({
  fromAccountId: uuid,
  routingNumber: z.string().regex(/^[0-9]{9}$/, 'Routing number must be exactly 9 digits'),
  accountNumber: z.string().regex(/^[0-9]{8,17}$/, 'Account number must be 8-17 digits'),
  accountHolder: z.string().min(2, 'Account holder name must be at least 2 characters').max(100, 'Account holder name too long'),
  amount: decimalString,
  description: z.string().max(500, 'Description too long').optional(),
});

// Query parameter schemas
export const accountIdParamSchema = z.object({
  id: uuid,
});

export const transactionIdParamSchema = z.object({
  id: uuid,
});

export const cardIdParamSchema = z.object({
  id: uuid,
});

export const requestIdParamSchema = z.object({
  id: uuid,
});

// Export type inference helpers
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type FundAccountInput = z.infer<typeof fundAccountSchema>;
export type UpdateSpendingRulesInput = z.infer<typeof updateSpendingRulesSchema>;
export type SendPaymentInput = z.infer<typeof sendPaymentSchema>;
export type CreatePaymentRequestInput = z.infer<typeof createPaymentRequestSchema>;
export type TransactionFiltersInput = z.infer<typeof transactionFiltersSchema>;
export type IssueCardInput = z.infer<typeof issueCardSchema>;
export type RegisterWebhookInput = z.infer<typeof registerWebhookSchema>;
export type SendPayoutInput = z.infer<typeof sendPayoutSchema>;
