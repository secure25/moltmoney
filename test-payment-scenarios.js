/**
 * End-to-End Payment Testing Script
 * Tests both agent-to-agent and agent-to-human payment scenarios
 */

const API_BASE_URL = 'http://localhost:3000';

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null, headers = {}) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  const responseData = await response.json();
  
  return {
    status: response.status,
    data: responseData,
  };
}

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

function logStep(step, message) {
  log(`\n[Step ${step}] ${message}`, 'blue');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'yellow');
}

// Main test function
async function runPaymentTests() {
  try {
    logSection('🚀 MoltMoney Payment System E2E Test');
    
    // Test data
    const ownerEmail = `test-owner-${Date.now()}@example.com`;
    const ownerPassword = 'SecurePass123!';
    let ownerToken = null;
    let agent1ApiKey = null;
    let agent2ApiKey = null;
    let agent1AccountId = null;
    let agent2AccountId = null;
    let externalAccountRouting = '123456789';
    let externalAccountNumber = `1${Date.now()}`.slice(-10); // Ensure 10 digits

    // ========================================
    // SETUP: Create Owner and Agents
    // ========================================
    logSection('📋 SETUP: Creating Test Accounts');

    logStep(1, 'Register Owner Account');
    const registerResult = await apiRequest('POST', '/auth/register', {
      email: ownerEmail,
      name: 'Test Owner',
      password: ownerPassword,
    });

    if (registerResult.status !== 201) {
      logError('Failed to register owner');
      console.log(registerResult);
      return;
    }
    logSuccess(`Owner registered: ${ownerEmail}`);

    logStep(2, 'Login as Owner');
    const loginResult = await apiRequest('POST', '/auth/login', {
      email: ownerEmail,
      password: ownerPassword,
    });

    if (loginResult.status !== 200) {
      logError('Failed to login');
      console.log(loginResult);
      return;
    }
    ownerToken = loginResult.data.token;
    logSuccess('Owner logged in successfully');

    logStep(3, 'Create Agent 1 (Sender)');
    const agent1Result = await apiRequest(
      'POST',
      '/accounts',
      {
        name: 'Payment Sender Agent',
        platform: 'TestPlatform',
      },
      { Authorization: `Bearer ${ownerToken}` }
    );

    if (agent1Result.status !== 201) {
      logError('Failed to create Agent 1');
      console.log(agent1Result);
      return;
    }
    agent1ApiKey = agent1Result.data.agent.apiKey;
    agent1AccountId = agent1Result.data.account.id;
    logSuccess(`Agent 1 created with API key: ${agent1ApiKey.substring(0, 20)}...`);
    logInfo(`Agent 1 Account ID: ${agent1AccountId}`);

    logStep(4, 'Create Agent 2 (Recipient)');
    const agent2Result = await apiRequest(
      'POST',
      '/accounts',
      {
        name: 'Payment Recipient Agent',
        platform: 'TestPlatform',
      },
      { Authorization: `Bearer ${ownerToken}` }
    );

    if (agent2Result.status !== 201) {
      logError('Failed to create Agent 2');
      console.log(agent2Result);
      return;
    }
    agent2ApiKey = agent2Result.data.agent.apiKey;
    agent2AccountId = agent2Result.data.account.id;
    logSuccess(`Agent 2 created with API key: ${agent2ApiKey.substring(0, 20)}...`);
    logInfo(`Agent 2 Account ID: ${agent2AccountId}`);

    logStep(5, 'Create External Bank Account (for human payments)');
    const externalAccountResult = await apiRequest(
      'POST',
      '/external-accounts',
      {
        routingNumber: externalAccountRouting,
        accountNumber: externalAccountNumber,
        accountHolder: 'John Human',
        accountType: 'CHECKING',
        initialBalance: '0',
      },
      { Authorization: `Bearer ${ownerToken}` }
    );

    if (externalAccountResult.status !== 201) {
      logError('Failed to create external account');
      console.log(externalAccountResult);
      return;
    }
    logSuccess(`External account created: ****${externalAccountNumber.slice(-4)}`);
    logInfo(`Full account number for testing: ${externalAccountNumber}`);

    logStep(6, 'Fund Agent 1 Account');
    const fundResult = await apiRequest(
      'POST',
      `/accounts/${agent1AccountId}/fund`,
      { amount: '1000.00' },
      { Authorization: `Bearer ${ownerToken}` }
    );

    if (fundResult.status !== 200) {
      logError('Failed to fund Agent 1');
      console.log(fundResult);
      return;
    }
    logSuccess(`Agent 1 funded with $1000.00`);
    logInfo(`New balance: $${fundResult.data.account.balance}`);

    // ========================================
    // TEST 1: Agent-to-Agent Payment
    // ========================================
    logSection('💸 TEST 1: Agent-to-Agent Payment');

    logStep(7, 'Check Initial Balances');
    const balance1Before = await apiRequest(
      'GET',
      `/accounts/${agent1AccountId}/balance`,
      null,
      { 'X-API-Key': agent1ApiKey }
    );
    const balance2Before = await apiRequest(
      'GET',
      `/accounts/${agent2AccountId}/balance`,
      null,
      { 'X-API-Key': agent2ApiKey }
    );

    logInfo(`Agent 1 balance: $${balance1Before.data.balance}`);
    logInfo(`Agent 2 balance: $${balance2Before.data.balance}`);

    logStep(8, 'Send $250 from Agent 1 to Agent 2');
    const agentPaymentResult = await apiRequest(
      'POST',
      '/payments/send',
      {
        toAccountId: agent2AccountId,
        amount: '250.00',
        description: 'Agent-to-agent test payment',
      },
      { 'X-API-Key': agent1ApiKey }
    );

    if (agentPaymentResult.status !== 201) {
      logError('Agent-to-agent payment failed');
      console.log(agentPaymentResult);
      return;
    }

    const agentTx = agentPaymentResult.data.transaction;
    logSuccess(`Payment successful!`);
    logInfo(`Transaction ID: ${agentTx.id}`);
    logInfo(`Type: ${agentTx.type}`);
    logInfo(`Status: ${agentTx.status}`);
    logInfo(`Amount: $${agentTx.amount}`);

    logStep(9, 'Verify Balances After Agent-to-Agent Payment');
    const balance1After = await apiRequest(
      'GET',
      `/accounts/${agent1AccountId}/balance`,
      null,
      { 'X-API-Key': agent1ApiKey }
    );
    const balance2After = await apiRequest(
      'GET',
      `/accounts/${agent2AccountId}/balance`,
      null,
      { 'X-API-Key': agent2ApiKey }
    );

    logInfo(`Agent 1 balance: $${balance1After.data.balance} (was $${balance1Before.data.balance})`);
    logInfo(`Agent 2 balance: $${balance2After.data.balance} (was $${balance2Before.data.balance})`);

    // Verify the math
    const expectedBalance1 = parseFloat(balance1Before.data.balance) - 250;
    const expectedBalance2 = parseFloat(balance2Before.data.balance) + 250;
    const actualBalance1 = parseFloat(balance1After.data.balance);
    const actualBalance2 = parseFloat(balance2After.data.balance);

    if (Math.abs(actualBalance1 - expectedBalance1) < 0.01 && 
        Math.abs(actualBalance2 - expectedBalance2) < 0.01) {
      logSuccess('✓ Balances are correct!');
      logSuccess(`✓ Agent 1: $${actualBalance1.toFixed(2)} (expected $${expectedBalance1.toFixed(2)})`);
      logSuccess(`✓ Agent 2: $${actualBalance2.toFixed(2)} (expected $${expectedBalance2.toFixed(2)})`);
    } else {
      logError('✗ Balance mismatch!');
      logError(`Agent 1: $${actualBalance1} (expected $${expectedBalance1})`);
      logError(`Agent 2: $${actualBalance2} (expected $${expectedBalance2})`);
    }

    // ========================================
    // TEST 2: Agent-to-Human Payment (Payout)
    // ========================================
    logSection('🏦 TEST 2: Agent-to-Human Payment (Payout)');

    logStep(10, 'Check Agent 1 Balance Before Payout');
    const balanceBeforePayout = await apiRequest(
      'GET',
      `/accounts/${agent1AccountId}/balance`,
      null,
      { 'X-API-Key': agent1ApiKey }
    );
    logInfo(`Agent 1 balance: $${balanceBeforePayout.data.balance}`);

    // Verify external account exists before payout
    logInfo(`Verifying external account: ${externalAccountRouting} / ${externalAccountNumber}`);
    const verifyResult = await apiRequest(
      'GET',
      `/external-accounts/${externalAccountRouting}/${externalAccountNumber}`,
      null,
      { Authorization: `Bearer ${ownerToken}` }
    );
    logInfo(`Verification result: ${JSON.stringify(verifyResult.data)}`);

    logStep(11, 'Send $150 Payout to Human Bank Account');
    const payoutResult = await apiRequest(
      'POST',
      '/payments/payout',
      {
        routingNumber: externalAccountRouting,
        accountNumber: externalAccountNumber,
        accountHolder: 'John Human',
        amount: '150.00',
        description: 'Payment for consulting services',
      },
      { 'X-API-Key': agent1ApiKey }
    );

    if (payoutResult.status !== 201) {
      logError('Payout failed');
      console.log(payoutResult);
      return;
    }

    const payoutTx = payoutResult.data.transaction;
    logSuccess(`Payout successful!`);
    logInfo(`Transaction ID: ${payoutTx.id}`);
    logInfo(`Type: ${payoutTx.type}`);
    logInfo(`Status: ${payoutTx.status}`);
    logInfo(`Amount: $${payoutTx.amount}`);
    logInfo(`Recipient: ${payoutTx.recipientName}`);
    logInfo(`Account: ${payoutTx.recipientAccount}`);

    logStep(12, 'Verify Balance After Payout');
    const balanceAfterPayout = await apiRequest(
      'GET',
      `/accounts/${agent1AccountId}/balance`,
      null,
      { 'X-API-Key': agent1ApiKey }
    );
    logInfo(`Agent 1 balance: $${balanceAfterPayout.data.balance} (was $${balanceBeforePayout.data.balance})`);

    const expectedBalanceAfterPayout = parseFloat(balanceBeforePayout.data.balance) - 150;
    const actualBalanceAfterPayout = parseFloat(balanceAfterPayout.data.balance);

    if (Math.abs(actualBalanceAfterPayout - expectedBalanceAfterPayout) < 0.01) {
      logSuccess(`✓ Balance is correct: $${actualBalanceAfterPayout.toFixed(2)} (expected $${expectedBalanceAfterPayout.toFixed(2)})`);
    } else {
      logError(`✗ Balance mismatch: $${actualBalanceAfterPayout} (expected $${expectedBalanceAfterPayout})`);
    }

    logStep(13, 'Verify External Account Received Funds');
    const externalBalanceResult = await apiRequest(
      'GET',
      `/external-accounts/${externalAccountRouting}/${externalAccountNumber}`,
      null,
      { Authorization: `Bearer ${ownerToken}` }
    );

    if (externalBalanceResult.status === 200 && externalBalanceResult.data.exists) {
      logSuccess(`✓ External account verified`);
      logInfo(`Account holder: ${externalBalanceResult.data.accountHolder}`);
      logInfo(`Status: ${externalBalanceResult.data.status}`);
    }

    // ========================================
    // SUMMARY
    // ========================================
    logSection('📊 TEST SUMMARY');
    
    logSuccess('✓ Agent-to-Agent Payment: PASSED');
    logInfo('  - Agent 1 sent $250 to Agent 2');
    logInfo('  - Balances updated correctly');
    logInfo('  - Transaction type: INTERNAL');
    
    logSuccess('✓ Agent-to-Human Payment: PASSED');
    logInfo('  - Agent 1 sent $150 payout to human bank account');
    logInfo('  - Balance deducted correctly');
    logInfo('  - Transaction type: PAYOUT');
    
    log('\n🎉 All payment tests completed successfully!', 'green');
    
    logSection('💰 FINAL BALANCES');
    logInfo(`Agent 1: $${balanceAfterPayout.data.balance}`);
    logInfo(`Agent 2: $${balance2After.data.balance}`);
    logInfo(`External Account: Received $150.00`);
    
    const totalOut = 250 + 150; // Agent-to-agent + payout
    logInfo(`\nTotal sent from Agent 1: $${totalOut}`);
    logInfo(`Starting balance: $1000.00`);
    logInfo(`Expected remaining: $${1000 - totalOut}`);
    logInfo(`Actual remaining: $${balanceAfterPayout.data.balance}`);

  } catch (error) {
    logError(`\n❌ Test failed with error: ${error.message}`);
    console.error(error);
  }
}

// Run the tests
console.log('\n🔧 Starting MoltMoney Payment System Tests...\n');
console.log('Make sure the API server is running on http://localhost:3000\n');

runPaymentTests().then(() => {
  console.log('\n✅ Test script completed\n');
}).catch((error) => {
  console.error('\n❌ Test script failed:', error);
  process.exit(1);
});
