/**
 * Test script for payout endpoint
 * Tests the POST /payments/payout endpoint
 */

const API_BASE = 'http://localhost:3001';

async function testPayoutEndpoint() {
  console.log('Testing Payout Endpoint...\n');

  try {
    // Step 1: Register owner
    console.log('1. Registering owner...');
    const ownerRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `owner-${Date.now()}@test.com`,
        password: 'password123',
        name: 'Test Owner',
      }),
    });
    const owner = await ownerRes.json();
    console.log('Owner registered:', owner.user.email);

    // Step 2: Create agent
    console.log('\n2. Creating agent...');
    const agentRes = await fetch(`${API_BASE}/accounts/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        name: 'Test Agent',
        platform: 'test',
        initialBalance: '1000.00',
      }),
    });
    const agent = await agentRes.json();
    console.log('Agent created:', agent.agent.name);
    console.log('Agent API Key:', agent.apiKey);

    // Step 3: Create external bank account
    console.log('\n3. Creating external bank account...');
    const externalAccountRes = await fetch(`${API_BASE}/external-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        routingNumber: '123456789',
        accountNumber: '9876543210',
        accountHolder: 'John Doe',
        accountType: 'CHECKING',
        initialBalance: '0.00',
      }),
    });
    const externalAccount = await externalAccountRes.json();
    console.log('External account created:', externalAccount.accountHolder);

    // Step 4: Send payout (small amount, no approval needed)
    console.log('\n4. Sending payout (50.00)...');
    const payoutRes = await fetch(`${API_BASE}/payments/payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': agent.apiKey,
      },
      body: JSON.stringify({
        routingNumber: '123456789',
        accountNumber: '9876543210',
        accountHolder: 'John Doe',
        amount: '50.00',
        description: 'Test payout',
      }),
    });

    if (!payoutRes.ok) {
      const error = await payoutRes.json();
      console.error('Payout failed:', error);
      return;
    }

    const payout = await payoutRes.json();
    console.log('Payout successful!');
    console.log('Transaction ID:', payout.transaction.id);
    console.log('Amount:', payout.transaction.amount);
    console.log('Status:', payout.transaction.status);
    console.log('Recipient:', payout.transaction.recipientName);
    console.log('Account:', payout.transaction.recipientAccount);

    // Step 5: Verify external account balance
    console.log('\n5. Verifying external account...');
    const verifyRes = await fetch(
      `${API_BASE}/external-accounts/123456789/9876543210`,
      {
        headers: { 'Authorization': `Bearer ${owner.token}` },
      }
    );
    const verification = await verifyRes.json();
    console.log('External account balance:', verification.balance);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests
testPayoutEndpoint();
