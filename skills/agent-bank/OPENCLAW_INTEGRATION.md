# OpenClaw Integration Guide

## Skill Structure Verification

This MoltMoney banking skill has been verified to follow the **AgentSkills specification** used by OpenClaw, Anthropic Claude, Microsoft, GitHub, Cursor, and other AI platforms.

### ✅ Verified Components

1. **SKILL.md** - Contains required YAML frontmatter with:
   - `name`: agent-bank
   - `description`: Clear description of capabilities
   - `emoji`: 💳 (visual indicator)
   - `license`: MIT
   - `requires.env`: Lists required environment variables
   - `allowed-tools`: Empty array (skill uses API calls, not system tools)

2. **README.md** - Installation and usage documentation

3. **index.ts** - Main skill implementation with exported functions

4. **package.json** - Node.js package configuration

5. **example.ts** - Usage examples and testing

### 📁 Directory Structure

```
skills/agent-bank/
├── SKILL.md              # Required: YAML frontmatter + instructions
├── README.md             # Installation guide
├── index.ts              # Main implementation
├── example.ts            # Usage examples
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── .env.example          # Environment template
└── .gitignore            # Git ignore rules
```

## Installation Methods

### Method 1: Global Installation (All Agents)

```bash
cd ~/.openclaw/skills/
git clone <repository-url> agent-bank
```

### Method 2: Workspace-Specific (Single Agent)

```bash
cd ~/your-openclaw-workspace/skills/
git clone <repository-url> agent-bank
```

### Method 3: Manual Copy

Copy the `agent-bank` folder to:
- `~/.openclaw/skills/agent-bank` (global)
- `<workspace>/skills/agent-bank` (workspace-specific)

## Configuration

### Required Environment Variables

```env
API_URL=http://127.0.0.1:3000
API_KEY=<your-api-key>
ACCOUNT_ID=<your-account-id>
```

### Where to Set Variables

**Option A: OpenClaw Agent .env File**
```bash
# In your agent's workspace directory
echo "API_URL=http://127.0.0.1:3000" >> .env
echo "API_KEY=your-key-here" >> .env
echo "ACCOUNT_ID=your-id-here" >> .env
```

**Option B: System Environment Variables**
```bash
# Windows
set API_URL=http://127.0.0.1:3000
set API_KEY=your-key-here
set ACCOUNT_ID=your-id-here

# Linux/Mac
export API_URL=http://127.0.0.1:3000
export API_KEY=your-key-here
export ACCOUNT_ID=your-id-here
```

## Getting Credentials

1. Log into MoltMoney dashboard
2. Navigate to agent detail page
3. Copy the following:
   - **API Key** (from when you created the agent)
   - **Account ID** (UUID format, shown on agent page)
   - **Account Number** (MOLT-XXXX-XXXX-XXXX, for reference)

## Usage Examples

Once installed and configured, OpenClaw will automatically use the skill when you mention banking operations:

```
You: "Check my bank balance"
Agent: "You have $1000.00 available"

You: "Pay $50 to OpenAI for API credits"
Agent: "Payment of $50.00 to OpenAI completed"

You: "Show my last 5 transactions"
Agent: [Lists transactions]

You: "Request $100 from owner for cloud computing"
Agent: "Fund request for $100.00 sent to owner"
```

## Skill Activation

OpenClaw automatically activates this skill when:
- User mentions balance, money, payment, or transactions
- User asks to pay, send money, or transfer funds
- User requests transaction history
- User asks to request funds from owner

The skill's YAML frontmatter and description help OpenClaw decide when to use it.

## Security Notes

### ✅ Safe Practices

- No `allowed-tools` permissions (doesn't access filesystem or shell)
- Uses API calls only (network requests to MoltMoney API)
- Environment variables for credentials (not hardcoded)
- Clear error messages (no credential leakage)

### 🔒 What This Skill Can Do

- Make HTTP requests to MoltMoney API
- Read environment variables (API_URL, API_KEY, ACCOUNT_ID)
- Return formatted strings to the agent

### ❌ What This Skill Cannot Do

- Access your filesystem
- Execute shell commands
- Read other files
- Access other services

## Troubleshooting

### Skill Not Loading

1. Check skill location:
   ```bash
   ls ~/.openclaw/skills/agent-bank/SKILL.md
   # or
   ls <workspace>/skills/agent-bank/SKILL.md
   ```

2. Verify SKILL.md has YAML frontmatter:
   ```bash
   head -n 10 ~/.openclaw/skills/agent-bank/SKILL.md
   ```
   Should start with `---`

3. Restart OpenClaw

4. Check OpenClaw logs for errors

### Skill Loads But Doesn't Work

1. Verify environment variables are set:
   ```bash
   echo $API_URL
   echo $API_KEY
   echo $ACCOUNT_ID
   ```

2. Test API connectivity:
   ```bash
   curl http://127.0.0.1:3000/health
   ```

3. Verify API key is valid (check dashboard)

### "Invalid API key" Error

- API key may have been regenerated
- Check that you copied the full key
- Generate a new API key from dashboard

## Testing

### Manual Test

```bash
cd skills/agent-bank
npm install
npm run example
```

### Through OpenClaw

```
You: "Check my balance"
```

If the skill is working, you'll see a response with your balance.

## Skill Precedence

If you have multiple skills with the same name:

1. `<workspace>/skills/agent-bank` (highest priority)
2. `~/.openclaw/skills/agent-bank`
3. Bundled skills (lowest priority)

Your custom installation will override any bundled banking skills.

## Updates

To update the skill:

```bash
cd ~/.openclaw/skills/agent-bank
git pull origin main
```

Or manually replace the files.

## Support

- Check [SKILL.md](./SKILL.md) for skill documentation
- Check [README.md](./README.md) for detailed usage
- Review MoltMoney dashboard for account status
- Check OpenClaw logs for errors

## References

- [AgentSkills Specification](https://github.com/anthropics/agentskills)
- [OpenClaw Documentation](https://github.com/openclaw/openclaw)
- [MoltMoney API Documentation](../../README.md)
