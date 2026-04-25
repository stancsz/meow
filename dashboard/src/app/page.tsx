"use client";

import React from "react";
import { Sidebar } from "@/components/Sidebar";
import { SwarmVitals } from "@/components/SwarmVitals";
import { ExecutionTimeline } from "@/components/ExecutionTimeline";
import { MissionLog } from "@/components/MissionLog";
import { PermissionsGate } from "@/components/PermissionsGate";
import { 
  Plus, 
  Search, 
  Bell, 
  User, 
  ChevronRight,
  ShieldCheck,
  Globe,
  Wind
} from "lucide-react";

export default function Dashboard() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 flex flex-col p-8 overflow-hidden">
        {/* Top Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-primary font-medium text-sm mb-1">
              <Globe className="w-4 h-4" />
              <span>Local Workspace: Meow-1</span>
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Mission Control</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <input 
                type="text" 
                placeholder="Search memories or skills..." 
                className="bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all w-64"
              />
            </div>
            <button className="p-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all">
              <Bell className="w-5 h-5" />
            </button>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 border border-white/20 p-px">
              <div className="w-full h-full rounded-[10px] bg-background flex items-center justify-center">
                <User className="text-white w-5 h-5" />
              </div>
            </div>
          </div>
        </header>

        {/* Swarm High-Level Vitals */}
        <SwarmVitals />

        {/* Main Workspace */}
        <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
          
          {/* Left Column: Active Mission */}
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 min-h-0">
            <div className="glass rounded-3xl p-8 border-white/10 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <Wind className="w-24 h-24 text-primary" />
              </div>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest">
                  Current Epoch
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-widest">
                   <ShieldCheck className="w-4 h-4" />
                   Secure Environment
                </div>
              </div>

              <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight leading-none">
                720p Resolution Upgrade
              </h1>
              <p className="text-muted-foreground max-w-xl mb-8 leading-relaxed">
                Evolving the orchestrator to support [Q-WING] parallel reasoning and 
                establishing the Shadow Mirror safety gates for core development.
              </p>

              <div className="flex gap-4">
                <button className="px-6 py-3 bg-primary text-white font-bold rounded-2xl neon-glow hover:scale-[1.02] transition-all flex items-center gap-2">
                  <Plus className="w-5 h-5" />
                  New Mission
                </button>
                <button className="px-6 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-all flex items-center gap-2">
                  View Architecture
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <MissionLog />
          </div>

          {/* Right Column: Execution Plan */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6 min-h-0">
            <ExecutionTimeline />
            
            <div className="glass rounded-2xl p-6 border-white/5 flex-1 relative overflow-hidden">
               <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                 <Layers className="w-5 h-5 text-purple-400" />
                 Memory Fragments
               </h3>
               <div className="space-y-3">
                 {[
                   { label: "Ref: robotics_gap_analysis.md", score: 0.98 },
                   { label: "Lesson: path_resolution_host_native", score: 0.94 },
                   { label: "Arch: q_wing_concurrency", score: 0.88 },
                 ].map(item => (
                   <div key={item.label} className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-primary/20 transition-all text-sm group cursor-pointer">
                     <div className="flex justify-between items-center text-muted-foreground group-hover:text-white transition-colors">
                       <span>{item.label}</span>
                       <span className="text-[10px] font-mono opacity-50">{item.score}</span>
                     </div>
                   </div>
                 ))}
               </div>
               
               <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
            </div>
          </div>

        </div>
      </main>
      
      <PermissionsGate />
    </div>
  );
}
