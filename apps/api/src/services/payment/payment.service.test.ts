import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PaymentService } from './payment.service';
import { AccountService } from '../account/account.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import { ExternalBankAccountService } from '../external-bank-account';
import Decimal from 'decimal.js';

const { PrismaClient } = require('@prisma/client');

describe('PaymentService', () => {
  let prisma: any;
  let paymentService: PaymentService;
  let accountService: AccountService;
  let paymentProvider: MockPaymentProvider;
  let testOwnerId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    paymentProvider = new MockPaymentProvider();
    paymentService = new PaymentService(prisma, paymentProvider, undefined, undefined);
    accountService = new AccountService(prisma, undefined);

    // Create a test owner
    const owner = await prisma.owner.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test Owner',
        password: 'hashed_password',
      },
    });
    testOwnerId = owner.id;
  });

  afterEach(async () => {
    // Clean up test data in correct order (virtual cards before accounts)
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.virtualCard.deleteMany({}); // Delete virtual cards first
    await prisma.externalBankAccount.deleteMany({}); // Delete external bank accounts
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({
      where: { ownerId: testOwnerId },
    });
    await prisma.owner.delete({
      where: { id: testOwnerId },
    });
    await prisma.$disconnect();
  });

  describe('evaluateSpendingRules', () => {
    it('should allow payment with no spending rules', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      const evaluation = await paymentService.evaluateSpendingRules(
        account,
        new Decimal('100')
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.requiresApproval).toBe(false);
      expect(evaluation.violations).toHaveLength(0);
    });

    it('should detect per-transaction limit violation', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await accountService.updateSpendingRules(account.id, {
        perTransactionLimit: '100.00',
      });

      const updatedAccount = await accountService.getAccount(account.id);
      const evaluation = await paymentService.evaluateSpendingRules(
        updatedAccount,
        new Decimal('150')
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.requiresApproval).toBe(true);
      expect(evaluation.violations.length).toBeGreaterThan(0);
      expect(evaluation.violations[0]).toContain('Per-transaction limit exceeded');
    });

    it('should detect daily limit violation', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      // Fund the account
      await accountService.fundAccount(account.id, new Decimal('500'));

      // Set daily limit
      await accountService.updateSpendingRules(account.id, {
        dailyLimit: '200.00',
      });

      // Create another account for internal transfer
      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Make a payment that uses up most of the daily limit
      await paymentService.sendPayment(
        account.id,
        recipientAccount.id,
        new Decimal('150'),
        'First payment'
      );

      // Try to make another payment that would exceed daily limit
      const updatedAccount = await accountService.getAccount(account.id);
      const evaluation = await paymentService.evaluateSpendingRules(
        updatedAccount,
        new Decimal('100')
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.requiresApproval).toBe(true);
      expect(evaluation.violations.some(v => v.includes('Daily limit exceeded'))).toBe(true);
    });

    it('should detect blocked category', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await accountService.updateSpendingRules(account.id, {
        blockedCategories: ['gambling', 'alcohol'],
      });

      const updatedAccount = await accountService.getAccount(account.id);
      const evaluation = await paymentService.evaluateSpendingRules(
        updatedAccount,
        new Decimal('50'),
        'Casino',
        'gambling'
      );

      expect(evaluation.allowed).toBe(true);
      expect(evaluation.requiresApproval).toBe(true);
      expect(evaluation.violations.some(v => v.includes('category blocked'))).toBe(true);
    });
  });

  describe('sendPayment', () => {
    it('should process valid internal payment', async () => {
      // Create sender and recipient accounts
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Send payment
      const transaction = await paymentService.sendPayment(
        senderAccount.id,
        recipientAccount.id,
        new Decimal('50'),
        'Test payment'
      );

      expect(transaction.type).toBe('INTERNAL');
      expect(transaction.status).toBe('COMPLETED');
      expect(new Decimal(transaction.amount.toString()).toNumber()).toBe(50);

      // Verify balances
      const senderBalance = await accountService.getBalance(senderAccount.id);
      const recipientBalance = await accountService.getBalance(recipientAccount.id);

      expect(senderBalance.toNumber()).toBe(150);
      expect(recipientBalance.toNumber()).toBe(50);
    });

    it('should reject payment with insufficient balance', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender with only 50
      await accountService.fundAccount(senderAccount.id, new Decimal('50'));

      // Try to send 100
      await expect(
        paymentService.sendPayment(
          senderAccount.id,
          recipientAccount.id,
          new Decimal('100'),
          'Test payment'
        )
      ).rejects.toThrow('Insufficient balance');
    });

    it('should reject self-payment', async () => {
      const { account } = await accountService.createAgentAccount(
        testOwnerId,
        'Test Agent',
        'OpenClaw'
      );

      await accountService.fundAccount(account.id, new Decimal('100'));

      await expect(
        paymentService.sendPayment(
          account.id,
          account.id,
          new Decimal('50'),
          'Self payment'
        )
      ).rejects.toThrow('Cannot send payment to self');
    });

    it('should reject payment to inactive account', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender
      await accountService.fundAccount(senderAccount.id, new Decimal('100'));

      // Freeze recipient
      await accountService.freezeAccount(recipientAccount.id);

      await expect(
        paymentService.sendPayment(
          senderAccount.id,
          recipientAccount.id,
          new Decimal('50'),
          'Test payment'
        )
      ).rejects.toThrow('Recipient account is frozen');
    });

    it('should create pending transaction when rules violated', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Set spending rules
      await accountService.updateSpendingRules(senderAccount.id, {
        perTransactionLimit: '50.00',
      });

      // Try to send payment exceeding limit
      const transaction = await paymentService.sendPayment(
        senderAccount.id,
        recipientAccount.id,
        new Decimal('100'),
        'Large payment'
      );

      expect(transaction.status).toBe('PENDING');
      expect(transaction.approvalRequired).toBe(true);

      // Verify balances unchanged
      const senderBalance = await accountService.getBalance(senderAccount.id);
      const recipientBalance = await accountService.getBalance(recipientAccount.id);

      expect(senderBalance.toNumber()).toBe(200);
      expect(recipientBalance.toNumber()).toBe(0);
    });

    it('should reject negative amounts', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      await expect(
        paymentService.sendPayment(
          senderAccount.id,
          recipientAccount.id,
          new Decimal('-50'),
          'Negative payment'
        )
      ).rejects.toThrow('Amount must be positive and non-zero');
    });
  });

  describe('approvePayment', () => {
    it('should approve pending payment and update balances', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Set spending rules to trigger approval
      await accountService.updateSpendingRules(senderAccount.id, {
        perTransactionLimit: '50.00',
      });

      // Create pending transaction
      const pendingTx = await paymentService.sendPayment(
        senderAccount.id,
        recipientAccount.id,
        new Decimal('100'),
        'Large payment'
      );

      expect(pendingTx.status).toBe('PENDING');

      // Approve the payment
      const approvedTx = await paymentService.approvePayment(pendingTx.id, testOwnerId);

      expect(approvedTx.status).toBe('COMPLETED');
      expect(approvedTx.approvedAt).toBeDefined();

      // Verify balances updated
      const senderBalance = await accountService.getBalance(senderAccount.id);
      const recipientBalance = await accountService.getBalance(recipientAccount.id);

      expect(senderBalance.toNumber()).toBe(100);
      expect(recipientBalance.toNumber()).toBe(100);
    });

    it('should reject approval by non-owner', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Set spending rules
      await accountService.updateSpendingRules(senderAccount.id, {
        perTransactionLimit: '50.00',
      });

      // Create pending transaction
      const pendingTx = await paymentService.sendPayment(
        senderAccount.id,
        recipientAccount.id,
        new Decimal('100'),
        'Large payment'
      );

      // Try to approve with different owner ID
      await expect(
        paymentService.approvePayment(pendingTx.id, 'different-owner-id')
      ).rejects.toThrow('Not authorized to approve this transaction');
    });

    it('should reject approval of non-pending transaction', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender
      await accountService.fundAccount(senderAccount.id, new Decimal('100'));

      // Create completed transaction
      const completedTx = await paymentService.sendPayment(
        senderAccount.id,
        recipientAccount.id,
        new Decimal('50'),
        'Normal payment'
      );

      expect(completedTx.status).toBe('COMPLETED');

      // Try to approve already completed transaction
      await expect(
        paymentService.approvePayment(completedTx.id, testOwnerId)
      ).rejects.toThrow('Transaction is not pending');
    });
  });

  describe('declinePayment', () => {
    it('should decline pending payment without updating balances', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Set spending rules
      await accountService.updateSpendingRules(senderAccount.id, {
        perTransactionLimit: '50.00',
      });

      // Create pending transaction
      const pendingTx = await paymentService.sendPayment(
        senderAccount.id,
        recipientAccount.id,
        new Decimal('100'),
        'Large payment'
      );

      // Decline the payment
      const declinedTx = await paymentService.declinePayment(pendingTx.id, testOwnerId);

      expect(declinedTx.status).toBe('DECLINED');

      // Verify balances unchanged
      const senderBalance = await accountService.getBalance(senderAccount.id);
      const recipientBalance = await accountService.getBalance(recipientAccount.id);

      expect(senderBalance.toNumber()).toBe(200);
      expect(recipientBalance.toNumber()).toBe(0);
    });

    it('should reject decline by non-owner', async () => {
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      const { account: recipientAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Recipient Agent',
        'OpenClaw'
      );

      // Fund sender
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Set spending rules
      await accountService.updateSpendingRules(senderAccount.id, {
        perTransactionLimit: '50.00',
      });

      // Create pending transaction
      const pendingTx = await paymentService.sendPayment(
        senderAccount.id,
        recipientAccount.id,
        new Decimal('100'),
        'Large payment'
      );

      // Try to decline with different owner ID
      await expect(
        paymentService.declinePayment(pendingTx.id, 'different-owner-id')
      ).rejects.toThrow('Not authorized to decline this transaction');
    });
  });

  describe('sendPayout', () => {
    it('should process successful payout to external account', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );

      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('500'));

      // Create mock external bank account
      await externalBankAccountService.createMockAccount(
        '123456789',
        '1234567890',
        'John Doe',
        'CHECKING',
        new Decimal('100')
      );

      // Send payout
      const transaction = await paymentService.sendPayout(
        senderAccount.id,
        '123456789',
        '1234567890',
        'John Doe',
        new Decimal('100')
      );

      expect(transaction.type).toBe('PAYOUT');
      expect(transaction.status).toBe('COMPLETED');
      expect(new Decimal(transaction.amount.toString()).toNumber()).toBe(100);
      expect(transaction.merchantName).toBe('John Doe');
      expect(transaction.description).toContain('****7890');

      // Verify sender balance deducted
      const senderBalance = await accountService.getBalance(senderAccount.id);
      expect(senderBalance.toNumber()).toBe(400);

      // Verify external account balance credited
      const externalAccount = await externalBankAccountService.getAccount(
        '123456789',
        '1234567890'
      );
      expect(new Decimal(externalAccount.balance.toString()).toNumber()).toBe(200);
    });

    it('should reject payout with insufficient balance', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender with only 50
      await accountService.fundAccount(senderAccount.id, new Decimal('50'));

      // Create mock external bank account
      await externalBankAccountService.createMockAccount(
        '123456789',
        '9876543210',
        'Jane Smith',
        'CHECKING',
        new Decimal('0')
      );

      // Try to send payout of 100
      await expect(
        paymentService.sendPayout(
          senderAccount.id,
          '123456789',
          '9876543210',
          'Jane Smith',
          new Decimal('100'),
          'Payment for services'
        )
      ).rejects.toThrow('Insufficient balance');

      // Verify sender balance unchanged
      const senderBalance = await accountService.getBalance(senderAccount.id);
      expect(senderBalance.toNumber()).toBe(50);
    });

    it('should reject payout to invalid external account', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Try to send payout to non-existent account
      await expect(
        paymentService.sendPayout(
          senderAccount.id,
          '999999999',
          '9999999999',
          'Unknown Person',
          new Decimal('100'),
          'Payment for services'
        )
      ).rejects.toThrow('External bank account not found or inactive');

      // Verify sender balance unchanged
      const senderBalance = await accountService.getBalance(senderAccount.id);
      expect(senderBalance.toNumber()).toBe(200);
    });

    it('should reject payout from frozen account', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Create mock external bank account
      await externalBankAccountService.createMockAccount(
        '123456789',
        '5555555555',
        'Bob Johnson',
        'CHECKING',
        new Decimal('0')
      );

      // Freeze sender account
      await accountService.freezeAccount(senderAccount.id);

      // Try to send payout
      await expect(
        paymentService.sendPayout(
          senderAccount.id,
          '123456789',
          '5555555555',
          'Bob Johnson',
          new Decimal('100'),
          'Payment for services'
        )
      ).rejects.toThrow('Sender account is frozen');

      // Verify sender balance unchanged
      const senderBalance = await accountService.getBalance(senderAccount.id);
      expect(senderBalance.toNumber()).toBe(200);
    });

    it('should evaluate spending rules for payouts', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('500'));

      // Set spending rules with per-transaction limit
      await accountService.updateSpendingRules(senderAccount.id, {
        perTransactionLimit: '50.00',
      });

      // Create mock external bank account
      await externalBankAccountService.createMockAccount(
        '123456789',
        '7777777777',
        'Alice Brown',
        'CHECKING',
        new Decimal('0')
      );

      // Try to send payout exceeding limit
      const transaction = await paymentService.sendPayout(
        senderAccount.id,
        '123456789',
        '7777777777',
        'Alice Brown',
        new Decimal('100'),
        'Large payout'
      );

      // Should create pending transaction requiring approval
      expect(transaction.status).toBe('PENDING');
      expect(transaction.approvalRequired).toBe(true);
      expect(transaction.type).toBe('PAYOUT');

      // Verify sender balance unchanged (pending approval)
      const senderBalance = await accountService.getBalance(senderAccount.id);
      expect(senderBalance.toNumber()).toBe(500);

      // Verify external account balance unchanged
      const externalAccount = await externalBankAccountService.getAccount(
        '123456789',
        '7777777777'
      );
      expect(new Decimal(externalAccount.balance.toString()).toNumber()).toBe(0);
    });

    it('should complete payout after approval', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('500'));

      // Set spending rules to trigger approval
      await accountService.updateSpendingRules(senderAccount.id, {
        perTransactionLimit: '50.00',
      });

      // Create mock external bank account
      await externalBankAccountService.createMockAccount(
        '123456789',
        '8888888888',
        'Charlie Davis',
        'SAVINGS',
        new Decimal('100')
      );

      // Send payout that requires approval
      const pendingTx = await paymentService.sendPayout(
        senderAccount.id,
        '123456789',
        '8888888888',
        'Charlie Davis',
        new Decimal('150'),
        'Large payout requiring approval'
      );

      expect(pendingTx.status).toBe('PENDING');
      expect(pendingTx.approvalRequired).toBe(true);

      // Approve the payout
      const approvedTx = await paymentService.approvePayment(pendingTx.id, testOwnerId);

      expect(approvedTx.status).toBe('COMPLETED');
      expect(approvedTx.type).toBe('PAYOUT');
      expect(approvedTx.approvedAt).toBeDefined();

      // Verify sender balance deducted
      const senderBalance = await accountService.getBalance(senderAccount.id);
      expect(senderBalance.toNumber()).toBe(350);

      // Verify external account balance credited
      const externalAccount = await externalBankAccountService.getAccount(
        '123456789',
        '8888888888'
      );
      expect(new Decimal(externalAccount.balance.toString()).toNumber()).toBe(250);
    });

    it('should reject payout with invalid routing number format', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Try to send payout with invalid routing number
      await expect(
        paymentService.sendPayout(
          senderAccount.id,
          '12345', // Invalid: too short
          '1234567890',
          'Test Person',
          new Decimal('100'),
          'Payment'
        )
      ).rejects.toThrow('Invalid routing number format');
    });

    it('should reject payout with invalid account number format', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Try to send payout with invalid account number
      await expect(
        paymentService.sendPayout(
          senderAccount.id,
          '123456789',
          '123', // Invalid: too short
          'Test Person',
          new Decimal('100'),
          'Payment'
        )
      ).rejects.toThrow('Invalid account number format');
    });

    it('should reject payout with negative amount', async () => {
      // Initialize services with external bank account support
      const externalBankAccountService = new ExternalBankAccountService(
        prisma,
        process.env.ENCRYPTION_SECRET || 'test-secret-key-32-chars-long!'
      );
      paymentService = new PaymentService(
        prisma,
        paymentProvider,
        undefined,
        undefined,
        externalBankAccountService
      );
      // Create sender account
      const { account: senderAccount } = await accountService.createAgentAccount(
        testOwnerId,
        'Sender Agent',
        'OpenClaw'
      );

      // Fund sender account
      await accountService.fundAccount(senderAccount.id, new Decimal('200'));

      // Create mock external bank account
      await externalBankAccountService.createMockAccount(
        '123456789',
        '1111111111',
        'Test Person',
        'CHECKING',
        new Decimal('0')
      );

      // Try to send negative payout
      await expect(
        paymentService.sendPayout(
          senderAccount.id,
          '123456789',
          '1111111111',
          'Test Person',
          new Decimal('-50'),
          'Negative payment'
        )
      ).rejects.toThrow('Amount must be positive and non-zero');
    });
  });
});
