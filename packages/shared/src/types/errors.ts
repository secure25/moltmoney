// Error types and utilities

export enum ErrorCode {
  // Authentication errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  DUPLICATE_EMAIL = 'DUPLICATE_EMAIL',
  
  // Authorization errors
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  INVALID_ACCOUNT = 'INVALID_ACCOUNT',
  
  // Business logic errors
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  ACCOUNT_FROZEN = 'ACCOUNT_FROZEN',
  ACCOUNT_CLOSED = 'ACCOUNT_CLOSED',
  SPENDING_LIMIT_EXCEEDED = 'SPENDING_LIMIT_EXCEEDED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  PAYMENT_DECLINED = 'PAYMENT_DECLINED',
  SELF_PAYMENT_NOT_ALLOWED = 'SELF_PAYMENT_NOT_ALLOWED',
  
  // Payout errors
  INVALID_ROUTING_NUMBER = 'INVALID_ROUTING_NUMBER',
  INVALID_ACCOUNT_NUMBER = 'INVALID_ACCOUNT_NUMBER',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',
  PAYOUT_FAILED = 'PAYOUT_FAILED',
  
  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  
  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
}

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): ErrorResponse {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

// Factory functions for common errors
export const createAuthError = (message: string = 'Invalid credentials'): AppError =>
  new AppError(ErrorCode.INVALID_CREDENTIALS, message, 401);

export const createUnauthorizedError = (message: string = 'Unauthorized'): AppError =>
  new AppError(ErrorCode.UNAUTHORIZED, message, 401);

export const createForbiddenError = (message: string = 'Forbidden'): AppError =>
  new AppError(ErrorCode.FORBIDDEN, message, 403);

export const createNotFoundError = (resource: string = 'Resource'): AppError =>
  new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404);

export const createValidationError = (message: string, details?: Record<string, unknown>): AppError =>
  new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);

export const createInsufficientBalanceError = (): AppError =>
  new AppError(ErrorCode.INSUFFICIENT_BALANCE, 'Insufficient balance', 400);

export const createAccountFrozenError = (): AppError =>
  new AppError(ErrorCode.ACCOUNT_FROZEN, 'Account is frozen', 400);

export const createAccountClosedError = (): AppError =>
  new AppError(ErrorCode.ACCOUNT_CLOSED, 'Account is closed', 400);

export const createRateLimitError = (): AppError =>
  new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded', 429);

export const createInternalError = (message: string = 'Internal server error'): AppError =>
  new AppError(ErrorCode.INTERNAL_ERROR, message, 500);

export const createInvalidRoutingNumberError = (): AppError =>
  new AppError(ErrorCode.INVALID_ROUTING_NUMBER, 'Invalid routing number format', 400);

export const createInvalidAccountNumberError = (): AppError =>
  new AppError(ErrorCode.INVALID_ACCOUNT_NUMBER, 'Invalid account number format', 400);

export const createAccountNotFoundError = (): AppError =>
  new AppError(ErrorCode.ACCOUNT_NOT_FOUND, 'External bank account not found', 404);

export const createPayoutFailedError = (reason?: string): AppError =>
  new AppError(ErrorCode.PAYOUT_FAILED, reason || 'Payout failed', 400);
