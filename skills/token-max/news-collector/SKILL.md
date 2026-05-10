---
origin: local
name: news-intel
description: Research agentic AI news, trending repos, and competitive intelligence every 3 hours. Prioritize by token maxxing value for a principal quantum agentics AI engineer.
---

# News Intel - Agentic AI Research Collector

Runs every 3 hours, collects agentic AI news and trending repos, organizes by importance for competitive advantage.

## Purpose

Stay ahead of the curve on:
- Agentic AI / autonomous AI agents
- AGI research and breakthroughs
- Quantum computing + AI intersection
- New repos with high leverage potential
- Production-ready frameworks

**Judged by:** How much "token maxxing competitive advantage" it provides to a principal quantum agentics AI engineer.

## Research Priorities

### Tier 1: Critical (Read immediately)
- AGI/ASI breakthrough research
- New agentic AI frameworks that enable 10x productivity
- Quantum-AI intersection developments
- New reasoning models (o1, o3, etc.)
- Revolutionary memory/context techniques

### Tier 2: High Value (Read within 24h)
- Trending repos with >1000 stars in agentic AI
- New production-ready frameworks
- Novel prompting/optimization techniques
- Multi-agent architecture advances

### Tier 3: Medium (Weekly review)
- Incremental improvements to existing tools
- Interesting but not urgent research
- Community discussions and patterns

## Data Collection

### Sources
- GitHub Trending (agentic AI, AI agents, autonomous)
- Hacker News (top stories with AI/AGI keywords)
- arXiv (cs.AI, cs.LG, cs.MA)
- Twitter/X (AI researchers, key accounts)
- Discord/Telegram AI channels

### Collection Script

```bash
python skills/token-max/news-collector/research_agent.py
```

### What Gets Collected
1. **Repo Metadata**
   - Name, description, stars, forks
   - Tech stack, language
   - Unique features / competitive advantage
   - Token maxxing potential (leverage score)

2. **Research Papers**
   - Title, authors, arXiv link
   - Key contributions
   - Practical applications
   - How it enables better AI

3. **News/Updates**
   - Company announcements
   - Research breakthroughs
   - Industry shifts

## Organization

### File Structure
```
~/Downloads/news/
├── 250509.md          # Most recent (yymmdd)
├── 250508.md          # Previous day
├── 250507.md
└── ...
```

### Daily File Format (yymmdd.md)
```markdown
# Agentic AI News - 2025-05-09

## 🔴 CRITICAL - Read Now

### [AGI] Breakthrough: New Reasoning Architecture
- Source: arXiv
- Link: https://arxiv.org/...
- Token Advantage: 95/100
- Summary: ...
- Why Important: ...

### [Framework] 10x Agent Productivity Tool
- Source: GitHub Trending
- Link: https://github.com/...
- Stars: 5.2k
- Token Advantage: 90/100
- Summary: ...
- Why Important: ...

## 🟡 HIGH VALUE - Read Today

...

## 🟢 MEDIUM - This Week

...
```

### Duplicate Detection
- Check title + source URL hash
- If exists in last 7 days, mark as [DUP] and don't re-add
- Keep track of seen articles in `tmp/news_intel/seen_hashes.json`

## Token Maxxing Priority Score (0-100)

Calculated based on:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Leverage** | 30% | How much time/effort does it save? |
| **Novelty** | 25% | Is it a new capability? |
| **Production Ready** | 20% | Can it be used today? |
| **Architecture Insight** | 15% | Does it change how we think about AI systems? |
| **Competitive Edge** | 10% | Do few others have this? |

Formula:
```
score = (leverage * 0.3) + (novelty * 0.25) + (prod_ready * 0.2) + (arch_insight * 0.15) + (edge * 0.1)
```

## Scheduling

### Cron Setup (Every 3 hours)
```bash
# Using ScheduleWakeup for Claude Code
/schedule-every 3 hours: python skills/token-max/news-collector/research_agent.py
```

### Manual Run
```bash
python skills/token-max/news-collector/research_agent.py --now
```

## Output

1. Creates/updates `~/Downloads/news/YYMMDD.md`
2. Updates seen hashes to prevent duplicates
3. Prints summary of new items found

## Quality Standards

**What gets in:**
- Substantive content (not just announcements)
- Technical depth
- Clear practical applications
- Novel ideas or significant improvements

**What doesn't:**
- Marketing fluff without substance
- Minor version updates
- General news not related to agentic AI/AGI
- Duplicate content