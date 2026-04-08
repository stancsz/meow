import type { Metadata } from "next";
import "./globals.css";

import Navigation from '@/components/Navigation';
import CommandPaletteWrapper from '@/components/CommandPaletteWrapper';
import ThemeProvider from '@/components/ThemeProvider';
import NotificationProvider from '@/components/NotificationProvider';
import NotificationBell from '@/components/NotificationBell';

export const metadata: Metadata = {
  title: "Meow",
  description: "Sovereign Agent Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark">
      <body className="antialiased">
        <ThemeProvider>
          <NotificationProvider>
            <Navigation />
            <div style={{ position: "fixed", top: 12, right: 80, zIndex: 50 }}>
              <NotificationBell />
            </div>
            <CommandPaletteWrapper />
            {children}
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
