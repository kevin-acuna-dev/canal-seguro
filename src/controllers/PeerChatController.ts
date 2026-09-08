import type { DataConnection, Peer as PeerType } from 'peerjs';
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
  private peer: PeerType | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private roomId: string = '';
  private passkey: string = '';
  private username: string = '';
  private isHost: boolean = false;
  private callbacks: ChatCallbacks;
  private participants: Map<string, Participant> = new Map();

  constructor(callbacks: ChatCallbacks) {
    this.callbacks = callbacks;
  }

  async initialize(
    roomId: string,
    passkey: string,
    username: string,
    isHost: boolean
  ): Promise<void> {
    this.roomId = roomId.toLowerCase();
    this.passkey = passkey;
    this.username = username;
    this.isHost = isHost;

    const { default: Peer } = await import('peerjs');

    const peerOptions = {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };

    return new Promise((resolve, reject) => {
      try {
        const peerInstance = isHost
          ? new Peer(`canalseguro-${this.roomId}`, peerOptions)
          : new Peer(peerOptions);

        this.peer = peerInstance;

        peerInstance.on('open', (id) => {
          this.participants.set(id, {
            id,
            name: this.username,
            isHost: this.isHost,
            joinedAt: Date.now()
          });

          this.callbacks.onConnected(id);
          this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));

          if (!this.isHost) {
            this.connectToHost(`canalseguro-${this.roomId}`, id);
          }
          resolve();
        });

        if (this.isHost) {
          peerInstance.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
          });
        }

        peerInstance.on('error', (err) => {
          let errorMsg = 'Error en la conexión segura';
          if (err.type === 'unavailable-id') {
            errorMsg = 'El código de sala ya está en uso por otro anfitrión.';
          } else if (err.type === 'peer-unavailable') {
            errorMsg = 'La sala no existe o el anfitrión no está conectado.';
          } else if (err.message) {
            errorMsg = err.message;
          }
          this.callbacks.onError(errorMsg);
          reject(new Error(errorMsg));
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Fallo al inicializar PeerJS';
        this.callbacks.onError(msg);
        reject(err);
      }
    });
  }

  private connectToHost(hostPeerId: string, selfId: string): void {
    if (!this.peer) return;

    const conn = this.peer.connect(hostPeerId, {
      reliable: true
    });

    this.hostConnection = conn;

    conn.on('open', () => {
      const joinPacket: PeerPacket = {
        type: 'USER_JOIN',
        senderId: selfId,
        senderName: this.username,
        timestamp: Date.now()
      };
      conn.send(joinPacket);
    });

    conn.on('data', (data) => {
      this.handlePacket(data as PeerPacket);
    });

    conn.on('close', () => {
      this.callbacks.onError('Se perdió la conexión con la sala.');
      this.destroyRoomLocally();
    });

    conn.on('error', () => {
      this.callbacks.onError('Error en el enlace con el anfitrión de la sala.');
    });
  }

  private handleIncomingConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', (data) => {
      const packet = data as PeerPacket;

      if (packet.type === 'USER_JOIN') {
        const newParticipant: Participant = {
          id: packet.senderId,
          name: packet.senderName || 'Participante',
          isHost: false,
          joinedAt: packet.timestamp
        };
        this.participants.set(packet.senderId, newParticipant);
        this.broadcastParticipants();

        const joinMessage: ChatMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          senderId: 'system',
          senderName: 'Sistema',
          timestamp: Date.now(),
          type: 'system',
          content: `${newParticipant.name} se ha unido al canal.`
        };
        this.callbacks.onMessageReceived(joinMessage);
        return;
      }

      if (packet.type === 'USER_LEAVE') {
        const p = this.participants.get(packet.senderId);
        this.participants.delete(packet.senderId);
        this.connections.delete(packet.senderId);
        this.broadcastParticipants();

        if (p) {
          const leaveMessage: ChatMessage = {
            id: `sys-${Date.now()}-${Math.random()}`,
            senderId: 'system',
            senderName: 'Sistema',
            timestamp: Date.now(),
            type: 'system',
            content: `${p.name} ha salido del canal.`
          };
          this.callbacks.onMessageReceived(leaveMessage);
        }
        return;
      }

      this.handlePacket(packet);

      if (this.isHost && (packet.type === 'MESSAGE' || packet.type === 'TYPING')) {
        this.connections.forEach((c, peerId) => {
          if (peerId !== packet.senderId && c.open) {
            c.send(packet);
          }
        });
      }
    });

    conn.on('close', () => {
      const p = this.participants.get(conn.peer);
      this.connections.delete(conn.peer);
      this.participants.delete(conn.peer);
      this.broadcastParticipants();

      if (p) {
        const disconnectMessage: ChatMessage = {
          id: `sys-${Date.now()}-${Math.random()}`,
          senderId: 'system',
          senderName: 'Sistema',
          timestamp: Date.now(),
          type: 'system',
          content: `${p.name} se ha desconectado.`
        };
        this.callbacks.onMessageReceived(disconnectMessage);
      }
    });
  }

  private async handlePacket(packet: PeerPacket): Promise<void> {
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

    if (packet.type === 'PEER_LIST' && packet.participants) {
      this.participants.clear();
      packet.participants.forEach((p) => this.participants.set(p.id, p));
      this.callbacks.onParticipantsUpdated(Array.from(this.participants.values()));
      return;
    }

    if (packet.type === 'MESSAGE' && packet.payload) {
      try {
        const decryptedJson = await decryptData(packet.payload as EncryptedPayload, this.passkey);
        const parsedMessage = JSON.parse(decryptedJson) as ChatMessage;
        parsedMessage.isSelf = packet.senderId === this.peer?.id;
        this.callbacks.onMessageReceived(parsedMessage);
      } catch {
        this.callbacks.onError('Mensaje recibido con clave de cifrado incompatible.');
      }
    }
  }

  private broadcastParticipants(): void {
    const list = Array.from(this.participants.values());
    this.callbacks.onParticipantsUpdated(list);

    const packet: PeerPacket = {
      type: 'PEER_LIST',
      senderId: this.peer?.id || '',
      participants: list,
      timestamp: Date.now()
    };

    this.connections.forEach((c) => {
      if (c.open) {
        c.send(packet);
      }
    });
  }

  sendTypingStatus(isTyping: boolean): void {
    const packet: PeerPacket = {
      type: 'TYPING',
      senderId: this.peer?.id || 'self',
      senderName: this.username,
      isTyping,
      timestamp: Date.now()
    };

    if (this.isHost) {
      this.connections.forEach((c) => {
        if (c.open) {
          c.send(packet);
        }
      });
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(packet);
    }
  }

  async sendMessage(
    content: string,
    type: 'text' | 'image' | 'audio',
    mediaName?: string,
    mediaSize?: number
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      senderId: this.peer?.id || 'self',
      senderName: this.username,
      timestamp: Date.now(),
      type,
      content,
      mediaName,
      mediaSize,
      isSelf: true
    };

    const encrypted = await encryptData(JSON.stringify(message), this.passkey);

    const packet: PeerPacket = {
      type: 'MESSAGE',
      senderId: this.peer?.id || '',
      senderName: this.username,
      payload: encrypted,
      timestamp: Date.now()
    };

    if (this.isHost) {
      this.connections.forEach((c) => {
        if (c.open) {
          c.send(packet);
        }
      });
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(packet);
    }

    return message;
  }

  destroyRoom(): void {
    const packet: PeerPacket = {
      type: 'ROOM_DESTROY',
      senderId: this.peer?.id || '',
      timestamp: Date.now()
    };

    if (this.isHost) {
      this.connections.forEach((c) => {
        if (c.open) {
          try {
            c.send(packet);
          } catch {}
        }
      });
    } else if (this.hostConnection && this.hostConnection.open) {
      try {
        this.hostConnection.send(packet);
      } catch {}
    }

    this.destroyRoomLocally();
  }

  destroyRoomLocally(): void {
    this.connections.forEach((conn) => {
      try {
        conn.close();
      } catch {}
    });
    this.connections.clear();

    if (this.hostConnection) {
      try {
        this.hostConnection.close();
      } catch {}
      this.hostConnection = null;
    }

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }

    this.participants.clear();
  }
}
