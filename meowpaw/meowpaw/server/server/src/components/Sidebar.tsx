"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SidebarTab {
  id: string;
  label: string;
  href: string;
  icon: string;
}

const tabs: SidebarTab[] = [
  { id: "dashboard", label: "Dashboard", href: "/", icon: "◉" },
  { id: "keys", label: "API Keys", href: "/keys", icon: "◇" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      style={{
        width: isCollapsed ? 56 : 200,
        minHeight: "calc(100vh - 48px)",
        backgroundColor: "#111",
        borderRight: "1px solid #333",
        transition: "width 0.2s ease",
        display: "flex",
        flexDirection: "column",
        paddingTop: 8,
      }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{
          background: "none",
          border: "none",
          color: "#888",
          cursor: "pointer",
          padding: "8px 16px",
          textAlign: "left",
          fontSize: 16,
          marginBottom: 8,
        }}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {isCollapsed ? "»" : "«"}
      </button>

      {/* Tabs */}
      <nav style={{ flex: 1 }}>
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                color: isActive ? "#00E5CC" : "#888",
                backgroundColor: isActive ? "rgba(0, 229, 204, 0.1)" : "transparent",
                borderLeft: isActive ? "2px solid #00E5CC" : "2px solid transparent",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: isActive ? 500 : 400,
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontSize: 18 }}>{tab.icon}</span>
              {!isCollapsed && <span>{tab.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Keyboard shortcut hint */}
      {!isCollapsed && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #222",
            fontSize: 11,
            color: "#555",
          }}
        >
          <span style={{ display: "block", marginBottom: 2 }}>Press</span>
          <kbd
            style={{
              backgroundColor: "#222",
              borderRadius: 3,
              padding: "2px 5px",
              fontSize: 10,
            }}
          >
            Ctrl+K
          </kbd>{" "}
          <span>for commands</span>
        </div>
      )}
    </aside>
  );
}