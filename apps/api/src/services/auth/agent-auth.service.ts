import crypto from 'crypto';
import { PrismaClient, Agent } from '@moltmoney/database';

export class AgentAuthService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Generate a new API key for an agent
   * Requirements: 2.2, 14.2
   */
  async generateApiKey(agentId: string): Promise<string> {
    // Generate random API key using crypto.randomBytes(32)
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Hash the API key using SHA-256 before storing
    const hashedApiKey = this.hashApiKey(apiKey);

    // Update agent with hashed API key
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { apiKey: hashedApiKey },
    });

    // Return the plain API key (only time it's visible)
    return apiKey;
  }

  /**
   * Verify an API key and return the associated agent
   * Requirements: 14.2
   */
  async verifyApiKey(apiKey: string): Promise<Agent> {
    // Hash the provided API key
    const hashedApiKey = this.hashApiKey(apiKey);

    // Find agent by hashed API key
    const agent = await this.prisma.agent.findUnique({
      where: { apiKey: hashedApiKey },
    });

    if (!agent) {
      throw new Error('Invalid API key');
    }

    return agent;
  }

  /**
   * Rotate an agent's API key (invalidate old, generate new)
   * Requirements: 14.5
   */
  async rotateApiKey(agentId: string): Promise<string> {
    // Verify agent exists
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    // Generate new API key (this will invalidate the old one)
    return this.generateApiKey(agentId);
  }

  /**
   * Hash an API key using SHA-256
   * @private
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }
}
