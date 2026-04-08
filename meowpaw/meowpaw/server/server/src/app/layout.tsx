import type { Metadata } from "next";
import "./globals.css";

import Navigation from '@/components/Navigation';
import CommandPaletteWrapper from '@/components/CommandPaletteWrapper';

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
    <html lang="en">
      <body className="antialiased">
        <Navigation />
        <CommandPaletteWrapper />
        {children}
      </body>
    </html>
  );
}
