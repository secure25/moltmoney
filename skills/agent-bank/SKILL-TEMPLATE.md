---
name: moltmoney-banking
description: Enables banking operations including balance checks, payments, transaction history, and fund requests through the MoltMoney API.
emoji: 💳
license: MIT
---

# MoltMoney Banking Skill

## Configuration

**IMPORTANT: Replace these values with your actual credentials from the MoltMoney dashboard:**

```javascript
const API_URL = "http://127.0.0.1:3000";
const API_KEY = "YOUR_API_KEY_HERE";  // Replace with your actual API key
const ACCOUNT_ID = "YOUR_ACCOUNT_ID_HERE";  // Replace with your actual account ID (UUID format)
```

## Description

This skill enables you to manage your MoltMoney banking account. You can check your balance, make payments to merchants or other agents, view transaction history, and request additional funds from your owner.

## When to Use This Skill

Use this skill when the user:
- Asks about their bank balance or available funds
- Wants to make a payment or send money
- Asks to see transaction history
- Needs to request more funds from their owner
- Mentions banking, payments, or financial operations

## Available Actions

### 1. Check Balance

**When to use:** User asks "what's my balance?" or "how much money do I have?"

**How to call:**
```javascript
async function checkBalance() {
  const response = await fetch(`${API_URL}/accounts/${ACCOUNT_ID}/balance`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json();
  return `You have $${parseFloat(data.balance).toFixed(2)} available`;
}
```

**Example response:** "You have $1000.00 available"

### 2. Make Payment

**When to use:** User says "pay $50 to OpenAI" or "send $25 to [merchant/agent]"

**How to call:**
```javascript
async function makePayment(amount, recipient, description) {
  // Check if recipient is a UUID (agent account) or merchant name
  const isAccountId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient);
  
  const payload = {
    fromAccountId: ACCOUNT_ID,
    amount: amount.toFixed(2),
    description: description || `Payment to ${recipient}`
  };
  
  if (isAccountId) {
    payload.toAccountId = recipient;
  } else {
    payload.merchantName = recipient;
  }
  
  const response = await fetch(`${API_URL}/payments/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  const data = await response.json();
  
  if (data.transaction.approvalRequired) {
    return `Payment of $${amount.toFixed(2)} to ${recipient} requires owner approval`;
  }
  
  return `Payment of $${amount.toFixed(2)} to ${recipient} completed`;
}
```

**Example usage:**
- "Pay $50 to OpenAI for API credits" → `makePayment(50, "OpenAI", "API credits")`
- "Send $25 to agent abc-123" → `makePayment(25, "abc-123-uuid", "transfer")`

### 3. List Transactions

**When to use:** User asks "show my transactions" or "what did I spend money on?"

**How to call:**
```javascript
async function listTransactions(limit = 10) {
  const response = await fetch(`${API_URL}/transactions?accountId=${ACCOUNT_ID}&pageSize=${limit}&page=1`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (data.data.length === 0) {
    return "No transactions found";
  }
  
  let result = "Recent transactions:\n";
  data.data.forEach((tx, index) => {
    const amount = parseFloat(tx.amount);
    const sign = tx.type === 'INBOUND' ? '+' : '-';
    const recipient = tx.merchantName || (tx.type === 'INBOUND' ? 'from Owner' : 'transfer');
    result += `${index + 1}. ${sign}$${Math.abs(amount).toFixed(2)} ${recipient} (${tx.status})`;
    if (tx.description) result += ` - ${tx.description}`;
    result += "\n";
  });
  
  return result;
}
```

**Example response:**
```
Recent transactions:
1. -$50.00 OpenAI (COMPLETED) - API credits
2. +$1000.00 from Owner (COMPLETED) - Initial funding
```

### 4. Request Funds

**When to use:** User says "request $100 from owner" or "I need more money"

**How to call:**
```javascript
async function requestFunds(amount, reason) {
  const payload = {
    fromAccountId: ACCOUNT_ID,
    amount: amount.toFixed(2),
    description: `Fund request: ${reason}`,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  
  const response = await fetch(`${API_URL}/payments/request`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  const data = await response.json();
  return `Fund request for $${amount.toFixed(2)} sent to owner. Reason: ${reason}`;
}
```

**Example usage:**
- "Request $100 for cloud computing" → `requestFunds(100, "cloud computing")`

## Error Handling

If any API call fails:
- Check if the error is "insufficient balance" → tell user they don't have enough money
- Check if the error is "account frozen" → tell user to contact their owner
- Check if the error is "invalid credentials" → tell user there's a configuration issue
- For other errors → provide the error message to the user

## Important Notes

1. **Spending Rules:** Some payments may require owner approval based on:
   - Transaction amount (e.g., over $50)
   - Daily spending limits
   - Restricted merchant categories (gambling, alcohol, etc.)

2. **Payment Recipients:**
   - Merchant names: Use plain text like "OpenAI", "AWS", "GitHub"
   - Agent transfers: Use the agent's account ID (UUID format)

3. **Security:**
   - Never share your API_KEY with anyone
   - All payments are logged and visible to your owner
   - Your owner can freeze your account at any time

## Example Conversations

**User:** "What's my balance?"
**You:** [Call checkBalance()] "You have $1000.00 available"

**User:** "Pay $50 to OpenAI for API credits"
**You:** [Call makePayment(50, "OpenAI", "API credits")] "Payment of $50.00 to OpenAI completed"

**User:** "Show me my last 5 transactions"
**You:** [Call listTransactions(5)] [Display transaction list]

**User:** "I need $200 more for cloud computing"
**You:** [Call requestFunds(200, "cloud computing")] "Fund request for $200.00 sent to owner. Reason: cloud computing"
