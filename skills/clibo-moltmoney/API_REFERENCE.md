# MoltMoney API Reference for REDACTED-AGENT

## Base Configuration
- **API URL**: https://REDACTED-NGROK-HOST (update with current ngrok URL)
- **Account ID**: REDACTED-ACCOUNT-ID
- **API Key**: REDACTED-ROTATED-KEY
- **Authentication**: Bearer token in Authorization header

## API Endpoints

### 1. Check Balance
**Endpoint**: `GET /accounts/{accountId}/balance`

**Full URL**: `GET https://REDACTED-NGROK-HOST/accounts/REDACTED-ACCOUNT-ID/balance`

**Headers**:
```
Authorization: Bearer REDACTED-ROTATED-KEY
Content-Type: application/json
```

**Response**:
```json
{
  "accountId": "REDACTED-ACCOUNT-ID",
  "balance": "1000.00",
  "currency": "USD",
  "status": "ACTIVE"
}
```

### 2. Make Payment
**Endpoint**: `POST /payments/send`

**Full URL**: `POST https://REDACTED-NGROK-HOST/payments/send`

**Headers**:
```
Authorization: Bearer REDACTED-ROTATED-KEY
Content-Type: application/json
```

**Request Body** (for merchant payment):
```json
{
  "fromAccountId": "REDACTED-ACCOUNT-ID",
  "amount": "50.00",
  "merchantName": "Amazon",
  "description": "Office supplies"
}
```

**Request Body** (for account transfer):
```json
{
  "fromAccountId": "REDACTED-ACCOUNT-ID",
  "toAccountId": "recipient-account-id-here",
  "amount": "100.00",
  "description": "Transfer to Alice"
}
```

**Response**:
```json
{
  "transaction": {
    "id": "tx-id",
    "amount": "50.00",
    "type": "OUTBOUND",
    "status": "COMPLETED",
    "approvalRequired": false
  }
}
```

### 3. List Transactions
**Endpoint**: `GET /transactions?accountId={accountId}&pageSize={limit}&page=1`

**Full URL**: `GET https://REDACTED-NGROK-HOST/transactions?accountId=REDACTED-ACCOUNT-ID&pageSize=10&page=1`

**Headers**:
```
Authorization: Bearer REDACTED-ROTATED-KEY
Content-Type: application/json
```

**Response**:
```json
{
  "data": [
    {
      "id": "tx-id",
      "amount": "50.00",
      "type": "OUTBOUND",
      "status": "COMPLETED",
      "description": "Office supplies",
      "merchantName": "Amazon",
      "createdAt": "2026-02-19T..."
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 10
}
```

### 4. Request Funds
**Endpoint**: `POST /payments/request`

**Full URL**: `POST https://REDACTED-NGROK-HOST/payments/request`

**Headers**:
```
Authorization: Bearer REDACTED-ROTATED-KEY
Content-Type: application/json
```

**Request Body**:
```json
{
  "fromAccountId": "REDACTED-ACCOUNT-ID",
  "amount": "500.00",
  "description": "Fund request: cloud computing costs",
  "expiresAt": "2026-02-26T00:00:00.000Z"
}
```

**Response**:
```json
{
  "id": "request-id",
  "amount": "500.00",
  "currency": "USD",
  "description": "Fund request: cloud computing costs",
  "status": "PENDING",
  "fromAccountId": "REDACTED-ACCOUNT-ID",
  "toAccountId": null,
  "expiresAt": "2026-02-26T00:00:00.000Z",
  "createdAt": "2026-02-19T..."
}
```

## Quick Reference

| Function | Method | Endpoint |
|----------|--------|----------|
| Check Balance | GET | `/accounts/{accountId}/balance` |
| Make Payment | POST | `/payments/send` |
| List Transactions | GET | `/transactions?accountId={accountId}&pageSize={limit}&page=1` |
| Request Funds | POST | `/payments/request` |

## Error Responses

All errors follow this format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "timestamp": "2026-02-19T..."
  }
}
```

Common error codes:
- `UNAUTHORIZED` - Invalid or missing API key
- `INSUFFICIENT_BALANCE` - Not enough funds
- `ACCOUNT_NOT_FOUND` - Account doesn't exist
- `INVALID_AMOUNT` - Amount must be positive

## Testing

Use the test script to verify connectivity:
```bash
node skills/REDACTED-AGENT-moltmoney/test.js
```
