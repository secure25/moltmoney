import { PrismaClient, Transaction as PrismaTransaction } from '@moltmoney/database';
import Decimal from 'decimal.js';
import { Transaction, TxType, TxStatus } from '@moltmoney/shared';

export interface TransactionFilters {
  startDate?: Date;
  endDate?: Date;
  type?: TxType;
  status?: TxStatus;
  minAmount?: Decimal;
  maxAmount?: Decimal;
  merchantName?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export class TransactionService {
  constructor(private prisma: PrismaClient) {}

  async listTransactions(
    accountId: string,
    filters: TransactionFilters = {}
  ): Promise<PaginatedResult<Transaction>> {
    const {
      startDate,
      endDate,
      type,
      status,
      minAmount,
      maxAmount,
      merchantName,
      page = 1,
      pageSize = 50,
    } = filters;

    // Enforce max page size
    const effectivePageSize = Math.min(pageSize, 200);
    const skip = (page - 1) * effectivePageSize;

    // Build where clause
    const where: any = {
      OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
    };

    if (startDate) {
      where.createdAt = { ...where.createdAt, gte: startDate };
    }

    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: endDate };
    }

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (minAmount) {
      where.amount = { ...where.amount, gte: minAmount };
    }

    if (maxAmount) {
      where.amount = { ...where.amount, lte: maxAmount };
    }

    if (merchantName) {
      where.merchantName = { contains: merchantName, mode: 'insensitive' };
    }

    // Execute query with pagination
    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: effectivePageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    // Convert to domain model
    const data = transactions.map(this.toDomainModel);

    return {
      data,
      total,
      page,
      pageSize: effectivePageSize,
      hasMore: skip + transactions.length < total,
    };
  }

  async getTransaction(transactionId: string): Promise<Transaction> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    return this.toDomainModel(transaction);
  }

  async exportTransactions(
    accountId: string,
    filters: TransactionFilters = {},
    format: 'csv' | 'json' = 'json'
  ): Promise<string> {
    // Get all transactions without pagination for export
    const where: any = {
      OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
    };

    const { startDate, endDate, type, status, minAmount, maxAmount, merchantName } = filters;

    if (startDate) {
      where.createdAt = { ...where.createdAt, gte: startDate };
    }

    if (endDate) {
      where.createdAt = { ...where.createdAt, lte: endDate };
    }

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (minAmount) {
      where.amount = { ...where.amount, gte: minAmount };
    }

    if (maxAmount) {
      where.amount = { ...where.amount, lte: maxAmount };
    }

    if (merchantName) {
      where.merchantName = { contains: merchantName, mode: 'insensitive' };
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const data = transactions.map(this.toDomainModel);

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      return this.toCSV(data);
    }
  }

  private toDomainModel(transaction: PrismaTransaction): Transaction {
    return {
      id: transaction.id,
      amount: new Decimal(transaction.amount.toString()),
      currency: transaction.currency,
      type: transaction.type as TxType,
      status: transaction.status as TxStatus,
      description: transaction.description,
      merchantName: transaction.merchantName,
      fromAccountId: transaction.fromAccountId,
      toAccountId: transaction.toAccountId,
      approvalRequired: transaction.approvalRequired,
      approvedAt: transaction.approvedAt,
      createdAt: transaction.createdAt,
    };
  }

  private toCSV(transactions: Transaction[]): string {
    if (transactions.length === 0) {
      return '';
    }

    // CSV header
    const headers = [
      'ID',
      'Amount',
      'Currency',
      'Type',
      'Status',
      'Description',
      'Merchant Name',
      'From Account ID',
      'To Account ID',
      'Approval Required',
      'Approved At',
      'Created At',
    ];

    const rows = transactions.map((tx) => [
      tx.id,
      tx.amount.toString(),
      tx.currency,
      tx.type,
      tx.status,
      this.escapeCSV(tx.description || ''),
      this.escapeCSV(tx.merchantName || ''),
      tx.fromAccountId,
      tx.toAccountId || '',
      tx.approvalRequired.toString(),
      tx.approvedAt ? tx.approvedAt.toISOString() : '',
      tx.createdAt.toISOString(),
    ]);

    const csvLines = [headers, ...rows].map((row) => row.join(','));

    return csvLines.join('\n');
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
