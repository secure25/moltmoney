# External Bank Account Payout - Implementation Tasks

## Phase 1: Database and Schema

- [x] 1. Update Prisma schema with ExternalBankAccount model
  - [x] 1.1 Add ExternalBankAccount model with all fields
  - [x] 1.2 Add unique constraint on routing + account number
  - [x] 1.3 Add indexes for performance
  
- [x] 2. Create and run database migration
  - [x] 2.1 Generate migration file
  - [x] 2.2 Run migration on development database
  - [x] 2.3 Verify schema changes

## Phase 2: Service Layer

- [x] 3. Create ExternalBankAccountService
  - [x] 3.1 Implement createMockAccount method
  - [x] 3.2 Implement verifyAccount method
  - [x] 3.3 Implement getAccount method
  - [x] 3.4 Implement creditAccount method (updates balance)
  - [x] 3.5 Add account number encryption/decryption
  - [x] 3.6 Add validation helpers (routing/account format)

- [x] 4. Update PaymentService with payout functionality
  - [x] 4.1 Add sendPayout method
  - [x] 4.2 Integrate with ExternalBankAccountService
  - [x] 4.3 Add payout validation logic
  - [x] 4.4 Implement payout transaction creation
  - [x] 4.5 Update balance deduction logic
  - [x] 4.6 Add spending rule evaluation for payouts
  - [x] 4.7 Integrate webhook events for payouts
  - [x] 4.8 Integrate WebSocket events for payouts

## Phase 3: API Routes

- [x] 5. Create external account routes
  - [x] 5.1 POST /external-accounts (create mock account)
  - [x] 5.2 GET /external-accounts/:routing/:account (verify account)
  - [x] 5.3 Add authentication middleware
  - [x] 5.4 Add request validation schemas

- [x] 6. Add payout route to payment routes
  - [x] 6.1 POST /payments/payout endpoint
  - [x] 6.2 Add request validation
  - [x] 6.3 Add authentication (agent or owner)
  - [x] 6.4 Add error handling

## Phase 4: Shared Types and Validation

- [x] 7. Update shared package with payout types
  - [x] 7.1 Add PayoutRequest interface
  - [x] 7.2 Add PayoutResponse interface
  - [x] 7.3 Add validation schemas for routing/account
  - [x] 7.4 Add new webhook event types

## Phase 5: Agent Skill Updates

- [x] 8. Add payout functionality to agent skill
  - [x] 8.1 Add send_payout function to skill class
  - [x] 8.2 Add exported send_payout function
  - [x] 8.3 Add payout interfaces
  - [x] 8.4 Update skill documentation

## Phase 6: Testing

- [x] 9. Write unit tests for ExternalBankAccountService
  - [x] 9.1 Test account creation
  - [x] 9.2 Test account verification
  - [x] 9.3 Test account number encryption
  - [x] 9.4 Test balance updates
  - [x] 9.5 Test validation helpers

- [x] 10. Write unit tests for PaymentService payout logic
  - [x] 10.1 Test successful payout
  - [x] 10.2 Test insufficient balance
  - [x] 10.3 Test invalid account
  - [x] 10.4 Test frozen account
  - [x] 10.5 Test spending rule evaluation
  - [x] 10.6 Test approval workflow

- [x] 11. Write integration tests for payout flow
  - [x] 11.1 Test end-to-end payout (agent to external account)
  - [x] 11.2 Test payout with approval required
  - [x] 11.3 Test payout failure scenarios
  - [x] 11.4 Test webhook delivery
  - [x] 11.5 Test WebSocket events

- [x] 12. Write API route tests
  - [x] 12.1 Test POST /external-accounts
  - [x] 12.2 Test GET /external-accounts/:routing/:account
  - [x] 12.3 Test POST /payments/payout
  - [x] 12.4 Test authentication and authorization

## Phase 7: Documentation

- [x] 13. Update API documentation
  - [x] 13.1 Document payout endpoint
  - [x] 13.2 Document external account endpoints
  - [x] 13.3 Add example requests/responses
  - [x] 13.4 Document error codes

- [x] 14. Update agent skill documentation
  - [x] 14.1 Add send_payout function documentation
  - [x] 14.2 Add usage examples
  - [x] 14.3 Update SKILL.md with payout instructions

- [x] 15. Create testing guide for payouts
  - [x] 15.1 Document how to create mock accounts
  - [x] 15.2 Document how to test payout flow
  - [x] 15.3 Add example test scenarios

## Phase 8: Dashboard Updates (Optional)

- [x] 16. Add payout transaction display
  - [x] 16.1 Show PAYOUT transactions in transaction list
  - [x] 16.2 Display recipient info (masked account)
  - [x] 16.3 Add payout status indicators

- [x] 17. Add external account management UI (Optional)
  - [x] 17.1 Create mock account form
  - [x] 17.2 List mock accounts
  - [x] 17.3 View account details

## Acceptance Criteria

All tasks must be completed and:
- All tests passing
- Code reviewed and approved
- Documentation updated
- Feature tested end-to-end
- No regressions in existing functionality
