# Final Guide for REDACTED-AGENT - MoltMoney Integration

## ✅ API is Working!

The MoltMoney API has been tested and confirmed working. Your account has **$2000.00** available.

## 🔴 The Problem

REDACTED-AGENT, you've been trying to access these endpoints:
- ❌ `GET /balance` - **DOES NOT EXIST**
- ❌ `GET /balance/{id}` - **DOES NOT EXIST**

These return 404 because they don't exist on the server.

## ✅ The Solution

Use the CORRECT endpoints. Here's exactly what you need to do:

### 1. Check Balance

**What you've been trying:**
```
GET /balance  ❌ WRONG
GET /balance/REDACTED-ACCOUNT-ID  ❌ WRONG
```

**What you MUST use:**
```
GET /accounts/REDACTED-ACCOUNT-ID/balance  ✅ CORRECT
```

**Full working example:**
```javascript
const response = await fetch(
  'https://REDACTED-NGROK-HOST/accounts/REDACTED-ACCOUNT-ID/balance',
  {
    headers: {
      'Authorization': 'Bearer REDACTED-ROTATED-KEY',
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': 'application/json'
    }
  }
);

const data = await response.json();
// Returns: { "accountId": "...", "balance": "2000.00", "currency": "USD", "status": "ACTIVE" }
```

### 2. List Transactions

**Correct endpoint:**
```
GET /transactions?accountId=REDACTED-ACCOUNT-ID&pageSize=10&page=1
```

**Full working example:**
```javascript
const response = await fetch(
  'https://REDACTED-NGROK-HOST/transactions?accountId=REDACTED-ACCOUNT-ID&pageSize=10&page=1',
  {
    headers: {
      'Authorization': 'Bearer REDACTED-ROTATED-KEY',
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': 'application/json'
    }
  }
);

const data = await response.json();
// Returns: { "data": [...], "total": 1, "page": 1, "pageSize": 10 }
```

### 3. Make Payment

**Correct endpoint:**
```
POST /payments/send
```

**Full working example:**
```javascript
const response = await fetch(
  'https://REDACTED-NGROK-HOST/payments/send',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer REDACTED-ROTATED-KEY',
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fromAccountId: 'REDACTED-ACCOUNT-ID',
      amount: '50.00',
      merchantName: 'Amazon',
      description: 'Office supplies'
    })
  }
);

const data = await response.json();
```

### 4. Request Funds

**Correct endpoint:**
```
POST /payments/request
```

**Full working example:**
```javascript
const response = await fetch(
  'https://REDACTED-NGROK-HOST/payments/request',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer REDACTED-ROTATED-KEY',
      'ngrok-skip-browser-warning': 'true',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fromAccountId: 'REDACTED-ACCOUNT-ID',
      amount: '100.00',
      description: 'Fund request: Need money for cloud computing',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
  }
);

const data = await response.json();
```

## 📋 Quick Reference

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Check Balance | GET | `/accounts/{accountId}/balance` |
| List Transactions | GET | `/transactions?accountId={id}&pageSize={limit}&page=1` |
| Make Payment | POST | `/payments/send` |
| Request Funds | POST | `/payments/request` |

## 🔑 Required Headers (ALL requests)

```javascript
{
  'Authorization': 'Bearer REDACTED-ROTATED-KEY',
  'ngrok-skip-browser-warning': 'true',
  'Content-Type': 'application/json'
}
```

## 💰 Your Current Status

- **Balance**: $2000.00
- **Account ID**: REDACTED-ACCOUNT-ID
- **Status**: ACTIVE
- **Spending Limits**:
  - Daily limit: $500
  - Per transaction: $150
  - Requires approval above: $151.01

## 🧪 Test It Now

Run this command to verify it works:

```bash
node skills/REDACTED-AGENT-moltmoney/test-endpoints.js
```

All tests should pass with ✅ SUCCESS.

## 📝 Summary

The key issue is that you're trying to access `/balance` when the actual endpoint is `/accounts/{accountId}/balance`. 

**Remember:**
- ❌ `/balance` → 404 Not Found
- ✅ `/accounts/REDACTED-ACCOUNT-ID/balance` → Works!

The API is working perfectly. You just need to use the correct endpoint paths.
