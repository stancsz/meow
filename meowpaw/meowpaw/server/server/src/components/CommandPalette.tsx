"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
}

export default function CommandPalette({ commands }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Open palette with Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }

      if (!isOpen) return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setQuery("");
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            setIsOpen(false);
            setQuery("");
          }
          break;
      }
    },
    [isOpen, filteredCommands, selectedIndex]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  // Group commands by category
  const grouped: Record<string, Command[]> = {};
  for (const cmd of filteredCommands) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }

  let globalIndex = 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
      }}
      onClick={() => {
        setIsOpen(false);
        setQuery("");
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          backgroundColor: "#1a1a1a",
          borderRadius: 12,
          border: "1px solid #333",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid #333",
          }}
        >
          <span
            style={{
              color: "#00E5CC",
              marginRight: 12,
              fontSize: 18,
            }}
          >
            ›
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: 16,
            }}
          />
          <kbd
            style={{
              backgroundColor: "#333",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 12,
              color: "#888",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category}>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#888",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {category}
              </div>
              {cmds.map((cmd) => {
                const thisIndex = globalIndex++;
                const isSelected = thisIndex === selectedIndex;
                return (
                  <div
                    key={cmd.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 16px",
                      backgroundColor: isSelected ? "#2563eb" : "transparent",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      cmd.action();
                      setIsOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => setSelectedIndex(thisIndex)}
                  >
                    <span style={{ color: "#fff", fontSize: 14 }}>{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd
                        style={{
                          backgroundColor: isSelected ? "#1d4ed8" : "#333",
                          borderRadius: 4,
                          padding: "2px 6px",
                          fontSize: 11,
                          color: "#aaa",
                        }}
                      >
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {filteredCommands.length === 0 && (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "#666",
              }}
            >
              No commands found
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #333",
            display: "flex",
            gap: 16,
            fontSize: 12,
            color: "#666",
          }}
        >
          <span>
            <kbd style={{ backgroundColor: "#333", borderRadius: 3, padding: "1px 4px" }}>↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd style={{ backgroundColor: "#333", borderRadius: 3, padding: "1px 4px" }}>↵</kbd>{" "}
            select
          </span>
          <span>
            <kbd style={{ backgroundColor: "#333", borderRadius: 3, padding: "1px 4px" }}>Ctrl+K</kbd>{" "}
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}

export function useCommandPaletteCommands(): Command[] {
  const router = useRouter();

  return [
    {
      id: "nav-dashboard",
      label: "Go to Dashboard",
      shortcut: "G D",
      category: "Navigation",
      action: () => router.push("/"),
    },
    {
      id: "nav-keys",
      label: "Go to API Keys",
      shortcut: "G K",
      category: "Navigation",
      action: () => router.push("/keys"),
    },
    {
      id: "action-new-bot",
      label: "Create New Bot",
      category: "Actions",
      action: () => router.push("/?new_bot=true"),
    },
    {
      id: "action-refresh",
      label: "Refresh Page",
      shortcut: "R",
      category: "Actions",
      action: () => window.location.reload(),
    },
  ];
}