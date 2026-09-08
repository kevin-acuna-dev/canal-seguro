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
    this.topic = `canalseguro/v3/rooms/${this.roomId}`;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const brokers = [
        'wss://broker.emqx.io:8084/mqtt',
        'wss://broker.hivemq.com:8884/mqtt'
      ];
      let brokerIndex = 0;

      const connectBroker = (url: string) => {
        try {
          const clientInstance = mqtt.connect(url, {
            clientId: this.clientId,
            clean: true,
            connectTimeout: 5000,
            reconnectPeriod: 2500
          });

          this.client = clientInstance;

          clientInstance.on('connect', () => {
            clientInstance.subscribe(this.topic, { qos: 1 }, (err) => {
              if (err) {
                if (!isSettled) {
                  isSettled = true;
                  const errText = 'No se pudo suscribir al canal seguro.';
                  this.callbacks.onError(errText);
                  reject(new Error(errText));
                }
                return;
              }

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

              if (!isSettled) {
                isSettled = true;
                resolve();
              }
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
            if (!isSettled) {
              brokerIndex++;
              if (brokerIndex < brokers.length) {
                clientInstance.end(true);
                connectBroker(brokers[brokerIndex]);
                return;
              }
              isSettled = true;
              const msg = err.message || 'Error de transporte en tiempo real';
              this.callbacks.onError(msg);
              reject(new Error(msg));
            }
          });
        } catch (e) {
          if (!isSettled) {
            isSettled = true;
            const msg = e instanceof Error ? e.message : 'Fallo en cliente de red';
            this.callbacks.onError(msg);
            reject(e);
          }
        }
      };

      connectBroker(brokers[0]);
    });
  }

  private publishPacket(packet: PeerPacket): void {
    if (!this.client || !this.client.connected) return;
    try {
      this.client.publish(this.topic, JSON.stringify(packet), { qos: 1 });
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
        type: 'USER_LEAVE',
        senderId: this.clientId,
        senderName: this.username,
        timestamp: Date.now(),
        participants: Array.from(this.participants.values())
      });

      const joinMsg: ChatMessage = {
        id: `sys-${Date.now()}-${Math.random()}`,
        senderId: 'system',
        senderName: 'Sistema',
        timestamp: Date.now(),
        type: 'system',
        content: `${newParticipant.name} se ha conectado al canal.`
      };
      this.callbacks.onMessageReceived(joinMsg);
      return;
    }

    if (packet.type === 'USER_LEAVE') {
      if (packet.participants && packet.participants.length > 0) {
        packet.participants.forEach((p) => {
          if (!this.participants.has(p.id)) {
            this.participants.set(p.id, p);
          }
        });
        this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));
        return;
      }

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
        parsedMessage.isSelf = false;
        this.callbacks.onMessageReceived(parsedMessage);
      } catch {
        this.callbacks.onError('Mensaje recibido con clave de cifrado incompatible.');
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
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
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
  }
}
