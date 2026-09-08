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
  const [currentPasskey, setCurrentPasskey] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isDestroyModalOpen, setIsDestroyModalOpen] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<{ src: string; name?: string } | null>(null);
  const [inviteRoomId, setInviteRoomId] = useState<string>('');
  const [invitePasskey, setInvitePasskey] = useState<string>('');

  const chatControllerRef = useRef<PeerChatController | null>(null);
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setToasts((prev) => {
      if (prev.some((t) => t.message === message)) {
        return prev;
      }
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t.id !== id));
      }, 4000);
      return [...prev.slice(-2), { id, message, type }];
    });
  }, []);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleJoinRoom = useCallback(async (
    roomId: string,
    passkey: string,
    hostMode: boolean,
    profileOverride?: UserProfile
  ): Promise<void> => {
    const activeUser = profileOverride || userProfile;
    if (!activeUser) return;

    setIsLoading(true);
    setCurrentPasskey(passkey);

    try {
      const controller = new PeerChatController({
        onMessageReceived: (msg) => {
          setMessages((prev) => [...prev, msg]);
        },
        onParticipantsUpdated: (updatedList) => {
          setParticipants(updatedList);
        },
        onTypingStateChanged: (senderId, senderName, isTyping) => {
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
        },
        onRoomDestroyed: () => {
          setMessages([]);
          setActiveRoomId(null);
          setCurrentPasskey('');
          setTypingUsers(new Map());
          addToast('La sala y sus mensajes han sido destruidos por el anfitrión.', 'warning');
        },
        onError: (errText) => {
          addToast(errText, 'error');
          setIsLoading(false);
        },
        onConnected: () => {
          setActiveRoomId(roomId.toUpperCase());
          setIsHost(hostMode);
          setIsLoading(false);
          addToast(
            hostMode ? `Sala ${roomId} creada con cifrado E2EE activo.` : `Conectado a la sala ${roomId}.`,
            'success'
          );
        }
      });

      chatControllerRef.current = controller;
      await controller.initialize(roomId, passkey, activeUser.username, hostMode);
    } catch (err) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : 'Error al conectar con la sala';
      addToast(msg, 'error');
    }
  }, [userProfile, addToast]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let detectedRoom = '';
      let detectedKey = '';

      const searchParams = new URLSearchParams(window.location.search);
      detectedRoom = searchParams.get('room') || '';
      detectedKey = searchParams.get('key') || '';

      if (!detectedRoom && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
        detectedRoom = hashParams.get('room') || '';
        detectedKey = hashParams.get('key') || '';
      }

      if (detectedRoom) {
        setInviteRoomId(detectedRoom.toUpperCase());
      }
      if (detectedKey) {
        setInvitePasskey(detectedKey);
      }

      const savedUser = sessionStorage.getItem('canal_seguro_user');
      if (savedUser) {
        try {
          const parsed = JSON.parse(savedUser);
          setUserProfile(parsed);

          if (detectedRoom && detectedKey) {
            handleJoinRoom(detectedRoom.toUpperCase(), detectedKey, false, parsed);
          }
        } catch {}
      }
    }
  }, [handleJoinRoom]);

  const handleLogin = async (profile: UserProfile, targetRoomId?: string, targetPasskey?: string) => {
    setUserProfile(profile);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('canal_seguro_user', JSON.stringify(profile));
    }

    if (targetRoomId && targetPasskey) {
      addToast(`Identificado como ${profile.username}. Conectando a la sala ${targetRoomId}...`, 'info');
      await handleJoinRoom(targetRoomId, targetPasskey, false, profile);
    } else {
      addToast(`Bienvenido, ${profile.username}. Sesión iniciada localmente.`, 'success');
    }
  };

  const handleLogout = () => {
    if (chatControllerRef.current) {
      chatControllerRef.current.destroyRoomLocally();
      chatControllerRef.current = null;
    }
    setUserProfile(null);
    setActiveRoomId(null);
    setCurrentPasskey('');
    setMessages([]);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('canal_seguro_user');
    }
    addToast('Sesión cerrada.', 'info');
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
    setCurrentPasskey('');
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
    setCurrentPasskey('');
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
        <LoginScreen
          onLogin={handleLogin}
          isLoading={isLoading}
          inviteRoomId={inviteRoomId}
          invitePasskey={invitePasskey}
        />
      ) : !activeRoomId ? (
        <div className="p-4 sm:p-6 w-full flex items-center justify-center">
          <RoomLobby
            userProfile={userProfile}
            onLogout={handleLogout}
            onJoinRoom={handleJoinRoom}
            isLoading={isLoading}
            initialRoomId={inviteRoomId}
            initialPasskey={invitePasskey}
          />
        </div>
      ) : (
        <ChatRoom
          roomId={activeRoomId}
          passkey={currentPasskey}
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
