# Fund Request Complete Flow

## Overview
This document explains how fund requests work in MoltMoney.

## The Flow

### 1. Agent Requests Funds
Agent (via OpenClaw or other platform) calls:
```javascript
requestFunds(500, "cloud computing costs")
```

This makes an API call:
```
POST /payments/request
{
  "fromAccountId": "agent-account-uuid",
  "amount": "500.00",
  "description": "Fund request: cloud computing costs",
  "expiresAt": "2026-02-22T..."
  // Note: NO toAccountId - this indicates it's a fund request to owner
}
```

### 2. API Creates Request
- Validates the agent's API key
- Finds the agent's account
- Creates a PaymentRequest with `toAccountId = null`
- Stores in database
- Returns success response

### 3. Owner Views Request
Owner logs into dashboard and goes to Approvals page:
- Dashboard fetches: `GET /payments/requests?status=PENDING`
- API returns all pending fund requests where `toAccountId IS NULL`
- Frontend displays them in purple with "Fund Request" badge

### 4. Owner Approves or Declines

**If Approved:**
- Owner clicks "Approve & Fund"
- Frontend calls: `POST /payments/request/:id/approve`
- API adds funds to agent's account
- Creates INBOUND transaction
- Marks request as PAID
- Agent's balance increases

**If Declined:**
- Owner clicks "Decline"
- Frontend calls: `POST /payments/request/:id/decline`
- API marks request as DECLINED
- No funds transferred

## Database Schema

```sql
PaymentRequest {
  id: UUID
  fromAccountId: UUID (agent's account)
  toAccountId: UUID | NULL  -- NULL means fund request to owner
  amount: Decimal
  description: String
  status: PENDING | PAID | DECLINED | EXPIRED
  expiresAt: DateTime
}
```

## API Endpoints

1. `POST /payments/request` - Create fund request (agent auth)
2. `GET /payments/requests?status=PENDING` - List requests (owner auth)
3. `POST /payments/request/:id/approve` - Approve request (owner auth)
4. `POST /payments/request/:id/decline` - Decline request (owner auth)

## Current Issue

The Prisma client is using the old schema where `toAccountId` was required.
After making it optional, the client needs regeneration.

**Fix:** Restart API server after running `npx prisma generate`
