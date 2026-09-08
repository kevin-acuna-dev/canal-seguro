'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, Participant, ToastMessage } from '@/types/chat';
import { PeerChatController } from '@/controllers/PeerChatController';
import { RoomLobby } from '@/components/RoomLobby';
import { ChatRoom } from '@/components/ChatRoom';
import { NotificationToast } from '@/components/NotificationToast';
import { Modal } from '@/components/Modal';
import { ImageViewer } from '@/components/ImageViewer';

export default function Home() {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDestroyModalOpen, setIsDestroyModalOpen] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; name?: string } | null>(null);
  const [initialRoomQuery, setInitialRoomQuery] = useState<string>('');

  const chatControllerRef = useRef<PeerChatController | null>(null);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      if (room) {
        setInitialRoomQuery(room.toUpperCase());
      }
    }
  }, []);

  const handleJoinRoom = async (
    roomId: string,
    passkey: string,
    username: string,
    hostMode: boolean
  ): Promise<void> => {
    setIsLoading(true);

    try {
      const controller = new PeerChatController({
        onMessageReceived: (msg) => {
          setMessages((prev) => [...prev, msg]);
        },
        onParticipantsUpdated: (updatedList) => {
          setParticipants(updatedList);
        },
        onRoomDestroyed: () => {
          setMessages([]);
          setActiveRoomId(null);
          addToast('La sala y sus mensajes han sido destruidos por el anfitrión.', 'warning');
        },
        onError: (errText) => {
          addToast(errText, 'error');
          setIsLoading(false);
        },
        onConnected: () => {
          setActiveRoomId(roomId);
          setCurrentUsername(username);
          setIsHost(hostMode);
          setIsLoading(false);
          addToast(
            hostMode ? `Sala ${roomId} creada con cifrado E2EE activo.` : `Conectado a la sala ${roomId}.`,
            'success'
          );
        }
      });

      chatControllerRef.current = controller;
      await controller.initialize(roomId, passkey, username, hostMode);
    } catch (err) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : 'Error de enlace';
      addToast(msg, 'error');
    }
  };

  const handleSendMessage = async (
    content: string,
    type: 'text' | 'image' | 'audio',
    mediaName?: string,
    mediaSize?: number
  ) => {
    if (!chatControllerRef.current) return;
    const sentMsg = await chatControllerRef.current.sendMessage(content, type, mediaName, mediaSize);
    setMessages((prev) => [...prev, sentMsg]);
  };

  const handleConfirmDestroyRoom = () => {
    setIsDestroyModalOpen(false);
    if (chatControllerRef.current) {
      chatControllerRef.current.destroyRoom();
      chatControllerRef.current = null;
    }
    setMessages([]);
    setActiveRoomId(null);
    addToast('Sala destruida. Todos los datos fueron eliminados de la memoria.', 'info');
  };

  const handleLeaveRoom = () => {
    if (chatControllerRef.current) {
      chatControllerRef.current.destroyRoomLocally();
      chatControllerRef.current = null;
    }
    setMessages([]);
    setActiveRoomId(null);
    addToast('Has abandonado la sala.', 'info');
  };

  const handleClearLocalMessages = () => {
    setMessages([]);
    addToast('Historial local vaciado de la pantalla.', 'info');
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center">
      {!activeRoomId ? (
        <div className="p-4 sm:p-6 w-full flex items-center justify-center">
          <RoomLobby
            onJoinRoom={handleJoinRoom}
            isLoading={isLoading}
            initialRoomId={initialRoomQuery}
          />
        </div>
      ) : (
        <ChatRoom
          roomId={activeRoomId}
          username={currentUsername}
          isHost={isHost}
          participants={participants}
          messages={messages}
          onSendMessage={handleSendMessage}
          onDestroyRoom={() => setIsDestroyModalOpen(true)}
          onLeaveRoom={handleLeaveRoom}
          onClearLocalMessages={handleClearLocalMessages}
          onOpenImageViewer={(src, name) => setPreviewImage({ src, name })}
          onAddToast={addToast}
        />
      )}

      <NotificationToast toasts={toasts} onDismiss={handleDismissToast} />

      <Modal
        isOpen={isDestroyModalOpen}
        onClose={() => setIsDestroyModalOpen(false)}
        title="Destruir sala permanentemente"
        description="Esta acción expulsará inmediatamente a todos los participantes conectados, cerrará las conexiones WebRTC y borrará todos los mensajes y archivos de la memoria sin dejar rastro en ningún servidor."
        isDestructive={true}
        confirmText="Destruir todo ahora"
        cancelText="Cancelar"
        onConfirm={handleConfirmDestroyRoom}
      />

      <ImageViewer
        src={previewImage?.src || null}
        name={previewImage?.name}
        onClose={() => setPreviewImage(null)}
      />
    </main>
  );
}
