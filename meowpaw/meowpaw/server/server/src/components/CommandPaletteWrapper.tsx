"use client";

import React from "react";
import CommandPalette, { useCommandPaletteCommands } from "./CommandPalette";

export default function CommandPaletteWrapper() {
  const commands = useCommandPaletteCommands();
  return <CommandPalette commands={commands} />;
}