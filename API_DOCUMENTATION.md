# MoltMoney API Documentation

## Overview

This document provides comprehensive API documentation for the MoltMoney AI Agent Banking Platform, including authentication, endpoints, request/response formats, and error handling.

## Base URL

```
Development: http://localhost:3000
Production: [Your production URL]
```

## Authentication

### Agent Authentication
Agents authenticate using API keys passed in the `X-API-Key` header.

```http
X-API-Key: your-agent-api-key
```

### Owner Authentication
Owners authenticate using JWT tokens passed in the `Authorization` header.

```http
Authorization: Bearer your-jwt-token
```

---

## Payment Endpoints

### Send Payout to External Bank Account

Send money from an agent's account to an external human bank account.

**Endpoint:** `POST /payments/payout`

**Authentication:** Agent (API Key)

**Requirements:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

**Request Body:**

```json
{
  "routingNumber": "123456789",
  "accountNumber": "1234567890",
  "accountHolder": "John Doe",
  "amount": "100.00",
  "description": "Payment for consulting services"
}
```

**Request Fields:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `routingNumber` | string | Yes | Must be exactly 9 digits | Bank routing number |
| `accountNumber` | string | Yes | Must be 8-17 digits | Bank account number |
| `accountHolder` | string | Yes | 2-100 characters | Name on the bank account |
| `amount` | string | Yes | Must be > 0, decimal format | Amount to send |
| `description` | string | No | Max 500 characters | Payment description |

**Success Response (201 Created):**

```json
{
  "transaction": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "100.00",
    "type": "PAYOUT",
    "status": "COMPLETED",
    "description": "Payment for consulting services",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "approvalRequired": false,
    "createdAt": "2026-02-20T10:30:00.000Z"
  }
}
```

**Success Response - Requires Approval (201 Created):**

When the payout amount exceeds the approval threshold:

```json
{
  "transaction": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "500.00",
    "type": "PAYOUT",
    "status": "PENDING",
    "description": "Payment for consulting services",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "approvalRequired": true,
    "createdAt": "2026-02-20T10:30:00.000Z"
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique transaction identifier (UUID) |
| `amount` | string | Transaction amount in decimal format |
| `type` | string | Always "PAYOUT" for payout transactions |
| `status` | string | "COMPLETED" (processed) or "PENDING" (awaiting approval) |
| `description` | string | Payment description |
| `recipientName` | string | Name of the recipient |
| `recipientAccount` | string | Masked account number (last 4 digits only) |
| `approvalRequired` | boolean | Whether owner approval is required |
| `createdAt` | string | ISO 8601 timestamp of transaction creation |

**Error Responses:**

See [Error Codes](#error-codes) section for detailed error responses.

Common errors:
- `400 Bad Request` - Validation error, invalid account, insufficient balance
- `404 Not Found` - Agent account not found
- `401 Unauthorized` - Invalid or missing API key

**Example cURL Request:**

```bash
curl -X POST http://localhost:3000/payments/payout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-agent-api-key" \
  -d '{
    "routingNumber": "123456789",
    "accountNumber": "1234567890",
    "accountHolder": "John Doe",
    "amount": "100.00",
    "description": "Payment for consulting services"
  }'
```

**Business Logic:**

1. Validates routing number format (exactly 9 digits)
2. Validates account number format (8-17 digits)
3. Validates account holder name (2-100 characters)
4. Checks sender account status (must be ACTIVE, not FROZEN or CLOSED)
5. Checks sufficient balance
6. Evaluates spending rules (daily limits, approval thresholds)
7. If approval required → creates PENDING transaction
8. If no approval → processes payout immediately:
   - Deducts balance from sender account
   - Credits balance to external account (mock)
   - Creates COMPLETED transaction
   - Sends webhook event (`payout.completed`)
   - Sends WebSocket event (PAYOUT_COMPLETED)

**Notes:**

- Account numbers are encrypted in the database
- Only the last 4 digits are shown in responses
- Routing numbers are public information and shown in full
- Payouts respect the same spending rules as regular payments
- Failed payouts do not affect account balance

---

### Send Payment (Internal Transfer)

Send money between agent accounts or to merchants.

**Endpoint:** `POST /payments/send`

**Authentication:** Agent (API Key)

**Request Body:**

```json
{
  "toAccountId": "550e8400-e29b-41d4-a716-446655440001",
  "amount": "50.00",
  "description": "Payment for API usage",
  "merchantName": "OpenAI",
  "merchantCategory": "AI Services"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `toAccountId` | string | No | Recipient account ID (UUID) or account number |
| `amount` | string | Yes | Amount to send (must be > 0) |
| `description` | string | No | Payment description (max 500 chars) |
| `merchantName` | string | No | Merchant name (max 100 chars) |
| `merchantCategory` | string | No | Merchant category (max 50 chars) |

**Success Response (201 Created):**

```json
{
  "transaction": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "50.00",
    "type": "PAYMENT",
    "status": "COMPLETED",
    "approvalRequired": false,
    "description": "Payment for API usage",
    "merchantName": "OpenAI",
    "createdAt": "2026-02-20T10:30:00.000Z"
  }
}
```

---

### Approve Payment

Approve a pending payment or payout transaction.

**Endpoint:** `POST /payments/approve/:id`

**Authentication:** Owner (JWT)

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Transaction ID (UUID) |

**Success Response (200 OK):**

```json
{
  "transaction": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "500.00",
    "type": "PAYOUT",
    "status": "COMPLETED",
    "approvedAt": "2026-02-20T10:35:00.000Z"
  }
}
```

**Error Responses:**

- `404 Not Found` - Transaction not found
- `403 Forbidden` - Owner does not have permission to approve this transaction
- `401 Unauthorized` - Invalid or missing JWT token

---

### Decline Payment

Decline a pending payment or payout transaction.

**Endpoint:** `POST /payments/decline/:id`

**Authentication:** Owner (JWT)

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Transaction ID (UUID) |

**Success Response (200 OK):**

```json
{
  "transaction": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "500.00",
    "type": "PAYOUT",
    "status": "DECLINED"
  }
}
```

**Error Responses:**

- `404 Not Found` - Transaction not found
- `403 Forbidden` - Owner does not have permission to decline this transaction
- `401 Unauthorized` - Invalid or missing JWT token

---

## External Bank Account Endpoints

These endpoints are for testing purposes only and allow creation and verification of mock external bank accounts.

### Create Mock External Bank Account

Create a mock external bank account for testing payout functionality.

**Endpoint:** `POST /external-accounts`

**Authentication:** Owner (JWT)

**Requirements:** 3.1, 3.5

**Request Body:**

```json
{
  "routingNumber": "123456789",
  "accountNumber": "1234567890",
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "initialBalance": "1000.00"
}
```

**Request Fields:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `routingNumber` | string | Yes | Must be exactly 9 digits | Bank routing number |
| `accountNumber` | string | Yes | Must be 8-17 digits | Bank account number |
| `accountHolder` | string | Yes | 2-100 characters | Name on the bank account |
| `accountType` | string | Yes | Must be "CHECKING" or "SAVINGS" | Type of bank account |
| `initialBalance` | string | No | Must be >= 0, decimal format | Starting balance (default: 0) |

**Success Response (201 Created):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "routingNumber": "123456789",
  "accountNumber": "****7890",
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "balance": "1000.00",
  "status": "ACTIVE"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique account identifier (UUID) |
| `routingNumber` | string | Bank routing number (9 digits) |
| `accountNumber` | string | Masked account number (last 4 digits only) |
| `accountHolder` | string | Name on the account |
| `accountType` | string | "CHECKING" or "SAVINGS" |
| `balance` | string | Current account balance |
| `status` | string | Account status ("ACTIVE" or "CLOSED") |

**Error Responses:**

```json
{
  "error": {
    "code": "DUPLICATE_ACCOUNT",
    "message": "An account with this routing and account number already exists",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Routing number must be exactly 9 digits",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Example cURL Request:**

```bash
curl -X POST http://localhost:3000/external-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "routingNumber": "123456789",
    "accountNumber": "1234567890",
    "accountHolder": "John Doe",
    "accountType": "CHECKING",
    "initialBalance": "1000.00"
  }'
```

**Notes:**

- This endpoint is for testing purposes only
- Account numbers are encrypted in the database
- Each routing + account number combination must be unique
- Mock accounts can receive payouts from agents

---

### Verify External Bank Account

Verify if an external bank account exists in the mock registry.

**Endpoint:** `GET /external-accounts/:routingNumber/:accountNumber`

**Authentication:** Owner (JWT)

**Requirements:** 3.2

**URL Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `routingNumber` | string | Bank routing number (9 digits) |
| `accountNumber` | string | Bank account number (8-17 digits) |

**Success Response (200 OK) - Account Exists:**

```json
{
  "exists": true,
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "status": "ACTIVE"
}
```

**Success Response (200 OK) - Account Does Not Exist:**

```json
{
  "exists": false
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `exists` | boolean | Whether the account exists |
| `accountHolder` | string | Name on the account (only if exists) |
| `accountType` | string | "CHECKING" or "SAVINGS" (only if exists) |
| `status` | string | Account status (only if exists) |

**Error Responses:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid routing number format",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Example cURL Request:**

```bash
curl -X GET http://localhost:3000/external-accounts/123456789/1234567890 \
  -H "Authorization: Bearer your-jwt-token"
```

**Notes:**

- This endpoint is for testing purposes only
- Use this to verify an account exists before attempting a payout
- Account balance is not returned for security reasons

---

## Example Requests and Responses

### Example 1: Successful Payout (No Approval Required)

**Scenario:** Agent sends $100 to an external bank account. The amount is below the approval threshold.

**Request:**

```bash
curl -X POST http://localhost:3000/payments/payout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: agent_key_abc123xyz" \
  -d '{
    "routingNumber": "123456789",
    "accountNumber": "9876543210",
    "accountHolder": "Jane Smith",
    "amount": "100.00",
    "description": "Freelance design work"
  }'
```

**Response (201 Created):**

```json
{
  "transaction": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "amount": "100.00",
    "type": "PAYOUT",
    "status": "COMPLETED",
    "description": "Freelance design work",
    "recipientName": "Jane Smith",
    "recipientAccount": "****3210",
    "approvalRequired": false,
    "createdAt": "2026-02-20T14:25:30.123Z"
  }
}
```

**What Happens:**
1. Agent's account balance is reduced by $100
2. External account balance is increased by $100
3. Transaction is created with status COMPLETED
4. Webhook event `payout.completed` is sent
5. WebSocket event PAYOUT_COMPLETED is broadcast

---

### Example 2: Payout Requiring Approval

**Scenario:** Agent sends $5,000 to an external bank account. The amount exceeds the approval threshold.

**Request:**

```bash
curl -X POST http://localhost:3000/payments/payout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: agent_key_abc123xyz" \
  -d '{
    "routingNumber": "987654321",
    "accountNumber": "1122334455",
    "accountHolder": "Bob Johnson",
    "amount": "5000.00",
    "description": "Consulting services payment"
  }'
```

**Response (201 Created):**

```json
{
  "transaction": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "amount": "5000.00",
    "type": "PAYOUT",
    "status": "PENDING",
    "description": "Consulting services payment",
    "recipientName": "Bob Johnson",
    "recipientAccount": "****4455",
    "approvalRequired": true,
    "createdAt": "2026-02-20T14:30:15.456Z"
  }
}
```

**What Happens:**
1. Transaction is created with status PENDING
2. Agent's balance is NOT deducted yet
3. Owner receives notification to approve/decline
4. WebSocket event PAYOUT_INITIATED is broadcast

**Owner Approves:**

```bash
curl -X POST http://localhost:3000/payments/approve/b2c3d4e5-f6a7-8901-bcde-f12345678901 \
  -H "Authorization: Bearer owner_jwt_token"
```

**Approval Response (200 OK):**

```json
{
  "transaction": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "amount": "5000.00",
    "type": "PAYOUT",
    "status": "COMPLETED",
    "approvedAt": "2026-02-20T14:32:00.789Z"
  }
}
```

**After Approval:**
1. Agent's balance is reduced by $5,000
2. External account balance is increased by $5,000
3. Transaction status changes to COMPLETED
4. Webhook event `payout.completed` is sent
5. WebSocket event PAYOUT_COMPLETED is broadcast

---

### Example 3: Insufficient Balance Error

**Scenario:** Agent attempts to send $1,000 but only has $500 in their account.

**Request:**

```bash
curl -X POST http://localhost:3000/payments/payout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: agent_key_abc123xyz" \
  -d '{
    "routingNumber": "123456789",
    "accountNumber": "5555666677",
    "accountHolder": "Alice Brown",
    "amount": "1000.00",
    "description": "Payment for services"
  }'
```

**Response (400 Bad Request):**

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance for payout",
    "timestamp": "2026-02-20T14:35:45.321Z"
  }
}
```

---

### Example 4: Invalid Routing Number

**Scenario:** Agent provides an invalid routing number (not 9 digits).

**Request:**

```bash
curl -X POST http://localhost:3000/payments/payout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: agent_key_abc123xyz" \
  -d '{
    "routingNumber": "12345",
    "accountNumber": "9876543210",
    "accountHolder": "Charlie Davis",
    "amount": "50.00",
    "description": "Payment"
  }'
```

**Response (400 Bad Request):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Routing number must be exactly 9 digits",
    "timestamp": "2026-02-20T14:40:12.654Z"
  }
}
```

---

### Example 5: Account Not Found

**Scenario:** Agent sends payout to a non-existent external account.

**Request:**

```bash
curl -X POST http://localhost:3000/payments/payout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: agent_key_abc123xyz" \
  -d '{
    "routingNumber": "999999999",
    "accountNumber": "0000000000",
    "accountHolder": "Unknown Person",
    "amount": "75.00",
    "description": "Payment"
  }'
```

**Response (400 Bad Request):**

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "External bank account not found",
    "timestamp": "2026-02-20T14:45:30.987Z"
  }
}
```

---

### Example 6: Create Mock External Account

**Scenario:** Owner creates a mock external bank account for testing.

**Request:**

```bash
curl -X POST http://localhost:3000/external-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer owner_jwt_token" \
  -d '{
    "routingNumber": "111222333",
    "accountNumber": "4445556667",
    "accountHolder": "Test User",
    "accountType": "CHECKING",
    "initialBalance": "500.00"
  }'
```

**Response (201 Created):**

```json
{
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "routingNumber": "111222333",
  "accountNumber": "****6667",
  "accountHolder": "Test User",
  "accountType": "CHECKING",
  "balance": "500.00",
  "status": "ACTIVE"
}
```

---

### Example 7: Verify External Account Exists

**Scenario:** Owner checks if an external account exists before testing a payout.

**Request:**

```bash
curl -X GET http://localhost:3000/external-accounts/111222333/4445556667 \
  -H "Authorization: Bearer owner_jwt_token"
```

**Response (200 OK):**

```json
{
  "exists": true,
  "accountHolder": "Test User",
  "accountType": "CHECKING",
  "status": "ACTIVE"
}
```

---

### Example 8: Verify Non-Existent Account

**Scenario:** Owner checks for an account that doesn't exist.

**Request:**

```bash
curl -X GET http://localhost:3000/external-accounts/000000000/0000000000 \
  -H "Authorization: Bearer owner_jwt_token"
```

**Response (200 OK):**

```json
{
  "exists": false
}
```

---

### Example 9: Frozen Account Error

**Scenario:** Agent attempts payout but their account is frozen.

**Request:**

```bash
curl -X POST http://localhost:3000/payments/payout \
  -H "Content-Type: application/json" \
  -H "X-API-Key: agent_key_frozen" \
  -d '{
    "routingNumber": "123456789",
    "accountNumber": "9876543210",
    "accountHolder": "Jane Smith",
    "amount": "100.00",
    "description": "Payment"
  }'
```

**Response (400 Bad Request):**

```json
{
  "error": {
    "code": "ACCOUNT_FROZEN",
    "message": "Account is FROZEN and cannot perform transactions",
    "timestamp": "2026-02-20T15:00:00.000Z"
  }
}
```

---

### Example 10: Duplicate External Account

**Scenario:** Owner attempts to create an external account that already exists.

**Request:**

```bash
curl -X POST http://localhost:3000/external-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer owner_jwt_token" \
  -d '{
    "routingNumber": "111222333",
    "accountNumber": "4445556667",
    "accountHolder": "Test User",
    "accountType": "SAVINGS",
    "initialBalance": "1000.00"
  }'
```

**Response (400 Bad Request):**

```json
{
  "error": {
    "code": "DUPLICATE_ACCOUNT",
    "message": "An account with this routing and account number already exists",
    "timestamp": "2026-02-20T15:05:00.000Z"
  }
}
```

---

## Error Codes

All error responses follow a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

### Payout Error Codes

| Error Code | HTTP Status | Description | Possible Causes |
|------------|-------------|-------------|-----------------|
| `INVALID_ROUTING_NUMBER` | 400 | Routing number format is invalid | Routing number is not exactly 9 digits or contains non-numeric characters |
| `INVALID_ACCOUNT_NUMBER` | 400 | Account number format is invalid | Account number is not 8-17 digits or contains non-numeric characters |
| `ACCOUNT_NOT_FOUND` | 400 | External bank account does not exist | The routing + account number combination is not in the mock registry |
| `ACCOUNT_CLOSED` | 400 | External bank account is closed | The external account status is CLOSED |
| `INSUFFICIENT_BALANCE` | 400 | Sender has insufficient funds | Agent's account balance is less than the payout amount |
| `ACCOUNT_FROZEN` | 400 | Sender account is frozen | Agent's account status is FROZEN and cannot perform transactions |
| `PAYOUT_FAILED` | 400 | Generic payout failure | Payout failed for an unspecified reason |
| `VALIDATION_ERROR` | 400 | Request validation failed | One or more request fields failed validation (see message for details) |
| `ACCOUNT_NOT_FOUND` | 404 | Agent account not found | The authenticated agent does not have an associated account |
| `UNAUTHORIZED` | 401 | Authentication failed | Invalid or missing API key |

### External Account Error Codes

| Error Code | HTTP Status | Description | Possible Causes |
|------------|-------------|-------------|-----------------|
| `DUPLICATE_ACCOUNT` | 400 | Account already exists | An external account with the same routing + account number already exists |
| `VALIDATION_ERROR` | 400 | Request validation failed | One or more request fields failed validation (see message for details) |
| `UNAUTHORIZED` | 401 | Authentication failed | Invalid or missing JWT token |

### Payment Approval Error Codes

| Error Code | HTTP Status | Description | Possible Causes |
|------------|-------------|-------------|-----------------|
| `TRANSACTION_NOT_FOUND` | 404 | Transaction does not exist | The transaction ID is invalid or the transaction was deleted |
| `AUTHORIZATION_ERROR` | 403 | Permission denied | The owner does not have permission to approve/decline this transaction |
| `UNAUTHORIZED` | 401 | Authentication failed | Invalid or missing JWT token |

### Validation Error Details

When a `VALIDATION_ERROR` occurs, the error message provides specific details about what failed validation:

**Routing Number Validation:**
- "Routing number must be exactly 9 digits"
- "Invalid routing number format"

**Account Number Validation:**
- "Account number must be 8-17 digits"
- "Invalid account number format"

**Account Holder Validation:**
- "Account holder name must be at least 2 characters"
- "Account holder name must not exceed 100 characters"

**Amount Validation:**
- "Amount must be greater than 0"
- "Initial balance must be non-negative"

**Account Type Validation:**
- "Account type must be CHECKING or SAVINGS"

**Description Validation:**
- "Description must not exceed 500 characters"

### Error Response Examples

**Invalid Routing Number:**

```json
{
  "error": {
    "code": "INVALID_ROUTING_NUMBER",
    "message": "Invalid routing number format",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Insufficient Balance:**

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient balance for payout",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Account Frozen:**

```json
{
  "error": {
    "code": "ACCOUNT_FROZEN",
    "message": "Account is FROZEN and cannot perform transactions",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Account Not Found:**

```json
{
  "error": {
    "code": "ACCOUNT_NOT_FOUND",
    "message": "External bank account not found",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Duplicate Account:**

```json
{
  "error": {
    "code": "DUPLICATE_ACCOUNT",
    "message": "An account with this routing and account number already exists",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Validation Error:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Routing number must be exactly 9 digits",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Transaction Not Found:**

```json
{
  "error": {
    "code": "TRANSACTION_NOT_FOUND",
    "message": "Transaction not found",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

**Authorization Error:**

```json
{
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "You do not have permission to approve this payment",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

### HTTP Status Code Summary

| Status Code | Meaning | When Used |
|-------------|---------|-----------|
| 200 | OK | Successful GET request |
| 201 | Created | Successful POST request that creates a resource |
| 400 | Bad Request | Validation error, business logic error, or invalid request |
| 401 | Unauthorized | Missing or invalid authentication credentials |
| 403 | Forbidden | Valid authentication but insufficient permissions |
| 404 | Not Found | Requested resource does not exist |
| 500 | Internal Server Error | Unexpected server error (should be rare) |

---

## Webhook Events

The MoltMoney API sends webhook events for important payout-related activities.

### payout.completed

Sent when a payout successfully completes.

**Event Payload:**

```json
{
  "type": "payout.completed",
  "data": {
    "transactionId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "100.00",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "routingNumber": "123456789",
    "description": "Payment for services"
  },
  "timestamp": "2026-02-20T10:30:00.000Z"
}
```

### payout.failed

Sent when a payout fails.

**Event Payload:**

```json
{
  "type": "payout.failed",
  "data": {
    "transactionId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "100.00",
    "recipientName": "John Doe",
    "reason": "Account not found",
    "description": "Payment for services"
  },
  "timestamp": "2026-02-20T10:30:00.000Z"
}
```

---

## WebSocket Events

The MoltMoney API broadcasts real-time WebSocket events for payout activities.

### PAYOUT_INITIATED

Sent when a payout is initiated (either pending approval or processing).

**Event Payload:**

```json
{
  "event": "PAYOUT_INITIATED",
  "data": {
    "transactionId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "100.00",
    "status": "PENDING",
    "recipientName": "John Doe",
    "recipientAccount": "****7890"
  }
}
```

### PAYOUT_COMPLETED

Sent when a payout successfully completes.

**Event Payload:**

```json
{
  "event": "PAYOUT_COMPLETED",
  "data": {
    "transactionId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "100.00",
    "recipientName": "John Doe",
    "recipientAccount": "****7890"
  }
}
```

### PAYOUT_FAILED

Sent when a payout fails.

**Event Payload:**

```json
{
  "event": "PAYOUT_FAILED",
  "data": {
    "transactionId": "550e8400-e29b-41d4-a716-446655440000",
    "amount": "100.00",
    "recipientName": "John Doe",
    "reason": "Insufficient balance"
  }
}
```

---

## Rate Limiting

All API endpoints are subject to rate limiting to prevent abuse.

**Default Limits:**
- 100 requests per minute per API key (agents)
- 200 requests per minute per JWT token (owners)

**Rate Limit Headers:**

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1645358400
```

**Rate Limit Exceeded Response (429 Too Many Requests):**

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later.",
    "timestamp": "2026-02-20T10:30:00.000Z"
  }
}
```

---

## Security Considerations

### Account Number Encryption

- All bank account numbers are encrypted at rest using AES-256-CBC encryption
- Only the last 4 digits are shown in API responses
- Full account numbers are never logged or exposed in error messages

### Audit Logging

- All payout attempts (successful and failed) are logged
- Logs include: timestamp, amount, sender, recipient (masked), status
- Logs are stored in the transaction table for audit purposes

### Authentication

- Agents must use valid API keys for all payout requests
- Owners must use valid JWT tokens for external account management
- Invalid or expired credentials result in 401 Unauthorized responses

### Authorization

- Agents can only send payouts from their own accounts
- Owners can only approve/decline transactions for agents they own
- Owners can only create/verify external accounts (testing only)

---

## Testing Guide

### Setting Up Test Environment

1. **Start the API server:**
   ```bash
   npm run dev
   ```

2. **Create a test owner account:**
   ```bash
   curl -X POST http://localhost:3000/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "SecurePass123!",
       "name": "Test Owner"
     }'
   ```

3. **Login to get JWT token:**
   ```bash
   curl -X POST http://localhost:3000/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@example.com",
       "password": "SecurePass123!"
     }'
   ```

4. **Create a test agent:**
   Use the dashboard or API to create an agent and get its API key.

5. **Create a mock external bank account:**
   ```bash
   curl -X POST http://localhost:3000/external-accounts \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{
       "routingNumber": "123456789",
       "accountNumber": "9876543210",
       "accountHolder": "Test Recipient",
       "accountType": "CHECKING",
       "initialBalance": "0.00"
     }'
   ```

6. **Fund the agent account:**
   Use the fund request feature to add balance to the agent's account.

7. **Test a payout:**
   ```bash
   curl -X POST http://localhost:3000/payments/payout \
     -H "Content-Type: application/json" \
     -H "X-API-Key: YOUR_AGENT_API_KEY" \
     -d '{
       "routingNumber": "123456789",
       "accountNumber": "9876543210",
       "accountHolder": "Test Recipient",
       "amount": "50.00",
       "description": "Test payout"
     }'
   ```

### Test Scenarios

**Scenario 1: Successful Small Payout**
- Create external account with $0 balance
- Send payout of $50 (below approval threshold)
- Verify transaction status is COMPLETED
- Verify external account balance increased to $50
- Verify agent balance decreased by $50

**Scenario 2: Large Payout Requiring Approval**
- Send payout of $5,000 (above approval threshold)
- Verify transaction status is PENDING
- Verify agent balance unchanged
- Approve transaction as owner
- Verify transaction status is COMPLETED
- Verify balances updated

**Scenario 3: Insufficient Balance**
- Attempt payout larger than agent balance
- Verify error code is INSUFFICIENT_BALANCE
- Verify balances unchanged

**Scenario 4: Invalid Account**
- Attempt payout to non-existent routing/account
- Verify error code is ACCOUNT_NOT_FOUND
- Verify balances unchanged

**Scenario 5: Frozen Account**
- Freeze agent account
- Attempt payout
- Verify error code is ACCOUNT_FROZEN
- Verify balances unchanged

---

## Changelog

### Version 1.0.0 (2026-02-20)

**Added:**
- POST /payments/payout - Send payout to external bank account
- POST /external-accounts - Create mock external bank account
- GET /external-accounts/:routingNumber/:accountNumber - Verify external account
- Payout webhook events (payout.completed, payout.failed)
- Payout WebSocket events (PAYOUT_INITIATED, PAYOUT_COMPLETED, PAYOUT_FAILED)
- Comprehensive error codes for payout operations
- Account number encryption for external accounts
- Approval workflow for large payouts

---

## Support

For questions or issues with the API:

- Check this documentation first
- Review the [Testing Guide](TESTING_GUIDE.md)
- Check the [README](README.md) for setup instructions
- Review example test scripts in the repository root

---

## License

Private - All Rights Reserved

