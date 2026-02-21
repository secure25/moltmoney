/**
 * Test script for external account routes
 * Tests the POST /external-accounts and GET /external-accounts/:routing/:account endpoints
 */

const BASE_URL = 'http://localhost:3000';

async function testExternalAccountRoutes() {
  console.log('🧪 Testing External Account Routes\n');

  try {
    // Step 1: Register an owner
    console.log('1️⃣ Registering owner...');
    const registerResponse = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test-external@example.com',
        password: 'password123',
        name: 'Test Owner',
      }),
    });

    if (!registerResponse.ok) {
      throw new Error(`Registration failed: ${await registerResponse.text()}`);
    }

    const { owner, token } = await registerResponse.json();
    console.log(`✅ Owner registered: ${owner.email}`);
    console.log(`   Token: ${token.substring(0, 20)}...\n`);

    // Step 2: Create a mock external bank account
    console.log('2️⃣ Creating mock external bank account...');
    const createAccountResponse = await fetch(`${BASE_URL}/external-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        routingNumber: '123456789',
        accountNumber: '9876543210',
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        initialBalance: '1000.00',
      }),
    });

    if (!createAccountResponse.ok) {
      const errorText = await createAccountResponse.text();
      throw new Error(`Create account failed: ${errorText}`);
    }

    const createdAccount = await createAccountResponse.json();
    console.log('✅ Mock external account created:');
    console.log(`   ID: ${createdAccount.id}`);
    console.log(`   Routing: ${createdAccount.routingNumber}`);
    console.log(`   Account: ${createdAccount.accountNumber} (masked)`);
    console.log(`   Holder: ${createdAccount.accountHolder}`);
    console.log(`   Type: ${createdAccount.accountType}`);
    console.log(`   Balance: $${createdAccount.balance}`);
    console.log(`   Status: ${createdAccount.status}\n`);

    // Step 3: Verify the external bank account exists
    console.log('3️⃣ Verifying external bank account...');
    const verifyResponse = await fetch(
      `${BASE_URL}/external-accounts/123456789/9876543210`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!verifyResponse.ok) {
      throw new Error(`Verify account failed: ${await verifyResponse.text()}`);
    }

    const verifyResult = await verifyResponse.json();
    console.log('✅ Account verification result:');
    console.log(`   Exists: ${verifyResult.exists}`);
    if (verifyResult.exists) {
      console.log(`   Holder: ${verifyResult.accountHolder}`);
      console.log(`   Type: ${verifyResult.accountType}`);
      console.log(`   Status: ${verifyResult.status}\n`);
    }

    // Step 4: Try to verify a non-existent account
    console.log('4️⃣ Verifying non-existent account...');
    const verifyNonExistentResponse = await fetch(
      `${BASE_URL}/external-accounts/111111111/0000000000`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!verifyNonExistentResponse.ok) {
      throw new Error(`Verify non-existent account failed: ${await verifyNonExistentResponse.text()}`);
    }

    const verifyNonExistentResult = await verifyNonExistentResponse.json();
    console.log('✅ Non-existent account verification:');
    console.log(`   Exists: ${verifyNonExistentResult.exists}\n`);

    // Step 5: Try to create duplicate account (should fail)
    console.log('5️⃣ Attempting to create duplicate account...');
    const duplicateResponse = await fetch(`${BASE_URL}/external-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        routingNumber: '123456789',
        accountNumber: '9876543210',
        accountHolder: 'Jane Doe',
        accountType: 'SAVINGS',
        initialBalance: '500.00',
      }),
    });

    if (duplicateResponse.status === 400) {
      const error = await duplicateResponse.json();
      console.log('✅ Duplicate account correctly rejected:');
      console.log(`   Error code: ${error.error.code}`);
      console.log(`   Message: ${error.error.message}\n`);
    } else {
      console.log('⚠️  Expected duplicate to fail but it succeeded\n');
    }

    // Step 6: Test validation - invalid routing number
    console.log('6️⃣ Testing validation - invalid routing number...');
    const invalidRoutingResponse = await fetch(`${BASE_URL}/external-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        routingNumber: '12345', // Too short
        accountNumber: '9876543210',
        accountHolder: 'Test User',
        accountType: 'CHECKING',
      }),
    });

    if (invalidRoutingResponse.status === 400) {
      const error = await invalidRoutingResponse.json();
      console.log('✅ Invalid routing number correctly rejected:');
      console.log(`   Error: ${error.error?.message || JSON.stringify(error)}\n`);
    } else {
      console.log('⚠️  Expected validation error but request succeeded\n');
    }

    console.log('🎉 All external account route tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
testExternalAccountRoutes();
