'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, User, KeyRound, Lock, ArrowRight, CheckCircle2, Radio, Key } from 'lucide-react';
import { UserProfile } from '@/types/chat';

interface LoginScreenProps {
  onLogin: (profile: UserProfile, targetRoomId?: string, targetPasskey?: string) => void;
  isLoading: boolean;
  inviteRoomId?: string;
  invitePasskey?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  isLoading,
  inviteRoomId,
  invitePasskey
}) => {
  const [username, setUsername] = useState('');
  const [manualPasskey, setManualPasskey] = useState(invitePasskey || '');
  const [errorMsg, setErrorMsg] = useState('');

  const hasInvite = Boolean(inviteRoomId);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMsg('Introduce un nombre o alias para identificarte.');
      return;
    }

    if (cleanUsername.length < 2) {
      setErrorMsg('El alias debe contener al menos 2 caracteres.');
      return;
    }

    const effectivePasskey = (invitePasskey || manualPasskey).trim();

    if (hasInvite && !effectivePasskey) {
      setErrorMsg('Debes introducir la clave de cifrado de la sala.');
      return;
    }

    const profile: UserProfile = {
      id: `usr-${Math.random().toString(36).substring(2, 9)}`,
      username: cleanUsername,
      loggedInAt: Date.now()
    };

    if (hasInvite && inviteRoomId) {
      onLogin(profile, inviteRoomId, effectivePasskey);
    } else {
      onLogin(profile);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <Card className="border-zinc-800 bg-zinc-900/95 shadow-2xl">
        <CardHeader className="space-y-3 pb-5 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-100 shadow-md">
            <ShieldCheck className="w-6 h-6 text-zinc-200" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold tracking-tight text-zinc-100">
              {hasInvite ? 'Invitación a Canal Seguro' : 'Acceso a Canal Seguro'}
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              {hasInvite
                ? `Te han invitado a unirte a una conversación privada y efímera`
                : 'Inicia sesión local protegida para crear o unirte a salas privadas'}
            </CardDescription>
          </div>

          {hasInvite ? (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  Sala de destino:
                </span>
                <span className="text-xs font-mono font-bold text-zinc-100 uppercase tracking-wider">
                  {inviteRoomId}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                {invitePasskey ? (
                  <Badge variant="success" className="text-[10px] gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Clave E2EE detectada en el enlace
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Key className="w-2.5 h-2.5" />
                    Requiere clave de cifrado
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5 pt-1">
              <Badge variant="outline" className="text-[10px] gap-1">
                <Lock className="w-2.5 h-2.5 text-emerald-400" />
                E2EE Criptográfico
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <CheckCircle2 className="w-2.5 h-2.5 text-zinc-400" />
                Cero Registros
              </Badge>
            </div>
          )}
        </CardHeader>

        <form onSubmit={handleLoginSubmit}>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                Tu Nombre o Alias en la Sala
              </label>
              <Input
                type="text"
                placeholder="Ej. Kevin, Alex, Carlos..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={24}
                autoFocus
                className="h-10 text-sm bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-500"
              />
            </div>

            {hasInvite && !invitePasskey && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                  Clave de Cifrado de la Sala
                </label>
                <Input
                  type="password"
                  placeholder="Contraseña compartida por quien te invitó"
                  value={manualPasskey}
                  onChange={(e) => setManualPasskey(e.target.value)}
                  className="h-10 text-sm bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-500"
                />
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300">
                {errorMsg}
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-2 flex flex-col gap-3">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 text-xs font-semibold gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
              ) : (
                <>
                  <span>{hasInvite ? `Unirse a la sala ${inviteRoomId}` : 'Ingresar al Sistema'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
            <p className="text-[11px] text-center text-zinc-400">
              Conexión directa peer-to-peer. Los datos desaparecen al salir o destruir la sala.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
