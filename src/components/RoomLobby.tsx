'use client';

import React, { useState } from 'react';
import { ShieldCheck, Lock, User, Key, LogIn, Plus, Eye, EyeOff, Radio } from 'lucide-react';

interface RoomLobbyProps {
  onJoinRoom: (roomId: string, passkey: string, username: string, isHost: boolean) => Promise<void>;
  isLoading: boolean;
  initialRoomId?: string;
  initialPasskey?: string;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  onJoinRoom,
  isLoading,
  initialRoomId = '',
  initialPasskey = ''
}) => {
  const [mode, setMode] = useState<'create' | 'join'>(initialRoomId ? 'join' : 'create');
  const [roomId, setRoomId] = useState<string>(initialRoomId || generateRandomRoomId());
  const [passkey, setPasskey] = useState<string>(initialPasskey);
  const [username, setUsername] = useState<string>('');
  const [showPasskey, setShowPasskey] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');

  function generateRandomRoomId(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  const handleGenerateNewCode = () => {
    setRoomId(generateRandomRoomId());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanRoomId = roomId.trim().toUpperCase();
    const cleanPasskey = passkey.trim();
    const cleanUsername = username.trim() || `Usuario-${Math.floor(100 + Math.random() * 900)}`;

    if (!cleanRoomId) {
      setFormError('Introduce un código de sala válido.');
      return;
    }

    if (!cleanPasskey) {
      setFormError('Introduce una clave de cifrado para proteger los mensajes.');
      return;
    }

    if (cleanPasskey.length < 4) {
      setFormError('La clave de cifrado debe tener al menos 4 caracteres.');
      return;
    }

    await onJoinRoom(cleanRoomId, cleanPasskey, cleanUsername, mode === 'create');
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-center gap-3 mb-6 pb-4 border-b border-zinc-800/80">
          <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100">
            <ShieldCheck className="w-5 h-5 text-zinc-200" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Canal Seguro</h1>
            <p className="text-xs text-zinc-400">Comunicaciones privadas cifradas de extremo a extremo</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950/80 rounded-xl border border-zinc-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('create');
              setFormError('');
              if (!roomId) handleGenerateNewCode();
            }}
            className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'create'
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Crear sala
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('join');
              setFormError('');
            }}
            className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'join'
                ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Unirse a sala
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              Tu apodo o nombre
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej. Alex"
              maxLength={24}
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-zinc-400" />
                Código de la sala
              </label>
              {mode === 'create' && (
                <button
                  type="button"
                  onClick={handleGenerateNewCode}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors underline underline-offset-2"
                >
                  Generar otro
                </button>
              )}
            </div>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="CÓDIGO (Ej. 8F2K9A)"
              maxLength={12}
              className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm font-mono uppercase text-zinc-100 placeholder:text-zinc-600 tracking-wider focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-400" />
              Contraseña de cifrado E2EE
            </label>
            <div className="relative">
              <input
                type={showPasskey ? 'text' : 'password'}
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                placeholder="Clave secreta compartida con amigos"
                className="w-full pl-3.5 pr-10 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPasskey(!showPasskey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 transition-colors"
                aria-label="Alternar visibilidad"
              >
                {showPasskey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="block mt-1 text-[11px] text-zinc-400">
              Solo quienes conozcan esta clave podrán leer los mensajes y fotos.
            </span>
          </div>

          {formError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            <span>{mode === 'create' ? 'Iniciar sala cifrada' : 'Conectarse a la sala'}</span>
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-zinc-800/80 text-center">
          <p className="text-[11px] text-zinc-400">
            Sin almacenamiento en servidores. Al cerrar o destruir la sala, todos los datos se eliminan de la memoria.
          </p>
        </div>
      </div>
    </div>
  );
};
