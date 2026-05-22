import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import { Task, TaskResult } from '../../orchestrator/Task';

export interface FederationMessage {
  type: 'challenge' | 'auth' | 'auth_success' | 'auth_failed' | 'delegate_task' | 'task_result' | 'ping' | 'pong';
  challenge?: string;
  signature?: string;
  publicKey?: string;
  task?: Task;
  taskResult?: TaskResult;
  error?: string;
}

export class FedServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private privateKey: crypto.KeyObject;
  private publicKeyPem: string;
  private authenticatedClients: Map<WebSocket, { publicKey: string; id: string }> = new Map();
  private taskHandler?: (task: Task) => Promise<TaskResult>;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(port: number, keys: { publicKey: string; privateKey: crypto.KeyObject }) {
    this.port = port;
    this.privateKey = keys.privateKey;
    this.publicKeyPem = keys.publicKey;
  }

  setTaskHandler(handler: (task: Task) => Promise<TaskResult>) {
    this.taskHandler = handler;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port }, () => {
        console.log(`🔒 [FedServer] Zero-trust Federation Server running on port ${this.port}`);
        resolve();
      });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });

      this.pingInterval = setInterval(() => {
        this.wss?.clients.forEach((ws) => {
          if ((ws as any).isAlive === false) {
            console.warn(`[FedServer] Client connection lost (heartbeat timeout). Terminating connection.`);
            return ws.terminate();
          }
          (ws as any).isAlive = false;
          ws.ping();
        });
      }, 10000);
    });
  }

  private handleConnection(ws: WebSocket) {
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });

    const challenge = crypto.randomBytes(32).toString('hex');
    let isAuthenticated = false;

    // Send challenge immediately
    const challengeMsg: FederationMessage = { type: 'challenge', challenge };
    ws.send(JSON.stringify(challengeMsg));

    ws.on('message', async (data) => {
      try {
        const msg: FederationMessage = JSON.parse(data.toString());

        if (msg.type === 'auth') {
          if (!msg.signature || !msg.publicKey) {
            ws.send(JSON.stringify({ type: 'auth_failed', error: 'Missing signature or public key' }));
            ws.close();
            return;
          }

          try {
            const pubKey = crypto.createPublicKey(msg.publicKey);
            const isValid = crypto.verify(
              null,
              Buffer.from(challenge),
              pubKey,
              Buffer.from(msg.signature, 'hex')
            );

            if (isValid) {
              isAuthenticated = true;
              const clientFingerprint = crypto.createHash('sha256').update(msg.publicKey).digest('hex').substring(0, 16);
              this.authenticatedClients.set(ws, { publicKey: msg.publicKey, id: clientFingerprint });
              
              console.log(`🔐 [FedServer] Client ${clientFingerprint} successfully authenticated via ed25519.`);
              ws.send(JSON.stringify({ type: 'auth_success' }));
            } else {
              console.warn(`[FedServer] Client authentication failed: Invalid signature.`);
              ws.send(JSON.stringify({ type: 'auth_failed', error: 'Invalid challenge signature' }));
              ws.close();
            }
          } catch (e: any) {
            console.error(`[FedServer] Error verifying signature:`, e);
            ws.send(JSON.stringify({ type: 'auth_failed', error: 'Verification failed: ' + e.message }));
            ws.close();
          }
          return;
        }

        // Zero-trust gate
        if (!isAuthenticated) {
          ws.send(JSON.stringify({ type: 'auth_failed', error: 'Not authenticated' }));
          ws.close();
          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (msg.type === 'delegate_task') {
          if (!msg.task) {
            ws.send(JSON.stringify({ type: 'task_result', error: 'No task provided' }));
            return;
          }

          console.log(`🛰️ [FedServer] Received task delegation request: ${msg.task.id} (${msg.task.description})`);
          if (this.taskHandler) {
            try {
              const result = await this.taskHandler(msg.task);
              ws.send(JSON.stringify({ type: 'task_result', taskResult: result }));
            } catch (err: any) {
              ws.send(JSON.stringify({ 
                type: 'task_result', 
                taskResult: {
                  taskId: msg.task.id,
                  success: false,
                  error: `Server execution error: ${err.message}`
                } 
              }));
            }
          } else {
            ws.send(JSON.stringify({ 
              type: 'task_result', 
              taskResult: {
                taskId: msg.task.id,
                success: false,
                error: 'No task handler registered on server'
              } 
            }));
          }
        }
      } catch (err) {
        console.error(`[FedServer] Error processing message:`, err);
      }
    });

    ws.on('close', () => {
      this.authenticatedClients.delete(ws);
    });
  }

  async stop(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          resolve();
        });
      });
    }
  }
}

export class FedClient {
  private ws: WebSocket | null = null;
  private url: string;
  private privateKey: crypto.KeyObject;
  private publicKeyPem: string;
  private resolveAuth?: (value: boolean) => void;
  private activeDelegations: Map<string, (result: TaskResult) => void> = new Map();
  private delegationQueue: Array<{ task: Task; resolve: (result: TaskResult) => void; reject: (err: any) => void }> = [];
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private isClosedIntentionally = false;

  constructor(url: string, keys: { publicKey: string; privateKey: crypto.KeyObject }) {
    this.url = url;
    this.privateKey = keys.privateKey;
    this.publicKeyPem = keys.publicKey;
  }

  connect(): Promise<boolean> {
    this.isClosedIntentionally = false;
    return new Promise((resolve) => {
      this.resolveAuth = (success) => {
        if (success) {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this.replayDelegations();
        }
        resolve(success);
      };
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        console.log(`🛰️ [FedClient] Connecting to peer ${this.url}...`);
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (err) => {
        console.error(`[FedClient] Connection error:`, err);
        if (!this.isReconnecting) {
          resolve(false);
        }
      });

      this.ws.on('close', () => {
        console.log(`🔌 [FedClient] Connection closed.`);
        if (!this.isReconnecting) {
          resolve(false);
        }
        if (!this.isClosedIntentionally) {
          this.triggerReconnection();
        }
      });
    });
  }

  private triggerReconnection() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    const delay = Math.min(100 * Math.pow(2, this.reconnectAttempts), 5000);
    this.reconnectAttempts++;
    console.log(`🛰️ [FedClient] Attempting auto-reconnection in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    setTimeout(() => {
      this.connect().then((success) => {
        if (!success) {
          this.isReconnecting = false;
          this.triggerReconnection();
        }
      });
    }, delay);
  }

  private replayDelegations() {
    if (this.delegationQueue.length === 0) return;
    console.log(`🛰️ [FedClient] Replaying ${this.delegationQueue.length} pending task delegations...`);
    const queueToProcess = [...this.delegationQueue];
    this.delegationQueue = [];
    for (const item of queueToProcess) {
      this.delegateTask(item.task).then(item.resolve).catch(item.reject);
    }
  }

  private handleMessage(data: any) {
    try {
      const msg: FederationMessage = JSON.parse(data.toString());

      if (msg.type === 'challenge') {
        if (!msg.challenge) return;
        
        console.log(`🔑 [FedClient] Received challenge, signing with local ed25519 key.`);
        const signature = crypto.sign(
          null,
          Buffer.from(msg.challenge),
          this.privateKey
        ).toString('hex');

        const authMsg: FederationMessage = {
          type: 'auth',
          signature,
          publicKey: this.publicKeyPem,
        };

        this.ws?.send(JSON.stringify(authMsg));
        return;
      }

      if (msg.type === 'auth_success') {
        console.log(`🎉 [FedClient] Connection successfully authenticated via ed25519 challenge-response.`);
        this.resolveAuth?.(true);
        return;
      }

      if (msg.type === 'auth_failed') {
        console.error(`❌ [FedClient] Authentication failed: ${msg.error}`);
        this.resolveAuth?.(false);
        this.ws?.close();
        return;
      }

      if (msg.type === 'task_result') {
        if (msg.taskResult) {
          const handler = this.activeDelegations.get(msg.taskResult.taskId);
          if (handler) {
            handler(msg.taskResult);
            this.activeDelegations.delete(msg.taskResult.taskId);
          }
        }
      }
    } catch (err) {
      console.error(`[FedClient] Message handling error:`, err);
    }
  }

  delegateTask(task: Task): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.log(`🛰️ [FedClient] Connection offline. Queueing delegation for task: ${task.id}`);
        this.delegationQueue.push({ task, resolve, reject });
        if (!this.isClosedIntentionally) {
          this.triggerReconnection();
        }
        return;
      }

      this.activeDelegations.set(task.id, resolve);
      this.ws.send(JSON.stringify({ type: 'delegate_task', task }));
    });
  }

  disconnect() {
    this.isClosedIntentionally = true;
    this.ws?.close();
  }
}
