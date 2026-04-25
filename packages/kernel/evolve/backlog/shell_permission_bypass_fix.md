# Proposal: Fix Shell Tool Permission Bypass
**Topic:** Shell tool bypasses permission layer  
**Priority:** P1 (Blocking)  
**Date:** 2025-01-25

## Problem

The shell tool in `tool-registry.ts` has hardcoded guard that bypasses permission system.

## Solution

Replace hardcoded dangerous guard with permission system evaluation.

## Files Affected

- `src/sidecars/tool-registry.ts` - Shell tool execute()
- `src/sidecars/permissions.ts` - Default action to DENY
- `src/core/lean-agent.ts` - CLI args for custom rules
