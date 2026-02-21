---
name: agent-bank
description: Enables banking operations for AI agents including balance checks, payments, transaction history, fund requests, and payouts to external bank accounts through the MoltMoney API.
emoji: 💳
license: MIT
requires:
  env:
    - API_URL
    - API_KEY
    - ACCOUNT_ID
allowed-tools: []
---

# AgentBank Skill

## Description
Enables banking operations for AI agents including balance checks, payments, transaction history, fund requests, and payouts to external bank accounts. This skill allows AI agents to autonomously manage their finances and send money to human bank accounts through the MoltMoney AI Agent Banking Platform.

## Configuration

The following environment variables must be configured:

- `API_URL`: The base URL of the MoltMoney API endpoint (e.g., `https://api.moltmoney.com` or `http://127.0.0.1:3000`)
- `API_KEY`: The agent's unique API key for authentication (obtained when the agent account is created)
- `ACCOUNT_ID`: The agent's account ID (obtained when the agent account is created)

**Important:** When your owner creates your agent account, they will receive:
1. **API Key** - Use this for authentication (shown only once!)
2. **Account ID** - Your unique account identifier
3. **Account Number** - For receiving payments from external sources (format: MOLT-XXXX-XXXX-XXXX)
4. **Virtual Card** - Auto-generated card for online transactions

Make sure to save all these credentials securely!

## Actions

### check_balance

Check the current account balance.

**Parameters:** None

**Returns:** A formatted string with the current balance, e.g., "You have $50.00 available"

**Example Usage:**
```
Agent: "What's my current balance?"
Skill: "You have $127.45 available"
```

### make_payment

Make a payment to a merchant or another agent.

**Parameters:**
- `amount` (required): Payment amount as a decimal number (e.g., 25.50)
- `recipient` (required): Merchant name or agent account ID
- `description` (optional): Description of the payment

**Returns:** 
- Success: "Payment of $X.XX to [recipient] completed"
- Approval required: "Payment of $X.XX to [recipient] requires owner approval"
- Error: Clear error message explaining the failure

**Example Usage:**
```
Agent: "Pay $50 to OpenAI for API credits"
Skill: "Payment of $50.00 to OpenAI completed"
```

### list_transactions

List recent transactions for the agent's account.

**Parameters:**
- `limit` (optional): Number of transactions to return (default: 10, max: 50)

**Returns:** A formatted list of recent transactions with amount, type, status, and description

**Example Usage:**
```
Agent: "Show me my last 5 transactions"
Skill: "Recent transactions:
1. -$50.00 to OpenAI (COMPLETED) - API credits
2. +$100.00 from Owner (COMPLETED) - Account funding
3. -$25.00 to AWS (COMPLETED) - Cloud services
4. -$15.50 to GitHub (COMPLETED) - Pro subscription
5. +$200.00 from Owner (COMPLETED) - Monthly allowance"
```

### request_funds

Request additional funds from the account owner.

**Parameters:**
- `amount` (required): Amount to request as a decimal number
- `reason` (required): Explanation for why funds are needed

**Returns:** Confirmation that the request was sent to the owner

**Example Usage:**
```
Agent: "Request $100 from owner for additional API credits"
Skill: "Fund request for $100.00 sent to owner. Reason: additional API credits"
```

### send_payout

Send money to an external human bank account.

**Parameters:**
- `routingNumber` (required): 9-digit bank routing number
- `accountNumber` (required): 8-17 digit bank account number
- `accountHolder` (required): Name on the bank account (minimum 2 characters)
- `amount` (required): Payout amount as a decimal number
- `description` (optional): Description of the payout

**Returns:** 
- Success: "Payout of $X.XX to [name] (****XXXX) completed"
- Approval required: "Payout of $X.XX to [name] (****XXXX) requires owner approval"
- Error: Clear error message explaining the failure

**Example Usage:**
```
Agent: "Send $150 to John Doe's account, routing 123456789, account 9876543210"
Skill: "Payout of $150.00 to John Doe (****3210) completed"
```

## Error Handling

The skill provides clear, actionable error messages for common scenarios:

- **Authentication errors**: "Invalid API key. Please check your configuration."
- **Insufficient balance**: "Payment failed: insufficient balance. Current balance: $X.XX"
- **Account frozen**: "Payment failed: account is frozen. Please contact your owner."
- **Invalid amount**: "Invalid amount. Please provide a positive number."
- **Network errors**: "Unable to connect to AgentBank API. Please try again later."
- **Rate limiting**: "Too many requests. Please wait a moment and try again."
- **Invalid routing number**: "Invalid routing number. Must be exactly 9 digits."
- **Invalid account number**: "Invalid account number. Must be 8-17 digits."
- **External account not found**: "Payout failed: external bank account not found"

## Testing Payouts

To test the payout functionality in a development environment:

1. **Create a mock external bank account** using the testing API:
   ```bash
   POST /external-accounts
   {
     "routingNumber": "123456789",
     "accountNumber": "9876543210",
     "accountHolder": "John Doe",
     "accountType": "CHECKING",
     "initialBalance": "1000.00"
   }
   ```

2. **Send a test payout** using the skill:
   ```
   Agent: "Send $50 to John Doe's account, routing 123456789, account 9876543210"
   Skill: "Payout of $50.00 to John Doe (****3210) completed"
   ```

3. **Verify the payout** by checking:
   - Your account balance decreased by the payout amount
   - Transaction history shows a PAYOUT transaction
   - The mock external account balance increased (can verify via API)

4. **Test approval workflow** by sending a payout above your approval threshold:
   ```
   Agent: "Send $500 to Jane Smith's account, routing 987654321, account 1234567890"
   Skill: "Payout of $500.00 to Jane Smith (****7890) requires owner approval"
   ```

**Note:** Mock external bank accounts are for testing only and do not represent real banking integration.

## Common Payout Scenarios

### Paying a Contractor
```
Agent: "Send $1500 to Sarah Johnson's account for web development work. Routing 111222333, account 4445556667"
Skill: "Payout of $1500.00 to Sarah Johnson (****6667) completed"
```

### Paying for Services with Approval
If the payout amount exceeds your spending limit:
```
Agent: "Send $5000 to Tech Consulting LLC, routing 999888777, account 1112223334"
Skill: "Payout of $5000.00 to Tech Consulting LLC (****3334) requires owner approval"
```
Your owner will receive a notification and can approve or decline the payout.

### Handling Insufficient Balance
```
Agent: "Send $2000 to vendor, routing 123456789, account 9876543210"
Skill: "Payout failed: insufficient balance"
Agent: "Request $2500 from owner for vendor payment"
Skill: "Fund request for $2500.00 sent to owner. Reason: vendor payment"
```

### Verifying Payout Completion
After sending a payout, you can verify it in your transaction history:
```
Agent: "Show my last 5 transactions"
Skill: "Recent transactions:
1. -$150.00 to John Doe (COMPLETED) - Payment for consulting services
2. -$50.00 to OpenAI (COMPLETED) - API credits
..."
```

## Security Notes

- The API key should be stored securely and never shared or logged
- All communication with the API uses HTTPS in production
- The skill only has access to the agent's own account data
- Payment approvals may be required based on spending rules configured by the owner

**Note:** When your owner creates your agent account, they will receive the API_KEY, ACCOUNT_ID, Account Number (for receiving payments), and a Virtual Card (for online transactions). Make sure to configure the API_KEY and ACCOUNT_ID in your environment.
