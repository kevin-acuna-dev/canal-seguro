'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, User, KeyRound, Lock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { UserProfile } from '@/types/chat';

interface LoginScreenProps {
  onLogin: (profile: UserProfile) => void;
  isLoading: boolean;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, isLoading }) => {
  const [username, setUsername] = useState('');
  const [accessPin, setAccessPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMsg('Introduce un nombre de usuario o alias para identificarte.');
      return;
    }

    if (cleanUsername.length < 2) {
      setErrorMsg('El nombre de usuario debe contener al menos 2 caracteres.');
      return;
    }

    const profile: UserProfile = {
      id: `usr-${Math.random().toString(36).substring(2, 9)}`,
      username: cleanUsername,
      loggedInAt: Date.now()
    };

    onLogin(profile);
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
              Acceso a Canal Seguro
            </CardTitle>
            <CardDescription className="text-xs text-zinc-400">
              Inicia sesión local protegida para crear o unirte a salas privadas
            </CardDescription>
          </div>
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
        </CardHeader>

        <form onSubmit={handleLoginSubmit}>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400" />
                Nombre o Alias de Usuario
              </label>
              <Input
                type="text"
                placeholder="Ej. Kevin, Alex, Marcus..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={24}
                autoFocus
                className="h-10 text-sm bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                PIN o Clave de Sesión (Opcional)
              </label>
              <Input
                type="password"
                placeholder="PIN personal para la sesión"
                value={accessPin}
                onChange={(e) => setAccessPin(e.target.value)}
                maxLength={16}
                className="h-10 text-sm bg-zinc-950 border-zinc-800 focus-visible:ring-zinc-500"
              />
              <span className="block text-[11px] text-zinc-400">
                Tu sesión se mantiene estrictamente en la memoria del navegador.
              </span>
            </div>

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
                  <span>Ingresar al Sistema</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
            <p className="text-[11px] text-center text-zinc-400">
              Arquitectura descentralizada. Ninguna credencial se envía a servidores de terceros.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};
