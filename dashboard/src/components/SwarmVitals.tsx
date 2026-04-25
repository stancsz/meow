"use client";

import React from "react";
import { Cpu, Database, Network, Zap } from "lucide-react";

export function SwarmVitals() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {[
        { label: "Active Wings", value: "4", total: "4", icon: Network, color: "text-purple-400" },
        { label: "Memory Coherence", value: "98.2%", total: "100%", icon: Database, color: "text-cyan-400" },
        { label: "Inference Speed", value: "124", total: "t/s", icon: Zap, color: "text-yellow-400" },
        { label: "Swarm Load", value: "42%", total: "100%", icon: Cpu, color: "text-emerald-400" },
      ].map((stat) => (
        <div key={stat.label} className="glass p-5 rounded-2xl border-white/5 group hover:border-primary/30 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2 rounded-lg bg-white/5 ${stat.color}`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">
              Live
            </div>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold tracking-tight text-white">{stat.value}</span>
            <span className="text-sm font-medium text-muted-foreground pb-1">{stat.total}</span>
          </div>
          <div className="mt-3 text-sm font-medium text-muted-foreground">
            {stat.label}
          </div>
          <div className="mt-4 w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
             <div 
               className={`h-full bg-primary neon-glow rounded-full transition-all duration-1000`} 
               style={{ width: stat.value.includes("%") ? stat.value : "100%" }}
             />
          </div>
        </div>
      ))}
    </div>
  );
}
