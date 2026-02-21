/**
 * SIMPLIFIED MoltMoney Skill for REDACTED-AGENT
 * 
 * This is a simplified version that explicitly shows how to call the API.
 * REDACTED-AGENT should call these functions, NOT make direct HTTP requests.
 */

const MOLTMONEY_CONFIG = {
  apiUrl: 'https://REDACTED-NGROK-HOST',
  apiKey: 'REDACTED-ROTATED-KEY',
  accountId: 'REDACTED-ACCOUNT-ID'
};

/**
 * Helper function to make API requests
 */
async function callMoltMoneyAPI(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const url = `${MOLTMONEY_CONFIG.apiUrl}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MOLTMONEY_CONFIG.apiKey}`,
      'ngrok-skip-browser-warning': 'true'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API error: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Function 1: Check Balance
 * 
 * IMPORTANT: This calls /accounts/{accountId}/balance
 * NOT /balance or /balance/{id}
 */
export async function check_balance(): Promise<string> {
  try {
    const endpoint = `/accounts/${MOLTMONEY_CONFIG.accountId}/balance`;
    const data = await callMoltMoneyAPI(endpoint);
    
    const balance = parseFloat(data.balance).toFixed(2);
    
    if (data.status === 'FROZEN') {
      return `Your account is frozen. Balance: $${balance}`;
    }
    if (data.status === 'CLOSED') {
      return `Your account is closed. Balance: $${balance}`;
    }
    
    return `You have $${balance} available`;
  } catch (error: any) {
    return `Error checking balance: ${error.message}`;
  }
}

/**
 * Function 2: Make Payment
 * 
 * IMPORTANT: This calls /payments/send
 * NOT /payment or /pay
 */
export async function make_payment(
  amount: number,
  recipient: string,
  description?: string
): Promise<string> {
  try {
    if (amount <= 0) {
      return 'Invalid amount. Please provide a positive number.';
    }
    
    const isAccountId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient);
    
    const payload: any = {
      fromAccountId: MOLTMONEY_CONFIG.accountId,
      amount: amount.toFixed(2),
      description: description || `Payment to ${recipient}`
    };
    
    if (isAccountId) {
      payload.toAccountId = recipient;
    } else {
      payload.merchantName = recipient;
    }
    
    const data = await callMoltMoneyAPI('/payments/send', 'POST', payload);
    
    const formattedAmount = parseFloat(data.transaction.amount).toFixed(2);
    
    if (data.transaction.approvalRequired) {
      return `Payment of $${formattedAmount} to ${recipient} requires owner approval`;
    }
    
    if (data.transaction.status === 'COMPLETED') {
      return `Payment of $${formattedAmount} to ${recipient} completed successfully`;
    }
    
    return `Payment of $${formattedAmount} to ${recipient} is ${data.transaction.status.toLowerCase()}`;
  } catch (error: any) {
    if (error.message.toLowerCase().includes('insufficient')) {
      return 'Payment failed: insufficient balance';
    }
    return `Payment failed: ${error.message}`;
  }
}

/**
 * Function 3: List Transactions
 * 
 * IMPORTANT: This calls /transactions?accountId={id}&pageSize={limit}&page=1
 * NOT /transactions/{id} or /account/transactions
 */
export async function list_transactions(limit: number = 10): Promise<string> {
  try {
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const endpoint = `/transactions?accountId=${MOLTMONEY_CONFIG.accountId}&pageSize=${cappedLimit}&page=1`;
    
    const data = await callMoltMoneyAPI(endpoint);
    
    if (data.data.length === 0) {
      return 'No transactions found';
    }
    
    const lines = ['Recent transactions:'];
    
    data.data.forEach((tx: any, index: number) => {
      const amount = parseFloat(tx.amount);
      const sign = tx.type === 'INBOUND' ? '+' : '-';
      const formattedAmount = `${sign}$${Math.abs(amount).toFixed(2)}`;
      
      let recipient = '';
      if (tx.merchantName) {
        recipient = ` to ${tx.merchantName}`;
      } else if (tx.type === 'INBOUND') {
        recipient = ' from Owner';
      }
      
      const desc = tx.description ? ` - ${tx.description}` : '';
      lines.push(`${index + 1}. ${formattedAmount}${recipient} (${tx.status})${desc}`);
    });
    
    return lines.join('\n');
  } catch (error: any) {
    return `Error listing transactions: ${error.message}`;
  }
}

/**
 * Function 4: Request Funds
 * 
 * IMPORTANT: This calls /payments/request
 * NOT /request or /fund-request
 */
export async function request_funds(amount: number, reason: string): Promise<string> {
  try {
    if (amount <= 0) {
      return 'Invalid amount. Please provide a positive number.';
    }
    
    if (!reason || reason.trim().length === 0) {
      return 'Please provide a reason for the fund request.';
    }
    
    const payload = {
      fromAccountId: MOLTMONEY_CONFIG.accountId,
      amount: amount.toFixed(2),
      description: `Fund request: ${reason}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    const data = await callMoltMoneyAPI('/payments/request', 'POST', payload);
    
    const formattedAmount = parseFloat(data.amount).toFixed(2);
    return `Fund request for $${formattedAmount} sent to owner. Reason: ${reason}`;
  } catch (error: any) {
    return `Fund request failed: ${error.message}`;
  }
}

// Export all functions
export default {
  check_balance,
  make_payment,
  list_transactions,
  request_funds
};
