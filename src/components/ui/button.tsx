import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantStyles = {
      default: 'bg-zinc-100 text-zinc-900 shadow hover:bg-zinc-200 border border-zinc-200',
      destructive: 'bg-rose-950/80 text-rose-200 shadow-sm hover:bg-rose-900 border border-rose-800/80',
      outline: 'border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-200 shadow-sm',
      secondary: 'bg-zinc-800 text-zinc-200 shadow-sm hover:bg-zinc-700 border border-zinc-700',
      ghost: 'hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100',
      link: 'text-zinc-200 underline-offset-4 hover:underline'
    }[variant];

    const sizeStyles = {
      default: 'h-9 px-4 py-2 text-xs font-medium',
      sm: 'h-8 rounded-md px-3 text-[11px] font-medium',
      lg: 'h-10 rounded-lg px-6 text-sm font-medium',
      icon: 'h-9 w-9 p-0'
    }[size];

    return (
      <button
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
          variantStyles,
          sizeStyles,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
