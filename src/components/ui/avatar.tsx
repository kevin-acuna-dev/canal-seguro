import * as React from 'react';
import { cn } from '@/lib/utils';

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, size = 'md', className, ...props }: AvatarProps) {
  const initials = name
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('') || 'U';

  const sizeClasses = {
    sm: 'w-7 h-7 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm'
  }[size];

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 font-mono font-semibold text-zinc-200 select-none shadow-sm',
        sizeClasses,
        className
      )}
      {...props}
    >
      {initials}
    </div>
  );
}
