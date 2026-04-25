"use client";

import React from "react";
import { X, Minus, Square } from "lucide-react";

export function WindowControls() {
  const isElectron = typeof window !== 'undefined' && window.process && (window.process as any).type === 'renderer';

  if (!isElectron) return null;

  const { ipcRenderer } = require('electron');

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-l border-white/5 no-drag">
      <button 
        onClick={() => ipcRenderer.send('window-minimize')}
        className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-colors"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button 
        onClick={() => ipcRenderer.send('window-close')}
        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
