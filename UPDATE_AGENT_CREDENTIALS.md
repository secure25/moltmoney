# Update Agent Credentials After Database Reset

## The Problem

After running `npx prisma migrate reset`, all agents were deleted from the database. Your OpenClaw agents (REDACTED-AGENT and REDACTED-AGENT) are using old API keys that no longer exist.

## Solution: Create New Agents and Update Skills

### Step 1: Create New Agents in Dashboard

1. Go to http://localhost:3001/dashboard
2. Click "Create Agent" button
3. Create agent "REDACTED-AGENT":
   - Name: REDACTED-AGENT
   - Platform: OpenClaw
   - Initial Balance: $1000
   - Daily Limit: $200
   - Per Transaction Limit: $50
   - Require Approval Above: $51
   - Blocked Categories: gambling, alcohol, dangerous goods

4. On the agent detail page, copy:
   - API Key (shown once, save it!)
   - Account ID (UUID)
   - Account Number (MOLT-XXXX-XXXX-XXXX)

5. Repeat for agent "REDACTED-AGENT"

### Step 2: Update OpenClaw Skills

For each agent, update their skill in OpenClaw:

```javascript
const API_URL = "https://REDACTED-NGROK-HOST"; // or your ngrok URL
const API_KEY = "NEW_API_KEY_HERE";  // From step 1
const ACCOUNT_ID = "NEW_ACCOUNT_ID_HERE";  // From step 1
```

### Step 3: Test Fund Request

Have your agent say:
"I need $500 more for cloud computing costs. Request it from my owner."

Then check the Approvals page in the dashboard.

## Quick Reference: Skill Update

Update these files with new credentials:
- `skills/agent-bank/REDACTED-AGENT-SKILL.md`
- `skills/agent-bank/REDACTED-AGENT-SKILL.md`

Or just paste the updated skill directly into OpenClaw chat.

## Why This Happened

`npx prisma migrate reset` does:
1. Drops all tables
2. Recreates tables from schema
3. Runs all migrations
4. Seeds database (if seed script exists)

This deletes ALL data including:
- Owners (you need to register again)
- Agents (need to create again)
- API keys (need to regenerate)
- Accounts (created with agents)
- Transactions (all history lost)

## Prevention

To avoid losing data in the future:
- Use `npx prisma migrate dev` for schema changes (preserves data)
- Only use `migrate reset` when you want a clean slate
- Backup important data before resetting
