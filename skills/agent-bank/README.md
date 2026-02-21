# MoltMoney Agent Banking Skill for OpenClaw

An OpenClaw skill that enables AI agents to perform banking operations through the MoltMoney API.

## Installation

### Option 1: Clone to OpenClaw Skills Directory

```bash
# For all agents (global installation)
cd ~/.openclaw/skills/
git clone <repository-url> agent-bank

# For a specific agent workspace
cd ~/your-openclaw-workspace/skills/
git clone <repository-url> agent-bank
```

### Option 2: Manual Installation

1. Copy the `agent-bank` folder to your OpenClaw skills directory:
   - Global: `~/.openclaw/skills/agent-bank`
   - Workspace-specific: `<workspace>/skills/agent-bank`

2. Restart OpenClaw or reload skills

## Configuration

### Step 1: Get Your Credentials

When your owner creates your agent account in MoltMoney, they will receive:

- **API Key** - For authentication (shown only once!)
- **Account ID** - Your unique account identifier (UUID format)
- **Account Number** - For receiving payments (format: MOLT-XXXX-XXXX-XXXX)
- **Virtual Card** - Auto-generated card for online transactions

### Step 2: Set Environment Variables

Configure these environment variables in your OpenClaw agent:

```bash
# Windows
set API_URL=http://127.0.0.1:3000
set API_KEY=your-api-key-here
set ACCOUNT_ID=your-account-id-here

# Linux/Mac
export API_URL=http://127.0.0.1:3000
export API_KEY=your-api-key-here
export ACCOUNT_ID=your-account-id-here
```

Or add them to your OpenClaw agent's `.env` file:

```env
API_URL=http://127.0.0.1:3000
API_KEY=your-api-key-here
ACCOUNT_ID=your-account-id-here
```

### Step 3: Verify Installation

After restarting OpenClaw, test the skill:

```
You: "Check my bank balance"
Agent: "You have $1000.00 available"
```

## Usage

### Check Balance

```
You: "What's my current balance?"
Agent: "You have $127.45 available"
```

### Make a Payment

```
You: "Pay $50 to OpenAI for API credits"
Agent: "Payment of $50.00 to OpenAI completed"
```

### Transfer to Another Agent

```
You: "Send $25 to agent account <account-id>"
Agent: "Payment of $25.00 to <account-id> completed"
```

### List Transactions

```
You: "Show me my last 10 transactions"
Agent: [Lists recent transactions with amounts, recipients, and status]
```

### Request Funds

```
You: "Request $100 from owner for cloud computing"
Agent: "Fund request for $100.00 sent to owner. Reason: cloud computing"
```

### Send Payout to External Bank Account

```
You: "Send $150 to John Doe's bank account, routing 123456789, account 9876543210"
Agent: "Payout of $150.00 to John Doe (****3210) completed"
```

### Send Payout with Description

```
You: "Pay $500 to Jane Smith for consulting work, routing 987654321, account 1234567890"
Agent: "Payout of $500.00 to Jane Smith (****7890) completed"
```

## Available Functions

The skill provides these functions that OpenClaw can call:

- `check_balance()` - Check current account balance
- `make_payment(amount, recipient, description?)` - Make a payment
- `list_transactions(limit?)` - List recent transactions
- `request_funds(amount, reason)` - Request funds from owner
- `send_payout(routingNumber, accountNumber, accountHolder, amount, description?)` - Send money to external bank account

## Security

- API keys are never logged or exposed
- All communication uses HTTPS in production
- The skill only accesses the agent's own account
- Spending rules may require owner approval for large payments

## Troubleshooting

### "Invalid API key"
- Verify API_KEY is set correctly
- Check that the API key hasn't been regenerated
- Contact your owner for a new API key

### "Unable to connect to API"
- Verify API_URL is correct
- Check that the MoltMoney API server is running
- Test network connectivity

### "Insufficient balance"
- Check balance with `check_balance()`
- Request more funds with `request_funds()`
- Contact your owner to fund your account

### "Invalid routing number" or "Invalid account number"
- Verify the routing number is exactly 9 digits
- Verify the account number is 8-17 digits
- Ensure both contain only numeric characters
- Double-check the bank account details with the recipient

### "External bank account not found"
- The external account may not exist in the system
- For testing, create a mock account first using POST /external-accounts
- Verify the routing and account numbers are correct

### Skill not loading
- Verify the skill folder is in the correct location
- Check that SKILL.md exists
- Restart OpenClaw
- Check OpenClaw logs for errors

## Development

### Build from Source

```bash
cd skills/agent-bank
npm install
npm run build
```

### Run Tests

```bash
npm test
```

### Run Example

```bash
npm run example
```

## License

MIT

## Support

For issues or questions:
1. Check the [SKILL.md](./SKILL.md) documentation
2. Review the [TESTING_GUIDE.md](../../TESTING_GUIDE.md)
3. Contact your account owner
4. Check the MoltMoney dashboard for transaction history
