# Internal Transfer Bug Fix - Missing $500

## Problem Summary

When REDACTED-AGENT sent $500 to REDACTED-AGENT using REDACTED-AGENT's account number (`MOLT-18AFBB49-F1EDF01A-25EB5FA1`), the money disappeared from the system:
- **Before**: REDACTED-AGENT $2500, REDACTED-AGENT $2000, Total $4500
- **After**: REDACTED-AGENT $2000, REDACTED-AGENT $2000, Total $4000
- **Missing**: $500

## Root Cause

The payment system treated the account number as a merchant name instead of recognizing it as an internal transfer between accounts.

### What Happened:

1. REDACTED-AGENT provided REDACTED-AGENT's **account number** (`MOLT-18AFBB49-F1EDF01A-25EB5FA1`) instead of the account **ID** (UUID)
2. The payment route validation expected a UUID format for `toAccountId`
3. Since the account number doesn't match UUID format, validation failed and `toAccountId` became `undefined`
4. The system treated it as an **OUTBOUND** payment to a merchant
5. The account number was stored in the `merchantName` field
6. Money was deducted from REDACTED-AGENT's account but never credited to REDACTED-AGENT's account

### Evidence from Database:

```
Transaction ID: 432fb49e-02d3-460c-8b1a-95ff9dad1b3f
Amount: $500
Type: OUTBOUND (should be INTERNAL)
Status: COMPLETED
From Account ID: 5e1880b3-5443-4bed-9cb3-29ecadab0038 (REDACTED-AGENT)
To Account ID: NULL (should be REDACTED-AGENT's ID)
Merchant Name: MOLT-18AFBB49-F1EDF01A-25EB5FA1 (the account number!)
```

## The Fix

### 1. Updated Payment Route Validation

**File**: `apps/api/src/routes/payment.routes.ts`

Changed the schema to accept any string (not just UUIDs):
```typescript
// Before
toAccountId: z.string().uuid().optional(),

// After
toAccountId: z.string().optional(), // Can be UUID or account number
```

### 2. Added Account Number Lookup

Added logic to resolve account numbers to account IDs:

```typescript
// Resolve toAccountId - support both UUID and account number
let resolvedToAccountId: string | null = null;
if (body.toAccountId) {
  // Check if it's a UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(body.toAccountId)) {
    // It's a UUID, use it directly
    resolvedToAccountId = body.toAccountId;
  } else {
    // It might be an account number, try to look it up
    const recipientAccount = await server.prisma.account.findFirst({
      where: { accountNumber: body.toAccountId },
    });
    
    if (recipientAccount) {
      resolvedToAccountId = recipientAccount.id;
    } else {
      // Not found as account number, will be treated as merchant name
      resolvedToAccountId = null;
    }
  }
}
```

### 3. Improved WebSocket Balance Broadcasts

**File**: `apps/api/src/services/payment/payment.service.ts`

Fixed WebSocket broadcasts to fetch updated balances from the database instead of calculating from stale account objects.

## How It Works Now

1. User provides either:
   - Account ID (UUID): `REDACTED-ACCOUNT-ID` ✅
   - Account Number: `MOLT-18AFBB49-F1EDF01A-25EB5FA1` ✅
   - Merchant Name: `Amazon` ✅

2. System checks if it's a UUID:
   - **Yes**: Use it as account ID for internal transfer
   - **No**: Look it up in the database as an account number
     - **Found**: Use the account ID for internal transfer
     - **Not Found**: Treat as merchant name for external payment

3. For internal transfers:
   - Deduct from sender account
   - Credit to recipient account
   - Create INTERNAL transaction
   - Both balances are updated correctly

## Testing

All 179 tests pass, including:
- Payment service tests
- Internal transfer tests
- Account service tests
- Integration tests

## Impact

- ✅ Users can now send money using account numbers
- ✅ Internal transfers work correctly
- ✅ No money disappears from the system
- ✅ Backward compatible with UUID-based transfers
- ✅ Still supports merchant payments

## Recommendation

To recover the missing $500:
1. The transaction exists in the database as an OUTBOUND payment
2. You can manually credit REDACTED-AGENT's account with $500 using the fund endpoint
3. Or delete the erroneous transaction and have REDACTED-AGENT resend the payment

## Prevention

The fix prevents this issue from happening again by:
1. Supporting both account IDs and account numbers
2. Properly resolving account numbers to IDs
3. Ensuring internal transfers are correctly identified
4. Maintaining accurate balance tracking
