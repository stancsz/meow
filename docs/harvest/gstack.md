---
name: gstack
repo: https://github.com/garrytan/gstack
why: Google Cloud infrastructure deployment framework. Enables agents to provision and manage GCP resources declaratively.
minimalSlice: "A minimal gstack skill: /deploy command that generates GCP deployment configs, creates/destroys resources via gcloud CLI."
fit: skill
status: pending
complexity: 3
---

# Harvest: gstack from garrytan

**Source:** `https://github.com/garrytan/gstack`

## Core Trick

Declarative Google Cloud infrastructure deployment from natural language agent requests.

## Minimal Slice for Meow

Implement as `src/skills/gstack.ts`:
1. `/deploy <service>` command
2. Generate gcloud/deployment configs
3. Execute and track deployments
4. `/destroy` for cleanup

## Why Worth It

- Extends Meow to cloud infrastructure
- Declarative = safe (what you wrote is what deploys)
- High practical value for DevOps tasks
