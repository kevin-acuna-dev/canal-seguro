import { NextRequest, NextResponse } from 'next/server';

interface ParticipantInfo {
  id: string;
  name: string;
  isHost: boolean;
  lastSeen: number;
}

interface RoomPacket {
  id: string;
  senderId: string;
  senderName?: string;
  type: string;
  payload?: unknown;
  timestamp: number;
  isTyping?: boolean;
}

interface RoomRecord {
  id: string;
  createdAt: number;
  lastActivity: number;
  destroyed: boolean;
  participants: Map<string, ParticipantInfo>;
  packets: RoomPacket[];
  typing: Map<string, { name: string; timestamp: number }>;
  waiters: Array<(packet: RoomPacket) => void>;
}

const getRoomsStore = (): Map<string, RoomRecord> => {
  const g = globalThis as unknown as { __CS_ROOMS__?: Map<string, RoomRecord> };
  if (!g.__CS_ROOMS__) {
    g.__CS_ROOMS__ = new Map<string, RoomRecord>();
  }
  return g.__CS_ROOMS__;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, roomId, clientId, username, isHost, packet } = body;

    if (!roomId) {
      return NextResponse.json({ error: 'Falta identificador de sala' }, { status: 400 });
    }

    const cleanRoomId = roomId.toLowerCase().trim();
    const rooms = getRoomsStore();
    let room = rooms.get(cleanRoomId);

    if (action === 'create' || action === 'join') {
      if (!room) {
        room = {
          id: cleanRoomId,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          destroyed: false,
          participants: new Map(),
          packets: [],
          typing: new Map(),
          waiters: []
        };
        rooms.set(cleanRoomId, room);
      }

      if (room.destroyed) {
        return NextResponse.json({ error: 'La sala ha sido destruida' }, { status: 410 });
      }

      const participant: ParticipantInfo = {
        id: clientId,
        name: username,
        isHost: Boolean(isHost),
        lastSeen: Date.now()
      };
      room.participants.set(clientId, participant);
      room.lastActivity = Date.now();

      const joinPacket: RoomPacket = {
        id: `sys-join-${Date.now()}-${clientId}`,
        senderId: clientId,
        senderName: username,
        type: 'USER_JOIN',
        timestamp: Date.now()
      };
      room.packets.push(joinPacket);

      const currentWaiters = [...room.waiters];
      room.waiters = [];
      currentWaiters.forEach((notify) => notify(joinPacket));

      return NextResponse.json({
        success: true,
        participants: Array.from(room.participants.values())
      });
    }

    if (!room || room.destroyed) {
      return NextResponse.json({ error: 'Sala no disponible o destruida' }, { status: 404 });
    }

    room.lastActivity = Date.now();

    if (action === 'send' && packet) {
      const newPacket: RoomPacket = {
        ...packet,
        id: packet.id || `pkt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        timestamp: Date.now()
      };
      room.packets.push(newPacket);

      if (room.packets.length > 200) {
        room.packets = room.packets.slice(-200);
      }

      const currentWaiters = [...room.waiters];
      room.waiters = [];
      currentWaiters.forEach((notify) => notify(newPacket));

      return NextResponse.json({ success: true, packetId: newPacket.id });
    }

    if (action === 'typing') {
      const isTyping = Boolean(body.isTyping);
      if (isTyping) {
        room.typing.set(clientId, { name: username, timestamp: Date.now() });
      } else {
        room.typing.delete(clientId);
      }

      const typingPacket: RoomPacket = {
        id: `typ-${Date.now()}-${clientId}`,
        senderId: clientId,
        senderName: username,
        type: 'TYPING',
        isTyping,
        timestamp: Date.now()
      };

      const currentWaiters = [...room.waiters];
      room.waiters = [];
      currentWaiters.forEach((notify) => notify(typingPacket));

      return NextResponse.json({ success: true });
    }

    if (action === 'leave') {
      room.participants.delete(clientId);
      room.typing.delete(clientId);

      const leavePacket: RoomPacket = {
        id: `sys-leave-${Date.now()}-${clientId}`,
        senderId: clientId,
        senderName: username,
        type: 'USER_LEAVE',
        timestamp: Date.now()
      };
      room.packets.push(leavePacket);

      const currentWaiters = [...room.waiters];
      room.waiters = [];
      currentWaiters.forEach((notify) => notify(leavePacket));

      return NextResponse.json({ success: true });
    }

    if (action === 'destroy') {
      room.destroyed = true;
      const destroyPacket: RoomPacket = {
        id: `sys-destroy-${Date.now()}`,
        senderId: clientId,
        senderName: username,
        type: 'ROOM_DESTROY',
        timestamp: Date.now()
      };

      const currentWaiters = [...room.waiters];
      room.waiters = [];
      currentWaiters.forEach((notify) => notify(destroyPacket));

      rooms.delete(cleanRoomId);
      return NextResponse.json({ success: true, message: 'Sala eliminada permanentemente' });
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error en servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('roomId');
  const clientId = searchParams.get('clientId') || '';
  const since = parseInt(searchParams.get('since') || '0', 10);

  if (!roomId) {
    return NextResponse.json({ error: 'Falta roomId' }, { status: 400 });
  }

  const cleanRoomId = roomId.toLowerCase().trim();
  const rooms = getRoomsStore();
  const room = rooms.get(cleanRoomId);

  if (!room || room.destroyed) {
    return NextResponse.json({
      destroyed: true,
      packets: [],
      participants: []
    });
  }

  const participant = room.participants.get(clientId);
  if (participant) {
    participant.lastSeen = Date.now();
  }

  const now = Date.now();
  for (const [id, t] of room.typing.entries()) {
    if (now - t.timestamp > 3500) {
      room.typing.delete(id);
    }
  }

  const existingNewPackets = room.packets.filter(
    (p) => p.timestamp > since && p.senderId !== clientId
  );

  if (existingNewPackets.length > 0) {
    return NextResponse.json({
      destroyed: false,
      packets: existingNewPackets,
      participants: Array.from(room.participants.values()),
      typing: Array.from(room.typing.values()).map((t) => t.name)
    });
  }

  const incomingPacket = await new Promise<RoomPacket | null>((resolve) => {
    let resolved = false;

    const waiter = (packet: RoomPacket) => {
      if (!resolved) {
        resolved = true;
        resolve(packet);
      }
    };

    room.waiters.push(waiter);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const idx = room.waiters.indexOf(waiter);
        if (idx !== -1) room.waiters.splice(idx, 1);
        resolve(null);
      }
    }, 8000);
  });

  const refreshedRoom = rooms.get(cleanRoomId);
  if (!refreshedRoom || refreshedRoom.destroyed) {
    return NextResponse.json({
      destroyed: true,
      packets: [],
      participants: []
    });
  }

  const freshPackets = incomingPacket && incomingPacket.senderId !== clientId
    ? [incomingPacket]
    : [];

  return NextResponse.json({
    destroyed: false,
    packets: freshPackets,
    participants: Array.from(refreshedRoom.participants.values()),
    typing: Array.from(refreshedRoom.typing.values()).map((t) => t.name)
  });
}
