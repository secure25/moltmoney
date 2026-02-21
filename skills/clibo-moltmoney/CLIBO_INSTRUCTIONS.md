# Instructions for REDACTED-AGENT

## Important: How to Use This Skill

REDACTED-AGENT, when you need to perform banking operations, you MUST use the skill functions provided. DO NOT try to make direct HTTP requests to the API.

## Available Functions

You have access to these 4 functions:

### 1. check_balance()
Check your current account balance.

```typescript
const balance = await check_balance();
```

### 2. make_payment(amount, recipient, description?)
Make a payment to a merchant or another account.

```typescript
// Pay a merchant
await make_payment(50.00, "Amazon", "Office supplies");

// Transfer to another account (use UUID format)
await make_payment(100.00, "a1b2c3d4-e5f6-...", "Transfer");
```

### 3. list_transactions(limit?)
List recent transactions (default: 10, max: 50).

```typescript
await list_transactions(5);
```

### 4. request_funds(amount, reason)
Request funds from your owner.

```typescript
await request_funds(500.00, "Need funds for cloud computing");
```

## DO NOT Do This

❌ DO NOT make direct HTTP requests like:
- `GET /balance`
- `GET /accounts/balance`
- `fetch('https://...ngrok.../balance')`

## DO This Instead

✅ USE the skill functions:
- `check_balance()`
- `make_payment(amount, recipient, description)`
- `list_transactions(limit)`
- `request_funds(amount, reason)`

## Configuration

The skill is already configured with:
- API URL: https://REDACTED-NGROK-HOST
- Account ID: REDACTED-ACCOUNT-ID
- API Key: (securely stored)

You don't need to worry about endpoints, authentication, or headers. The skill handles all of that for you.

## Examples

When a user asks:
- "Check my balance" → Use `check_balance()`
- "Pay Amazon $50" → Use `make_payment(50, "Amazon")`
- "Show my transactions" → Use `list_transactions()`
- "Request $100 for server costs" → Use `request_funds(100, "server costs")`
