// Script to create a test agent with known credentials
const { PrismaClient } = require('@moltmoney/database');
const crypto = require('crypto');

async function createTestAgent() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Creating test agent...\n');
    
    // First, find or create an owner
    let owner = await prisma.owner.findFirst();
    
    if (!owner) {
      console.log('No owner found. Creating test owner...');
      const hashedPassword = crypto.createHash('sha256').update('password123').digest('hex');
      owner = await prisma.owner.create({
        data: {
          email: 'testowner@example.com',
          password: hashedPassword,
          name: 'Test Owner',
        },
      });
      console.log(`Created owner: ${owner.email}\n`);
    } else {
      console.log(`Using existing owner: ${owner.email}\n`);
    }

    // Generate a new API key
    const rawApiKey = crypto.randomBytes(32).toString('hex');
    const hashedApiKey = crypto.createHash('sha256').update(rawApiKey).digest('hex');

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        name: 'Test Agent for Approvals',
        apiKey: hashedApiKey,
        ownerId: owner.id,
        platform: 'CUSTOM', // Add required platform field
      },
    });

    // Create account for agent
    const account = await prisma.account.create({
      data: {
        balance: 1000.00,
        currency: 'USD',
        status: 'ACTIVE',
        type: 'AGENT', // Add required type field
        agentId: agent.id,
      },
    });

    console.log('✓ Test agent created successfully!\n');
    console.log('='.repeat(60));
    console.log('CREDENTIALS - SAVE THESE!');
    console.log('='.repeat(60));
    console.log(`Agent ID: ${agent.id}`);
    console.log(`Account ID: ${account.id}`);
    console.log(`API Key (RAW - use this): ${rawApiKey}`);
    console.log(`API Key (hashed): ${hashedApiKey}`);
    console.log('='.repeat(60));
    console.log('\nUpdate your test scripts with these credentials.');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestAgent();
