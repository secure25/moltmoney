import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

/**
 * Rate limit entry tracking attempts and timestamps
 */
interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

/**
 * Rate limiting middleware using in-memory store
 * Requirements: 14.4
 */
export class RateLimitMiddleware {
  private store: Map<string, RateLimitEntry>;
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.store = new Map();
    this.config = {
      maxAttempts: config?.maxAttempts ?? 5,
      windowMs: config?.windowMs ?? 15 * 60 * 1000, // 15 minutes
    };

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Rate limit middleware for authentication endpoints
   * Tracks attempts by IP address
   * Returns 429 status when limit exceeded
   */
  limit = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const ip = this.getClientIp(request);
    const now = Date.now();

    // Get or create rate limit entry for this IP
    let entry = this.store.get(ip);

    // If no entry exists or the window has expired, create a new one
    if (!entry || now >= entry.resetAt) {
      entry = {
        attempts: 0,
        resetAt: now + this.config.windowMs,
      };
      this.store.set(ip, entry);
    }

    // Increment attempt count
    entry.attempts++;

    // Check if limit exceeded
    if (entry.attempts > this.config.maxAttempts) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      
      reply.code(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many attempts. Please try again later.',
          retryAfter,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', this.config.maxAttempts.toString());
    reply.header('X-RateLimit-Remaining', (this.config.maxAttempts - entry.attempts).toString());
    reply.header('X-RateLimit-Reset', new Date(entry.resetAt).toISOString());
  };

  /**
   * Extract client IP address from request
   * Checks X-Forwarded-For header first (for proxies), then falls back to socket IP
   */
  private getClientIp(request: FastifyRequest): string {
    // Check X-Forwarded-For header (for proxies/load balancers)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      return ips.split(',')[0].trim();
    }

    // Check X-Real-IP header
    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to socket IP
    return request.ip || 'unknown';
  }

  /**
   * Clean up expired entries from the store
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [ip, entry] of this.store.entries()) {
      if (now >= entry.resetAt) {
        this.store.delete(ip);
      }
    }
  }

  /**
   * Reset rate limit for a specific IP (useful for testing)
   */
  reset(ip: string): void {
    this.store.delete(ip);
  }

  /**
   * Clear all rate limit entries (useful for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get current attempt count for an IP (useful for testing)
   */
  getAttempts(ip: string): number {
    const entry = this.store.get(ip);
    return entry ? entry.attempts : 0;
  }
}

/**
 * Create a rate limiter middleware function
 * @param maxAttempts Maximum number of attempts allowed
 * @param windowMs Time window in milliseconds
 */
export function createRateLimiter(maxAttempts: number, windowMs: number) {
  const rateLimiter = new RateLimitMiddleware({ maxAttempts, windowMs });
  return rateLimiter.limit;
}
