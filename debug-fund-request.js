// Comprehensive debugging script for fund requests
const API_URL = "http://127.0.0.1:3000";

// REDACTED-AGENT agent credentials
const API_KEY = "REDACTED-ROTATED-KEY";
const ACCOUNT_ID = "e99250d7-6818-4c37-9317-8dc232e03a77";

async function runTests() {
  console.log('='.repeat(70));
  console.log('FUND REQUEST DEBUGGING SCRIPT');
  console.log('='.repeat(70));
  console.log();

  // Test 1: Check API is running
  console.log('Test 1: Checking if API is running...');
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    console.log('✓ API is running:', data);
  } catch (error) {
    console.log('✗ API is not running:', error.message);
    console.log('  Make sure to start the API server: cd apps/api && npm run dev');
    return;
  }
  console.log();

  // Test 2: Verify API key works
  console.log('Test 2: Verifying API key...');
  try {
    const response = await fetch(`${API_URL}/accounts/${ACCOUNT_ID}/balance`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✓ API key is valid');
      console.log('  Current balance:', data.balance);
    } else {
      const data = await response.json();
      console.log('✗ API key is invalid:', data.error?.message);
      console.log('  Make sure you copied the correct API key from the dashboard');
      return;
    }
  } catch (error) {
    console.log('✗ Error checking balance:', error.message);
    return;
  }
  console.log();

  // Test 3: Create fund request
  console.log('Test 3: Creating fund request...');
  try {
    const payload = {
      fromAccountId: ACCOUNT_ID,
      amount: "500.00",
      description: "Fund request: cloud computing costs",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    console.log('  Payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch(`${API_URL}/payments/request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('  Response status:', response.status);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✓ Fund request created successfully!');
      console.log('  Request ID:', data.id);
      console.log('  Amount:', data.amount);
      console.log('  Description:', data.description);
      console.log('  Status:', data.status);
      console.log('  To Account ID:', data.toAccountId || 'null (fund request to owner)');
    } else {
      console.log('✗ Fund request failed');
      console.log('  Error:', JSON.stringify(data, null, 2));
      return;
    }
  } catch (error) {
    console.log('✗ Error creating fund request:', error.message);
    return;
  }
  console.log();

  // Test 4: Check if request appears in list
  console.log('Test 4: Checking if request appears in pending list...');
  console.log('  Note: This requires owner authentication');
  console.log('  Please check the dashboard at: http://localhost:3001/approvals');
  console.log();

  console.log('='.repeat(70));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(70));
  console.log();
  console.log('If all tests passed, check the Approvals page in your dashboard.');
  console.log('If you don\'t see the request there, check the API server logs for errors.');
}

// Check if credentials are set
console.log('='.repeat(70));
console.log('FUND REQUEST DEBUGGING SCRIPT - REDACTED-AGENT AGENT');
console.log('='.repeat(70));
console.log();

runTests();
