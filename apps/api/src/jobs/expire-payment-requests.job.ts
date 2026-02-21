import { PrismaClient, RequestStatus } from '@moltmoney/database';

/**
 * Background job to expire payment requests
 * Requirements: 8.4
 * 
 * This job runs hourly to update expired payment requests
 * (expiresAt < now) to EXPIRED status
 */
export class ExpirePaymentRequestsJob {
  constructor(private prisma: PrismaClient) {}

  /**
   * Execute the job to expire payment requests
   * Returns the number of requests that were expired
   */
  async execute(): Promise<number> {
    const now = new Date();

    // Update all pending requests that have expired
    const result = await this.prisma.paymentRequest.updateMany({
      where: {
        status: RequestStatus.PENDING,
        expiresAt: {
          lt: now,
        },
      },
      data: {
        status: RequestStatus.EXPIRED,
      },
    });

    return result.count;
  }

  /**
   * Start the job to run hourly
   * Returns an interval ID that can be used to stop the job
   */
  startHourly(): NodeJS.Timeout {
    // Run immediately on start
    this.execute().catch((error) => {
      console.error('Error expiring payment requests:', error);
    });

    // Then run every hour (3600000 ms)
    const intervalId = setInterval(() => {
      this.execute()
        .then((count) => {
          if (count > 0) {
            console.log(`Expired ${count} payment request(s)`);
          }
        })
        .catch((error) => {
          console.error('Error expiring payment requests:', error);
        });
    }, 3600000); // 1 hour in milliseconds

    return intervalId;
  }

  /**
   * Stop the job
   */
  static stop(intervalId: NodeJS.Timeout): void {
    clearInterval(intervalId);
  }
}
