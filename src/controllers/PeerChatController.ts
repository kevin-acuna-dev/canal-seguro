import { ChatMessage, EncryptedPayload, Participant, PeerPacket } from '@/types/chat';
import { encryptData, decryptData } from '@/utils/crypto';

export interface ChatCallbacks {
  onMessageReceived: (message: ChatMessage) => void;
  onParticipantsUpdated: (participants: Participant[]) => void;
  onRoomDestroyed: () => void;
  onError: (errorMessage: string) => void;
  onConnected: (peerId: string) => void;
  onTypingStateChanged: (senderId: string, senderName: string, isTyping: boolean) => void;
}

export class PeerChatController {
  private clientId: string = '';
  private roomId: string = '';
  private passkey: string = '';
  private username: string = '';
  private isHost: boolean = false;
  private callbacks: ChatCallbacks;
  private participants: Map<string, Participant> = new Map();
  private isPollingActive: boolean = false;
  private lastPollTimestamp: number = 0;
  private processedMessageIds: Set<string> = new Set();
  private announcedJoins: Set<string> = new Set();
  private abortController: AbortController | null = null;

  constructor(callbacks: ChatCallbacks) {
    this.callbacks = callbacks;
  }

  async initialize(
    roomId: string,
    passkey: string,
    username: string,
    isHost: boolean
  ): Promise<void> {
    this.roomId = roomId.toLowerCase().trim();
    this.passkey = passkey.trim();
    this.username = username.trim();
    this.isHost = isHost;
    this.clientId = `usr-${Math.random().toString(36).substring(2, 10)}`;
    this.processedMessageIds.clear();
    this.announcedJoins.clear();
    this.lastPollTimestamp = Date.now() - 2000;

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isHost ? 'create' : 'join',
          roomId: this.roomId,
          clientId: this.clientId,
          username: this.username,
          isHost: this.isHost
        })
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || 'Error al conectar con la sala';
        this.callbacks.onError(errorMsg);
        throw new Error(errorMsg);
      }

      this.participants.clear();
      if (Array.isArray(data.participants)) {
        data.participants.forEach((p: Participant) => {
          this.participants.set(p.id, p);
          this.announcedJoins.add(p.id);
        });
      }

      this.callbacks.onConnected(this.clientId);
      this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));

      this.isPollingActive = true;
      this.startPollLoop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fallo al iniciar conexión con el backend propio';
      this.callbacks.onError(msg);
      throw err;
    }
  }

  private async startPollLoop(): Promise<void> {
    while (this.isPollingActive) {
      this.abortController = new AbortController();

      try {
        const url = `/api/sync?roomId=${encodeURIComponent(this.roomId)}&clientId=${encodeURIComponent(this.clientId)}&since=${this.lastPollTimestamp}`;
        const res = await fetch(url, {
          signal: this.abortController.signal,
          cache: 'no-store'
        });

        if (!this.isPollingActive) break;

        if (!res.ok) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }

        const data = await res.json();

        if (data.destroyed) {
          this.isPollingActive = false;
          this.callbacks.onRoomDestroyed();
          this.destroyRoomLocally();
          break;
        }

        if (Array.isArray(data.participants)) {
          this.participants.clear();
          data.participants.forEach((p: Participant) => {
            this.participants.set(p.id, p);
          });
          this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));
        }

        if (Array.isArray(data.typing)) {
          const remoteTyping = data.typing.filter((name: string) => name !== this.username);
          if (remoteTyping.length > 0) {
            this.callbacks.onTypingStateChanged('remote', remoteTyping.join(', '), true);
          } else {
            this.callbacks.onTypingStateChanged('remote', '', false);
          }
        }

        if (Array.isArray(data.packets) && data.packets.length > 0) {
          for (const pkt of data.packets) {
            if (pkt.timestamp > this.lastPollTimestamp) {
              this.lastPollTimestamp = pkt.timestamp;
            }

            if (pkt.senderId === this.clientId) continue;

            if (pkt.type === 'USER_JOIN' && !this.announcedJoins.has(pkt.senderId)) {
              this.announcedJoins.add(pkt.senderId);
              const joinMsg: ChatMessage = {
                id: pkt.id || `sys-${Date.now()}-${Math.random()}`,
                senderId: 'system',
                senderName: 'Sistema',
                timestamp: pkt.timestamp,
                type: 'system',
                content: `${pkt.senderName || 'Participante'} se ha conectado al canal.`
              };
              this.callbacks.onMessageReceived(joinMsg);
            }

            if (pkt.type === 'USER_LEAVE') {
              this.announcedJoins.delete(pkt.senderId);
              const leaveMsg: ChatMessage = {
                id: pkt.id || `sys-${Date.now()}-${Math.random()}`,
                senderId: 'system',
                senderName: 'Sistema',
                timestamp: pkt.timestamp,
                type: 'system',
                content: `${pkt.senderName || 'Participante'} ha salido del canal.`
              };
              this.callbacks.onMessageReceived(leaveMsg);
            }

            if (pkt.type === 'ROOM_DESTROY') {
              this.isPollingActive = false;
              this.callbacks.onRoomDestroyed();
              this.destroyRoomLocally();
              return;
            }

            if (pkt.type === 'MESSAGE' && pkt.payload) {
              try {
                const decrypted = await decryptData(pkt.payload as EncryptedPayload, this.passkey);
                const parsedMsg = JSON.parse(decrypted) as ChatMessage;

                if (!this.processedMessageIds.has(parsedMsg.id)) {
                  this.processedMessageIds.add(parsedMsg.id);
                  parsedMsg.isSelf = false;
                  this.callbacks.onMessageReceived(parsedMsg);
                }
              } catch {
                this.callbacks.onError('Mensaje recibido con clave de cifrado incompatible.');
              }
            }
          }
        }
      } catch (e: unknown) {
        if (!this.isPollingActive) break;
        if (e instanceof Error && e.name === 'AbortError') {
          break;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }

  async sendTypingStatus(isTyping: boolean): Promise<void> {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'typing',
          roomId: this.roomId,
          clientId: this.clientId,
          username: this.username,
          isTyping
        })
      });
    } catch {}
  }

  async sendMessage(
    content: string,
    type: 'text' | 'image' | 'audio',
    mediaName?: string,
    mediaSize?: number
  ): Promise<ChatMessage> {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.processedMessageIds.add(messageId);

    const message: ChatMessage = {
      id: messageId,
      senderId: this.clientId,
      senderName: this.username,
      timestamp: Date.now(),
      type,
      content,
      mediaName,
      mediaSize,
      isSelf: true
    };

    const encrypted = await encryptData(JSON.stringify(message), this.passkey);

    await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send',
        roomId: this.roomId,
        clientId: this.clientId,
        username: this.username,
        packet: {
          id: messageId,
          type: 'MESSAGE',
          senderId: this.clientId,
          senderName: this.username,
          payload: encrypted,
          timestamp: Date.now()
        }
      })
    });

    return message;
  }

  async destroyRoom(): Promise<void> {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'destroy',
          roomId: this.roomId,
          clientId: this.clientId,
          username: this.username
        })
      });
    } catch {}

    this.destroyRoomLocally();
  }

  destroyRoomLocally(): void {
    this.isPollingActive = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    try {
      fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'leave',
          roomId: this.roomId,
          clientId: this.clientId,
          username: this.username
        }),
        keepalive: true
      });
    } catch {}

    this.participants.clear();
    this.processedMessageIds.clear();
    this.announcedJoins.clear();
  }
}
