# MoltMoney Testing Guide

## Prerequisites

Before testing, make sure you have:
1. Fixed the Prisma client by running `fix-prisma.bat`
2. Both API server and dashboard running
3. Created at least 2 agents with funded accounts

## Step 1: Fix Prisma Client (IMPORTANT!)

The backend code already generates API keys, virtual cards, and account numbers, but the Prisma client needs to be regenerated:

```bash
# Run the fix script
fix-prisma.bat

# OR manually:
# 1. Stop all Node.js processes
# 2. Delete node_modules\.prisma folder
# 3. Run: cd packages\database && npx prisma generate
# 4. Run: npm run build
```

## Step 2: Create New Agents

After fixing Prisma, create new agents to get all credentials:

1. Go to dashboard: http://127.0.0.1:3001/dashboard
2. Click "Create Agent"
3. Fill in agent details
4. **SAVE ALL CREDENTIALS** shown on success page:
   - ✅ API Key (shown only once!)
   - ✅ Account ID
   - ✅ Account Number (format: MOLT-XXXX-XXXX-XXXX)
   - ✅ Virtual Card (card number, expiry, CVV)

## Step 3: Fund Your Agents

1. Go to each agent's detail page
2. Use the "Fund Account" form
3. Add $100 to Agent 1
4. Add $300 to Agent 2

## Step 4: Test Using the Skill

### Setup Environment Variables

For Agent 1:
```bash
set API_URL=http://127.0.0.1:3000
set API_KEY=<agent-1-api-key>
set ACCOUNT_ID=<agent-1-account-id>
```

### Test Commands

```bash
# Check balance
node -e "require('./skills/agent-bank/index.ts').check_balance().then(console.log)"

# Make a payment to a merchant
node -e "require('./skills/agent-bank/index.ts').make_payment(25.50, 'OpenAI', 'API credits').then(console.log)"

# List transactions
node -e "require('./skills/agent-bank/index.ts').list_transactions(10).then(console.log)"

# Request funds from owner
node -e "require('./skills/agent-bank/index.ts').request_funds(100, 'Need more budget').then(console.log)"
```

## Step 5: Test Agent-to-Agent Transfers

### Using cURL

Transfer $50 from Agent 2 to Agent 1:

```bash
curl -X POST "http://127.0.0.1:3000/payments/send" ^
  -H "Authorization: Bearer <agent-2-api-key>" ^
  -H "Content-Type: application/json" ^
  -d "{\"fromAccountId\":\"<agent-2-account-id>\",\"toAccountId\":\"<agent-1-account-id>\",\"amount\":\"50.00\",\"description\":\"Shared resources\"}"
```

### Using the Skill

```javascript
// Agent 2 pays Agent 1
make_payment(50.00, '<agent-1-account-id>', 'Shared resources')
```

## Step 6: Test Spending Rules

1. Go to Agent 1's detail page
2. Set spending rules:
   - Daily Limit: $100
   - Per Transaction Limit: $50
   - Require Approval Above: $30
3. Try making a $40 payment (should require approval)
4. Check the Approvals page in dashboard
5. Approve or decline the payment

## Step 7: Test Account Management

### Freeze Account
```bash
curl -X POST "http://127.0.0.1:3000/accounts/<account-id>/freeze" ^
  -H "Authorization: Bearer <owner-token>"
```

Try making a payment - should fail with "Account is frozen"

### Unfreeze Account
```bash
curl -X POST "http://127.0.0.1:3000/accounts/<account-id>/unfreeze" ^
  -H "Authorization: Bearer <owner-token>"
```

## Step 8: Test Virtual Cards

Virtual cards are auto-generated when you create an agent. You can:

1. View them on the agent detail page
2. Use the card number for online transactions
3. The card details include:
   - Card Number (16 digits, Luhn-valid)
   - Expiry Date (3 years from creation)
   - CVV (3 digits)

## Step 9: Test Account Numbers

Account numbers are used for receiving payments from external sources:

1. Each agent gets a unique account number (format: MOLT-XXXX-XXXX-XXXX)
2. View it on the agent detail page
3. Share it with others to receive payments

## Test Scenarios

### Scenario A: Basic Payment Flow
1. Agent 1 checks balance ($100)
2. Agent 1 pays $25 to "OpenAI"
3. Agent 1 checks balance ($75)
4. View transaction in dashboard

### Scenario B: Agent-to-Agent Transfer
1. Agent 2 sends $50 to Agent 1
2. Both check balances
3. Agent 1: $150, Agent 2: $250

### Scenario C: Insufficient Funds
1. Agent 1 tries to pay $200 (only has $100)
2. Should fail with "Insufficient balance"

### Scenario D: Approval Workflow
1. Set "Require approval above $30" for Agent 1
2. Agent 1 tries to pay $40
3. Payment goes to PENDING
4. Owner approves in dashboard
5. Payment completes

### Scenario E: Fund Request
1. Agent 1 requests $100 from owner
2. Owner sees request in dashboard
3. Owner can approve/decline

## Troubleshooting

### "Property 'accountNumber' does not exist"
- Run `fix-prisma.bat` to regenerate Prisma client
- Restart all servers

### "No API key shown when creating agent"
- Make sure you ran `fix-prisma.bat` first
- Check that the API server is running
- Check browser console for errors

### "Virtual card not showing"
- Virtual cards are auto-generated
- Check the agent detail page
- If missing, the agent was created before the fix

### "Account number is undefined"
- Run `fix-prisma.bat`
- Create a new agent (old agents won't have account numbers)

## API Endpoints Reference

### Agent Authentication
```
Authorization: Bearer <api-key>
```

### Check Balance
```
GET /accounts/<account-id>/balance
```

### Make Payment
```
POST /payments/send
Body: {
  "fromAccountId": "...",
  "toAccountId": "..." OR "merchantName": "...",
  "amount": "25.00",
  "description": "..."
}
```

### List Transactions
```
GET /transactions?accountId=<account-id>&pageSize=10
```

### Request Funds
```
POST /payments/request
Body: {
  "fromAccountId": "...",
  "amount": "100.00",
  "description": "...",
  "expiresAt": "2026-02-21T00:00:00Z"
}
```

## Success Criteria

✅ API keys are generated and shown once on agent creation
✅ Account numbers are generated (format: MOLT-XXXX-XXXX-XXXX)
✅ Virtual cards are auto-generated with valid card numbers
✅ All credentials are displayed on the success page
✅ Account numbers are visible on agent detail pages
✅ Virtual cards are visible on agent detail pages
✅ Agents can make payments using the skill
✅ Agent-to-agent transfers work
✅ Spending rules are enforced
✅ Approval workflow functions correctly

## Next Steps

After successful testing:
1. Integrate the skill into your AI agent platform (OpenClaw, etc.)
2. Set up webhooks for real-time notifications
3. Configure spending rules for each agent
4. Monitor transactions in the dashboard
5. Use the API for automated operations
