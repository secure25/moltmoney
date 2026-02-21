// Script to get agent credentials from database
const { PrismaClient } = require('@moltmoney/database');

async function getCredentials() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Fetching agent credentials...\n');
    
    // Get all agents with their accounts
    const agents = await prisma.agent.findMany({
      include: {
        account: true,
        owner: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (agents.length === 0) {
      console.log('No agents found in database.');
      console.log('\nYou need to:');
      console.log('1. Start the dashboard: cd apps/dashboard && npm run dev');
      console.log('2. Register an owner account');
      console.log('3. Create an agent');
      return;
    }

    console.log(`Found ${agents.length} agent(s):\n`);
    
    agents.forEach((agent, index) => {
      console.log(`Agent ${index + 1}: ${agent.name}`);
      console.log(`  Owner: ${agent.owner.email}`);
      console.log(`  Agent ID: ${agent.id}`);
      console.log(`  Account ID: ${agent.account?.id || 'No account'}`);
      console.log(`  API Key (raw): ${agent.apiKeyRaw || 'Not available (already used)'}`);
      console.log(`  API Key (hashed): ${agent.apiKey}`);
      console.log(`  Status: ${agent.account?.status || 'No account'}`);
      console.log(`  Balance: $${agent.account?.balance || '0.00'}`);
      console.log();
    });

    console.log('Note: The raw API key is only shown once when the agent is created.');
    console.log('If you don\'t see it above, you\'ll need to create a new agent.');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

getCredentials();
