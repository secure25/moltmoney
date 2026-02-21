# External Bank Account Payout - Design

## Architecture Overview

This feature adds external bank account payout capability using a mock banking system. It extends the existing payment infrastructure to support PAYOUT transaction types.

## Database Schema Changes

### New Table: ExternalBankAccount

```prisma
model ExternalBankAccount {
  id            String   @id @default(uuid())
  routingNumber String   // 9 digits
  accountNumber String   // 8-17 digits (encrypted)
  accountHolder String   // Name on account
  accountType   String   // CHECKING or SAVINGS
  balance       Decimal  @db.Decimal(18, 2) // Mock balance for testing
  status        String   // ACTIVE, CLOSED
  createdAt     DateTime @default(now())
  
  @@unique([routingNumber, accountNumber])
  @@index([routingNumber])
}
```

### Transaction Model Updates
No schema changes needed - PAYOUT type already exists in TxType enum.

## API Endpoints

### 1. POST /payments/payout
Initiate a payout to an external bank account.

**Request:**
```json
{
  "fromAccountId": "uuid",
  "routingNumber": "123456789",
  "accountNumber": "1234567890",
  "accountHolder": "John Doe",
  "amount": "100.00",
  "description": "Payment for services"
}
```

**Response (Success):**
```json
{
  "transaction": {
    "id": "uuid",
    "amount": "100.00",
    "type": "PAYOUT",
    "status": "COMPLETED",
    "description": "Payment for services",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "approvalRequired": false
  }
}
```

**Response (Requires Approval):**
```json
{
  "transaction": {
    "id": "uuid",
    "amount": "500.00",
    "type": "PAYOUT",
    "status": "PENDING",
    "description": "Payment for services",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "approvalRequired": true
  }
}
```

### 2. POST /external-accounts (Testing Only)
Create a mock external bank account for testing.

**Request:**
```json
{
  "routingNumber": "123456789",
  "accountNumber": "1234567890",
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "initialBalance": "1000.00"
}
```

**Response:**
```json
{
  "id": "uuid",
  "routingNumber": "123456789",
  "accountNumber": "****7890",
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "balance": "1000.00",
  "status": "ACTIVE"
}
```

### 3. GET /external-accounts/:routingNumber/:accountNumber
Verify an external bank account exists (for testing).

**Response:**
```json
{
  "exists": true,
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "status": "ACTIVE"
}
```

## Service Layer

### PaymentService Updates

Add new method: `sendPayout()`

```typescript
async sendPayout(
  fromAccountId: string,
  routingNumber: string,
  accountNumber: string,
  accountHolder: string,
  amount: Decimal,
  description?: string
): Promise<Transaction>
```

**Logic Flow:**
1. Validate inputs (routing/account format, amount, account holder)
2. Check sender account status and balance
3. Evaluate spending rules
4. If approval required → create PENDING transaction
5. If no approval → process payout immediately
6. Update sender balance
7. Update mock external account balance
8. Create PAYOUT transaction record
9. Send webhooks and WebSocket events

### New Service: ExternalBankAccountService

```typescript
class ExternalBankAccountService {
  async createMockAccount(data): Promise<ExternalBankAccount>
  async verifyAccount(routing, account): Promise<boolean>
  async getAccount(routing, account): Promise<ExternalBankAccount>
  async creditAccount(routing, account, amount): Promise<void>
  async closeAccount(id): Promise<void>
}
```

## Validation Rules

### Routing Number
- Must be exactly 9 digits
- Must be numeric only
- Regex: `^[0-9]{9}$`

### Account Number
- Must be 8-17 digits
- Must be numeric only
- Regex: `^[0-9]{8,17}$`

### Account Holder
- Required, non-empty string
- Max length: 100 characters
- Min length: 2 characters

### Amount
- Must be positive and non-zero
- Max 2 decimal places
- Must not exceed sender balance

## Security Considerations

### Account Number Encryption
- Store account numbers encrypted (same as virtual cards)
- Use AES-256-CBC encryption
- Only show last 4 digits in responses

### Audit Logging
- Log all payout attempts (success and failure)
- Include: timestamp, amount, sender, recipient (masked), status
- Store in transaction table

### Rate Limiting
- Apply existing rate limits to payout endpoint
- Consider separate, stricter limits for payouts

## Error Handling

### Error Codes
- `INVALID_ROUTING_NUMBER` - Routing number format invalid
- `INVALID_ACCOUNT_NUMBER` - Account number format invalid
- `ACCOUNT_NOT_FOUND` - External account doesn't exist
- `ACCOUNT_CLOSED` - External account is closed
- `INSUFFICIENT_BALANCE` - Sender has insufficient funds
- `ACCOUNT_FROZEN` - Sender account is frozen
- `PAYOUT_FAILED` - Generic payout failure

### Error Response Format
```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance for payout",
    "timestamp": "2026-02-20T10:30:00Z"
  }
}
```

## Webhook Events

### New Event: PAYOUT_COMPLETED
```json
{
  "type": "payout.completed",
  "data": {
    "transactionId": "uuid",
    "amount": "100.00",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "routingNumber": "123456789",
    "description": "Payment for services"
  }
}
```

### New Event: PAYOUT_FAILED
```json
{
  "type": "payout.failed",
  "data": {
    "transactionId": "uuid",
    "amount": "100.00",
    "recipientName": "John Doe",
    "reason": "Account not found",
    "description": "Payment for services"
  }
}
```

## WebSocket Events

### PAYOUT_INITIATED
Sent when payout is initiated (pending approval or processing).

### PAYOUT_COMPLETED
Sent when payout successfully completes.

### PAYOUT_FAILED
Sent when payout fails.

## Agent Skill Updates

Add new function to agent skill:

```typescript
async send_payout(
  routingNumber: string,
  accountNumber: string,
  accountHolder: string,
  amount: number,
  description?: string
): Promise<string>
```

**Example Usage:**
```typescript
const result = await send_payout(
  "123456789",
  "1234567890",
  "John Doe",
  100.00,
  "Payment for consulting services"
);
// Returns: "Payout of 100.00 to John Doe (****7890) completed"
```

## Testing Strategy

### Unit Tests
- Validate routing/account number formats
- Test encryption/decryption of account numbers
- Test balance calculations
- Test spending rule evaluation for payouts

### Integration Tests
- Create mock external account
- Send payout to mock account
- Verify balances updated correctly
- Test approval workflow for large payouts
- Test payout failures (invalid account, insufficient balance)

### End-to-End Tests
- Agent initiates payout via skill
- Owner approves payout
- Verify transaction history
- Check webhook delivery

## Migration Plan

1. Add ExternalBankAccount table to schema
2. Run database migration
3. Implement ExternalBankAccountService
4. Update PaymentService with sendPayout method
5. Add payout routes
6. Update agent skill
7. Add tests
8. Update documentation

## Future Enhancements (Out of Scope)
- Real ACH integration
- International wire transfers
- Payout scheduling
- Recurring payouts
- Payout reversals
- Multi-currency support
