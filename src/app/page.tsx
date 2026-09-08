'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, Participant, ToastMessage, UserProfile } from '@/types/chat';
import { PeerChatController } from '@/controllers/PeerChatController';
import { LoginScreen } from '@/components/LoginScreen';
import { RoomLobby } from '@/components/RoomLobby';
import { ChatRoom } from '@/components/ChatRoom';
import { NotificationToast } from '@/components/NotificationToast';
import { Modal } from '@/components/Modal';
import { ImageViewer } from '@/components/ImageViewer';

export default function Home() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDestroyModalOpen, setIsDestroyModalOpen] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; name?: string } | null>(null);
  const [initialRoomQuery, setInitialRoomQuery] = useState<string>('');

  const chatControllerRef = useRef<PeerChatController | null>(null);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

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
      const savedUser = sessionStorage.getItem('canal_seguro_user');
      if (savedUser) {
        try {
          setUserProfile(JSON.parse(savedUser));
        } catch {}
      }

      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      if (room) {
        setInitialRoomQuery(room.toUpperCase());
      }
    }
  }, []);

  const handleLogin = (profile: UserProfile) => {
    setUserProfile(profile);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('canal_seguro_user', JSON.stringify(profile));
    }
    addToast(`Bienvenido, ${profile.username}. Sesión iniciada localmente.`, 'success');
  };

  const handleLogout = () => {
    if (chatControllerRef.current) {
      chatControllerRef.current.destroyRoomLocally();
      chatControllerRef.current = null;
    }
    setUserProfile(null);
    setActiveRoomId(null);
    setMessages([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('canal_seguro_user');
    }
    addToast('Sesión cerrada.', 'info');
  };

  const handleTypingStateChanged = useCallback((senderId: string, senderName: string, isTyping: boolean) => {
    const existingTimeout = typingTimeoutsRef.current.get(senderId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      typingTimeoutsRef.current.delete(senderId);
    }

    if (isTyping) {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.set(senderId, senderName);
        return next;
      });

      const timeout = setTimeout(() => {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(senderId);
          return next;
        });
        typingTimeoutsRef.current.delete(senderId);
      }, 3000);

      typingTimeoutsRef.current.set(senderId, timeout);
    } else {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(senderId);
        return next;
      });
    }
  }, []);

  const handleJoinRoom = async (
    roomId: string,
    passkey: string,
    hostMode: boolean
  ): Promise<void> => {
    if (!userProfile) return;
    setIsLoading(true);

    try {
      const controller = new PeerChatController({
        onMessageReceived: (msg) => {
          setMessages((prev) => [...prev, msg]);
        },
        onParticipantsUpdated: (updatedList) => {
          setParticipants(updatedList);
        },
        onTypingStateChanged: handleTypingStateChanged,
        onRoomDestroyed: () => {
          setMessages([]);
          setActiveRoomId(null);
          setTypingUsers(new Map());
          addToast('La sala y sus mensajes han sido destruidos por el anfitrión.', 'warning');
        },
        onError: (errText) => {
          addToast(errText, 'error');
          setIsLoading(false);
        },
        onConnected: () => {
          setActiveRoomId(roomId);
          setIsHost(hostMode);
          setIsLoading(false);
          addToast(
            hostMode ? `Sala ${roomId} creada con cifrado E2EE activo.` : `Conectado a la sala ${roomId}.`,
            'success'
          );
        }
      });

      chatControllerRef.current = controller;
      await controller.initialize(roomId, passkey, userProfile.username, hostMode);
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

  const handleSendTypingStatus = (isTyping: boolean) => {
    if (chatControllerRef.current) {
      chatControllerRef.current.sendTypingStatus(isTyping);
    }
  };

  const handleConfirmDestroyRoom = () => {
    setIsDestroyModalOpen(false);
    if (chatControllerRef.current) {
      chatControllerRef.current.destroyRoom();
      chatControllerRef.current = null;
    }
    setMessages([]);
    setActiveRoomId(null);
    setTypingUsers(new Map());
    addToast('Sala destruida. Todos los datos fueron eliminados de la memoria.', 'info');
  };

  const handleLeaveRoom = () => {
    if (chatControllerRef.current) {
      chatControllerRef.current.destroyRoomLocally();
      chatControllerRef.current = null;
    }
    setMessages([]);
    setActiveRoomId(null);
    setTypingUsers(new Map());
    addToast('Has abandonado la sala.', 'info');
  };

  const handleClearLocalMessages = () => {
    setMessages([]);
    addToast('Historial local vaciado de la pantalla.', 'info');
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center">
      {!userProfile ? (
        <LoginScreen onLogin={handleLogin} isLoading={isLoading} />
      ) : !activeRoomId ? (
        <div className="p-4 sm:p-6 w-full flex items-center justify-center">
          <RoomLobby
            userProfile={userProfile}
            onLogout={handleLogout}
            onJoinRoom={handleJoinRoom}
            isLoading={isLoading}
            initialRoomId={initialRoomQuery}
          />
        </div>
      ) : (
        <ChatRoom
          roomId={activeRoomId}
          username={userProfile.username}
          isHost={isHost}
          participants={participants}
          messages={messages}
          typingUsers={Array.from(typingUsers.values())}
          onSendMessage={handleSendMessage}
          onSendTypingStatus={handleSendTypingStatus}
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
