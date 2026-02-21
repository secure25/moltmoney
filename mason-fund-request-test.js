const API_URL = "http://127.0.0.1:3000";
const API_KEY = "REDACTED-ROTATED-KEY";
const ACCOUNT_ID = "e99250d7-6818-4c37-9317-8dc232e03a77";

async function test() {
  const response = await fetch(`${API_URL}/payments/request`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fromAccountId: ACCOUNT_ID,
      amount: "500.00",
      description: "Fund request: cloud computing costs",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
  });

  console.log('Status:', response.status);
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

test();
