// Check what agents exist in the database
const API_URL = "http://127.0.0.1:3000";

async function checkAgents() {
  console.log('Checking agents in database...\n');
  
  try {
    // First, we need to login to get a token
    console.log('Please provide your owner credentials:');
    console.log('Email: (enter in terminal)');
    console.log('Password: (enter in terminal)');
    console.log('\nOr check the dashboard at http://localhost:3001/dashboard');
    console.log('to see your agents and their details.\n');
    
    console.log('The issue is that your agent\'s API key has changed after database reset.');
    console.log('You need to:');
    console.log('1. Go to the agent detail page in the dashboard');
    console.log('2. Copy the new API key and Account ID');
    console.log('3. Update your OpenClaw agent skill with the new credentials');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAgents();
