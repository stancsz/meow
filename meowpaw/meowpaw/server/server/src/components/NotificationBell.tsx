"use client";

import React, { useState } from "react";
import { useNotifications } from "./NotificationProvider";

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearNotification } =
    useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const typeColors = {
    info: "#2563eb",
    success: "#16a34a",
    warning: "#ca8a04",
    error: "#dc2626",
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Bell button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen && unreadCount > 0) {
            // Could auto-mark as read here
          }
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#888",
          fontSize: 20,
          padding: "4px 8px",
          position: "relative",
        }}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              backgroundColor: "#dc2626",
              color: "white",
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 600,
              minWidth: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
            }}
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              width: 320,
              maxHeight: 400,
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: 8,
              boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
              zIndex: 100,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                borderBottom: "1px solid #333",
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#2563eb",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Notification list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "#666",
                    fontSize: 13,
                  }}
                >
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #222",
                      backgroundColor: n.read ? "transparent" : "rgba(37, 99, 235, 0.05)",
                      cursor: "pointer",
                    }}
                    onClick={() => markAsRead(n.id)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: n.read ? 400 : 600,
                            color: "#fff",
                            marginBottom: 2,
                          }}
                        >
                          {n.title}
                        </div>
                        <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>
                          {n.body}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#555",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: typeColors[n.type],
                              display: "inline-block",
                            }}
                          />
                          {formatTime(n.timestamp)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearNotification(n.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#555",
                          cursor: "pointer",
                          fontSize: 14,
                          padding: "0 0 0 8px",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}