import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OwnerAuthService } from '../../services/auth/owner-auth.service';
import { AccountService } from '../../services/account/account.service';
import { CardService } from '../../services/card/card.service';
import { MockPaymentProvider } from '../../providers/mock-payment-provider';
import Decimal from 'decimal.js';

describe('Integration: Card Issuance and Payment Flow', () => {
  let prisma: PrismaClient;
  let ownerAuthService: OwnerAuthService;
  let accountService: AccountService;
  let cardService: CardService;
  let mockProvider: MockPaymentProvider;
  let testOwnerId: string;

  beforeEach(async () => {
    prisma = new PrismaClient();
    ownerAuthService = new OwnerAuthService(prisma);
    mockProvider = new MockPaymentProvider();
    const encryptionSecret = 'test-encryption-key-32-characters';
    accountService = new AccountService(prisma, undefined, encryptionSecret);
    cardService = new CardService(prisma, mockProvider, encryptionSecret);

    // Register owner
    const owner = await ownerAuthService.registerOwner(
      `test-${Date.now()}@example.com`,
      'Test Owner',
      'password123'
    );
    testOwnerId = owner.id;
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.webhookEvent.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.virtualCard.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.agent.deleteMany({});
    await prisma.owner.deleteMany({});
    await prisma.$disconnect();
  });

  it('should complete full card flow: issue → authorize payment → verify balance', async () => {
    // Step 1: Create agent account and fund
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Step 2: Issue virtual card
    const card = await cardService.issueCard(account.id);

    expect(card).toBeDefined();
    expect(card.status).toBe('ACTIVE');
    expect(card.cardNumber).toBeDefined();
    expect(card.cardNumber).toMatch(/^4111/); // Test Visa format
    expect(card.cvv).toBeDefined();
    expect(card.cvv).toHaveLength(3);
    expect(card.expiryMonth).toBeGreaterThanOrEqual(1);
    expect(card.expiryMonth).toBeLessThanOrEqual(12);
    expect(card.expiryYear).toBeGreaterThan(new Date().getFullYear());
    expect(card.accountId).toBe(account.id);

    // Step 3: Authorize payment with card (this only checks authorization, doesn't process)
    const authResult = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(100),
      'Test Merchant'
    );

    expect(authResult.approved).toBe(true);
    expect(authResult.transactionId).toBeDefined();

    // Note: authorizeCardPayment only authorizes, it doesn't deduct balance
    // In a real system, a separate capture/process step would deduct the balance
    // For this test, we'll verify the authorization worked
    const finalBalance = await accountService.getBalance(account.id);
    expect(finalBalance.toNumber()).toBe(500); // Balance unchanged (authorization only)

    // Step 5: Verify transaction was NOT created (authorization only)
    // In a real system, authorization and capture are separate steps
    const transactions = await prisma.transaction.findMany({
      where: { fromAccountId: account.id, type: 'OUTBOUND' }
    });

    // No transaction created yet (would be created on capture)
    expect(transactions).toHaveLength(0);
  });

  it('should enforce card spend limit', async () => {
    // Create agent account and fund
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(1000));

    // Issue card with spend limit
    const card = await cardService.issueCard(account.id, new Decimal(200));

    expect(card.spendLimit).toBeDefined();
    expect(new Decimal(card.spendLimit!.toString()).toNumber()).toBe(200);

    // Attempt payment exceeding spend limit
    const authResult = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(300), // Exceeds limit of 200
      'Expensive Merchant'
    );

    expect(authResult.approved).toBe(false);
    expect(authResult.reason).toBe('Exceeds card spend limit');

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(1000);
  });

  it('should reject payment with frozen card', async () => {
    // Create agent account and fund
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Issue and freeze card
    const card = await cardService.issueCard(account.id);
    const frozenCard = await cardService.freezeCard(card.id);

    expect(frozenCard.status).toBe('FROZEN');

    // Attempt payment with frozen card
    const authResult = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(100),
      'Test Merchant'
    );

    expect(authResult.approved).toBe(false);
    expect(authResult.reason).toBeDefined();

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(500);
  });

  it('should allow payment after unfreezing card', async () => {
    // Create agent account and fund
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Issue, freeze, then unfreeze card
    const card = await cardService.issueCard(account.id);
    await cardService.freezeCard(card.id);
    const unfrozenCard = await cardService.unfreezeCard(card.id);

    expect(unfrozenCard.status).toBe('ACTIVE');

    // Attempt payment with unfrozen card (authorization only)
    const authResult = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(100),
      'Test Merchant'
    );

    expect(authResult.approved).toBe(true);

    // Verify balance unchanged (authorization doesn't deduct)
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(500);
  });

  it('should permanently reject payment with cancelled card', async () => {
    // Create agent account and fund
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Issue and cancel card
    const card = await cardService.issueCard(account.id);
    const cancelledCard = await cardService.cancelCard(card.id);

    expect(cancelledCard.status).toBe('CANCELLED');

    // Attempt payment with cancelled card
    const authResult = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(100),
      'Test Merchant'
    );

    expect(authResult.approved).toBe(false);

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(500);

    // Verify cannot unfreeze cancelled card
    await expect(
      cardService.unfreezeCard(card.id)
    ).rejects.toThrow();
  });

  it('should reject card payment with insufficient balance', async () => {
    // Create agent account with limited funds
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(50));

    // Issue card
    const card = await cardService.issueCard(account.id);

    // Attempt payment exceeding balance
    const authResult = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(100),
      'Test Merchant'
    );

    expect(authResult.approved).toBe(false);
    expect(authResult.reason).toBe('Insufficient balance');

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(50);
  });

  it('should list all cards for an account', async () => {
    // Create agent account (auto-creates 1 virtual card)
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    // Issue additional cards
    const card1 = await cardService.issueCard(account.id);
    const card2 = await cardService.issueCard(account.id, new Decimal(100));
    const card3 = await cardService.issueCard(account.id, new Decimal(500));

    // Freeze one card
    await cardService.freezeCard(card2.id);

    // List all cards (should have 4 total: 1 auto-created + 3 issued)
    const cards = await cardService.listCards(account.id);

    expect(cards).toHaveLength(4);
    expect(cards.map(c => c.id)).toContain(card1.id);
    expect(cards.map(c => c.id)).toContain(card2.id);
    expect(cards.map(c => c.id)).toContain(card3.id);

    // Verify frozen card status
    const frozenCard = cards.find(c => c.id === card2.id);
    expect(frozenCard?.status).toBe('FROZEN');

    // Verify CVV is not included in list (security)
    cards.forEach(card => {
      expect('cvv' in card).toBe(false);
    });
  });

  it('should enforce spending rules on card payments', async () => {
    // Create agent account with spending rules
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(1000));
    await accountService.updateSpendingRules(account.id, {
      perTransactionLimit: '100'
    });

    // Issue card
    const card = await cardService.issueCard(account.id);

    // Attempt payment exceeding per-transaction limit
    const authResult = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(150), // Exceeds per-transaction limit
      'Test Merchant'
    );

    // Should be declined due to spending rule violation
    expect(authResult.approved).toBe(false);

    // Verify balance unchanged
    const balance = await accountService.getBalance(account.id);
    expect(balance.toNumber()).toBe(1000);
  });

  it('should handle multiple sequential card payments', async () => {
    // Create agent account and fund
    const { account } = await accountService.createAgentAccount(
      testOwnerId,
      'Test Agent',
      'OpenClaw'
    );

    await accountService.fundAccount(account.id, new Decimal(500));

    // Issue card
    const card = await cardService.issueCard(account.id);

    // Make multiple payments (authorization only)
    const payment1 = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(100),
      'Merchant 1'
    );
    expect(payment1.approved).toBe(true);

    const payment2 = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(150),
      'Merchant 2'
    );
    expect(payment2.approved).toBe(true);

    const payment3 = await cardService.authorizeCardPayment(
      card.cardNumber,
      new Decimal(200),
      'Merchant 3'
    );
    expect(payment3.approved).toBe(true);

    // Verify balance unchanged (authorizations don't deduct)
    const finalBalance = await accountService.getBalance(account.id);
    expect(finalBalance.toNumber()).toBe(500);

    // Verify no transactions created (authorization only)
    const transactions = await prisma.transaction.findMany({
      where: { fromAccountId: account.id }
    });
    expect(transactions.filter(tx => tx.type === 'OUTBOUND')).toHaveLength(0);
  });
});
