import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimitMiddleware } from './rate-limit.middleware';

describe('RateLimitMiddleware', () => {
  let rateLimiter: RateLimitMiddleware;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let sendSpy: ReturnType<typeof vi.fn>;
  let codeSpy: ReturnType<typeof vi.fn>;
  let headerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create rate limiter with default config (5 attempts per 15 minutes)
    rateLimiter = new RateLimitMiddleware();

    // Setup mock reply
    sendSpy = vi.fn();
    codeSpy = vi.fn().mockReturnValue({ send: sendSpy });
    headerSpy = vi.fn().mockReturnThis();

    mockReply = {
      code: codeSpy,
      header: headerSpy,
    } as unknown as Partial<FastifyReply>;
  });

  afterEach(() => {
    rateLimiter.clear();
  });

  describe('IP address extraction', () => {
    it('should extract IP from request.ip', async () => {
      mockRequest = {
        ip: '192.168.1.1',
        headers: {},
      } as FastifyRequest;

      await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
      expect(codeSpy).not.toHaveBeenCalled();
    });

    it('should extract IP from X-Forwarded-For header', async () => {
      mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'x-forwarded-for': '203.0.113.1, 198.51.100.1',
        },
      } as unknown as FastifyRequest;

      await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(rateLimiter.getAttempts('203.0.113.1')).toBe(1);
    });

    it('should extract IP from X-Real-IP header', async () => {
      mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'x-real-ip': '203.0.113.5',
        },
      } as unknown as FastifyRequest;

      await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(rateLimiter.getAttempts('203.0.113.5')).toBe(1);
    });
  });

  describe('Rate limiting', () => {
    it('should allow requests within the limit', async () => {
      mockRequest = {
        ip: '192.168.1.100',
        headers: {},
      } as FastifyRequest;

      // Make 5 requests (at the limit)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      // Should not have returned 429
      expect(codeSpy).not.toHaveBeenCalledWith(429);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should block requests exceeding the limit', async () => {
      mockRequest = {
        ip: '192.168.1.101',
        headers: {},
      } as FastifyRequest;

      // Make 5 requests (at the limit)
      for (let i = 0; i < 5; i++) {
        await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      // 6th request should be blocked
      await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(429);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many attempts. Please try again later.',
          }),
        })
      );
    });

    it('should return retry-after in error response', async () => {
      mockRequest = {
        ip: '192.168.1.102',
        headers: {},
      } as FastifyRequest;

      // Exceed the limit
      for (let i = 0; i < 6; i++) {
        await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      const errorResponse = sendSpy.mock.calls[0][0];
      expect(errorResponse.error.retryAfter).toBeGreaterThan(0);
      expect(errorResponse.error.retryAfter).toBeLessThanOrEqual(15 * 60); // 15 minutes in seconds
    });

    it('should include rate limit headers', async () => {
      mockRequest = {
        ip: '192.168.1.103',
        headers: {},
      } as FastifyRequest;

      await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should track attempts independently per IP', async () => {
      const ip1Request = {
        ip: '192.168.1.104',
        headers: {},
      } as FastifyRequest;

      const ip2Request = {
        ip: '192.168.1.105',
        headers: {},
      } as FastifyRequest;

      // Make 3 requests from IP1
      for (let i = 0; i < 3; i++) {
        await rateLimiter.limit(ip1Request, mockReply as FastifyReply);
      }

      // Make 2 requests from IP2
      for (let i = 0; i < 2; i++) {
        await rateLimiter.limit(ip2Request, mockReply as FastifyReply);
      }

      expect(rateLimiter.getAttempts('192.168.1.104')).toBe(3);
      expect(rateLimiter.getAttempts('192.168.1.105')).toBe(2);
    });
  });

  describe('Window reset', () => {
    it('should reset attempts after window expires', async () => {
      // Create rate limiter with short window for testing
      const shortWindowLimiter = new RateLimitMiddleware({
        maxAttempts: 2,
        windowMs: 100, // 100ms window
      });

      mockRequest = {
        ip: '192.168.1.106',
        headers: {},
      } as FastifyRequest;

      // Make 2 requests (at limit)
      await shortWindowLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await shortWindowLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be able to make requests again
      await shortWindowLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).not.toHaveBeenCalledWith(429);
      shortWindowLimiter.clear();
    });
  });

  describe('Utility methods', () => {
    it('should reset rate limit for specific IP', async () => {
      mockRequest = {
        ip: '192.168.1.107',
        headers: {},
      } as FastifyRequest;

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        await rateLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      expect(rateLimiter.getAttempts('192.168.1.107')).toBe(5);

      // Reset
      rateLimiter.reset('192.168.1.107');

      expect(rateLimiter.getAttempts('192.168.1.107')).toBe(0);
    });

    it('should clear all rate limits', async () => {
      const ip1Request = {
        ip: '192.168.1.108',
        headers: {},
      } as FastifyRequest;

      const ip2Request = {
        ip: '192.168.1.109',
        headers: {},
      } as FastifyRequest;

      await rateLimiter.limit(ip1Request, mockReply as FastifyReply);
      await rateLimiter.limit(ip2Request, mockReply as FastifyReply);

      rateLimiter.clear();

      expect(rateLimiter.getAttempts('192.168.1.108')).toBe(0);
      expect(rateLimiter.getAttempts('192.168.1.109')).toBe(0);
    });
  });

  describe('Custom configuration', () => {
    it('should respect custom max attempts', async () => {
      const customLimiter = new RateLimitMiddleware({
        maxAttempts: 3,
        windowMs: 15 * 60 * 1000,
      });

      mockRequest = {
        ip: '192.168.1.110',
        headers: {},
      } as FastifyRequest;

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        await customLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }

      // 4th request should be blocked
      await customLimiter.limit(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(codeSpy).toHaveBeenCalledWith(429);
      customLimiter.clear();
    });
  });
});
