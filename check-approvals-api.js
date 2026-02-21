// Check if the approvals API returns the fund request
const API_URL = "http://127.0.0.1:3000";

// You need to get your owner token from the browser
// Open browser console on dashboard and run: document.cookie
// Copy the token value

const OWNER_TOKEN = "PASTE_YOUR_OWNER_TOKEN_HERE";

async function checkApprovals() {
  console.log('Checking approvals API...\n');
  
  try {
    const response = await fetch(`${API_URL}/payments/requests?status=PENDING`, {
      headers: {
        'Authorization': `Bearer ${OWNER_TOKEN}`,
      },
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));

    if (response.ok) {
      if (data.data && data.data.length > 0) {
        console.log(`\n✓ Found ${data.data.length} pending fund request(s)!`);
        data.data.forEach((req, i) => {
          console.log(`\nRequest ${i + 1}:`);
          console.log('  ID:', req.id);
          console.log('  Amount:', req.amount);
          console.log('  Description:', req.description);
          console.log('  From:', req.fromAccount?.agent?.name || 'Unknown');
          console.log('  To Account ID:', req.toAccountId || 'null (owner)');
        });
      } else {
        console.log('\n✗ No pending fund requests found');
        console.log('This might be a filtering issue in the API');
      }
    } else {
      console.log('\n✗ Failed to fetch approvals');
      console.log('Error:', data.error || data);
    }
  } catch (error) {
    console.error('\n✗ Error:', error.message);
  }
}

console.log('='.repeat(60));
console.log('APPROVALS API CHECK');
console.log('='.repeat(60));
console.log();

if (OWNER_TOKEN === "PASTE_YOUR_OWNER_TOKEN_HERE") {
  console.log('To get your owner token:');
  console.log('1. Open dashboard in browser: http://localhost:3001/dashboard');
  console.log('2. Open browser console (F12)');
  console.log('3. Run: document.cookie');
  console.log('4. Copy the token value (after "token=")');
  console.log('5. Paste it in this file');
  console.log('6. Run: node check-approvals-api.js');
} else {
  checkApprovals();
}
