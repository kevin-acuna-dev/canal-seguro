import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'border-transparent bg-zinc-100 text-zinc-900 shadow',
    secondary: 'border-zinc-700 bg-zinc-800 text-zinc-300',
    destructive: 'border-rose-800/60 bg-rose-950/70 text-rose-300',
    outline: 'text-zinc-300 border-zinc-800 bg-zinc-900/50',
    success: 'border-emerald-800/60 bg-emerald-950/70 text-emerald-300'
  }[variant];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-1 focus:ring-zinc-400',
        variantStyles,
        className
      )}
      {...props}
    />
  );
}
