# Payout Testing Guide

This guide provides comprehensive instructions for testing the external bank account payout feature in the AI Agent Bank system.

## Table of Contents
1. [Creating Mock External Bank Accounts](#creating-mock-external-bank-accounts)
2. [Testing Payout Flow](#testing-payout-flow)
3. [Example Test Scenarios](#example-test-scenarios)

---

## Creating Mock External Bank Accounts

Mock external bank accounts simulate real bank accounts for testing purposes. They allow you to test the complete payout flow without integrating with actual banking systems.

### Using the API

#### Create a Mock Account

**Endpoint:** `POST /external-accounts`

**Authentication:** Requires owner authentication token

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

**Field Requirements:**
- `routingNumber`: Exactly 9 digits (e.g., "123456789")
- `accountNumber`: 8-17 digits (e.g., "1234567890")
- `accountHolder`: 2-100 characters (recipient name)
- `accountType`: Either "CHECKING" or "SAVINGS"
- `initialBalance`: Positive decimal with up to 2 decimal places

**Example using curl:**
```bash
curl -X POST http://localhost:3001/external-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_OWNER_TOKEN" \
  -d '{
    "routingNumber": "123456789",
    "accountNumber": "1234567890",
    "accountHolder": "John Doe",
    "accountType": "CHECKING",
    "initialBalance": "1000.00"
  }'
```

**Success Response (201):**
```json
{
  "id": "uuid-here",
  "routingNumber": "123456789",
  "accountNumber": "****7890",
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "balance": "1000.00",
  "status": "ACTIVE"
}
```

#### Verify a Mock Account

**Endpoint:** `GET /external-accounts/:routingNumber/:accountNumber`

**Authentication:** Requires owner authentication token

**Example:**
```bash
curl http://localhost:3001/external-accounts/123456789/1234567890 \
  -H "Authorization: Bearer YOUR_OWNER_TOKEN"
```

**Success Response (200):**
```json
{
  "exists": true,
  "accountHolder": "John Doe",
  "accountType": "CHECKING",
  "status": "ACTIVE"
}
```

### Using Node.js Test Scripts

Create a file `create-mock-account.js`:

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:3001';
const OWNER_TOKEN = 'your-owner-token-here';

async function createMockAccount() {
  try {
    const response = await axios.post(
      `${API_URL}/external-accounts`,
      {
        routingNumber: '123456789',
        accountNumber: '9876543210',
        accountHolder: 'Jane Smith',
        accountType: 'SAVINGS',
        initialBalance: '5000.00'
      },
      {
        headers: {
          'Authorization': `Bearer ${OWNER_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Mock account created:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error creating mock account:', error.response?.data || error.message);
  }
}

createMockAccount();
```

Run with: `node create-mock-account.js`

---

## Testing Payout Flow

### Prerequisites

1. **Start the API server:**
   ```bash
   cd apps/api
   npm run dev
   ```

2. **Have the following ready:**
   - Owner authentication token
   - Agent authentication token
   - Agent account ID with sufficient balance
   - Mock external bank account (routing + account number)

### Basic Payout Test

#### Step 1: Create a Mock External Account

Use the API or script from the previous section to create a mock account.

#### Step 2: Send a Payout

**Endpoint:** `POST /payments/payout`

**Authentication:** Requires agent or owner authentication token

**Request Body:**
```json
{
  "fromAccountId": "agent-account-uuid",
  "routingNumber": "123456789",
  "accountNumber": "1234567890",
  "accountHolder": "John Doe",
  "amount": "100.00",
  "description": "Payment for consulting services"
}
```

**Example using curl:**
```bash
curl -X POST http://localhost:3001/payments/payout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN" \
  -d '{
    "fromAccountId": "agent-account-uuid",
    "routingNumber": "123456789",
    "accountNumber": "1234567890",
    "accountHolder": "John Doe",
    "amount": "100.00",
    "description": "Payment for consulting services"
  }'
```

**Success Response (200) - No Approval Required:**
```json
{
  "transaction": {
    "id": "transaction-uuid",
    "amount": "100.00",
    "type": "PAYOUT",
    "status": "COMPLETED",
    "description": "Payment for consulting services",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "approvalRequired": false,
    "createdAt": "2026-02-20T10:30:00Z"
  }
}
```

**Success Response (200) - Approval Required:**
```json
{
  "transaction": {
    "id": "transaction-uuid",
    "amount": "500.00",
    "type": "PAYOUT",
    "status": "PENDING",
    "description": "Large payment requiring approval",
    "recipientName": "John Doe",
    "recipientAccount": "****7890",
    "approvalRequired": true,
    "createdAt": "2026-02-20T10:30:00Z"
  }
}
```

#### Step 3: Verify Transaction

Check the transaction history to confirm the payout:

```bash
curl http://localhost:3001/accounts/agent-account-uuid/transactions \
  -H "Authorization: Bearer YOUR_AGENT_TOKEN"
```

#### Step 4: Verify Balance Updates

Check that:
- Agent account balance decreased by payout amount
- Mock external account balance increased by payout amount

### Testing with Agent Skill

If using the agent skill, you can test payouts programmatically:

```typescript
import { send_payout } from './skills/agent-bank';

async function testPayout() {
  try {
    const result = await send_payout(
      '123456789',      // routing number
      '1234567890',     // account number
      'John Doe',       // account holder
      100.00,           // amount
      'Payment for services' // description
    );
    
    console.log('Payout result:', result);
  } catch (error) {
    console.error('Payout failed:', error.message);
  }
}

testPayout();
```

### Testing Approval Workflow

For payouts that require approval (amounts above the approval threshold):

#### Step 1: Send Large Payout

Send a payout with an amount above the approval threshold (check spending rules).

#### Step 2: Check Pending Status

The transaction should have `status: "PENDING"` and `approvalRequired: true`.

#### Step 3: Approve as Owner

**Endpoint:** `POST /accounts/:accountId/approvals/:transactionId/approve`

```bash
curl -X POST http://localhost:3001/accounts/agent-account-uuid/approvals/transaction-uuid/approve \
  -H "Authorization: Bearer YOUR_OWNER_TOKEN"
```

#### Step 4: Verify Completion

After approval, the transaction status should change to "COMPLETED" and balances should update.

---

## Example Test Scenarios

### Scenario 1: Successful Small Payout

**Goal:** Test a payout below the approval threshold

**Steps:**
1. Create mock account with routing "111111111", account "1111111111"
2. Fund agent account with $500
3. Send payout of $50 to mock account
4. Verify transaction status is "COMPLETED"
5. Verify agent balance decreased by $50
6. Verify mock account balance increased by $50

**Expected Result:** ✅ Payout completes immediately without approval

---

### Scenario 2: Large Payout Requiring Approval

**Goal:** Test approval workflow for large payouts

**Steps:**
1. Create mock account with routing "222222222", account "2222222222"
2. Fund agent account with $1000
3. Set approval threshold to $100 in spending rules
4. Send payout of $500 to mock account
5. Verify transaction status is "PENDING"
6. Approve transaction as owner
7. Verify transaction status changes to "COMPLETED"
8. Verify balances updated correctly

**Expected Result:** ✅ Payout requires and receives approval, then completes

---

### Scenario 3: Insufficient Balance

**Goal:** Test payout rejection due to insufficient funds

**Steps:**
1. Create mock account with routing "333333333", account "3333333333"
2. Fund agent account with $50
3. Attempt payout of $100 to mock account
4. Verify error response with code "INSUFFICIENT_BALANCE"
5. Verify agent balance unchanged

**Expected Result:** ✅ Payout rejected with appropriate error

---

### Scenario 4: Invalid Routing Number

**Goal:** Test validation of routing number format

**Steps:**
1. Attempt payout with routing number "12345" (too short)
2. Verify error response with code "INVALID_ROUTING_NUMBER"
3. Attempt payout with routing number "12345678A" (non-numeric)
4. Verify error response with code "INVALID_ROUTING_NUMBER"

**Expected Result:** ✅ Invalid routing numbers rejected

---

### Scenario 5: Invalid Account Number

**Goal:** Test validation of account number format

**Steps:**
1. Attempt payout with account number "1234567" (too short)
2. Verify error response with code "INVALID_ACCOUNT_NUMBER"
3. Attempt payout with account number "123456789012345678" (too long)
4. Verify error response with code "INVALID_ACCOUNT_NUMBER"

**Expected Result:** ✅ Invalid account numbers rejected

---

### Scenario 6: Frozen Account

**Goal:** Test payout rejection from frozen account

**Steps:**
1. Create mock account with routing "444444444", account "4444444444"
2. Fund agent account with $500
3. Freeze agent account (set status to "FROZEN")
4. Attempt payout of $100
5. Verify error response with code "ACCOUNT_FROZEN"

**Expected Result:** ✅ Payout rejected from frozen account

---

### Scenario 7: Non-Existent External Account

**Goal:** Test payout to non-existent external account

**Steps:**
1. Attempt payout to routing "999999999", account "9999999999" (not created)
2. Verify error response with code "ACCOUNT_NOT_FOUND"
3. Verify agent balance unchanged

**Expected Result:** ✅ Payout rejected for non-existent account

---

### Scenario 8: Spending Rule Daily Limit

**Goal:** Test daily spending limit enforcement

**Steps:**
1. Create mock account with routing "555555555", account "5555555555"
2. Fund agent account with $1000
3. Set daily spending limit to $200
4. Send payout of $150 (should succeed)
5. Send another payout of $100 (should fail - exceeds daily limit)
6. Verify second payout rejected with appropriate error

**Expected Result:** ✅ Daily limit enforced correctly

---

### Scenario 9: Webhook Delivery

**Goal:** Test webhook events for payout completion

**Steps:**
1. Register webhook endpoint for "payout.completed" event
2. Create mock account and send payout
3. Verify webhook received with correct payload
4. Check webhook includes: transactionId, amount, recipientName, recipientAccount

**Expected Result:** ✅ Webhook delivered with correct data

---

### Scenario 10: WebSocket Real-Time Updates

**Goal:** Test WebSocket events for payout status

**Steps:**
1. Connect to WebSocket as agent
2. Send payout request
3. Verify "PAYOUT_INITIATED" event received
4. Verify "PAYOUT_COMPLETED" event received
5. Check event payloads contain transaction details

**Expected Result:** ✅ Real-time updates delivered via WebSocket

---

## Automated Testing

### Running Unit Tests

```bash
cd apps/api
npm test -- external-bank-account.service.test.ts
npm test -- payment.service.test.ts
```

### Running Integration Tests

```bash
cd apps/api
npm test -- payout-flow.test.ts
```

### Running All Tests

```bash
cd apps/api
npm test
```

---

## Troubleshooting

### Common Issues

**Issue:** "INVALID_ROUTING_NUMBER" error
- **Solution:** Ensure routing number is exactly 9 digits, numeric only

**Issue:** "INVALID_ACCOUNT_NUMBER" error
- **Solution:** Ensure account number is 8-17 digits, numeric only

**Issue:** "INSUFFICIENT_BALANCE" error
- **Solution:** Fund the agent account with sufficient balance before payout

**Issue:** "ACCOUNT_NOT_FOUND" error
- **Solution:** Create the mock external account before attempting payout

**Issue:** Payout stuck in "PENDING" status
- **Solution:** Check if approval is required and approve as owner

**Issue:** Balance not updating
- **Solution:** Verify transaction completed successfully, check database directly

---

## Best Practices

1. **Always create mock accounts before testing payouts**
2. **Use unique routing/account combinations for each test**
3. **Clean up test data between test runs**
4. **Test both success and failure scenarios**
5. **Verify balance updates on both sides (sender and recipient)**
6. **Test approval workflow with various threshold amounts**
7. **Monitor webhook and WebSocket events during testing**
8. **Use descriptive transaction descriptions for easier debugging**

---

## Additional Resources

- [API Documentation](./API_DOCUMENTATION.md)
- [Agent Skill Documentation](./skills/agent-bank/SKILL.md)
- [Requirements Document](./.kiro/specs/external-bank-payout/requirements.md)
- [Design Document](./.kiro/specs/external-bank-payout/design.md)
