"use client";

import React, { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";

const logs = [
  { type: "info", time: "10:02:14", msg: "Scanning workspace: /meow-1" },
  { type: "info", time: "10:02:15", msg: "Loaded memory state from Sovereign Palace" },
  { type: "system", time: "10:02:16", msg: ">>> HYPOTHESIS: Shadow Mirror required for safety 🚀" },
  { type: "tool", time: "10:02:18", msg: "[sh] bun test --all" },
  { type: "success", time: "10:02:22", msg: "Base tests passed. Proceeding with architecture drafting." },
  { type: "info", time: "10:02:24", msg: "Updating JOB.md with 1080p roadmap..." },
  { type: "warn", time: "10:02:25", msg: "Detected path discrepancy in bun-orchestrator.ts" },
];

export function MissionLog() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="glass rounded-2xl flex flex-col h-[400px] border-white/5 overflow-hidden">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-bold text-white tracking-tight">Mission Log</span>
        </div>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/40" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 p-4 font-mono text-xs overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-white/10"
      >
        {logs.map((log, i) => (
          <div key={i} className="flex gap-3 group">
            <span className="text-muted-foreground/40 shrink-0">{log.time}</span>
            <span className={`
              ${log.type === "system" ? "text-primary font-bold" : ""}
              ${log.type === "success" ? "text-emerald-400" : ""}
              ${log.type === "tool" ? "text-cyan-300" : ""}
              ${log.type === "warn" ? "text-yellow-500" : ""}
              ${log.type === "info" ? "text-muted-foreground" : ""}
            `}>
              {log.msg}
            </span>
          </div>
        ))}
        <div className="flex gap-2 items-center text-primary animate-pulse py-1">
          <span className="w-1.5 h-3 bg-primary" />
          <span>Listening for swarm events...</span>
        </div>
      </div>
    </div>
  );
}
