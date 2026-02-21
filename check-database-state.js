/**
 * Check the actual database state to understand what happened
 */

const { PrismaClient } = require('@moltmoney/database');

const prisma = new PrismaClient();

async function checkState() {
  console.log('='.repeat(60));
  console.log('DATABASE STATE CHECK');
  console.log('='.repeat(60));
  
  // Get all accounts
  const accounts = await prisma.account.findMany({
    include: {
      agent: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
  
  console.log('\nAll Accounts:');
  let totalBalance = 0;
  accounts.forEach((acc, i) => {
    const balance = parseFloat(acc.balance.toString());
    totalBalance += balance;
    console.log(`${i + 1}. ${acc.agent?.name || 'Unknown'} (${acc.id})`);
    console.log(`   Balance: $${balance.toFixed(2)}`);
    console.log(`   Status: ${acc.status}`);
    console.log(`   Account Number: ${acc.accountNumber}`);
  });
  
  console.log(`\nTotal Balance Across All Accounts: $${totalBalance.toFixed(2)}`);
  
  // Get recent transactions
  const transactions = await prisma.transaction.findMany({
    orderBy: {
      createdAt: 'desc'
    },
    take: 10,
    include: {
      fromAccount: {
        include: {
          agent: true
        }
      },
      toAccount: {
        include: {
          agent: true
        }
      }
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('RECENT TRANSACTIONS (Last 10):');
  console.log('='.repeat(60));
  
  transactions.forEach((tx, i) => {
    console.log(`\n${i + 1}. Transaction ID: ${tx.id}`);
    console.log(`   Amount: $${tx.amount.toString()}`);
    console.log(`   Type: ${tx.type}`);
    console.log(`   Status: ${tx.status}`);
    console.log(`   From: ${tx.fromAccount?.agent?.name || 'Unknown'} (${tx.fromAccountId})`);
    console.log(`   To: ${tx.toAccount?.agent?.name || tx.merchantName || 'External'} (${tx.toAccountId || 'N/A'})`);
    console.log(`   Description: ${tx.description || 'None'}`);
    console.log(`   Approval Required: ${tx.approvalRequired}`);
    console.log(`   Created: ${tx.createdAt.toISOString()}`);
  });
  
  // Look for the $500 transaction specifically
  console.log('\n' + '='.repeat(60));
  console.log('LOOKING FOR $500 TRANSACTION:');
  console.log('='.repeat(60));
  
  const fiveHundredTx = transactions.find(tx => tx.amount.toString() === '500');
  if (fiveHundredTx) {
    console.log('\n✅ Found $500 transaction:');
    console.log(`   ID: ${fiveHundredTx.id}`);
    console.log(`   Type: ${fiveHundredTx.type}`);
    console.log(`   Status: ${fiveHundredTx.status}`);
    console.log(`   From Account ID: ${fiveHundredTx.fromAccountId}`);
    console.log(`   To Account ID: ${fiveHundredTx.toAccountId || 'NULL'}`);
    console.log(`   Merchant Name: ${fiveHundredTx.merchantName || 'NULL'}`);
    
    if (fiveHundredTx.type === 'INTERNAL' && fiveHundredTx.toAccountId) {
      console.log('\n   This is an INTERNAL transfer.');
      console.log('   Both accounts should have been updated.');
    } else if (fiveHundredTx.type === 'OUTBOUND') {
      console.log('\n   This is an OUTBOUND payment to a merchant.');
      console.log('   Only the sender account should have been debited.');
      console.log('   ⚠️ This would explain the missing $500!');
    }
  } else {
    console.log('\n❌ No $500 transaction found in recent transactions');
  }
  
  await prisma.$disconnect();
}

checkState().catch(console.error);
