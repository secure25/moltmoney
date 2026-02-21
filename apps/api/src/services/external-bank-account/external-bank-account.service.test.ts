import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExternalBankAccountService } from './external-bank-account.service';
import { PrismaClient } from '@moltmoney/database';
import Decimal from 'decimal.js';

describe('ExternalBankAccountService', () => {
  let service: ExternalBankAccountService;
  let prisma: PrismaClient;

  beforeEach(() => {
    prisma = new PrismaClient();
    service = new ExternalBankAccountService(prisma, 'test-secret');
  });

  describe('validateRoutingNumber', () => {
    it('should validate correct routing number', () => {
      expect(service.validateRoutingNumber('123456789')).toBe(true);
    });

    it('should reject routing number with less than 9 digits', () => {
      expect(service.validateRoutingNumber('12345678')).toBe(false);
    });

    it('should reject routing number with more than 9 digits', () => {
      expect(service.validateRoutingNumber('1234567890')).toBe(false);
    });

    it('should reject routing number with non-numeric characters', () => {
      expect(service.validateRoutingNumber('12345678a')).toBe(false);
    });
  });

  describe('validateAccountNumber', () => {
    it('should validate correct account number (8 digits)', () => {
      expect(service.validateAccountNumber('12345678')).toBe(true);
    });

    it('should validate correct account number (17 digits)', () => {
      expect(service.validateAccountNumber('12345678901234567')).toBe(true);
    });

    it('should validate correct account number (12 digits)', () => {
      expect(service.validateAccountNumber('123456789012')).toBe(true);
    });

    it('should reject account number with less than 8 digits', () => {
      expect(service.validateAccountNumber('1234567')).toBe(false);
    });

    it('should reject account number with more than 17 digits', () => {
      expect(service.validateAccountNumber('123456789012345678')).toBe(false);
    });

    it('should reject account number with non-numeric characters', () => {
      expect(service.validateAccountNumber('1234567a')).toBe(false);
    });
  });

  describe('createMockAccount', () => {
    it('should create account with valid inputs', async () => {
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: 'encrypted-data',
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'create').mockResolvedValue(mockAccount);

      const result = await service.createMockAccount(
        '123456789',
        '12345678',
        'John Doe',
        'CHECKING',
        new Decimal(1000)
      );

      expect(result).toBeDefined();
      expect(result.routingNumber).toBe('123456789');
      expect(result.accountNumber).toBe('12345678');
      expect(result.accountHolder).toBe('John Doe');
      expect(result.accountType).toBe('CHECKING');
      expect(result.balance.toString()).toBe('1000');
      expect(result.status).toBe('ACTIVE');
    });

    it('should create account with default zero balance', async () => {
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: 'encrypted-data',
        accountHolder: 'Jane Smith',
        accountType: 'SAVINGS',
        balance: new Decimal(0),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'create').mockResolvedValue(mockAccount);

      const result = await service.createMockAccount(
        '123456789',
        '12345678901',
        'Jane Smith',
        'SAVINGS'
      );

      expect(result.balance.toString()).toBe('0');
    });

    it('should trim account holder name', async () => {
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: 'encrypted-data',
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(0),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'create').mockResolvedValue(mockAccount);

      const result = await service.createMockAccount(
        '123456789',
        '12345678',
        '  John Doe  ',
        'CHECKING'
      );

      expect(result.accountHolder).toBe('John Doe');
    });

    it('should throw error for invalid routing number', async () => {
      await expect(
        service.createMockAccount('12345', '12345678', 'John Doe', 'CHECKING', new Decimal(1000))
      ).rejects.toThrow('Invalid routing number format');
    });

    it('should throw error for invalid account number', async () => {
      await expect(
        service.createMockAccount('123456789', '123', 'John Doe', 'CHECKING', new Decimal(1000))
      ).rejects.toThrow('Invalid account number format');
    });

    it('should throw error for short account holder name', async () => {
      await expect(
        service.createMockAccount('123456789', '12345678', 'J', 'CHECKING', new Decimal(1000))
      ).rejects.toThrow('Account holder name must be at least 2 characters');
    });

    it('should throw error for long account holder name', async () => {
      const longName = 'A'.repeat(101);
      await expect(
        service.createMockAccount('123456789', '12345678', longName, 'CHECKING', new Decimal(1000))
      ).rejects.toThrow('Account holder name must not exceed 100 characters');
    });

    it('should throw error for negative initial balance', async () => {
      await expect(
        service.createMockAccount('123456789', '12345678', 'John Doe', 'CHECKING', new Decimal(-100))
      ).rejects.toThrow('Initial balance cannot be negative');
    });

    it('should create SAVINGS account type', async () => {
      const mockAccount = {
        id: 'test-id',
        routingNumber: '987654321',
        accountNumber: 'encrypted-data',
        accountHolder: 'Alice Johnson',
        accountType: 'SAVINGS',
        balance: new Decimal(5000),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'create').mockResolvedValue(mockAccount);

      const result = await service.createMockAccount(
        '987654321',
        '98765432109876',
        'Alice Johnson',
        'SAVINGS',
        new Decimal(5000)
      );

      expect(result.accountType).toBe('SAVINGS');
    });
  });

  describe('verifyAccount', () => {
    it('should return true for existing active account', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccounts = [{
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      }];

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue(mockAccounts);

      const result = await service.verifyAccount('123456789', '12345678');
      expect(result).toBe(true);
    });

    it('should return false for non-existent account', async () => {
      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([]);

      const result = await service.verifyAccount('123456789', '12345678');
      expect(result).toBe(false);
    });

    it('should return false for inactive account', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccounts = [{
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'CLOSED',
        createdAt: new Date(),
      }];

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue(mockAccounts);

      const result = await service.verifyAccount('123456789', '12345678');
      expect(result).toBe(false);
    });

    it('should return false for invalid routing number', async () => {
      const result = await service.verifyAccount('12345', '12345678');
      expect(result).toBe(false);
    });

    it('should return false for invalid account number', async () => {
      const result = await service.verifyAccount('123456789', '123');
      expect(result).toBe(false);
    });

    it('should return false when account number does not match', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('87654321');
      
      const mockAccounts = [{
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      }];

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue(mockAccounts);

      const result = await service.verifyAccount('123456789', '12345678');
      expect(result).toBe(false);
    });
  });

  describe('getAccount', () => {
    it('should return account for valid routing and account number', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([mockAccount]);

      const result = await service.getAccount('123456789', '12345678');

      expect(result).toBeDefined();
      expect(result?.routingNumber).toBe('123456789');
      expect(result?.accountNumber).toBe('12345678');
      expect(result?.accountHolder).toBe('John Doe');
      expect(result?.balance.toString()).toBe('1000');
    });

    it('should return null for non-existent account', async () => {
      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([]);

      const result = await service.getAccount('123456789', '12345678');

      expect(result).toBeNull();
    });

    it('should return account even if status is CLOSED', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'CLOSED',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([mockAccount]);

      const result = await service.getAccount('123456789', '12345678');

      expect(result).toBeDefined();
      expect(result?.status).toBe('CLOSED');
    });

    it('should throw error for invalid routing number', async () => {
      await expect(
        service.getAccount('12345', '12345678')
      ).rejects.toThrow('Invalid routing number format');
    });

    it('should throw error for invalid account number', async () => {
      await expect(
        service.getAccount('123456789', '123')
      ).rejects.toThrow('Invalid account number format');
    });

    it('should return null when account number does not match', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('87654321');
      
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([mockAccount]);

      const result = await service.getAccount('123456789', '12345678');

      expect(result).toBeNull();
    });
  });

  describe('creditAccount', () => {
    it('should credit account with valid amount', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([mockAccount]);
      vi.spyOn(prisma.externalBankAccount, 'update').mockResolvedValue({
        ...mockAccount,
        balance: new Decimal(1100),
      });

      await service.creditAccount('123456789', '12345678', new Decimal(100));

      expect(prisma.externalBankAccount.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: {
          balance: new Decimal(1100),
        },
      });
    });

    it('should handle large credit amounts', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([mockAccount]);
      vi.spyOn(prisma.externalBankAccount, 'update').mockResolvedValue({
        ...mockAccount,
        balance: new Decimal(11000),
      });

      await service.creditAccount('123456789', '12345678', new Decimal(10000));

      expect(prisma.externalBankAccount.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: {
          balance: new Decimal(11000),
        },
      });
    });

    it('should handle decimal credit amounts', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'ACTIVE',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([mockAccount]);
      vi.spyOn(prisma.externalBankAccount, 'update').mockResolvedValue({
        ...mockAccount,
        balance: new Decimal('1050.75'),
      });

      await service.creditAccount('123456789', '12345678', new Decimal('50.75'));

      expect(prisma.externalBankAccount.update).toHaveBeenCalledWith({
        where: { id: 'test-id' },
        data: {
          balance: new Decimal('1050.75'),
        },
      });
    });

    it('should throw error for zero amount', async () => {
      await expect(
        service.creditAccount('123456789', '12345678', new Decimal(0))
      ).rejects.toThrow('Credit amount must be positive');
    });

    it('should throw error for negative amount', async () => {
      await expect(
        service.creditAccount('123456789', '12345678', new Decimal(-100))
      ).rejects.toThrow('Credit amount must be positive');
    });

    it('should throw error for non-existent account', async () => {
      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([]);

      await expect(
        service.creditAccount('123456789', '12345678', new Decimal(100))
      ).rejects.toThrow('External bank account not found');
    });

    it('should throw error for inactive account', async () => {
      const service2 = new ExternalBankAccountService(prisma, 'test-secret');
      const encryptedNumber = (service2 as any).encryptAccountNumber('12345678');
      
      const mockAccount = {
        id: 'test-id',
        routingNumber: '123456789',
        accountNumber: encryptedNumber,
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        balance: new Decimal(1000),
        status: 'CLOSED',
        createdAt: new Date(),
      };

      vi.spyOn(prisma.externalBankAccount, 'findMany').mockResolvedValue([mockAccount]);

      await expect(
        service.creditAccount('123456789', '12345678', new Decimal(100))
      ).rejects.toThrow('Cannot credit inactive account');
    });
  });

  describe('encryption/decryption', () => {
    it('should encrypt and decrypt account number correctly', () => {
      const accountNumber = '1234567890';
      const encrypted = (service as any).encryptAccountNumber(accountNumber);
      const decrypted = (service as any).decryptAccountNumber(encrypted);
      
      expect(decrypted).toBe(accountNumber);
      expect(encrypted).not.toBe(accountNumber);
    });

    it('should produce different encrypted values for same input', () => {
      const accountNumber = '1234567890';
      const encrypted1 = (service as any).encryptAccountNumber(accountNumber);
      const encrypted2 = (service as any).encryptAccountNumber(accountNumber);
      
      // Due to random IV, encrypted values should be different
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same value
      const decrypted1 = (service as any).decryptAccountNumber(encrypted1);
      const decrypted2 = (service as any).decryptAccountNumber(encrypted2);
      expect(decrypted1).toBe(accountNumber);
      expect(decrypted2).toBe(accountNumber);
    });

    it('should handle different account number lengths', () => {
      const shortNumber = '12345678'; // 8 digits
      const longNumber = '12345678901234567'; // 17 digits
      
      const encryptedShort = (service as any).encryptAccountNumber(shortNumber);
      const encryptedLong = (service as any).encryptAccountNumber(longNumber);
      
      expect((service as any).decryptAccountNumber(encryptedShort)).toBe(shortNumber);
      expect((service as any).decryptAccountNumber(encryptedLong)).toBe(longNumber);
    });

    it('should use different encryption keys for different secrets', () => {
      const service2 = new ExternalBankAccountService(prisma, 'different-secret');
      const accountNumber = '1234567890';
      
      const encrypted1 = (service as any).encryptAccountNumber(accountNumber);
      const encrypted2 = (service2 as any).encryptAccountNumber(accountNumber);
      
      // Different secrets should produce different encrypted values
      expect(encrypted1).not.toBe(encrypted2);
      
      // Each service should decrypt its own encrypted value
      expect((service as any).decryptAccountNumber(encrypted1)).toBe(accountNumber);
      expect((service2 as any).decryptAccountNumber(encrypted2)).toBe(accountNumber);
    });

    it('should fail to decrypt with wrong encryption key', () => {
      const service2 = new ExternalBankAccountService(prisma, 'different-secret');
      const accountNumber = '1234567890';
      
      const encrypted = (service as any).encryptAccountNumber(accountNumber);
      
      // Attempting to decrypt with different key should fail
      expect(() => {
        (service2 as any).decryptAccountNumber(encrypted);
      }).toThrow();
    });
  });
});
