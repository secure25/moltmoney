# Fund Request Fix Guide

## The Problem

When your agent calls `requestFunds()`, the request isn't showing up in the approvals page.

## Root Cause

The Prisma client needs to be regenerated after we made `toAccountId` optional in the schema. The API server is currently using the old Prisma client that doesn't allow `toAccountId` to be null/undefined.

## Steps to Fix

### 1. Stop the API Server
Press `Ctrl+C` in the terminal where the API server is running.

### 2. Regenerate Prisma Client
```bash
cd packages/database
npx prisma generate
cd ../..
```

### 3. Restart the API Server
```bash
cd apps/api
npm run dev
```

### 4. Test the Fund Request

You can test using the provided script:
```bash
node test-fund-request.js
```

Or have your agent try again:
"I need $500 more for cloud computing costs. Request it from my owner."

### 5. Check the Approvals Page

Go to the dashboard and click on "Approvals". You should see the fund request there with:
- Purple styling
- "Fund Request" badge
- Agent name
- Amount
- Reason/description
- "Approve & Fund" and "Decline" buttons

## What Should Happen

1. Agent calls `requestFunds(500, "cloud computing costs")`
2. API creates payment request with `toAccountId = null` (fund request to owner)
3. Request is stored in database
4. Owner sees request in approvals page
5. Owner clicks "Approve & Fund" to add money to agent's account
6. Or owner clicks "Decline" to reject the request

## Troubleshooting

If it still doesn't work after restarting:

1. Check API server logs for errors
2. Run the test script to see the exact error
3. Verify the agent's credentials are correct (API_KEY and ACCOUNT_ID)
4. Check that the agent account exists in the database

## Alternative: Manual Fund Top-Up

If you just want to add funds without the request flow:
1. Go to the agent's detail page
2. Use the "Fund Account" form
3. Enter amount and click "Add Funds"

This directly adds money to the agent's account without requiring a request.
