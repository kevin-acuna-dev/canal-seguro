export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  salt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  timestamp: number;
  type: 'text' | 'image' | 'audio' | 'system';
  content: string;
  mediaName?: string;
  mediaSize?: number;
  isSelf?: boolean;
}

export interface PeerPacket {
  type: 'MESSAGE' | 'USER_JOIN' | 'USER_LEAVE' | 'PEER_LIST' | 'ROOM_DESTROY' | 'TYPING';
  senderId: string;
  senderName?: string;
  payload?: EncryptedPayload | string;
  participants?: Participant[];
  timestamp: number;
}

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}
