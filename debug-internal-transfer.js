/**
 * Debug script to test internal transfers between agents
 * This will help us understand why $500 disappeared
 */

const API_URL = 'https://REDACTED-NGROK-HOST';

// REDACTED-AGENT's credentials (should have $2000 now, originally $2500)
const REDACTED-AGENT_API_KEY = 'YOUR_REDACTED-AGENT_API_KEY_HERE';
const REDACTED-AGENT_ACCOUNT_ID = 'YOUR_REDACTED-AGENT_ACCOUNT_ID_HERE';

// REDACTED-AGENT's credentials
const REDACTED-AGENT_API_KEY = 'REDACTED-ROTATED-KEY';
const REDACTED-AGENT_ACCOUNT_ID = 'REDACTED-ACCOUNT-ID';

async function getBalance(apiKey, accountId, agentName) {
  try {
    const response = await fetch(
      `${API_URL}/accounts/${accountId}/balance`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'ngrok-skip-browser-warning': 'true',
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log(`${agentName} Balance: $${data.balance}`);
      return parseFloat(data.balance);
    } else {
      console.log(`${agentName} Balance: ERROR ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`${agentName} Balance: ERROR ${error.message}`);
    return null;
  }
}

async function getTransactions(apiKey, accountId, agentName) {
  try {
    const response = await fetch(
      `${API_URL}/transactions?accountId=${accountId}&pageSize=10&page=1`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'ngrok-skip-browser-warning': 'true',
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log(`\n${agentName} Transactions:`);
      data.data.forEach((tx, i) => {
        console.log(`  ${i + 1}. ${tx.type} - $${tx.amount} - ${tx.status} - ${tx.description || 'No description'}`);
        console.log(`     From: ${tx.fromAccountId}`);
        console.log(`     To: ${tx.toAccountId || 'External'}`);
      });
      return data.data;
    } else {
      console.log(`${agentName} Transactions: ERROR ${response.status}`);
      return [];
    }
  } catch (error) {
    console.log(`${agentName} Transactions: ERROR ${error.message}`);
    return [];
  }
}

async function runDiagnostics() {
  console.log('='.repeat(60));
  console.log('INTERNAL TRANSFER BUG DIAGNOSTICS');
  console.log('='.repeat(60));
  console.log('\nExpected State:');
  console.log('  REDACTED-AGENT: $2000 (was $2500, sent $500)');
  console.log('  REDACTED-AGENT: $2500 (was $2000, received $500)');
  console.log('  Total: $4500');
  console.log('\nActual State:');
  
  // Get current balances
  const REDACTED-AGENTBalance = await getBalance(REDACTED-AGENT_API_KEY, REDACTED-AGENT_ACCOUNT_ID, 'REDACTED-AGENT');
  const REDACTED-AGENTBalance = await getBalance(REDACTED-AGENT_API_KEY, REDACTED-AGENT_ACCOUNT_ID, 'REDACTED-AGENT');
  
  if (REDACTED-AGENTBalance !== null && REDACTED-AGENTBalance !== null) {
    const total = REDACTED-AGENTBalance + REDACTED-AGENTBalance;
    console.log(`  Total: $${total.toFixed(2)}`);
    console.log(`\n❌ MISSING: $${(4500 - total).toFixed(2)}`);
  }
  
  // Get transactions for both accounts
  console.log('\n' + '='.repeat(60));
  await getTransactions(REDACTED-AGENT_API_KEY, REDACTED-AGENT_ACCOUNT_ID, 'REDACTED-AGENT');
  await getTransactions(REDACTED-AGENT_API_KEY, REDACTED-AGENT_ACCOUNT_ID, 'REDACTED-AGENT');
  
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS');
  console.log('='.repeat(60));
  console.log('\nPlease check:');
  console.log('1. Does the $500 transaction appear in BOTH accounts?');
  console.log('2. Is the transaction status COMPLETED?');
  console.log('3. Are the fromAccountId and toAccountId correct?');
  console.log('4. Did the balances update correctly?');
}

runDiagnostics();
