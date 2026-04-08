import type { Metadata } from "next";
import "./globals.css";

import Navigation from '@/components/Navigation';
import CommandPaletteWrapper from '@/components/CommandPaletteWrapper';
import ThemeProvider from '@/components/ThemeProvider';

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
          <Navigation />
          <CommandPaletteWrapper />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
