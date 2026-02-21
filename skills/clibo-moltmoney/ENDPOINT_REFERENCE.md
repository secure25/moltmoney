# MoltMoney API Endpoint Reference for REDACTED-AGENT

## ⚠️ CRITICAL: Correct Endpoints

REDACTED-AGENT, you've been trying to access `/balance` and `/balance/{id}` - **these endpoints DO NOT EXIST**.

Here are the ACTUAL endpoints that exist on the MoltMoney API:

## 1. Check Balance

**CORRECT Endpoint:**
```
GET /accounts/{accountId}/balance
```

**Full URL:**
```
GET https://REDACTED-NGROK-HOST/accounts/REDACTED-ACCOUNT-ID/balance
```

**Headers Required:**
```
Authorization: Bearer REDACTED-ROTATED-KEY
ngrok-skip-browser-warning: true
Content-Type: application/json
```

**Response:**
```json
{
  "accountId": "REDACTED-ACCOUNT-ID",
  "balance": "0.00",
  "currency": "USD",
  "status": "ACTIVE"
}
```

## 2. Make Payment

**CORRECT Endpoint:**
```
POST /payments/send
```

**Full URL:**
```
POST https://REDACTED-NGROK-HOST/payments/send
```

**Headers Required:**
```
Authorization: Bearer REDACTED-ROTATED-KEY
ngrok-skip-browser-warning: true
Content-Type: application/json
```

**Request Body:**
```json
{
  "fromAccountId": "REDACTED-ACCOUNT-ID",
  "amount": "50.00",
  "merchantName": "Amazon",
  "description": "Office supplies"
}
```

## 3. List Transactions

**CORRECT Endpoint:**
```
GET /transactions?accountId={accountId}&pageSize={limit}&page=1
```

**Full URL:**
```
GET https://REDACTED-NGROK-HOST/transactions?accountId=REDACTED-ACCOUNT-ID&pageSize=10&page=1
```

**Headers Required:**
```
Authorization: Bearer REDACTED-ROTATED-KEY
ngrok-skip-browser-warning: true
Content-Type: application/json
```

## 4. Request Funds

**CORRECT Endpoint:**
```
POST /payments/request
```

**Full URL:**
```
POST https://REDACTED-NGROK-HOST/payments/request
```

**Headers Required:**
```
Authorization: Bearer REDACTED-ROTATED-KEY
ngrok-skip-browser-warning: true
Content-Type: application/json
```

**Request Body:**
```json
{
  "fromAccountId": "REDACTED-ACCOUNT-ID",
  "amount": "100.00",
  "description": "Fund request: Need money for cloud computing",
  "expiresAt": "2026-02-26T19:00:00.000Z"
}
```

## ❌ Endpoints That DO NOT EXIST

These will return 404:
- `/balance`
- `/balance/{id}`
- `/accounts/balance`
- `/payment`
- `/pay`
- `/transactions/{id}`
- `/account/transactions`
- `/request`
- `/fund-request`

## ✅ Summary

| Function | Correct Endpoint |
|----------|-----------------|
| Check Balance | `GET /accounts/{accountId}/balance` |
| Make Payment | `POST /payments/send` |
| List Transactions | `GET /transactions?accountId={id}&pageSize={limit}&page=1` |
| Request Funds | `POST /payments/request` |

## Testing

You can test the balance endpoint with curl:

```bash
curl -H "Authorization: Bearer REDACTED-ROTATED-KEY" \
     -H "ngrok-skip-browser-warning: true" \
     https://REDACTED-NGROK-HOST/accounts/REDACTED-ACCOUNT-ID/balance
```

This WILL work and return your balance.
