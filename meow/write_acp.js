const fs=require("fs");
const lines=[
"/// <reference types="node" />",
"/**",
" * acp.ts - ACP (Agent Client Protocol) sidecar",
" *",
" * Implements JSON-RPC 2.0 over stdio for programmatic control of Meow.",
" * Supported methods: initialize, newSession, loadSession, prompt, cancel.",
" */",
];
fs.writeFileSync("C:/Users/stanc/github/meow/meow/src/sidecars/acp.ts", lines.join("
"));
console.log(lines.length);