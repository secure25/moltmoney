/**
 * AgentBank Skill - OpenClaw Integration
 * 
 * This skill enables AI agents to perform banking operations through the
 * AI Agent Banking Platform API.
 */

interface SkillConfig {
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
  request: {
    id: string;
    amount: string;
    description: string;
    status: string;
  };
}

interface TransactionListResponse {
  data: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

interface VirtualCard {
  id: string;
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  status: string;
  spendLimit?: string;
  accountId: string;
  createdAt: string;
}

interface CardListResponse {
  cards: VirtualCard[];
}

interface PayoutResponse {
  transaction: {
    id: string;
    amount: string;
    type: string;
    status: string;
    recipientName: string;
    recipientAccount: string;
    approvalRequired: boolean;
  };
}

export class AgentBankSkill {
  private config: SkillConfig;

  constructor(config: SkillConfig) {
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
          throw new Error('Unable to connect to AgentBank API. Please try again later.');
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
        return `Payment of $${formattedAmount} to ${recipient} completed`;
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

      const formattedAmount = parseFloat(response.request.amount).toFixed(2);

      return `Fund request for $${formattedAmount} sent to owner. Reason: ${reason}`;
    } catch (error) {
      if (error instanceof Error) {
        return `Fund request failed: ${error.message}`;
      }
      return 'Fund request failed: An unexpected error occurred';
    }
  }

  async sendPayout(
    routingNumber: string,
    accountNumber: string,
    accountHolder: string,
    amount: number,
    description?: string
  ): Promise<string> {
    try {
      if (amount <= 0) {
        return 'Invalid amount. Please provide a positive number.';
      }

      if (!routingNumber || !/^[0-9]{9}$/.test(routingNumber)) {
        return 'Invalid routing number. Must be exactly 9 digits.';
      }

      if (!accountNumber || !/^[0-9]{8,17}$/.test(accountNumber)) {
        return 'Invalid account number. Must be 8-17 digits.';
      }

      if (!accountHolder || accountHolder.trim().length < 2) {
        return 'Invalid account holder name. Must be at least 2 characters.';
      }

      const payload = {
        fromAccountId: this.config.accountId,
        routingNumber,
        accountNumber,
        accountHolder: accountHolder.trim(),
        amount: amount.toFixed(2),
        description: description || `Payout to ${accountHolder}`,
      };

      const response = await this.makeRequest<PayoutResponse>(
        '/payments/payout',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      const formattedAmount = parseFloat(response.transaction.amount).toFixed(2);
      const maskedAccount = response.transaction.recipientAccount;

      if (response.transaction.approvalRequired) {
        return `Payout of ${formattedAmount} to ${response.transaction.recipientName} (${maskedAccount}) requires owner approval`;
      }

      if (response.transaction.status === 'COMPLETED') {
        return `Payout of ${formattedAmount} to ${response.transaction.recipientName} (${maskedAccount}) completed`;
      }

      if (response.transaction.status === 'PENDING') {
        return `Payout of ${formattedAmount} to ${response.transaction.recipientName} (${maskedAccount}) is pending`;
      }

      return `Payout of ${formattedAmount} to ${response.transaction.recipientName} (${maskedAccount}) is ${response.transaction.status.toLowerCase()}`;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.toLowerCase().includes('insufficient')) {
          return `Payout failed: insufficient balance`;
        }
        if (error.message.toLowerCase().includes('frozen')) {
          return 'Payout failed: account is frozen. Please contact your owner.';
        }
        if (error.message.toLowerCase().includes('closed')) {
          return 'Payout failed: account is closed. Please contact your owner.';
        }
        if (error.message.toLowerCase().includes('account not found')) {
          return 'Payout failed: external bank account not found';
        }
        return `Payout failed: ${error.message}`;
      }
      return 'Payout failed: An unexpected error occurred';
    }
  }
}

export function initializeSkill(): AgentBankSkill {
  const config: SkillConfig = {
    apiUrl: process.env.API_URL || '',
    apiKey: process.env.API_KEY || '',
    accountId: process.env.ACCOUNT_ID || '',
  };

  return new AgentBankSkill(config);
}

let skillInstance: AgentBankSkill | null = null;

function getSkillInstance(): AgentBankSkill {
  if (!skillInstance) {
    skillInstance = initializeSkill();
  }
  return skillInstance;
}

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

export async function send_payout(
  routingNumber: string,
  accountNumber: string,
  accountHolder: string,
  amount: number,
  description?: string
): Promise<string> {
  return getSkillInstance().sendPayout(
    routingNumber,
    accountNumber,
    accountHolder,
    amount,
    description
  );
}
