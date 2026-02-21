# Implementation Plan: AI Agent Banking Platform

## Overview

This implementation plan breaks down the AI Agent Banking Platform into incremental coding tasks. The approach follows a bottom-up strategy: starting with core infrastructure (database, authentication), building business logic modules (accounts, payments, cards), then adding the API layer, and finally the frontend dashboard and OpenClaw skill integration.

Each task builds on previous work, with property-based tests integrated throughout to validate correctness early. The mock payment provider is implemented alongside the payment module to enable end-to-end testing without external dependencies.

## Tasks

- [x] 1. Set up project structure and development environment
  - Initialize Turborepo monorepo with apps/ and packages/ directories
  - Configure TypeScript with strict mode for all packages
  - Set up ESLint and Prettier
  - Create Docker Compose configuration for PostgreSQL
  - Configure package.json scripts for development
  - _Requirements: 19.1, 19.2_

- [x] 2. Initialize database schema and Prisma ORM
  - [x] 2.1 Create Prisma schema with all models (Owner, Agent, Account, Transaction, PaymentRequest, VirtualCard)
    - Define all enums (AccountType, AccountStatus, TxType, TxStatus, RequestStatus, CardStatus)
    - Set up relationships and foreign keys
    - Configure UUID primary keys
    - Add indexes on foreign keys and frequently queried fields
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_
  
  - [ ]* 2.2 Write property test for database relationship integrity
    - **Property 43: Database Relationship Integrity**
    - **Validates: Requirements 20.1, 20.2, 20.3**
  
  - [ ]* 2.3 Write property test for UUID primary keys
    - **Property 44: UUID Primary Keys**
    - **Validates: Requirements 20.4**
  
  - [x] 2.4 Generate Prisma client and run initial migration
    - Generate TypeScript types from schema
    - Create initial database migration
    - _Requirements: 19.3_

- [x] 3. Implement shared types and utilities package
  - Create shared TypeScript types for API requests/responses
  - Implement Decimal.js wrapper utilities for money calculations
  - Create validation schemas using Zod
  - Implement error response types and utilities
  - _Requirements: 19.4, 19.5_

- [x] 4. Implement authentication module
  - [x] 4.1 Create owner authentication service
    - Implement registerOwner with bcrypt password hashing (12 salt rounds)
    - Implement loginOwner with JWT token generation (HS256, 24h expiration)
    - Implement verifyOwnerToken for JWT validation
    - _Requirements: 1.1, 1.2, 1.4_
  
  - [ ]* 4.2 Write property test for owner registration
    - **Property 1: Owner Registration Creates Unique Accounts**
    - **Validates: Requirements 1.1, 1.4**
  
  - [ ]* 4.3 Write property test for owner authentication
    - **Property 2: Owner Authentication Returns Valid JWT**
    - **Validates: Requirements 1.2, 1.3, 14.1**
  
  - [x] 4.4 Create agent authentication service
    - Implement generateApiKey using crypto.randomBytes(32)
    - Store API keys as SHA-256 hashes
    - Implement verifyApiKey for API key validation
    - Implement rotateApiKey for key rotation
    - _Requirements: 2.2, 14.2, 14.5_
  
  - [ ]* 4.5 Write property test for agent API key authentication
    - **Property 32: Agent API Key Authentication**
    - **Validates: Requirements 14.2**
  
  - [ ]* 4.6 Write property test for API key rotation
    - **Property 35: API Key Rotation**
    - **Validates: Requirements 14.5**
  
  - [x] 4.7 Create authentication middleware for Fastify
    - Implement requireOwner middleware
    - Implement requireAgent middleware
    - Implement requireOwnerOrAgent middleware
    - _Requirements: 1.3_
  
  - [ ]* 4.8 Write property test for authorization enforcement
    - **Property 7: Balance Inquiry Enforces Authorization**
    - **Validates: Requirements 4.2**
  
  - [ ]* 4.9 Write property test for unauthenticated request rejection
    - **Property 33: Unauthenticated Request Rejection**
    - **Validates: Requirements 14.3**

- [x] 5. Implement rate limiting middleware
  - [x] 5.1 Create rate limiter using in-memory store
    - Implement 5 attempts per 15 minutes for authentication endpoints
    - Track attempts by IP address
    - Return 429 status when limit exceeded
    - _Requirements: 14.4_
  
  - [ ]* 5.2 Write property test for rate limiting
    - **Property 34: Rate Limiting on Authentication**
    - **Validates: Requirements 14.4**

- [x] 6. Implement account module
  - [x] 6.1 Create account service with core operations
    - Implement createAgentAccount (atomic Agent + Account creation)
    - Implement getAccount
    - Implement getBalance
    - Implement updateSpendingRules
    - Implement freezeAccount, unfreezeAccount, closeAccount
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 4.1, 6.1, 13.1, 13.3, 13.4_
  
  - [ ]* 6.2 Write property test for agent account creation
    - **Property 3: Agent Account Creation Initializes Correctly**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
  
  - [ ]* 6.3 Write property test for account details completeness
    - **Property 4: Agent Account Details Are Complete**
    - **Validates: Requirements 2.6**
  
  - [ ]* 6.4 Write property test for balance inquiry
    - **Property 6: Balance Inquiry Returns Current Balance**
    - **Validates: Requirements 4.1, 4.3**
  
  - [x] 6.5 Implement fundAccount operation
    - Use Decimal.js for balance calculations
    - Create INBOUND transaction with COMPLETED status
    - Ensure 18,2 decimal precision
    - _Requirements: 3.1, 3.2, 3.5_
  
  - [ ]* 6.6 Write property test for account funding
    - **Property 5: Account Funding Increases Balance Correctly**
    - **Validates: Requirements 3.1, 3.2, 3.5**
  
  - [ ]* 6.7 Write property test for spending rules persistence
    - **Property 10: Spending Rules Persist and Apply**
    - **Validates: Requirements 6.1, 6.2**
  
  - [ ]* 6.8 Write property test for account freeze behavior
    - **Property 29: Account Freeze Behavior**
    - **Validates: Requirements 13.1, 13.2**
  
  - [ ]* 6.9 Write property test for account freeze round-trip
    - **Property 30: Account Freeze Round-Trip**
    - **Validates: Requirements 13.3**
  
  - [ ]* 6.10 Write property test for account closure restrictions
    - **Property 31: Account Closure Restrictions**
    - **Validates: Requirements 13.4**
  
  - [ ]* 6.11 Write unit tests for edge cases
    - Test duplicate email rejection
    - Test negative/zero funding amounts
    - Test closing account with non-zero balance
    - Test frozen account balance inquiry
    - _Requirements: 1.5, 3.4, 13.5, 4.4_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement payment provider interface and mock provider
  - [x] 8.1 Define PaymentProvider interface
    - Define interfaces for issueVirtualCard, authorizePayment, capturePayment, refundPayment
    - Define CardDetails, AuthorizationResponse, CaptureResponse, RefundResponse types
    - Define WebhookEvent types
    - _Requirements: 15.5_
  
  - [x] 8.2 Implement mock payment provider
    - Generate fake card numbers using Luhn algorithm (4111 XXXX XXXX XXXX format)
    - Generate random expiry dates (2-5 years future) and 3-digit CVV
    - Implement authorization logic (check balance, rules, limits)
    - Simulate 100ms processing delay
    - Return appropriate decline reasons (insufficient_funds, blocked_category, spend_limit_exceeded)
    - _Requirements: 15.1, 15.2, 15.3_
  
  - [ ]* 8.3 Write property test for virtual card generation
    - **Property 24: Virtual Card Generation**
    - **Validates: Requirements 11.1, 11.2, 15.1**
  
  - [ ]* 8.4 Write property test for mock provider authorization logic
    - **Property 36: Mock Provider Authorization Logic**
    - **Validates: Requirements 15.2, 15.3**

- [x] 9. Implement payment module
  - [x] 9.1 Create spending rule evaluation service
    - Implement evaluateSpendingRules function
    - Check daily limit (sum transactions for current day)
    - Check per-transaction limit
    - Check blocked categories
    - Return RuleEvaluation with violations
    - _Requirements: 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 9.2 Write property test for daily spending limit
    - **Property 11: Daily Spending Limit Enforcement**
    - **Validates: Requirements 6.3**
  
  - [ ]* 9.3 Write property test for per-transaction limit
    - **Property 12: Per-Transaction Limit Enforcement**
    - **Validates: Requirements 6.4**
  
  - [ ]* 9.4 Write property test for merchant category blocking
    - **Property 13: Merchant Category Blocking**
    - **Validates: Requirements 6.5**
  
  - [x] 9.5 Implement payment processing service
    - Implement sendPayment with validation, rule evaluation, and balance updates
    - Use database transactions with row-level locking for atomicity
    - Determine transaction type (INTERNAL vs OUTBOUND)
    - Call payment provider for authorization
    - Update balances atomically for INTERNAL transactions
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_
  
  - [ ]* 9.6 Write property test for valid payments
    - **Property 8: Valid Payments Update Balances Atomically**
    - **Validates: Requirements 5.1, 5.6**
  
  - [ ]* 9.7 Write property test for rule violations triggering approval
    - **Property 9: Rule Violations Trigger Approval Workflow**
    - **Validates: Requirements 5.2, 6.6, 7.1**
  
  - [ ]* 9.8 Write property test for failed payment balance preservation
    - **Property 23: Failed Payment Preserves Balance**
    - **Validates: Requirements 10.4**
  
  - [x] 9.9 Implement approval workflow
    - Implement approvePayment (process payment, update status, record timestamp)
    - Implement declinePayment (update status without processing)
    - Verify owner authorization
    - _Requirements: 7.2, 7.3, 7.4_
  
  - [ ]* 9.10 Write property test for payment approval
    - **Property 14: Payment Approval Completes Transaction**
    - **Validates: Requirements 7.2, 7.5**
  
  - [ ]* 9.11 Write property test for payment decline
    - **Property 15: Payment Decline Preserves Balances**
    - **Validates: Requirements 7.3**
  
  - [ ]* 9.12 Write property test for approval authorization
    - **Property 16: Approval Authorization Enforcement**
    - **Validates: Requirements 7.4**
  
  - [ ]* 9.13 Write property test for agent-to-agent payment validation
    - **Property 20: Agent-to-Agent Payment Validation**
    - **Validates: Requirements 9.3**
  
  - [ ]* 9.14 Write unit tests for edge cases
    - Test insufficient balance rejection
    - Test self-payment rejection
    - Test payment to inactive account
    - _Requirements: 5.3, 9.4_

- [x] 10. Implement payment request module
  - [x] 10.1 Create payment request service
    - Implement createRequest with unique payment link generation
    - Implement payRequest (process payment and update status)
    - Implement declineRequest
    - Implement listRequests with status filtering
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_
  
  - [ ]* 10.2 Write property test for payment request creation
    - **Property 17: Payment Request Creation**
    - **Validates: Requirements 8.1, 8.2**
  
  - [ ]* 10.3 Write property test for payment request fulfillment
    - **Property 18: Payment Request Fulfillment**
    - **Validates: Requirements 8.3**
  
  - [ ]* 10.4 Write property test for payment request filtering
    - **Property 19: Payment Request Filtering**
    - **Validates: Requirements 8.6**
  
  - [ ]* 10.5 Write unit tests for payment request edge cases
    - Test expired request rejection
    - Test declined request
    - _Requirements: 8.4, 8.5_
  
  - [x] 10.6 Implement background job for expiring requests
    - Create cron job that runs hourly
    - Update expired requests (expiresAt < now) to EXPIRED status
    - _Requirements: 8.4_

- [x] 11. Implement virtual card module
  - [x] 11.1 Create card service
    - Implement issueCard (delegate to payment provider, store encrypted)
    - Implement listCards (exclude CVV from results)
    - Implement freezeCard, unfreezeCard, cancelCard
    - Implement authorizeCardPayment (check status, balance, limits, rules)
    - Use AES-256 encryption for card numbers at rest
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6_
  
  - [ ]* 11.2 Write property test for card spend limit enforcement
    - **Property 25: Card Spend Limit Enforcement**
    - **Validates: Requirements 11.3**
  
  - [ ]* 11.3 Write property test for card status lifecycle
    - **Property 26: Card Status Lifecycle**
    - **Validates: Requirements 11.4, 11.5**

- [x] 12. Implement webhook module
  - [x] 12.1 Create webhook service
    - Implement registerWebhook with URL validation (HTTPS in production)
    - Generate webhook secret for HMAC signatures
    - Implement unregisterWebhook
    - Implement deliverEvent with HMAC-SHA256 signature
    - Store events in database for reliable delivery
    - _Requirements: 16.1, 16.4_
  
  - [ ]* 12.2 Write property test for webhook delivery
    - **Property 21: Webhook Delivery for Transactions**
    - **Validates: Requirements 7.5, 9.2, 16.1**
  
  - [ ]* 12.3 Write property test for webhook URL validation
    - **Property 40: Webhook URL Validation**
    - **Validates: Requirements 16.4**
  
  - [x] 12.4 Implement webhook retry logic
    - Implement retryFailedDeliveries background job
    - Retry with exponential backoff (1min, 5min, 15min)
    - Mark webhook inactive after 3 failed attempts
    - 10 second timeout per delivery
    - _Requirements: 16.5_
  
  - [ ]* 12.5 Write property test for webhook retry logic
    - **Property 41: Webhook Retry Logic**
    - **Validates: Requirements 16.5**
  
  - [x] 12.6 Integrate webhook calls into payment and card modules
    - Call deliverEvent after transaction completion
    - Call deliverEvent for payment approvals/declines
    - Call deliverEvent for low balance warnings
    - _Requirements: 7.5, 15.4, 16.1, 16.3_
  
  - [ ]* 12.7 Write property test for mock provider webhook generation
    - **Property 37: Mock Provider Webhook Generation**
    - **Validates: Requirements 15.4**
  
  - [ ]* 12.8 Write property test for low balance warnings
    - **Property 39: Low Balance Warnings**
    - **Validates: Requirements 16.3**

- [x] 13. Implement transaction module
  - [x] 13.1 Create transaction service
    - Implement listTransactions with pagination and filtering
    - Implement getTransaction
    - Implement exportTransactions (CSV and JSON formats)
    - Add indexes for fast queries (accountId, createdAt, type, status)
    - Default page size 50, max 200
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [ ]* 13.2 Write property test for transaction history completeness
    - **Property 27: Transaction History Completeness**
    - **Validates: Requirements 12.1, 12.2**
  
  - [ ]* 13.3 Write property test for transaction details completeness
    - **Property 28: Transaction Details Completeness**
    - **Validates: Requirements 12.3, 12.4**

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement Fastify API server
  - [x] 15.1 Set up Fastify server with middleware
    - Initialize Fastify with logging
    - Register CORS middleware
    - Register authentication middleware
    - Register rate limiting middleware
    - Register error handling
    - Configure request validation with Zod schemas
    - _Requirements: 19.5_
  
  - [ ]* 15.2 Write property test for input validation
    - **Property 42: Input Validation**
    - **Validates: Requirements 19.5**
  
  - [x] 15.3 Implement authentication routes
    - POST /auth/register (owner registration)
    - POST /auth/login (owner login)
    - POST /auth/agents/keys (generate agent API key)
    - _Requirements: 1.1, 1.2, 2.2_
  
  - [x] 15.4 Implement account routes
    - POST /accounts (create agent account)
    - GET /accounts/:id (get account details)
    - GET /accounts/:id/balance (check balance)
    - PATCH /accounts/:id/rules (update spending rules)
    - POST /accounts/:id/freeze (freeze account)
    - POST /accounts/:id/unfreeze (unfreeze account)
    - POST /accounts/:id/close (close account)
    - POST /accounts/:id/fund (owner funds agent)
    - _Requirements: 2.1, 2.6, 3.1, 4.1, 6.1, 13.1, 13.3, 13.4_
  
  - [x] 15.5 Implement payment routes
    - POST /payments/send (send payment)
    - POST /payments/approve/:id (approve pending payment)
    - POST /payments/decline/:id (decline payment)
    - _Requirements: 5.1, 7.2, 7.3_
  
  - [x] 15.6 Implement payment request routes
    - POST /payments/request (create payment request)
    - POST /payments/request/:id/pay (pay request)
    - POST /payments/request/:id/decline (decline request)
    - GET /payments/requests (list payment requests)
    - _Requirements: 8.1, 8.3, 8.5, 8.6_
  
  - [x] 15.7 Implement card routes
    - POST /cards/virtual (issue virtual card)
    - GET /cards (list cards)
    - PATCH /cards/:id/freeze (freeze card)
    - PATCH /cards/:id/unfreeze (unfreeze card)
    - PATCH /cards/:id/cancel (cancel card)
    - _Requirements: 11.1, 11.4, 11.5, 11.6_
  
  - [x] 15.8 Implement transaction routes
    - GET /transactions (list transactions with filters)
    - GET /transactions/:id (transaction details)
    - GET /transactions/export (export transactions)
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [x] 15.9 Implement webhook routes
    - POST /webhooks/register (register webhook URL)
    - DELETE /webhooks/:id (unregister webhook)
    - _Requirements: 16.4_

- [x] 16. Implement WebSocket server
  - [x] 16.1 Set up WebSocket server with authentication
    - Initialize WebSocket server alongside Fastify
    - Authenticate connections with JWT or API key
    - Implement heartbeat ping/pong (30 second interval)
    - Limit to 5 concurrent connections per account
    - _Requirements: 16.2_
  
  - [x] 16.2 Implement real-time event broadcasting
    - Implement broadcast function for account-specific events
    - Implement broadcastToOwner for owner-specific events
    - Send events for: balance updates, transaction creation/updates, approval required, payment requests
    - _Requirements: 16.2, 17.5_
  
  - [ ]* 16.3 Write property test for WebSocket notifications
    - **Property 38: WebSocket Real-Time Notifications**
    - **Validates: Requirements 16.2**
  
  - [x] 16.4 Integrate WebSocket calls into modules
    - Broadcast balance_updated after funding or payment
    - Broadcast transaction_created after new transaction
    - Broadcast approval_required when payment needs approval
    - Broadcast payment_request_received when request created
    - _Requirements: 16.2, 17.5_

- [x] 17. Implement external payment processing
  - [x] 17.1 Create guest payment endpoint
    - POST /payments/guest (process payment via payment link)
    - No authentication required
    - Validate payment link and expiration
    - Process payment through mock provider
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [ ]* 17.2 Write property test for external payment processing
    - **Property 22: External Payment Processing**
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 18. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Implement Next.js dashboard application
  - [x] 19.1 Set up Next.js 14 with App Router
    - Initialize Next.js project with TypeScript
    - Configure Tailwind CSS
    - Install and configure shadcn/ui components
    - Set up environment variables for API URL
    - _Requirements: 17.1_
  
  - [x] 19.2 Implement authentication pages
    - Create /auth/login page with login form
    - Create /auth/register page with registration form
    - Store JWT token in httpOnly cookie
    - Implement protected route middleware
    - _Requirements: 1.1, 1.2_
  
  - [x] 19.3 Implement dashboard overview page
    - Create /dashboard page
    - Display all agent accounts with balances
    - Show total balance across all agents
    - Display recent transactions (last 10)
    - Show pending approvals badge
    - _Requirements: 17.1_
  
  - [x] 19.4 Implement agent detail page
    - Create /agents/[id] page
    - Display account information and current balance
    - Show spending rules with edit capability
    - List virtual cards
    - Show recent transactions for this agent
    - Add fund account form
    - _Requirements: 17.3_
  
  - [x] 19.5 Implement transactions page
    - Create /transactions page
    - Display filterable transaction list (date, type, status, account)
    - Implement pagination
    - Add export functionality (CSV/JSON)
    - Show transaction detail modal on click
    - _Requirements: 17.2_
  
  - [x] 19.6 Implement approvals page
    - Create /approvals page
    - List all pending transactions requiring approval
    - Show transaction details (amount, merchant, agent)
    - Add approve/decline buttons
    - _Requirements: 17.4_
  
  - [x] 19.7 Implement reusable components
    - BalanceCard component (display balance with fund/freeze actions)
    - TransactionList component (filterable list with pagination)
    - SpendingRulesEditor component (form for editing rules)
    - ApprovalCard component (transaction with approve/decline)
    - _Requirements: 17.1, 17.2, 17.3, 17.4_
  
  - [x] 19.8 Integrate WebSocket client for real-time updates
    - Connect to WebSocket server on dashboard load
    - Handle balance_updated events (refresh balance display)
    - Handle transaction_created events (add to transaction list)
    - Handle approval_required events (show toast notification)
    - Implement automatic reconnection with exponential backoff
    - _Requirements: 17.5_

- [x] 20. Implement OpenClaw skill
  - [x] 20.1 Create SKILL.md definition
    - Define skill description and configuration (API_URL, API_KEY)
    - Define check_balance action
    - Define make_payment action (amount, recipient, description)
    - Define list_transactions action (limit parameter)
    - Define request_funds action (amount, reason)
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
  
  - [x] 20.2 Implement skill action handlers
    - Implement check_balance (call GET /accounts/:id/balance, format response)
    - Implement make_payment (call POST /payments/send, handle approval status)
    - Implement list_transactions (call GET /transactions, format list)
    - Implement request_funds (call POST /payments/request, confirm sent)
    - Add error handling with clear feedback messages
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

- [x] 21. Integration testing and end-to-end flows
  - [x]* 21.1 Write integration tests for complete payment flow
    - Test: register owner → create agent → fund account → make payment → verify balances
    - _Requirements: 1.1, 2.1, 3.1, 5.1_
  
  - [x]* 21.2 Write integration tests for approval workflow
    - Test: create payment violating rules → verify pending → approve → verify completed
    - _Requirements: 5.2, 7.1, 7.2_
  
  - [x]* 21.3 Write integration tests for payment request flow
    - Test: create request → pay request → verify status and balances
    - _Requirements: 8.1, 8.3_
  
  - [x]* 21.4 Write integration tests for card issuance and payment
    - Test: issue card → authorize payment → verify balance deduction
    - _Requirements: 11.1, 11.3_
  
  - [x]* 21.5 Write integration tests for WebSocket real-time updates
    - Test: connect WebSocket → make payment → verify event received
    - _Requirements: 16.2, 17.5_

- [ ] 22. Final checkpoint - Ensure all tests pass
  - Run full test suite (unit + property + integration)
  - Verify test coverage meets 80% minimum
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 23. Documentation and deployment preparation
  - Create README.md with setup instructions
  - Document API endpoints in OpenAPI/Swagger format
  - Create .env.example files for configuration
  - Write Docker Compose setup for local development
  - Document OpenClaw skill installation process
  - _Requirements: All_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each property test should run minimum 100 iterations
- Use fast-check library for property-based testing in TypeScript
- All monetary calculations must use Decimal.js
- Database operations requiring atomicity must use Prisma transactions
- WebSocket and webhook failures should not block transaction completion
- Mock provider should be easily swappable with real provider via interface
