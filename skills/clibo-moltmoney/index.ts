/**
 * MoltMoney Skill for REDACTED-AGENT Agent
 * 
 * This skill enables REDACTED-AGENT to perform banking operations through MoltMoney.
 */

interface MoltMoneyConfig {
  apiUrl: string;
  apiKey: string;
  accountId: string;
}

interface Transaction {
  id: string;
  amount: string;
  type: string;
  status: string;
  description?: string;
  merchantName?: string;
  createdAt: string;
}

interface BalanceResponse {
  accountId: string;
  balance: string;
  currency: string;
  status: string;
}

interface PaymentResponse {
  transaction: {
    id: string;
    amount: string;
    type: string;
    status: string;
    approvalRequired: boolean;
  };
}

interface PaymentRequestResponse {
  id: string;
  amount: string;
  description: string;
  status: string;
}

interface TransactionListResponse {
  data: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

export class REDACTED-AGENTMoltMoneySkill {
  private config: MoltMoneyConfig;

  constructor(config: MoltMoneyConfig) {
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.apiUrl) {
      throw new Error('API_URL is required in skill configuration');
    }
    if (!this.config.apiKey) {
      throw new Error('API_KEY is required in skill configuration');
    }
    if (!this.config.accountId) {
      throw new Error('ACCOUNT_ID is required in skill configuration');
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.apiUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'ngrok-skip-browser-warning': 'true',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(
          errorData.error?.message || 
          `API request failed with status ${response.status}`
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
          throw new Error('Unable to connect to MoltMoney API. Please try again later.');
        }
        if (error.message.includes('401') || error.message.includes('UNAUTHORIZED')) {
          throw new Error('Invalid API key. Please check your configuration.');
        }
        if (error.message.includes('429')) {
          throw new Error('Too many requests. Please wait a moment and try again.');
        }
        throw error;
      }
      throw new Error('An unexpected error occurred');
    }
  }

  async checkBalance(): Promise<string> {
    try {
      const response = await this.makeRequest<BalanceResponse>(
        `/accounts/${this.config.accountId}/balance`
      );

      const balance = parseFloat(response.balance).toFixed(2);
      
      if (response.status === 'FROZEN') {
        return `Your account is frozen. Balance: $${balance}`;
      }
      
      if (response.status === 'CLOSED') {
        return `Your account is closed. Balance: $${balance}`;
      }
      
      return `You have $${balance} available`;
    } catch (error) {
      if (error instanceof Error) {
        return `Error checking balance: ${error.message}`;
      }
      return 'Error checking balance: An unexpected error occurred';
    }
  }

  async makePayment(
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
        fromAccountId: this.config.accountId,
        amount: amount.toFixed(2),
        description: description || `Payment to ${recipient}`,
      };

      if (isAccountId) {
        payload.toAccountId = recipient;
      } else {
        payload.merchantName = recipient;
      }

      const response = await this.makeRequest<PaymentResponse>(
        '/payments/send',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      const formattedAmount = parseFloat(response.transaction.amount).toFixed(2);

      if (response.transaction.approvalRequired) {
        return `Payment of $${formattedAmount} to ${recipient} requires owner approval`;
      }

      if (response.transaction.status === 'COMPLETED') {
        return `Payment of $${formattedAmount} to ${recipient} completed successfully`;
      }

      if (response.transaction.status === 'PENDING') {
        return `Payment of $${formattedAmount} to ${recipient} is pending`;
      }

      return `Payment of $${formattedAmount} to ${recipient} is ${response.transaction.status.toLowerCase()}`;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes('insufficient')) {
          return `Payment failed: insufficient balance`;
        }
        if (error.message.toLowerCase().includes('frozen')) {
          return 'Payment failed: account is frozen. Please contact your owner.';
        }
        if (error.message.toLowerCase().includes('closed')) {
          return 'Payment failed: account is closed. Please contact your owner.';
        }
        return `Payment failed: ${error.message}`;
      }
      return 'Payment failed: An unexpected error occurred';
    }
  }

  async listTransactions(limit: number = 10): Promise<string> {
    try {
      const cappedLimit = Math.min(Math.max(1, limit), 50);

      const response = await this.makeRequest<TransactionListResponse>(
        `/transactions?accountId=${this.config.accountId}&pageSize=${cappedLimit}&page=1`
      );

      if (response.data.length === 0) {
        return 'No transactions found';
      }

      const lines = ['Recent transactions:'];
      
      response.data.forEach((tx, index) => {
        const amount = parseFloat(tx.amount);
        const sign = tx.type === 'INBOUND' ? '+' : '-';
        const formattedAmount = `${sign}$${Math.abs(amount).toFixed(2)}`;
        
        let recipient = '';
        if (tx.merchantName) {
          recipient = ` to ${tx.merchantName}`;
        } else if (tx.type === 'INBOUND') {
          recipient = ' from Owner';
        } else if (tx.type === 'INTERNAL') {
          recipient = ' (internal transfer)';
        }

        const desc = tx.description ? ` - ${tx.description}` : '';
        
        lines.push(
          `${index + 1}. ${formattedAmount}${recipient} (${tx.status})${desc}`
        );
      });

      return lines.join('\n');
    } catch (error) {
      if (error instanceof Error) {
        return `Error listing transactions: ${error.message}`;
      }
      return 'Error listing transactions: An unexpected error occurred';
    }
  }

  async requestFunds(amount: number, reason: string): Promise<string> {
    try {
      if (amount <= 0) {
        return 'Invalid amount. Please provide a positive number.';
      }

      if (!reason || reason.trim().length === 0) {
        return 'Please provide a reason for the fund request.';
      }

      const payload = {
        fromAccountId: this.config.accountId,
        amount: amount.toFixed(2),
        description: `Fund request: ${reason}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await this.makeRequest<PaymentRequestResponse>(
        '/payments/request',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      const formattedAmount = parseFloat(response.amount).toFixed(2);

      return `Fund request for $${formattedAmount} sent to owner. Reason: ${reason}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Fund request failed: ${error.message}`;
      }
      return 'Fund request failed: An unexpected error occurred';
    }
  }
}

// Initialize with REDACTED-AGENT's credentials
export function initializeSkill(): REDACTED-AGENTMoltMoneySkill {
  const config: MoltMoneyConfig = {
    apiUrl: process.env.MOLTMONEY_API_URL || 'https://REDACTED-NGROK-HOST',
    apiKey: process.env.MOLTMONEY_API_KEY || 'REDACTED-ROTATED-KEY',
    accountId: process.env.MOLTMONEY_ACCOUNT_ID || 'REDACTED-ACCOUNT-ID',
  };

  return new REDACTED-AGENTMoltMoneySkill(config);
}

let skillInstance: REDACTED-AGENTMoltMoneySkill | null = null;

function getSkillInstance(): REDACTED-AGENTMoltMoneySkill {
  if (!skillInstance) {
    skillInstance = initializeSkill();
  }
  return skillInstance;
}

// Exported functions for ClawNow to use
export async function check_balance(): Promise<string> {
  return getSkillInstance().checkBalance();
}

export async function make_payment(
  amount: number,
  recipient: string,
  description?: string
): Promise<string> {
  return getSkillInstance().makePayment(amount, recipient, description);
}

export async function list_transactions(limit?: number): Promise<string> {
  return getSkillInstance().listTransactions(limit);
}

export async function request_funds(
  amount: number,
  reason: string
): Promise<string> {
  return getSkillInstance().requestFunds(amount, reason);
}
