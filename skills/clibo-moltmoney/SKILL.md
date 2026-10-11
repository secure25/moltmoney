# MoltMoney Skill for REDACTED-AGENT

This skill enables REDACTED-AGENT to perform banking operations through the MoltMoney platform.

## Configuration

Configure skill with environment variables:
- `MOLTMONEY_API_URL`
- `MOLTMONEY_API_KEY`
- `MOLTMONEY_ACCOUNT_ID`

## Available Functions

### check_balance()
Check your current account balance.

**Returns**: String with balance information

**Example**:
```typescript
const balance = await check_balance();
// Returns: "You have $1000.00 available"
```

### make_payment(amount, recipient, description?)
Make a payment to a merchant or another account.

**Parameters**:
- `amount` (number): Amount to pay
- `recipient` (string): Merchant name or account ID (UUID format)
- `description` (string, optional): Payment description

**Returns**: String with payment status

**Examples**:
```typescript
// Pay a merchant
const result = await make_payment(50.00, "Amazon", "Office supplies");
// Returns: "Payment of $50.00 to Amazon completed successfully"

// Transfer to another account
const result = await make_payment(100.00, "a1b2c3d4-...", "Transfer to Alice");
// Returns: "Payment of $100.00 to a1b2c3d4-... completed successfully"
```

### list_transactions(limit?)
List recent transactions.

**Parameters**:
- `limit` (number, optional): Number of transactions to retrieve (1-50, default: 10)

**Returns**: String with formatted transaction list

**Example**:
```typescript
const transactions = await list_transactions(5);
// Returns:
// "Recent transactions:
// 1. +$1000.00 from Owner (COMPLETED) - Initial funding
// 2. -$50.00 to Amazon (COMPLETED) - Office supplies"
```

### request_funds(amount, reason)
Request funds from your account owner.

**Parameters**:
- `amount` (number): Amount to request
- `reason` (string): Reason for the fund request

**Returns**: String with request status

**Example**:
```typescript
const result = await request_funds(500.00, "cloud computing costs");
// Returns: "Fund request for $500.00 sent to owner. Reason: cloud computing costs"
```

## Usage in ClawNow

When REDACTED-AGENT needs to perform banking operations, it can use these functions:

1. **Check balance before making payments**
2. **Make payments** to merchants or other accounts
3. **Request funds** when balance is low
4. **Review transaction history** to track spending

## Error Handling

All functions return user-friendly error messages:
- "Insufficient balance" - Not enough funds
- "Account is frozen" - Account needs owner attention
- "Invalid API key" - Authentication issue
- "Unable to connect" - Network/API issue

## Security Notes

- API key is stored securely and never exposed in responses
- All requests are authenticated with Bearer token
- Payments may require owner approval based on spending rules
