"use client";

import React from "react";
import { useTheme } from "@/components/ThemeProvider";

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingSection({ title, children }: SettingSectionProps) {
  return (
    <section
      style={{
        backgroundColor: "var(--input-bg)",
        padding: "1.5rem",
        borderRadius: 8,
        border: "1px solid var(--border-color)",
        marginBottom: "1.5rem",
      }}
    >
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: "var(--text-color)",
          marginTop: 0,
          marginBottom: "1rem",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 0",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      <div>
        <div style={{ fontSize: 14, color: "var(--text-color)" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          backgroundColor: checked ? "#2563eb" : "#333",
          border: "none",
          cursor: "pointer",
          position: "relative",
          transition: "background-color 0.2s",
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "white",
            position: "absolute",
            top: 3,
            left: checked ? 23 : 3,
            transition: "left 0.2s",
          }}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = React.useState({
    notifications: true,
    soundEffects: false,
    autoSave: true,
    compactMode: false,
  });

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          marginBottom: "2rem",
          color: "var(--text-color)",
        }}
      >
        Settings
      </h1>

      {/* Appearance */}
      <SettingSection title="Appearance">
        <div style={{ paddingBottom: "1rem" }}>
          <label
            style={{ fontSize: 14, color: "var(--text-color)", marginBottom: 8, display: "block" }}
          >
            Theme
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={() => setTheme("dark")}
              style={{
                flex: 1,
                padding: "0.75rem",
                borderRadius: 8,
                border: theme === "dark" ? "2px solid #2563eb" : "2px solid var(--border-color)",
                backgroundColor: theme === "dark" ? "rgba(37, 99, 235, 0.1)" : "transparent",
                color: "var(--text-color)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ◐ Dark
            </button>
            <button
              onClick={() => setTheme("light")}
              style={{
                flex: 1,
                padding: "0.75rem",
                borderRadius: 8,
                border: theme === "light" ? "2px solid #2563eb" : "2px solid var(--border-color)",
                backgroundColor: theme === "light" ? "rgba(37, 99, 235, 0.1)" : "transparent",
                color: "var(--text-color)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ◑ Light
            </button>
          </div>
        </div>

        <Toggle
          label="Compact Mode"
          description="Use a more compact UI layout"
          checked={settings.compactMode}
          onChange={(v) => setSettings((s) => ({ ...s, compactMode: v }))}
        />
      </SettingSection>

      {/* Notifications */}
      <SettingSection title="Notifications">
        <Toggle
          label="Desktop Notifications"
          description="Show system notifications for long-running tasks"
          checked={settings.notifications}
          onChange={(v) => setSettings((s) => ({ ...s, notifications: v }))}
        />
        <Toggle
          label="Sound Effects"
          description="Play sounds for notifications and events"
          checked={settings.soundEffects}
          onChange={(v) => setSettings((s) => ({ ...s, soundEffects: v }))}
        />
      </SettingSection>

      {/* General */}
      <SettingSection title="General">
        <Toggle
          label="Auto-save Sessions"
          description="Automatically save session state on exit"
          checked={settings.autoSave}
          onChange={(v) => setSettings((s) => ({ ...s, autoSave: v }))}
        />
      </SettingSection>

      {/* Keyboard Shortcuts */}
      <SettingSection title="Keyboard Shortcuts">
        <div style={{ fontSize: 13, color: "#888" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border-color)" }}>
            <span>Command Palette</span>
            <kbd style={{ backgroundColor: "#333", borderRadius: 4, padding: "2px 6px", color: "#aaa" }}>Ctrl+K</kbd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border-color)" }}>
            <span>Toggle Theme</span>
            <kbd style={{ backgroundColor: "#333", borderRadius: 4, padding: "2px 6px", color: "#aaa" }}>Ctrl+T</kbd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid var(--border-color)" }}>
            <span>Go to Dashboard</span>
            <kbd style={{ backgroundColor: "#333", borderRadius: 4, padding: "2px 6px", color: "#aaa" }}>G D</kbd>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0" }}>
            <span>Refresh</span>
            <kbd style={{ backgroundColor: "#333", borderRadius: 4, padding: "2px 6px", color: "#aaa" }}>R</kbd>
          </div>
        </div>
      </SettingSection>

      {/* About */}
      <SettingSection title="About">
        <div style={{ fontSize: 14, color: "#888" }}>
          <p style={{ marginTop: 0 }}>Meow Desktop v0.1.0</p>
          <p style={{ marginBottom: 0 }}>Sovereign Agent Platform</p>
        </div>
      </SettingSection>
    </div>
  );
}