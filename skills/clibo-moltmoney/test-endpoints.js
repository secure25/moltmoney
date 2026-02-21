/**
 * Test script to verify MoltMoney API endpoints
 * Run this to confirm the API is working correctly
 */

const API_URL = 'https://REDACTED-NGROK-HOST';
const API_KEY = 'REDACTED-ROTATED-KEY';
const ACCOUNT_ID = 'REDACTED-ACCOUNT-ID';

async function testEndpoint(name, method, endpoint, body = null) {
  console.log(`\nTesting: ${name}`);
  console.log(`${method} ${endpoint}`);
  
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'ngrok-skip-browser-warning': 'true',
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, options);
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ SUCCESS');
      console.log('Response:', JSON.stringify(data, null, 2));
      return true;
    } else {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.log('❌ FAILED');
      console.log('Error:', JSON.stringify(error, null, 2));
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR');
    console.log('Error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MOLTMONEY API ENDPOINT TESTS');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);
  console.log(`Account ID: ${ACCOUNT_ID}`);
  console.log('='.repeat(60));
  
  // Test 1: Check Balance
  await testEndpoint(
    'Check Balance',
    'GET',
    `/accounts/${ACCOUNT_ID}/balance`
  );
  
  // Test 2: List Transactions
  await testEndpoint(
    'List Transactions',
    'GET',
    `/transactions?accountId=${ACCOUNT_ID}&pageSize=5&page=1`
  );
  
  // Test 3: Health Check
  await testEndpoint(
    'Health Check',
    'GET',
    '/health'
  );
  
  console.log('\n' + '='.repeat(60));
  console.log('TESTS COMPLETE');
  console.log('='.repeat(60));
  console.log('\nIf all tests passed, the API is working correctly!');
  console.log('REDACTED-AGENT can now use these endpoints through the skill functions.');
}

runTests();
