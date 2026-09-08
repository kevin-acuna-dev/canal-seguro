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
  private eventSource: EventSource | null = null;
  private clientId: string = '';
  private roomId: string = '';
  private passkey: string = '';
  private username: string = '';
  private isHost: boolean = false;
  private callbacks: ChatCallbacks;
  private participants: Map<string, Participant> = new Map();
  private topicUrl: string = '';
  private processedMessageIds: Set<string> = new Set();
  private announcedParticipants: Set<string> = new Set();

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
    this.clientId = `cs-${Math.random().toString(36).substring(2, 10)}`;
    this.topicUrl = `https://ntfy.sh/cs_v5_${this.roomId}`;
    this.processedMessageIds.clear();
    this.announcedParticipants.clear();

    return new Promise((resolve, reject) => {
      let isSettled = false;

      try {
        const sse = new EventSource(`${this.topicUrl}/sse`);
        this.eventSource = sse;

        const completeConnection = () => {
          if (!isSettled) {
            isSettled = true;
            this.participants.set(this.clientId, {
              id: this.clientId,
              name: this.username,
              isHost: this.isHost,
              joinedAt: Date.now()
            });

            this.callbacks.onConnected(this.clientId);
            this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));

            this.publishPacket({
              type: 'USER_JOIN',
              senderId: this.clientId,
              senderName: this.username,
              timestamp: Date.now()
            });

            resolve();
          }
        };

        sse.addEventListener('open', () => {
          completeConnection();
        });

        sse.addEventListener('message', (event) => {
          try {
            const raw = JSON.parse(event.data);
            if (raw.event === 'open') {
              completeConnection();
              return;
            }
            if (raw.event === 'message' && raw.message) {
              const packet = JSON.parse(raw.message) as PeerPacket;
              this.handlePacket(packet);
            }
          } catch {}
        });

        sse.addEventListener('error', () => {
          if (!isSettled) {
            isSettled = true;
            const err = 'Error al establecer el canal seguro.';
            this.callbacks.onError(err);
            reject(new Error(err));
          }
        });

        setTimeout(() => {
          if (!isSettled) {
            completeConnection();
          }
        }, 1500);
      } catch (e) {
        if (!isSettled) {
          isSettled = true;
          const msg = e instanceof Error ? e.message : 'Fallo en transporte';
          this.callbacks.onError(msg);
          reject(e);
        }
      }
    });
  }

  private async publishPacket(packet: PeerPacket): Promise<void> {
    try {
      await fetch(this.topicUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(packet)
      });
    } catch {}
  }

  private async handlePacket(packet: PeerPacket): Promise<void> {
    if (!packet || packet.senderId === this.clientId) return;

    if (packet.type === 'USER_JOIN') {
      const isNew = !this.participants.has(packet.senderId);
      const newParticipant: Participant = {
        id: packet.senderId,
        name: packet.senderName || 'Participante',
        isHost: false,
        joinedAt: packet.timestamp
      };
      this.participants.set(packet.senderId, newParticipant);
      this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));

      this.publishPacket({
        type: 'USER_PRESENT',
        senderId: this.clientId,
        senderName: this.username,
        timestamp: Date.now()
      });

      if (isNew && !this.announcedParticipants.has(packet.senderId)) {
        this.announcedParticipants.add(packet.senderId);
        const joinMsg: ChatMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          senderId: 'system',
          senderName: 'Sistema',
          timestamp: Date.now(),
          type: 'system',
          content: `${newParticipant.name} se ha conectado.`
        };
        this.callbacks.onMessageReceived(joinMsg);
      }
      return;
    }

    if (packet.type === 'USER_PRESENT') {
      const presentParticipant: Participant = {
        id: packet.senderId,
        name: packet.senderName || 'Participante',
        isHost: false,
        joinedAt: packet.timestamp
      };
      this.participants.set(packet.senderId, presentParticipant);
      this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));
      return;
    }

    if (packet.type === 'USER_LEAVE') {
      const p = this.participants.get(packet.senderId);
      this.participants.delete(packet.senderId);
      this.announcedParticipants.delete(packet.senderId);
      this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));

      if (p) {
        const leaveMsg: ChatMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          senderId: 'system',
          senderName: 'Sistema',
          timestamp: Date.now(),
          type: 'system',
          content: `${p.name} se ha desconectado.`
        };
        this.callbacks.onMessageReceived(leaveMsg);
      }
      return;
    }

    if (packet.type === 'ROOM_DESTROY') {
      this.callbacks.onRoomDestroyed();
      this.destroyRoomLocally();
      return;
    }

    if (packet.type === 'TYPING') {
      this.callbacks.onTypingStateChanged(
        packet.senderId,
        packet.senderName || 'Participante',
        Boolean(packet.isTyping)
      );
      return;
    }

    if (packet.type === 'MESSAGE' && packet.payload) {
      try {
        const decryptedJson = await decryptData(packet.payload as EncryptedPayload, this.passkey);
        const parsedMessage = JSON.parse(decryptedJson) as ChatMessage;

        if (this.processedMessageIds.has(parsedMessage.id)) {
          return;
        }
        this.processedMessageIds.add(parsedMessage.id);

        parsedMessage.isSelf = false;
        this.callbacks.onMessageReceived(parsedMessage);
      } catch {
        this.callbacks.onError('Mensaje recibido con clave incompatible.');
      }
    }
  }

  sendTypingStatus(isTyping: boolean): void {
    this.publishPacket({
      type: 'TYPING',
      senderId: this.clientId,
      senderName: this.username,
      isTyping,
      timestamp: Date.now()
    });
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

    await this.publishPacket({
      type: 'MESSAGE',
      senderId: this.clientId,
      senderName: this.username,
      payload: encrypted,
      timestamp: Date.now()
    });

    return message;
  }

  destroyRoom(): void {
    this.publishPacket({
      type: 'ROOM_DESTROY',
      senderId: this.clientId,
      timestamp: Date.now()
    });
    this.destroyRoomLocally();
  }

  destroyRoomLocally(): void {
    if (this.eventSource) {
      this.publishPacket({
        type: 'USER_LEAVE',
        senderId: this.clientId,
        senderName: this.username,
        timestamp: Date.now()
      });

      this.eventSource.close();
      this.eventSource = null;
    }

    this.participants.clear();
    this.processedMessageIds.clear();
    this.announcedParticipants.clear();
  }
}
