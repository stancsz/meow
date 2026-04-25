"use client";

import React, { useState } from "react";
import { Video, Play, Code, Layers, Share2, Download } from "lucide-react";

export function VideoStudio() {
  const [view, setView] = useState<"preview" | "code">("preview");

  return (
    <div className="flex-1 flex flex-col gap-6 h-full min-h-0">
      <div className="glass rounded-3xl p-6 border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/20 text-primary">
            <Video className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Hyperframes Studio</h2>
            <p className="text-sm text-muted-foreground">Editing: <span className="text-primary font-mono select-all">intro_mission_720p.mp4</span></p>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={() => setView("preview")}
             className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${view === 'preview' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-white/5'}`}
           >
             <Play className="w-3.5 h-3.5" />
             Preview
           </button>
           <button 
             onClick={() => setView("code")}
             className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${view === 'code' ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-white/5'}`}
           >
             <Code className="w-3.5 h-3.5" />
             Source
           </button>
           <div className="w-px h-6 bg-white/10 mx-2" />
           <button className="p-2 rounded-xl hover:bg-white/5 text-muted-foreground hover:text-white transition-all">
             <Share2 className="w-4 h-4" />
           </button>
           <button className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/30 transition-all flex items-center gap-2">
             <Download className="w-4 h-4" />
             Render
           </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        <div className="col-span-12 lg:col-span-8 glass rounded-3xl border-white/5 overflow-hidden relative group">
           {view === "preview" ? (
             <div className="w-full h-full bg-black/40 flex items-center justify-center">
                {/* This would be an iframe to localhost:8080 during npx hyperframes preview */}
                <div className="text-center">
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4 animate-pulse">
                     <Play className="w-10 h-10 text-primary fill-primary" />
                  </div>
                  <p className="text-white font-bold text-lg">Hyperframes Engine Offline</p>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">Initialize the video skill to start the real-time preview server.</p>
                  <button className="mt-6 px-6 py-2.5 bg-primary text-white font-bold rounded-xl text-sm neon-glow">
                    Boot Engine
                  </button>
                </div>
             </div>
           ) : (
             <div className="w-full h-full p-6 font-mono text-xs overflow-auto bg-black/60 scrollbar-thin">
                <pre className="text-cyan-300">
{`<!-- hyperframes intro -->
<div class="clip" data-start="0" data-duration="5">
  <h1 class="text-white text-6xl font-bold">
    MEOWJU <span class="text-primary">COWORKER</span>
  </h1>
  <p class="text-muted-foreground mt-4">
    Autonomous AGI Workstation
  </p>
</div>

<style>
  .clip {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    opacity: 0;
  }
</style>`}
                </pre>
             </div>
           )}
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="glass rounded-3xl p-6 border-white/5 flex-1 overflow-hidden">
             <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
               <Layers className="w-5 h-5 text-purple-400" />
               Timeline Layers
             </h3>
             <div className="space-y-3">
               {[
                 { label: "Background Overlay", start: "0s", dur: "10s", active: true },
                 { label: "Main Avatar (HeyGen)", start: "1s", dur: "8s", active: true },
                 { label: "Title Animation", start: "0s", dur: "3s", active: false },
                 { label: "Subtitles (Auto)", start: "1s", dur: "9s", active: true },
               ].map(layer => (
                 <div key={layer.label} className="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between group">
                    <div>
                      <div className="text-sm font-medium text-white/90">{layer.label}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-1">{layer.start} - {layer.dur}</div>
                    </div>
                    <div className={`w-2 h-2 rounded-full ${layer.active ? 'bg-primary neon-glow' : 'bg-white/10'}`} />
                 </div>
               ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
