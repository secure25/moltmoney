// MoltMoney Database Layer
// Prisma client exports

import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

// Export a singleton Prisma client instance
export const prisma = new PrismaClient();
