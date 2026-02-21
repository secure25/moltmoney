import 'dotenv/config';
import { PrismaClient } from '@moltmoney/database';
import { buildServer } from './server';

const prisma = new PrismaClient();

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    const server = await buildServer({ prisma });

    // Start server
    await server.listen({ port: PORT, host: HOST });

    console.log(`🚀 MoltMoney API Server running on http://${HOST}:${PORT}`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);
      server.wsServer.shutdown();
      await server.close();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

start();
