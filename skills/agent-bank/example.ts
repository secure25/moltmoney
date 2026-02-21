/**
 * Example usage of the AgentBank OpenClaw Skill
 * 
 * This file demonstrates how to use the skill's actions in a TypeScript application.
 */

import {
  check_balance,
  make_payment,
  list_transactions,
  request_funds,
  send_payout,
} from './index';

/**
 * Example: Check account balance
 */
async function exampleCheckBalance() {
  console.log('=== Checking Balance ===');
  const balance = await check_balance();
  console.log(balance);
  console.log();
}

/**
 * Example: Make a payment to a merchant
 */
async function exampleMakePayment() {
  console.log('=== Making Payment ===');
  const result = await make_payment(
    50.00,
    'OpenAI',
    'API credits for GPT-4'
  );
  console.log(result);
  console.log();
}

/**
 * Example: Make a payment to another agent (using account ID)
 */
async function exampleAgentToAgentPayment() {
  console.log('=== Agent-to-Agent Payment ===');
  const recipientAccountId = '123e4567-e89b-12d3-a456-426614174000';
  const result = await make_payment(
    25.50,
    recipientAccountId,
    'Shared compute resources'
  );
  console.log(result);
  console.log();
}

/**
 * Example: List recent transactions
 */
async function exampleListTransactions() {
  console.log('=== Recent Transactions ===');
  const transactions = await list_transactions(10);
  console.log(transactions);
  console.log();
}

/**
 * Example: Request funds from owner
 */
async function exampleRequestFunds() {
  console.log('=== Requesting Funds ===');
  const result = await request_funds(
    100.00,
    'Need additional budget for cloud computing resources'
  );
  console.log(result);
  console.log();
}

/**
 * Example: Send payout to external bank account
 */
async function exampleSendPayout() {
  console.log('=== Sending Payout ===');
  const result = await send_payout(
    '123456789',           // Routing number
    '9876543210',          // Account number
    'John Doe',            // Account holder name
    150.00,                // Amount
    'Payment for consulting services'
  );
  console.log(result);
  console.log();
}

/**
 * Example: Send payout with minimal parameters
 */
async function exampleSimplePayout() {
  console.log('=== Simple Payout (no description) ===');
  const result = await send_payout(
    '987654321',
    '1234567890',
    'Jane Smith',
    75.50
  );
  console.log(result);
  console.log();
}

/**
 * Example: Handle errors gracefully
 */
async function exampleErrorHandling() {
  console.log('=== Error Handling Example ===');
  
  // Try to make a payment with invalid amount
  const result1 = await make_payment(-10, 'Test', 'Invalid amount');
  console.log(result1); // Will show error message
  
  // Try to request funds without reason
  const result2 = await request_funds(50, '');
  console.log(result2); // Will show error message
  
  // Try payout with invalid routing number
  const result3 = await send_payout('12345', '1234567890', 'Test', 100);
  console.log(result3); // Will show error message
  
  // Try payout with invalid account number
  const result4 = await send_payout('123456789', '123', 'Test', 100);
  console.log(result4); // Will show error message
  
  console.log();
}

/**
 * Example: Complete workflow
 */
async function exampleCompleteWorkflow() {
  console.log('=== Complete Workflow Example ===');
  
  // 1. Check initial balance
  console.log('Step 1: Check balance');
  const initialBalance = await check_balance();
  console.log(initialBalance);
  
  // 2. Make a payment
  console.log('\nStep 2: Make payment');
  const payment = await make_payment(25.00, 'AWS', 'EC2 instances');
  console.log(payment);
  
  // 3. Send payout to external account
  console.log('\nStep 3: Send payout to external bank account');
  const payout = await send_payout(
    '123456789',
    '9876543210',
    'Contractor Name',
    200.00,
    'Payment for development work'
  );
  console.log(payout);
  
  // 4. Check balance after transactions
  console.log('\nStep 4: Check balance after transactions');
  const newBalance = await check_balance();
  console.log(newBalance);
  
  // 5. View transaction history
  console.log('\nStep 5: View recent transactions');
  const transactions = await list_transactions(5);
  console.log(transactions);
  
  // 6. Request more funds if needed
  console.log('\nStep 6: Request additional funds');
  const fundRequest = await request_funds(
    100.00,
    'Running low on balance, need funds for continued operations'
  );
  console.log(fundRequest);
  
  console.log();
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('AgentBank Skill - Usage Examples\n');
  console.log('Make sure to set API_URL and API_KEY environment variables\n');
  console.log('='.repeat(50));
  console.log();

  try {
    await exampleCheckBalance();
    await exampleMakePayment();
    await exampleAgentToAgentPayment();
    await exampleListTransactions();
    await exampleRequestFunds();
    await exampleSendPayout();
    await exampleSimplePayout();
    await exampleErrorHandling();
    await exampleCompleteWorkflow();
    
    console.log('='.repeat(50));
    console.log('All examples completed!');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  exampleCheckBalance,
  exampleMakePayment,
  exampleAgentToAgentPayment,
  exampleListTransactions,
  exampleRequestFunds,
  exampleSendPayout,
  exampleSimplePayout,
  exampleErrorHandling,
  exampleCompleteWorkflow,
};
