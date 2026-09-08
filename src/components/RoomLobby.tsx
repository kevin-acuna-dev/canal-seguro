'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import {
  ShieldCheck,
  Lock,
  Key,
  LogIn,
  Plus,
  Eye,
  EyeOff,
  Radio,
  LogOut,
  RefreshCw
} from 'lucide-react';
import { UserProfile } from '@/types/chat';

interface RoomLobbyProps {
  userProfile: UserProfile;
  onLogout: () => void;
  onJoinRoom: (roomId: string, passkey: string, isHost: boolean) => Promise<void>;
  isLoading: boolean;
  initialRoomId?: string;
  initialPasskey?: string;
}

export const RoomLobby: React.FC<RoomLobbyProps> = ({
  userProfile,
  onLogout,
  onJoinRoom,
  isLoading,
  initialRoomId = '',
  initialPasskey = ''
}) => {
  const [mode, setMode] = useState<'create' | 'join'>(initialRoomId ? 'join' : 'create');
  const [roomId, setRoomId] = useState<string>(initialRoomId || generateRandomRoomId());
  const [passkey, setPasskey] = useState<string>(initialPasskey);
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

    if (!cleanRoomId) {
      setFormError('Introduce un código de sala válido.');
      return;
    }

    if (!cleanPasskey) {
      setFormError('Introduce la clave de cifrado E2EE.');
      return;
    }

    if (cleanPasskey.length < 4) {
      setFormError('La clave de cifrado debe tener al menos 4 caracteres.');
      return;
    }

    await onJoinRoom(cleanRoomId, cleanPasskey, mode === 'create');
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <Card className="border-zinc-800 bg-zinc-900/95 shadow-2xl">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2.5">
              <Avatar name={userProfile.username} size="sm" />
              <div>
                <p className="text-xs font-semibold text-zinc-200 leading-tight">
                  {userProfile.username}
                </p>
                <p className="text-[10px] text-zinc-500 font-mono">Sesión iniciada</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="h-7 px-2 text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              <LogOut className="w-3 h-3 mr-1" />
              Cambiar
            </Button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shadow-sm shrink-0">
              <ShieldCheck className="w-5 h-5 text-zinc-200" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-zinc-100">
                Canal Seguro P2P
              </CardTitle>
              <CardDescription className="text-xs text-zinc-400">
                Crea una sala efímera o conéctate al canal de un amigo
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950 rounded-lg border border-zinc-800">
              <Button
                type="button"
                variant={mode === 'create' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setMode('create');
                  setFormError('');
                  if (!roomId) handleGenerateNewCode();
                }}
                className="w-full gap-1.5 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear sala
              </Button>
              <Button
                type="button"
                variant={mode === 'join' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setMode('join');
                  setFormError('');
                }}
                className="w-full gap-1.5 font-semibold"
              >
                <LogIn className="w-3.5 h-3.5" />
                Unirse a sala
              </Button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-zinc-400" />
                  Código de la sala
                </label>
                {mode === 'create' && (
                  <button
                    type="button"
                    onClick={handleGenerateNewCode}
                    className="text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Aleatorio
                  </button>
                )}
              </div>
              <Input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="EJ. ALPHA9"
                maxLength={12}
                className="h-10 text-sm font-mono uppercase tracking-widest text-center"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-zinc-400" />
                Clave secreta E2EE (AES-256)
              </label>
              <div className="relative">
                <Input
                  type={showPasskey ? 'text' : 'password'}
                  value={passkey}
                  onChange={(e) => setPasskey(e.target.value)}
                  placeholder="Contraseña compartida para cifrar mensajes"
                  className="h-10 pr-9 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPasskey(!showPasskey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                  aria-label="Mostrar u ocultar clave"
                >
                  {showPasskey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-zinc-400">
                Los mensajes y fotos solo pueden ser leídos por quienes compartan esta misma clave.
              </p>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300">
                {formError}
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-1 flex flex-col gap-3">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 text-xs font-semibold gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>{mode === 'create' ? 'Iniciar Sala Cifrada' : 'Conectarse a la Sala'}</span>
            </Button>
            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-800">
                P2P Sin Servidor
              </Badge>
              <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-800">
                Autodestructible
              </Badge>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
