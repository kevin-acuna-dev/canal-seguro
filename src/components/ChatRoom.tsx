'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  ChatMessage,
  Participant
} from '@/types/chat';
import {
  ShieldCheck,
  Send,
  Image as ImageIcon,
  Mic,
  Square,
  Trash2,
  Users,
  Copy,
  LogOut,
  Eraser,
  Lock,
  Radio,
  Pencil,
  Share2,
  Check,
  Key
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { compressImage, VoiceRecorder } from '@/utils/media';

interface ChatRoomProps {
  roomId: string;
  passkey: string;
  username: string;
  isHost: boolean;
  participants: Participant[];
  messages: ChatMessage[];
  typingUsers: string[];
  onSendMessage: (content: string, type: 'text' | 'image' | 'audio', mediaName?: string, mediaSize?: number) => Promise<void>;
  onSendTypingStatus: (isTyping: boolean) => void;
  onDestroyRoom: () => void;
  onLeaveRoom: () => void;
  onClearLocalMessages: () => void;
  onOpenImageViewer: (src: string, name?: string) => void;
  onAddToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  roomId,
  passkey,
  username,
  isHost,
  participants,
  messages,
  typingUsers,
  onSendMessage,
  onSendTypingStatus,
  onDestroyRoom,
  onLeaveRoom,
  onClearLocalMessages,
  onOpenImageViewer,
  onAddToast
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputText(value);

    if (value.trim().length > 0) {
      onSendTypingStatus(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onSendTypingStatus(false);
      }, 2500);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      onSendTypingStatus(false);
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || isSending) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    onSendTypingStatus(false);

    const content = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      await onSendMessage(content, 'text');
    } catch {
      onAddToast('No se pudo enviar el mensaje cifrado.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendText();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onAddToast('Solo se admiten archivos de imagen.', 'warning');
      return;
    }

    setIsSending(true);
    try {
      const compressed = await compressImage(file, 1280, 0.82);
      await onSendMessage(compressed.dataUrl, 'image', file.name, compressed.size);
      onAddToast('Imagen cifrada y enviada.', 'success');
    } catch {
      onAddToast('Fallo al procesar y cifrar la imagen.', 'error');
    } finally {
      setIsSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setIsSending(true);
          try {
            const compressed = await compressImage(file, 1280, 0.82);
            await onSendMessage(compressed.dataUrl, 'image', 'captura-portapapeles.webp', compressed.size);
            onAddToast('Imagen pegada y enviada cifrada.', 'success');
          } catch {
            onAddToast('Error al enviar la imagen del portapapeles.', 'error');
          } finally {
            setIsSending(false);
          }
          break;
        }
      }
    }
  };

  const handleToggleRecordVoice = async () => {
    if (isRecording) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setIsRecording(false);
      setIsSending(true);

      try {
        if (voiceRecorderRef.current) {
          const audioBase64 = await voiceRecorderRef.current.stop();
          await onSendMessage(audioBase64, 'audio', 'nota-de-voz.webm');
          onAddToast('Nota de voz enviada.', 'success');
        }
      } catch {
        onAddToast('Error al capturar la nota de audio.', 'error');
      } finally {
        setIsSending(false);
        setRecordingSeconds(0);
      }
    } else {
      try {
        const recorder = new VoiceRecorder();
        await recorder.start();
        voiceRecorderRef.current = recorder;
        setIsRecording(true);
        setRecordingSeconds(0);

        timerIntervalRef.current = setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch {
        onAddToast('No se pudo acceder al micrófono para grabar audio.', 'error');
      }
    }
  };

  const handleCancelVoice = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (voiceRecorderRef.current) {
      voiceRecorderRef.current.cancel();
      voiceRecorderRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    onAddToast('Grabación cancelada.', 'info');
  };

  const getFullInviteUrl = () => {
    return `${window.location.origin}?room=${roomId}&key=${encodeURIComponent(passkey)}`;
  };

  const getCleanInviteUrl = () => {
    return `${window.location.origin}?room=${roomId}`;
  };

  const handleCopyDirectLink = async () => {
    const url = getFullInviteUrl();
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    onAddToast('Enlace directo con clave copiado al portapapeles.', 'success');
  };

  const handleCopyCodeOnly = async () => {
    await navigator.clipboard.writeText(roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
    onAddToast('Código de sala copiado.', 'success');
  };

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-zinc-950 text-zinc-100 antialiased overflow-hidden">
      <header className="h-14 border-b border-zinc-800 bg-zinc-900/90 px-4 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-zinc-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-widest text-zinc-200">
                SALA: {roomId}
              </span>
              <Badge variant="success" className="gap-1">
                <Lock className="w-2.5 h-2.5" />
                E2EE Activo
              </Badge>
            </div>
            <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
              <Radio className="w-2.5 h-2.5 text-emerald-400" />
              <span>{isHost ? 'Anfitrión' : 'Participante'}: {username}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowShareModal(true)}
            className="gap-1.5"
            title="Compartir enlace de sala"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Invitar amigos</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowParticipantsModal(true)}
            className="gap-1.5"
            title="Ver participantes"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{participants.length}</span>
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={onClearLocalMessages}
            title="Limpiar mensajes locales"
          >
            <Eraser className="w-4 h-4" />
          </Button>

          {isHost ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onDestroyRoom}
              className="gap-1.5 font-semibold"
              title="Destruir sala y borrar datos"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Destruir sala</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onLeaveRoom}
              className="gap-1.5"
              title="Salir de la sala"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        <div className="text-center my-2">
          <Badge variant="outline" className="text-[11px] text-zinc-400 py-1 px-3 border-zinc-800 gap-1.5">
            <Lock className="w-3 h-3 text-zinc-400" />
            Cifrado AES-256-GCM punto a punto. Tus amigos pueden unirse con el enlace de invitación.
          </Badge>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-zinc-400">
            <ShieldCheck className="w-10 h-10 mb-2 stroke-1 text-zinc-600" />
            <p className="text-xs">No hay mensajes en esta sesión.</p>
            <p className="text-[11px] mt-1 text-zinc-400">
              Escribe un texto o comparte una foto para iniciar la conversación cifrada.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === 'system') {
            return (
              <div key={msg.id} className="text-center my-2">
                <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800/80">
                  {msg.content}
                </span>
              </div>
            );
          }

          const isSelf = msg.isSelf;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} max-w-full`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                {!isSelf && <Avatar name={msg.senderName} size="sm" />}
                <span className="text-[11px] font-medium text-zinc-400">
                  {isSelf ? 'Tú' : msg.senderName}
                </span>
                <span className="text-[10px] text-zinc-400">{formatTime(msg.timestamp)}</span>
              </div>

              <div
                className={`max-w-[85%] sm:max-w-md rounded-2xl px-3.5 py-2.5 shadow-sm text-sm break-words ${
                  isSelf
                    ? 'bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-tr-none'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none'
                }`}
              >
                {msg.type === 'text' && (
                  <p className="whitespace-pre-wrap leading-relaxed select-text">{msg.content}</p>
                )}

                {msg.type === 'image' && (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenImageViewer(msg.content, msg.mediaName)}
                      className="block overflow-hidden rounded-lg border border-zinc-700/60 focus:outline-none transition-transform hover:scale-[1.01]"
                    >
                      <img
                        src={msg.content}
                        alt={msg.mediaName || 'Imagen compartida'}
                        className="max-h-72 w-full object-cover rounded-lg"
                        loading="lazy"
                      />
                    </button>
                    {msg.mediaName && (
                      <div className="text-[10px] text-zinc-400 font-mono truncate max-w-xs">
                        {msg.mediaName}
                      </div>
                    )}
                  </div>
                )}

                {msg.type === 'audio' && (
                  <div className="flex items-center gap-2 py-1 min-w-[200px]">
                    <audio src={msg.content} controls className="w-full h-8 brightness-90 contrast-125" />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-400 animate-pulse">
            <Pencil className="w-3 h-3 text-zinc-400" />
            <span>
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'está escribiendo...' : 'están escribiendo...'}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-zinc-900/95 border-t border-zinc-800 shrink-0">
        {isRecording ? (
          <div className="flex items-center justify-between p-2.5 bg-zinc-950 border border-rose-900/60 rounded-xl">
            <div className="flex items-center gap-3 text-rose-400 text-xs font-semibold px-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span>Grabando nota de voz: {formatSeconds(recordingSeconds)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelVoice}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleToggleRecordVoice}
                className="gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                Enviar nota
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendText} className="flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending}
              title="Adjuntar imagen"
            >
              <ImageIcon className="w-4 h-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleToggleRecordVoice}
              disabled={isSending}
              title="Grabar nota de voz"
            >
              <Mic className="w-4 h-4" />
            </Button>

            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                rows={1}
                placeholder="Escribe un mensaje cifrado o pega una imagen..."
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 resize-none max-h-28 overflow-y-auto leading-normal transition-colors"
              />
            </div>

            <Button
              type="submit"
              disabled={!inputText.trim() || isSending}
              size="icon"
              className="h-10 w-10 shrink-0"
              title="Enviar mensaje"
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        )}
      </div>

      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-zinc-100 text-sm font-semibold">
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Invitar a tus amigos a la sala</span>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-medium">Enlace directo con clave (1 clic para entrar):</span>
                  <Badge variant="success" className="text-[9px]">Recomendado</Badge>
                </div>
                <div className="p-2 bg-zinc-900 rounded-lg font-mono text-[11px] text-zinc-300 break-all select-all border border-zinc-800">
                  {getFullInviteUrl()}
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleCopyDirectLink}
                  className="w-full gap-1.5"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copiado al portapapeles' : 'Copiar enlace completo con clave'}</span>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="text-[10px] text-zinc-400 block mb-1">Código de sala:</span>
                  <span className="font-mono font-bold text-zinc-200 text-xs block">{roomId}</span>
                </div>
                <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                  <span className="text-[10px] text-zinc-400 block mb-1">Clave de cifrado:</span>
                  <span className="font-mono font-bold text-zinc-200 text-xs block">{passkey}</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyCodeOnly}
                className="w-full gap-1.5"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copiar solo código de sala</span>
              </Button>
            </div>

            <div className="px-5 py-3 bg-zinc-950 border-t border-zinc-800 text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShareModal(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}

      {showParticipantsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2 text-zinc-200 text-sm font-semibold">
                <Users className="w-4 h-4" />
                <span>Participantes en línea ({participants.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowParticipantsModal(false)}
                className="text-zinc-400 hover:text-zinc-200 p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar name={p.name} size="sm" />
                    <span className="font-medium text-zinc-200">{p.name}</span>
                  </div>
                  {p.isHost && (
                    <Badge variant="secondary" className="text-[10px]">
                      Anfitrión
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-3 bg-zinc-950 border-t border-zinc-800 text-right">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowParticipantsModal(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
