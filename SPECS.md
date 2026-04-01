# SimpleClaw — Technical Specification

**Version:** 1.0.0  
**Date:** April 1, 2026  
**Status:** Active Development

---

## Overview

SimpleClaw is a **stateless intent-to-action meta-orchestration engine** that accepts natural language, breaks it into structured execution plans, and delegates to specialized sub-agents via ephemeral Workers.

**Core Philosophy:** Sovereign, lean, and extensible. Users own their keys (BYOK), infrastructure (BYOI), and skills (BYOS).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SIMPLECLAW LAYERS                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   CLI / TUI                          │   │ ← User Interface
│  │   Interactive terminal, spinners, progress, colors   │   │
│  └─────────────────────────┬───────────────────────────┘   │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────┐   │
│  │              ORCHESTRATOR (Stateless)                │   │ ← Brain
│  │   Intent parsing → Plan-Diff-Approve → Dispatch      │   │
│  └─────────────────────────┬───────────────────────────┘   │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────┐   │
│  │                  WORKER LAYER                        │   │ ← Muscle
│  │   Ephemeral Cloud Functions (1-30s lifetime)        │   │
│  │   JIT skill loading + KMS-decrypted credentials      │   │
│  └─────────────────────────┬───────────────────────────┘   │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────┐   │
│  │              SOVEREIGN MOTHERBOARD                   │   │ ← User's Data
│  │   User's own Supabase/SQLite                         │   │
│  │   Sessions, tasks, skills, gas ledger                │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Orchestrator (`src/core/orchestrator.ts`)

The brain of SimpleClaw. Long-running but stateless via checkpointing.

**Responsibilities:**
- Parse natural language → `SwarmManifest` (DAG)
- Build `PlanDiffApprove` for user review
- Dispatch Workers via dispatcher
- Checkpoint session state

**Key Types:**
```typescript
interface SwarmManifest {
  sessionId: string;
  intent: string;
  tasks: Task[];
  estimatedCost: number;
}

interface Task {
  id: string;
  skill: string;
  action: 'READ' | 'WRITE';
  params: Record<string, unknown>;
  dependsOn?: string[];
}

interface PlanDiffApprove {
  sessionId: string;
  manifest: SwarmManifest;
  credentialAccess: { skill: string; masked: boolean }[];
  userConfirm: boolean;
}
```

### 2. Dispatcher (`src/core/dispatcher.ts`)

Dispatches Workers based on manifest DAG.

**Features:**
- Parallel task dispatch (independent tasks)
- Sequential dispatch (dependency-ordered)
- Gas tank enforcement
- Idempotency via transaction_log

### 3. Workers (`src/workers/`)

Ephemeral execution units. Each Worker:
1. Receives `userId` and `taskId`
2. Fetches KMS-decrypted credentials
3. Loads JIT skill
4. Executes via sub-agent engine
5. Writes result to Motherboard
6. Terminates (purges secrets)

**Worker Types:**
- `cloud-function.ts` — GCP Cloud Function template
- `github.worker.ts` — GitHub API operations
- `test-worker.ts` — Testing harness

### 4. Security Layer (`src/security/`)

**KMS Credential Flow:**
```
Onboarding: User pastes service_role key
  → Platform encrypts via KMS → ciphertext stored
  → Plaintext discarded immediately

Runtime (per Worker):
  Worker receives user_id
  → Fetches ciphertext from platform DB
  → Calls KMS.decrypt() → plaintext in volatile RAM only
  → Creates Supabase client
  → Worker terminates → key gone
```

**Triple Lock Security:**
1. KMS encryption (GCP HSM)
2. IAM-gated decrypt access
3. Audit logging

### 5. Database / Sovereign Motherboard (`src/db/`)

User's own Supabase instance or local SQLite.

**Schema (from `001_motherboard.sql`):**
```sql
-- Sessions
CREATE TABLE orchestrator_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  manifest JSONB,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Task Results
CREATE TABLE task_results (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  task_id TEXT,
  worker_id TEXT,
  skill TEXT,
  status TEXT,
  result JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Gas Ledger
CREATE TABLE gas_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ
);

-- Heartbeat Queue (Continuous Mode)
CREATE TABLE heartbeat_queue (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  next_trigger TIMESTAMPTZ NOT NULL,
  interval_minutes INTEGER DEFAULT 30,
  status TEXT DEFAULT 'pending',
  last_run TIMESTAMPTZ
);

-- Skill References
CREATE TABLE skill_refs (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  content TEXT NOT NULL,
  version TEXT,
  created_at TIMESTAMPTZ
);

-- Audit Log
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
);
```

### 6. Gas Tank Billing (`src/core/gas.ts`)

Pay-per-use credits. No subscriptions, no idle cost.

**Functions:**
- `hasSufficientGas(userId, amount)` → boolean
- `debitCredits(userId, amount)` → void
- `getBalance(userId)` → number
- `createCheckoutSession(amount)` → Stripe URL

**Stripe Integration:**
- Webhook handler for payment confirmation
- Idempotency via `stripe_payment_id`

### 7. Heartbeat / Continuous Mode (`src/core/heartbeat.ts`)

Recursive scheduling for long-running tasks.

**Mechanism:**
1. User enables continuous mode (30-min intervals)
2. `heartbeat_queue` entry created
3. `pg_cron` triggers webhook every 30 min
4. Orchestrator processes pending heartbeats
5. Schedules next trigger if recurring

### 8. Skill System (`src/core/skill-loader.ts`)

Markdown-based instruction sets with YAML frontmatter.

**Format:**
```yaml
---
name: github
version: 1.0.0
description: GitHub API operations
credentials:
  - GITHUB_TOKEN
allowedDomains:
  - api.github.com
---
# Skill content
Use GitHub REST API for operations...
```

**Features:**
- JIT loading from registry/GitHub/Supabase
- Credential validation
- Domain allowlisting
- Hook system (PreToolUse, PostToolUse)

### 9. Plugin System (`src/plugins/`)

Native capability integrations.

**Available Plugins:**
- `browser.ts` — Browser automation
- `screencap.ts` — Screen capture
- `github.ts` — GitHub CLI integration
- `gdrive.ts` — Google Drive via rclone
- `linear.ts` — Linear API
- `opencli.ts` — CLI-anything integration

### 10. LLM Integration (`src/core/llm.ts`)

**Current:** OpenAI only (GPT-4 via function calling)

**Intent Parsing Flow:**
```
User: "List my GitHub issues"
  → Orchestrator sends to OpenAI
  → Function call: createSwarmManifest({tasks: [...]})
  → Returns structured manifest
```

---

## File Structure

```
simpleclaw/
├── src/
│   ├── index.ts                 # Entry point
│   ├── core/
│   │   ├── orchestrator.ts     # Main orchestrator
│   │   ├── dispatcher.ts        # Worker dispatcher
│   │   ├── gas.ts              # Gas tank logic
│   │   ├── heartbeat.ts        # Continuous mode
│   │   ├── llm.ts              # LLM integration
│   │   ├── policy.ts           # System prompt
│   │   ├── skill-loader.ts     # Skill loading
│   │   ├── types.ts            # Type definitions
│   │   └── *.test.ts           # Unit tests
│   ├── workers/
│   │   ├── base-worker.ts       # Worker base class
│   │   ├── template.ts         # Cloud Function template
│   │   ├── delegation.ts       # Sub-agent delegation
│   │   └── *.worker.ts         # Skill-specific workers
│   ├── plugins/
│   │   ├── browser.ts          # Browser plugin
│   │   ├── screencap.ts        # Screencap plugin
│   │   ├── github.ts           # GitHub plugin
│   │   └── ...                 # Other plugins
│   ├── security/
│   │   ├── kms.ts              # KMS encryption/decryption
│   │   ├── onboarding.ts      # User onboarding
│   │   └── triple_lock.ts     # Security policies
│   ├── db/
│   │   ├── client.ts           # DB client wrapper
│   │   ├── schema.sql          # Schema definition
│   │   └── migrations/        # SQL migrations
│   ├── skills/                 # Built-in skills
│   │   ├── github.md
│   │   ├── http-get.md
│   │   └── ...
│   └── __tests__/              # Integration tests
├── server/                      # Next.js dashboard
│   └── src/app/
│       ├── page.tsx            # Main UI
│       ├── api/
│       │   ├── orchestrator/   # Orchestrator API
│       │   ├── heartbeat/      # Heartbeat webhook
│       │   └── stripe-webhook/ # Stripe handler
│       └── components/         # React components
├── terraform/                   # GCP infrastructure
├── docs/                        # Documentation
├── scripts/                     # Build scripts
├── test/                        # Test utilities
└── configs/                     # Configuration templates
```

---

## API Endpoints

### Orchestrator API (`/api/orchestrator`)

**POST**
```json
// Request: Create plan
{
  "action": "plan",
  "userId": "user_123",
  "intent": "List my GitHub issues"
}

// Response
{
  "sessionId": "sess_abc123",
  "manifest": { ... },
  "planDiff": { ... },
  "estimatedCost": 100
}
```

```json
// Request: Approve execution
{
  "action": "approve",
  "sessionId": "sess_abc123",
  "plan": { ... }
}

// Response
{
  "executionId": "exec_xyz",
  "status": "dispatched"
}
```

### Heartbeat API (`/api/heartbeat`)

**POST** (triggered by pg_cron)
```json
{
  "heartbeatId": "hb_123",
  "sessionId": "sess_abc123"
}
```

### Stripe Webhook (`/api/stripe-webhook`)

**POST** (from Stripe)
```json
{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_xxx",
      "metadata": { "userId": "user_123" }
    }
  }
}
```

---

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...

# Optional
ANTHROPIC_API_KEY=sk-ant-...       # Claude support
GEMINI_API_KEY=...                  # Gemini support
DEEPSEEK_API_KEY=sk-...            # DeepSeek support

# Supabase (for production)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# GCP KMS (for production)
GCP_PROJECT_ID=...
GCP_KMS_KEY_RING=...
GCP_KMS_KEY_NAME=...
```

---

## Development Commands

```bash
# Install dependencies
bun install

# Run tests
bun test
bun test src/core/

# Run development server
bun run dev

# Build for production
bun run build

# Type checking
bun run typecheck

# Linting
bun run lint
```

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `openai` | LLM integration |
| `@supabase/supabase-js` | Database client |
| `stripe` | Payment processing |
| `yaml` | YAML parsing |
| `zod` | Schema validation |
| `@google-cloud/functions-framework` | Cloud Functions |

---

## Roadmap

See [`tmp/TODO.md`](./tmp/TODO.md) for detailed implementation roadmap.

### Completed ✅
- Phase 0: Worker Dispatch + Execution Loop
- Phase 0: End-to-End Integration Test
- Phase 0: Plan-Diff-Approve Execution Bridge
- Phase 1: Gas Tank (Stripe + gas_ledger)
- Phase 1.5: Orchestrator TDD & API Enhancement
- Phase 2: Heartbeat (pg_cron + 30min intervals)
- Plugin System (GitHub, Browser, Screencap, etc.)
- BYOK/BYOI/BYOS Architecture

### In Progress 🔄
- Multi-LLM Provider Support
- CLI-Anything Integration

### Planned 📋
- Interactive CLI UX (TUI)
- Git Integration
- MCP Protocol Support
- Context Compaction
- Session Persistence
- Repository Mapping
- Slash Commands
- Configuration System
- Loop Detection
- Token Optimization

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests (TDD approach)
4. Ensure all tests pass
5. Submit a pull request

---

## License

MIT

---

*SimpleClaw — Stupidly Simple. Stupidly Scalable. Radically Sovereign. 🦀*
