"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface Notification {
  id: string;
  title: string;
  body: string;
  type: "info" | "success" | "warning" | "error";
  timestamp: number;
  read: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  showNotification: (title: string, body: string, type?: Notification["type"]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
  requestPermission: () => Promise<boolean>;
  hasPermission: boolean;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  showNotification: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  clearNotification: () => {},
  requestPermission: async () => false,
  hasPermission: false,
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    // Check if we already have permission
    if (typeof window !== "undefined" && "Notification" in window) {
      setHasPermission(Notification.permission === "granted");
    }
    // Load saved notifications from localStorage
    const saved = localStorage.getItem("meow-notifications");
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("meow-notifications", JSON.stringify(notifications));
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const showNotification = useCallback(
    async (title: string, body: string, type: Notification["type"] = "info") => {
      const id = Date.now().toString();
      const notification: Notification = {
        id,
        title,
        body,
        type,
        timestamp: Date.now(),
        read: false,
      };

      setNotifications((prev) => [notification, ...prev].slice(0, 50)); // Keep last 50

      // Show system notification if permitted
      if (hasPermission && typeof window !== "undefined" && "Notification" in window) {
        try {
          new Notification(title, { body, icon: "/icon.png" });
        } catch (e) {
          // Notification failed, but we still added it to the in-app list
        }
      }
    },
    [hasPermission]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      const granted = result === "granted";
      setHasPermission(granted);
      return granted;
    } catch (e) {
      return false;
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        showNotification,
        markAsRead,
        markAllAsRead,
        clearNotification,
        requestPermission,
        hasPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}