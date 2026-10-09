import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, Owner } from '@moltmoney/database';

const SALT_ROUNDS = 12;
const JWT_EXPIRATION = '24h';

// JWT secret should be loaded from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';

export interface JWTPayload {
  ownerId: string;
  email: string;
}

export class OwnerAuthService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Register a new owner with hashed password
   * Requirements: 1.1, 1.4
   */
  async registerOwner(email: string, name: string, password: string): Promise<Owner> {
    // Hash password with bcrypt (12 salt rounds)
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create owner in database
    const owner = await this.prisma.owner.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    return owner;
  }

  /**
   * Authenticate owner and return JWT token
   * Requirements: 1.2
   */
  async loginOwner(email: string, password: string): Promise<{ token: string; owner: Owner }> {
    // Find owner by email
    const owner = await this.prisma.owner.findUnique({
      where: { email },
    });

    if (!owner) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, owner.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Generate JWT token (HS256, 24h expiration)
    const payload: JWTPayload = {
      ownerId: owner.id,
      email: owner.email,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRATION,
    });

    return { token, owner };
  }

  /**
   * Verify JWT token and return owner
   * Requirements: 1.3
   */
  async verifyOwnerToken(token: string): Promise<Owner> {
    try {
      // Verify and decode JWT token
      const payload = jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
      }) as JWTPayload;

      // Fetch owner from database
      const owner = await this.prisma.owner.findUnique({
        where: { id: payload.ownerId },
      });

      if (!owner) {
        throw new Error('Owner not found');
      }

      return owner;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token expired');
      }
      throw error;
    }
  }
}
