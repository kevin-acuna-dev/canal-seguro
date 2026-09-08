import mqtt, { MqttClient } from 'mqtt';
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
  private client: MqttClient | null = null;
  private clientId: string = '';
  private roomId: string = '';
  private passkey: string = '';
  private username: string = '';
  private isHost: boolean = false;
  private callbacks: ChatCallbacks;
  private participants: Map<string, Participant> = new Map();
  private topic: string = '';
  private processedMessageIds: Set<string> = new Set();

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
    this.topic = `canalseguro/v4/rooms/${this.roomId}`;
    this.processedMessageIds.clear();

    return new Promise((resolve, reject) => {
      let isInitialConnect = true;
      const brokers = [
        'wss://broker.emqx.io:8084/mqtt',
        'wss://broker.hivemq.com:8884/mqtt'
      ];
      let currentBrokerIndex = 0;

      const connectToBroker = (url: string) => {
        try {
          const clientInstance = mqtt.connect(url, {
            clientId: this.clientId,
            clean: true,
            keepalive: 20,
            connectTimeout: 7000,
            reconnectPeriod: 4000
          });

          this.client = clientInstance;

          clientInstance.on('connect', () => {
            clientInstance.subscribe(this.topic, { qos: 0 }, (err) => {
              if (err) {
                if (isInitialConnect) {
                  this.callbacks.onError('Error al suscribir al canal seguro.');
                  reject(err);
                }
                return;
              }

              if (isInitialConnect) {
                isInitialConnect = false;
                this.participants.set(this.clientId, {
                  id: this.clientId,
                  name: this.username,
                  isHost: this.isHost,
                  joinedAt: Date.now()
                });

                this.callbacks.onConnected(this.clientId);
                this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));
                resolve();
              }

              this.publishPacket({
                type: 'USER_JOIN',
                senderId: this.clientId,
                senderName: this.username,
                timestamp: Date.now()
              });
            });
          });

          clientInstance.on('message', (_topic, messageBuffer) => {
            try {
              const rawString = messageBuffer.toString();
              const packet = JSON.parse(rawString) as PeerPacket;
              this.handlePacket(packet);
            } catch {}
          });

          clientInstance.on('error', (err) => {
            if (isInitialConnect) {
              currentBrokerIndex++;
              if (currentBrokerIndex < brokers.length) {
                clientInstance.end(true);
                connectToBroker(brokers[currentBrokerIndex]);
                return;
              }
              const msg = err.message || 'Error de conexión en red móvil';
              this.callbacks.onError(msg);
              reject(new Error(msg));
            }
          });
        } catch (e) {
          if (isInitialConnect) {
            const msg = e instanceof Error ? e.message : 'Fallo en transporte de red';
            this.callbacks.onError(msg);
            reject(e);
          }
        }
      };

      connectToBroker(brokers[0]);
    });
  }

  private publishPacket(packet: PeerPacket): void {
    if (!this.client || !this.client.connected) return;
    try {
      this.client.publish(this.topic, JSON.stringify(packet), { qos: 0 });
    } catch {}
  }

  private async handlePacket(packet: PeerPacket): Promise<void> {
    if (packet.senderId === this.clientId) return;

    if (packet.type === 'USER_JOIN') {
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

      const joinMsg: ChatMessage = {
        id: `sys-${Date.now()}-${Math.random()}`,
        senderId: 'system',
        senderName: 'Sistema',
        timestamp: Date.now(),
        type: 'system',
        content: `${newParticipant.name} se ha conectado.`
      };
      this.callbacks.onMessageReceived(joinMsg);
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

    this.publishPacket({
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
    if (this.client) {
      try {
        this.client.publish(
          this.topic,
          JSON.stringify({
            type: 'USER_LEAVE',
            senderId: this.clientId,
            senderName: this.username,
            timestamp: Date.now()
          }),
          { qos: 0 }
        );
      } catch {}

      try {
        this.client.unsubscribe(this.topic);
        this.client.end(true);
      } catch {}
      this.client = null;
    }

    this.participants.clear();
    this.processedMessageIds.clear();
  }
}
