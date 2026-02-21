// Check REDACTED-AGENT's balance
const API_URL = "http://127.0.0.1:3000";
const API_KEY = "REDACTED-ROTATED-KEY";
const ACCOUNT_ID = "e99250d7-6818-4c37-9317-8dc232e03a77";

async function checkBalance() {
  console.log('Checking REDACTED-AGENT\'s balance...\n');
  
  try {
    const response = await fetch(`${API_URL}/accounts/${ACCOUNT_ID}/balance`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    
    if (response.ok) {
      console.log('\n✓ Balance retrieved successfully!');
      console.log('Current balance: $' + parseFloat(data.balance).toFixed(2));
    } else {
      console.log('\n✗ Failed to get balance');
      console.log('Error:', data.error || data);
    }
  } catch (error) {
    console.error('\n✗ Network error:', error.message);
  }
}

checkBalance();
