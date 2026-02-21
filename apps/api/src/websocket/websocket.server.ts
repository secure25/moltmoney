import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@moltmoney/database';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MAX_CONNECTIONS_PER_ACCOUNT = 5;

export interface RealtimeEvent {
  type: RealtimeEventType;
  data: any;
  timestamp: Date;
}

export enum RealtimeEventType {
  BALANCE_UPDATED = 'balance.updated',
  TRANSACTION_CREATED = 'transaction.created',
  TRANSACTION_UPDATED = 'transaction.updated',
  APPROVAL_REQUIRED = 'approval.required',
  PAYMENT_REQUEST_RECEIVED = 'payment_request.received',
  PAYOUT_COMPLETED = 'payout.completed',
}

interface AuthenticatedConnection {
  ws: WebSocket;
  accountId?: string;
  ownerId?: string;
  isAlive: boolean;
}

class WebSocketServer {
  private connections: Map<string, AuthenticatedConnection[]> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  initialize(server: FastifyInstance) {
    // Start heartbeat
    this.startHeartbeat();

    // Handle WebSocket connections
    server.get('/ws', { websocket: true }, (connection, req) => {
      const { socket } = connection;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const apiKey = url.searchParams.get('apiKey');

      // Authenticate connection
      this.authenticateConnection(socket, token, apiKey)
        .then((auth) => {
          if (!auth) {
            socket.close(1008, 'Authentication failed');
            return;
          }

          const { accountId, ownerId } = auth;
          const connectionId = this.generateConnectionId(accountId, ownerId);

          // Check connection limit
          const existingConnections = this.connections.get(connectionId) || [];
          if (existingConnections.length >= MAX_CONNECTIONS_PER_ACCOUNT) {
            socket.close(1008, 'Maximum connections exceeded');
            return;
          }

          // Add connection
          const conn: AuthenticatedConnection = {
            ws: socket,
            accountId,
            ownerId,
            isAlive: true,
          };

          existingConnections.push(conn);
          this.connections.set(connectionId, existingConnections);

          // Handle pong responses
          socket.on('pong', () => {
            conn.isAlive = true;
          });

          // Handle disconnection
          socket.on('close', () => {
            this.removeConnection(connectionId, socket);
          });

          // Send welcome message
          socket.send(
            JSON.stringify({
              type: 'connected',
              data: { accountId, ownerId },
              timestamp: new Date().toISOString(),
            })
          );
        })
        .catch((error) => {
          console.error('WebSocket authentication error:', error);
          socket.close(1011, 'Internal server error');
        });
    });
  }

  private async authenticateConnection(
    _socket: WebSocket,
    token: string | null,
    apiKey: string | null
  ): Promise<{ accountId?: string; ownerId?: string } | null> {
    // Try JWT authentication (owner)
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { ownerId: string };
        return { ownerId: decoded.ownerId };
      } catch (error) {
        // Invalid JWT
      }
    }

    // Try API key authentication (agent)
    if (apiKey) {
      try {
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
        const agent = await this.prisma.agent.findUnique({
          where: { apiKey: hashedKey },
          include: { Account: true },
        });

        if (agent && agent.Account) {
          return { accountId: agent.Account.id };
        }
      } catch (error) {
        console.error('API key authentication error:', error);
      }
    }

    return null;
  }

  private generateConnectionId(accountId?: string, ownerId?: string): string {
    return accountId || ownerId || 'unknown';
  }

  private removeConnection(connectionId: string, ws: WebSocket) {
    const connections = this.connections.get(connectionId);
    if (connections) {
      const filtered = connections.filter((conn) => conn.ws !== ws);
      if (filtered.length > 0) {
        this.connections.set(connectionId, filtered);
      } else {
        this.connections.delete(connectionId);
      }
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.connections.forEach((connections, connectionId) => {
        connections.forEach((conn, index) => {
          if (!conn.isAlive) {
            // Connection is dead, remove it
            conn.ws.terminate();
            connections.splice(index, 1);
            return;
          }

          // Mark as not alive and send ping
          conn.isAlive = false;
          conn.ws.ping();
        });

        // Clean up empty connection arrays
        if (connections.length === 0) {
          this.connections.delete(connectionId);
        }
      });
    }, HEARTBEAT_INTERVAL);
  }

  async broadcast(accountId: string, event: RealtimeEvent): Promise<void> {
    const connections = this.connections.get(accountId);
    if (!connections) return;

    const message = JSON.stringify({
      type: event.type,
      data: event.data,
      timestamp: event.timestamp.toISOString(),
    });

    connections.forEach((conn) => {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    });
  }

  async broadcastToOwner(ownerId: string, event: RealtimeEvent): Promise<void> {
    const connections = this.connections.get(ownerId);
    if (!connections) return;

    const message = JSON.stringify({
      type: event.type,
      data: event.data,
      timestamp: event.timestamp.toISOString(),
    });

    connections.forEach((conn) => {
      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    });
  }

  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    this.connections.forEach((connections) => {
      connections.forEach((conn) => {
        conn.ws.close(1001, 'Server shutting down');
      });
    });

    this.connections.clear();
  }
}

export { WebSocketServer };
