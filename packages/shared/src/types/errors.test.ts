import { describe, it, expect } from 'vitest';
import {
  AppError,
  ErrorCode,
  createAuthError,
  createNotFoundError,
  createValidationError,
  createInsufficientBalanceError,
} from './errors';

describe('Error utilities', () => {
  describe('AppError', () => {
    it('should create error with code and message', () => {
      const error = new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid login', 401);
      expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect(error.message).toBe('Invalid login');
      expect(error.statusCode).toBe(401);
    });

    it('should convert to JSON', () => {
      const error = new AppError(ErrorCode.NOT_FOUND, 'Resource not found', 404);
      const json = error.toJSON();
      expect(json).toEqual({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Resource not found',
          details: undefined,
        },
      });
    });

    it('should include details in JSON', () => {
      const error = new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        400,
        { field: 'email' }
      );
      const json = error.toJSON();
      expect(json.error.details).toEqual({ field: 'email' });
    });
  });

  describe('Factory functions', () => {
    it('should create auth error', () => {
      const error = createAuthError();
      expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect(error.statusCode).toBe(401);
    });

    it('should create not found error', () => {
      const error = createNotFoundError('Account');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.message).toBe('Account not found');
      expect(error.statusCode).toBe(404);
    });

    it('should create validation error with details', () => {
      const error = createValidationError('Invalid input', { field: 'amount' });
      expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(error.details).toEqual({ field: 'amount' });
      expect(error.statusCode).toBe(400);
    });

    it('should create insufficient balance error', () => {
      const error = createInsufficientBalanceError();
      expect(error.code).toBe(ErrorCode.INSUFFICIENT_BALANCE);
      expect(error.statusCode).toBe(400);
    });
  });
});
