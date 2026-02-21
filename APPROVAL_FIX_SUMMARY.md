# Approval System Fix Summary

## Issues Identified

### 1. Fund Requests Not Appearing in Dashboard
**Problem**: When agents sent fund requests, they didn't appear in the owner's dashboard.

**Root Cause**: The payment request service only broadcast WebSocket events when `toAccountId` existed. Fund requests have `toAccountId = null`, so they were never broadcast to owners.

**Fix**: Updated `payment-request.service.ts` to:
- Broadcast to recipient account when `toAccountId` exists (regular payment requests)
- Broadcast to owner using `broadcastToOwner()` when `toAccountId` is null (fund requests)

### 2. Decline Button Failing
**Problem**: Clicking "Decline" on fund requests showed "failed to decline" error.

**Root Causes**:
1. Authorization logic in the decline route was checking if agents could decline, but the condition was wrong for fund requests
2. The service method required a non-null `accountId`, but owners declining fund requests don't have an associated account

**Fixes**:
- Updated `payment-request.routes.ts` decline endpoint to:
  - Fix agent authorization check to handle null `toAccountId`
  - Pass `null` as accountId when owner declines a fund request
- Updated `payment-request.service.ts` `declineRequest()` to:
  - Accept `accountId` as nullable (`string | null`)
  - Skip account validation when `accountId` is null (owner decline)

### 3. Dashboard Not Polling for Updates
**Problem**: Even if WebSocket failed, the dashboard would never show new requests.

**Fix**: Added polling to `approvals/page.tsx`:
- Fetches pending items every 5 seconds as a fallback
- Ensures requests appear even if WebSocket connection fails

## Files Modified

1. `apps/api/src/services/payment-request/payment-request.service.ts`
   - Enhanced WebSocket broadcast logic to handle fund requests
   - Made `declineRequest()` accept nullable accountId

2. `apps/api/src/routes/payment-request.routes.ts`
   - Fixed authorization logic for declining fund requests
   - Pass correct accountId (or null) to service

3. `apps/dashboard/src/app/approvals/page.tsx`
   - Added 5-second polling interval as fallback

## Testing

All payment request tests pass successfully. The card service tests that failed are unrelated to these changes (database constraint issue).

## How to Test

1. Start the API server: `npm run dev` in `apps/api`
2. Start the dashboard: `npm run dev` in `apps/dashboard`
3. Run the test script: `node test-approval-fix.js`
4. Check the dashboard at http://localhost:3001/approvals
5. You should see:
   - Toast notification when request is created
   - Request appears in the approvals page within 5 seconds
   - Decline button works correctly

## What Changed

### Before:
- Fund requests were created but never broadcast via WebSocket
- Dashboard only fetched on page load
- Decline button failed for fund requests

### After:
- Fund requests broadcast to owner via WebSocket
- Dashboard polls every 5 seconds as fallback
- Decline button works for both regular and fund requests
- Proper authorization checks for all scenarios
