// Shared Agent public serializer. The Agent.apiKey field is a live credential
// (displayed exactly once at creation) and MUST never appear in any API
// response. All routes/services that include an Agent in a response go
// through this module so the invariant is enforced in one place.
import { Agent } from '@moltmoney/database';

export const AGENT_PUBLIC_SELECT = {
  id: true,
  name: true,
  platform: true,
  createdAt: true,
} as const;

export type PublicAgent = Pick<Agent, 'id' | 'name' | 'platform' | 'createdAt'>;

/**
 * Prisma include for embedding the Agent relation in a response. Use this
 * instead of `include: { Agent: true }` so only the public fields are ever
 * loaded. For OWNER-AUTHORIZATION checks still needing ownerId, load the
 * agent separately rather than widening the response shape.
 */
export const AGENT_PUBLIC_INCLUDE = { Agent: { select: AGENT_PUBLIC_SELECT } } as const;

export function toPublicAgent(agent: Agent): PublicAgent;
export function toPublicAgent(agent: null | undefined): null;
export function toPublicAgent(agent: Agent | null | undefined): PublicAgent | null;
export function toPublicAgent(agent: any): any {
  if (agent == null) return null;
  if (Array.isArray(agent)) {
    return agent.map((a) => toPublicAgent(a));
  }
  // Strip every field that isn't part of AGENT_PUBLIC_SELECT, even if the
  // caller passed the raw Prisma Agent row with apiKey/ownerId attached.
  return {
    id: agent.id,
    name: agent.name,
    platform: agent.platform,
    createdAt: agent.createdAt,
  };
}
