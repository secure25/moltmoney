// Test script for REDACTED-AGENT MoltMoney Skill
// This tests the skill functions with REDACTED-AGENT's credentials

const API_URL = "https://REDACTED-NGROK-HOST";
const API_KEY = "REDACTED-ROTATED-KEY";
const ACCOUNT_ID = "REDACTED-ACCOUNT-ID";

async function testSkill() {
  console.log('='.repeat(60));
  console.log('REDACTED-AGENT MOLTMONEY SKILL TEST');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Check Balance
  console.log('Test 1: Checking balance...');
  try {
    const response = await fetch(`${API_URL}/accounts/${ACCOUNT_ID}/balance`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Balance: $${parseFloat(data.balance).toFixed(2)}`);
      console.log(`  Status: ${data.status}`);
    } else {
      const error = await response.json();
      console.log(`✗ Failed: ${error.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
  console.log();

  // Test 2: List Transactions
  console.log('Test 2: Listing recent transactions...');
  try {
    const response = await fetch(
      `${API_URL}/transactions?accountId=${ACCOUNT_ID}&pageSize=5&page=1`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Found ${data.data.length} transaction(s)`);
      data.data.forEach((tx, i) => {
        const amount = parseFloat(tx.amount).toFixed(2);
        const sign = tx.type === 'INBOUND' ? '+' : '-';
        console.log(`  ${i + 1}. ${sign}$${amount} - ${tx.description || tx.merchantName || 'No description'}`);
      });
    } else {
      const error = await response.json();
      console.log(`✗ Failed: ${error.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
  console.log();

  // Test 3: Request Funds (optional - uncomment to test)
  console.log('Test 3: Fund request (skipped - uncomment to test)');
  console.log('  To test fund requests, uncomment the code below');
  /*
  try {
    const payload = {
      fromAccountId: ACCOUNT_ID,
      amount: "100.00",
      description: "Fund request: Test from REDACTED-AGENT skill",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const response = await fetch(`${API_URL}/payments/request`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✓ Fund request created: $${data.amount}`);
      console.log(`  Request ID: ${data.id}`);
    } else {
      const error = await response.json();
      console.log(`✗ Failed: ${error.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
  }
  */
  console.log();

  console.log('='.repeat(60));
  console.log('SKILL TEST COMPLETE');
  console.log('='.repeat(60));
  console.log();
  console.log('Next steps:');
  console.log('1. Upload this skill to ClawNow');
  console.log('2. Configure REDACTED-AGENT to use the skill');
  console.log('3. Test with REDACTED-AGENT: "Check my balance" or "Request $100 for testing"');
}

testSkill();
