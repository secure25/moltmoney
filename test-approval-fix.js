// Test script to verify approval fixes
const API_URL = "http://127.0.0.1:3000";
const API_KEY = "REDACTED-ROTATED-KEY";
const ACCOUNT_ID = "4510fd3b-6f9e-443f-aef7-b7171335f951";

async function testApprovalFix() {
  console.log('='.repeat(60));
  console.log('TESTING APPROVAL FIX');
  console.log('='.repeat(60));
  console.log();
  
  try {
    // Create a fund request
    console.log('1. Creating fund request...');
    const payload = {
      fromAccountId: ACCOUNT_ID,
      amount: "100.00",
      description: "Test fund request - approval fix verification",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const response = await fetch(`${API_URL}/payments/request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      console.log('✗ Failed to create fund request');
      console.log('Error:', JSON.stringify(error, null, 2));
      return;
    }

    const data = await response.json();
    console.log('✓ Fund request created successfully!');
    console.log('Request ID:', data.id);
    console.log('Amount:', data.amount);
    console.log();
    
    console.log('2. What should happen now:');
    console.log('   - WebSocket should broadcast to owner (ownerId)');
    console.log('   - Dashboard should show toast notification');
    console.log('   - Approvals page should poll and show the request within 5 seconds');
    console.log();
    console.log('3. Check your dashboard at: http://localhost:3001/approvals');
    console.log();
    console.log('4. Try declining the request - it should work now!');
    
  } catch (error) {
    console.error('\n✗ Network error:', error.message);
  }
}

testApprovalFix();
