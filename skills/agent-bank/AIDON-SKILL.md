---
name: moltmoney-banking
description: Banking operations via MoltMoney API
emoji: 💳
---

# MoltMoney Banking

```javascript
const API_URL = "https://REDACTED-NGROK-HOST";
const API_KEY = "REDACTED-AGENT_API_KEY_HERE";  // Replace with REDACTED-AGENT's API key
const ACCOUNT_ID = "REDACTED-AGENT_ACCOUNT_ID_HERE";  // Replace with REDACTED-AGENT's Account ID
```

## Actions

### Check Balance
```javascript
async function checkBalance() {
  const r = await fetch(`${API_URL}/accounts/${ACCOUNT_ID}/balance`, {
    headers: {'Authorization': `Bearer ${API_KEY}`}
  });
  const d = await r.json();
  return `You have $${parseFloat(d.balance).toFixed(2)} available`;
}
```

### Make Payment
```javascript
async function makePayment(amount, recipient, desc) {
  const isUUID = /^[0-9a-f-]{36}$/i.test(recipient);
  const payload = {
    fromAccountId: ACCOUNT_ID,
    amount: amount.toFixed(2),
    description: desc || `Payment to ${recipient}`,
    ...(isUUID ? {toAccountId: recipient} : {merchantName: recipient})
  };
  const r = await fetch(`${API_URL}/payments/send`, {
    method: 'POST',
    headers: {'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  return d.transaction.approvalRequired 
    ? `Payment of $${amount.toFixed(2)} to ${recipient} requires approval`
    : `Payment of $${amount.toFixed(2)} to ${recipient} completed`;
}
```

### List Transactions
```javascript
async function listTransactions(limit = 10) {
  const r = await fetch(`${API_URL}/transactions?accountId=${ACCOUNT_ID}&pageSize=${limit}`, {
    headers: {'Authorization': `Bearer ${API_KEY}`}
  });
  const d = await r.json();
  if (!d.data.length) return "No transactions";
  return "Transactions:\n" + d.data.map((tx, i) => {
    const sign = tx.type === 'INBOUND' ? '+' : '-';
    const who = tx.merchantName || (tx.type === 'INBOUND' ? 'Owner' : 'transfer');
    return `${i+1}. ${sign}$${Math.abs(parseFloat(tx.amount)).toFixed(2)} ${who}`;
  }).join('\n');
}
```

### Request Funds
```javascript
async function requestFunds(amount, reason) {
  const r = await fetch(`${API_URL}/payments/request`, {
    method: 'POST',
    headers: {'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      fromAccountId: ACCOUNT_ID,
      amount: amount.toFixed(2),
      description: `Fund request: ${reason}`,
      expiresAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
    })
  });
  return `Fund request for $${amount.toFixed(2)} sent. Reason: ${reason}`;
}
```

## Usage
- Balance: "what's my balance?" → checkBalance()
- Pay: "pay $50 to OpenAI" → makePayment(50, "OpenAI", "API credits")
- History: "show transactions" → listTransactions(10)
- Request: "request $100 for compute" → requestFunds(100, "compute")

Payments over $50 may need owner approval. Handle errors gracefully.
