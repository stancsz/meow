"use client";

import React from "react";
import { Lock, ShieldAlert, Check, X, ShieldCheck } from "lucide-react";

export function PermissionsGate() {
  return (
    <div className="fixed bottom-8 right-8 w-96 glass-blur rounded-3xl p-6 border-primary/30 neon-glow z-[100] animate-in slide-in-from-bottom-10 fade-in duration-500">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-primary/20 text-primary">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-white font-bold tracking-tight">Permission Request</h3>
          <p className="text-xs text-muted-foreground">High-privilege operation detected</p>
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl p-4 mb-6 border border-white/5">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-xs font-mono text-yellow-500 font-bold uppercase">System Write Access</span>
        </div>
        <p className="text-sm text-white/90 leading-relaxed font-medium">
          Agent wants to modify <code className="bg-black/40 px-1.5 py-0.5 rounded text-primary">agent-harness/jobs/bun-orchestrator.ts</code> to implement the Shadow Mirror.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/5 border border-white/10 text-white font-bold hover:bg-red-500/10 hover:border-red-500/30 transition-all text-sm group">
          <X className="w-4 h-4 group-hover:text-red-500 transition-colors" />
          Deny
        </button>
        <button className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-primary text-white font-bold hover:scale-[1.02] active:scale-95 transition-all text-sm shadow-lg shadow-primary/20">
          <Check className="w-4 h-4" />
          Allow Once
        </button>
      </div>
      
      <button className="w-full mt-3 flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-white transition-colors">
        <ShieldCheck className="w-3 h-3" />
        Always allow for this session
      </button>
    </div>
  );
}
