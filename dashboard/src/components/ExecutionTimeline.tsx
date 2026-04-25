"use client";

import React from "react";
import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";

interface Step {
  id: string;
  label: string;
  status: "completed" | "active" | "pending" | "failed";
  timestamp?: string;
  duration?: string;
}

const steps: Step[] = [
  { id: "1", label: "Observe Repository State", status: "completed", timestamp: "10:02:14", duration: "1.2s" },
  { id: "2", label: "Orient: Analyze Robotics Gap", status: "completed", timestamp: "10:02:16", duration: "4.5s" },
  { id: "3", label: "Decide: Implement Shadow Mirror", status: "active", timestamp: "10:02:22" },
  { id: "4", label: "Act: Write tests/mirror_core.test.ts", status: "pending" },
  { id: "5", label: "Dogfood: Validate Implementation", status: "pending" },
];

export function ExecutionTimeline() {
  return (
    <div className="glass rounded-2xl p-6 border-white/5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Execution Plan
        </h3>
        <span className="text-xs font-mono text-muted-foreground bg-white/5 px-2 py-1 rounded">
          EPOCH-42
        </span>
      </div>

      <div className="space-y-6 relative">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-white/5" />
        
        {steps.map((step, idx) => (
          <div key={step.id} className="relative flex gap-4 group">
            <div className={`mt-1 z-10 p-0.5 rounded-full bg-background transition-colors duration-300 ${
              step.status === "completed" ? "text-emerald-400" :
              step.status === "active" ? "text-primary neon-glow animate-pulse" :
              "text-muted-foreground"
            }`}>
              {step.status === "completed" ? <CheckCircle2 className="w-5 h-5" /> :
               step.status === "active" ? <Circle className="w-5 h-5 fill-primary/20" /> :
               <Circle className="w-5 h-5" />}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className={`font-medium transition-colors ${
                  step.status === "active" ? "text-white" : "text-muted-foreground"
                }`}>
                  {step.label}
                </span>
                {step.timestamp && (
                  <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                    {step.timestamp}
                  </span>
                )}
              </div>
              
              {step.status === "active" && (
                <div className="mt-2 text-xs text-primary/80 font-medium flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: '0s' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
                  </div>
                  Reasoning about entanglement matrix...
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
