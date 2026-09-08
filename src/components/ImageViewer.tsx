'use client';

import React from 'react';
import { X, Download } from 'lucide-react';

interface ImageViewerProps {
  src: string | null;
  name?: string;
  onClose: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ src, name, onClose }) => {
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute -top-12 right-0 flex items-center gap-2">
          <a
            href={src}
            download={name || 'imagen-segura.webp'}
            className="p-2 rounded-lg bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-700 transition-colors"
            title="Descargar imagen"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-700 transition-colors"
            title="Cerrar visor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <img
          src={src}
          alt={name || 'Vista previa'}
          className="max-h-[85vh] max-w-full rounded-lg object-contain border border-zinc-800 shadow-2xl"
        />
        {name && (
          <span className="mt-3 text-xs text-zinc-400 font-mono tracking-wide">{name}</span>
        )}
      </div>
    </div>
  );
};
