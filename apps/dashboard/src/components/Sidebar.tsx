"use client";

import React from "react";
import { 
  LayoutDashboard, 
  Cpu, 
  Brain, 
  Zap, 
  Settings, 
  History,
  Activity,
  Layers
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Mission Control", active: true },
  { icon: Activity, label: "Swarm Status", active: false },
  { icon: Brain, label: "Memory Palace", active: false },
  { icon: Zap, label: "Curiosity Backlog", active: false },
  { icon: Layers, label: "Resolution Gate", active: false },
  { icon: History, label: "Episodic Log", active: false },
];

export function Sidebar() {
  return (
    <aside className="w-64 glass border-r h-screen sticky top-0 flex flex-col p-4 z-50">
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="w-8 h-8 rounded-lg bg-primary neon-glow flex items-center justify-center">
          <Zap className="text-white w-5 h-5 fill-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">
          MEOWJU<span className="text-primary text-xs ml-1 align-top tracking-[0.2em]">COWORKER</span>
        </h1>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
              item.active 
                ? "bg-primary/20 text-primary border border-primary/20" 
                : "text-muted-foreground hover:bg-white/5 hover:text-white"
            }`}
          >
            <item.icon className={`w-5 h-5 ${item.active ? "text-primary" : "text-muted-foreground group-hover:text-white"}`} />
            <span className="font-medium">{item.label}</span>
            {item.active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary neon-glow animate-pulse" />}
          </button>
        ))}
      </nav>

      <div className="pt-4 mt-4 border-t border-white/5 space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-white/5 hover:text-white transition-all">
          <Settings className="w-5 h-5" />
          <span className="font-medium">Orchestrator Settings</span>
        </button>
      </div>
    </aside>
  );
}
