#!/usr/bin/env python3
"""
Token Maxxing - Strategic token optimization for leverage and professional advantage.

Features:
- Semantic caching for repeated queries
- Context compression for long conversations
- Prompt compression for redundancy removal
- Token tracking and cost monitoring
- Parallel agent workflows
- Context stuffing for "perfect information"
- Leverage calculator (ROI on token spending)
- Token burn dashboard for professional metrics
"""

import os
import sys
import json
import time
import hashlib
import asyncio
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any, Iterator, Tuple
from datetime import datetime, timedelta
from collections import OrderedDict
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

# ─── Configuration ────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "max_context": 8000,
    "cache_threshold": 0.85,
    "compress_threshold": 10000,
    "streaming": True,
    "track_costs": True,
    "price_per_1k_input": 0.001,
    "price_per_1k_output": 0.003,
}

# ─── Token Counting ────────────────────────────────────────────────────────────

def count_tokens(text: str) -> int:
    return len(text) // 4

def count_messages_tokens(messages: List[Dict]) -> int:
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            for c in content:
                if isinstance(c, dict):
                    total += count_tokens(str(c.get("text", "")))
                else:
                    total += count_tokens(str(c))
        else:
            total += count_tokens(str(content))
        total += count_tokens(msg.get("role", ""))
    return total

def estimate_cost(input_tokens: int, output_tokens: int,
                 price_in: float = 0.001, price_out: float = 0.003) -> float:
    return (input_tokens * price_in + output_tokens * price_out) / 1000


# ─── Prompt Compression ─────────────────────────────────────────────────────────

def compress_prompt(prompt: str) -> str:
    if not prompt:
        return prompt
    patterns = [
        (r'\bI want you to\b', 'You'),
        (r'\bYou are a\b', 'You are'),
        (r'\bshould be helpful\b', ''),
        (r'\bPlease\b', ''),
        (r'\bThank you\b', ''),
        (r'\bThanks\b', ''),
        (r'\bAs an AI\b', ''),
        (r'\bI am an AI\b', ''),
        (r'\bPlease help\b', 'Help'),
        (r'\bCan you\b', 'Could you'),
        (r'\bWould you\b', 'Will you'),
        (r'\bI need you to\b', 'Please'),
        (r'\bI would like you to\b', 'Please'),
        (r'\bIn order to\b', 'To'),
        (r'\bDue to the fact that\b', 'Because'),
        (r'\bAt this point in time\b', 'Now'),
    ]
    compressed = prompt
    for pattern, replacement in patterns:
        compressed = re.sub(pattern, replacement, compressed, flags=re.I)
    compressed = re.sub(r'\s+', ' ', compressed).strip()
    compressed = re.sub(r'\s+[.!?,]$', '', compressed)
    return compressed


# ─── Context Compression ────────────────────────────────────────────────────────

@dataclass
class Message:
    role: str
    content: str
    tokens: int = 0

    def to_dict(self) -> dict:
        return {"role": self.role, "content": self.content}

def messages_to_objects(messages: List[Dict]) -> List[Message]:
    result = []
    for m in messages:
        content = m.get("content", "")
        if isinstance(content, list):
            text = " ".join(c.get("text", "") if isinstance(c, dict) else str(c) for c in content)
        else:
            text = str(content)
        result.append(Message(role=m.get("role", "user"), content=text, tokens=count_tokens(text)))
    return result

def compress_context(messages: List[Dict], max_tokens: int = 8000, summarize_older: bool = True) -> List[Dict]:
    if not messages:
        return []
    objs = messages_to_objects(messages)
    total = sum(m.tokens for m in objs)
    if total <= max_tokens:
        return messages

    recent_messages = []
    accumulated = 0
    for msg in reversed(objs):
        if accumulated + msg.tokens > max_tokens * 0.4:
            break
        recent_messages.insert(0, msg)
        accumulated += msg.tokens

    if len(objs) > len(recent_messages):
        older = objs[:-len(recent_messages)] if recent_messages else objs
        older_content = "\n".join(f"[{m.role}]: {m.content[:200]}" for m in older)
        summary = compress_prompt(older_content)
        if len(summary) > 300:
            summary = summary[:300] + "..."
        recent_messages.insert(0, Message(role="system", content=f"[Earlier conversation summarized: {summary}]", tokens=count_tokens(summary)))

    return [m.to_dict() for m in recent_messages]


# ─── Semantic Cache ─────────────────────────────────────────────────────────────

class SemanticCache:
    def __init__(self, threshold: float = 0.85, cache_dir: str = "tmp/token_cache"):
        self.threshold = threshold
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.cache_dir / "cache.db"
        self._init_db()
        self.stats = {"hits": 0, "misses": 0, "total": 0}

    def _init_db(self):
        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS sim_cache (
                key TEXT PRIMARY KEY,
                normalized_key TEXT,
                value TEXT,
                token_count INTEGER,
                created_at REAL
            )
        """)
        conn.commit()
        conn.close()

    def _normalize(self, text: str) -> str:
        normalized = text.lower().strip()
        normalized = re.sub(r'[^\w\s]', '', normalized)
        normalized = re.sub(r'\s+', ' ', normalized)
        return normalized

    def _get_similarity_key(self, text: str) -> str:
        normalized = self._normalize(text)
        return hashlib.md5(normalized[:100].encode()).hexdigest()

    def get(self, query: str) -> Optional[str]:
        norm_key = self._normalize(query)
        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()
        c.execute("SELECT value FROM sim_cache WHERE normalized_key = ?", (norm_key,))
        row = c.fetchone()
        conn.close()
        if row:
            self.stats["hits"] += 1
            self.stats["total"] += 1
            return row[0]
        self.stats["misses"] += 1
        self.stats["total"] += 1
        return None

    def set(self, query: str, value: str):
        norm_key = self._normalize(query)
        token_count = count_tokens(value)
        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()
        c.execute("""
            INSERT OR REPLACE INTO sim_cache (key, normalized_key, value, token_count, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (query, norm_key, value, token_count, time.time()))
        conn.commit()
        conn.close()

    def clear(self):
        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()
        c.execute("DELETE FROM sim_cache")
        conn.commit()
        conn.close()
        self.stats = {"hits": 0, "misses": 0, "total": 0}

    def get_hit_rate(self) -> float:
        return self.stats["hits"] / self.stats["total"] if self.stats["total"] > 0 else 0.0

    def get_stats(self) -> dict:
        return {**self.stats, "hit_rate": self.get_hit_rate(), "cache_size": self._get_cache_size()}

    def _get_cache_size(self) -> int:
        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM sim_cache")
        count = c.fetchone()[0]
        conn.close()
        return count


# ─── Token Tracker ─────────────────────────────────────────────────────────────

@dataclass
class TokenRecord:
    timestamp: float
    input_tokens: int
    output_tokens: int
    cost: float
    cache_hit: bool

class TokenTracker:
    def __init__(self, price_in: float = 0.001, price_out: float = 0.003):
        self.price_in = price_in
        self.price_out = price_out
        self.records: List[TokenRecord] = []
        self.session_start = time.time()

    def before(self, messages: List[Dict]) -> int:
        return count_messages_tokens(messages)

    def after(self, input_tokens: int, output_tokens: int, cache_hit: bool = False):
        cost = estimate_cost(input_tokens, output_tokens, self.price_in, self.price_out)
        self.records.append(TokenRecord(time.time(), input_tokens, output_tokens, cost, cache_hit))

    def stats(self) -> dict:
        total_input = sum(r.input_tokens for r in self.records)
        total_output = sum(r.output_tokens for r in self.records)
        total_cost = sum(r.cost for r in self.records)
        cache_hits = sum(1 for r in self.records if r.cache_hit)
        return {
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_tokens": total_input + total_output,
            "total_cost": round(total_cost, 4),
            "cache_hit_rate": cache_hits / len(self.records) if self.records else 0,
            "calls": len(self.records),
            "session_duration": round(time.time() - self.session_start, 1)
        }

    def save_stats(self, path: str = "tmp/token_stats.json"):
        stats = self.stats()
        with open(path, "w") as f:
            json.dump(stats, f, indent=2)


# ─── Parallel Agents ───────────────────────────────────────────────────────────

@dataclass
class AgentConfig:
    task: str
    priority: int = 1
    agent_id: str = ""
    dependencies: List[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.agent_id:
            self.agent_id = f"agent_{hashlib.md5(self.task.encode()).hexdigest()[:8]}"

class ParallelAgents:
    """
    Run multiple AI agents in parallel for maximum efficiency.

    Example:
        agents = ParallelAgents([
            AgentConfig(task="refactor auth", priority=1),
            AgentConfig(task="write tests", priority=1),
            AgentConfig(task="update docs", priority=2),  # after #1
        ], max_parallel=2)
        results = asyncio.run(agents.run_all())
    """

    def __init__(self, configs: List[AgentConfig], max_parallel: int = 3):
        self.configs = configs
        self.max_parallel = max_parallel
        self.results: Dict[str, Any] = {}

    async def run_all(self) -> Dict[str, Any]:
        """Run all agents respecting dependencies and max_parallel."""
        # Group by priority
        by_priority = {}
        for cfg in self.configs:
            if cfg.priority not in by_priority:
                by_priority[cfg.priority] = []
            by_priority[cfg.priority].append(cfg)

        # Run each priority level
        for priority in sorted(by_priority.keys()):
            configs = by_priority[priority]

            # Filter out those with unmet dependencies
            ready = [c for c in configs if all(d in self.results for d in c.dependencies)]

            # Run ready agents in parallel (up to max_parallel)
            tasks = []
            for cfg in ready[:self.max_parallel]:
                tasks.append(self._run_agent(cfg))

            # Wait for all in this batch
            if tasks:
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)
                for cfg, result in zip(ready[:self.max_parallel], batch_results):
                    self.results[cfg.agent_id] = result

        return self.results

    async def _run_agent(self, config: AgentConfig) -> str:
        """Simulate agent execution (replace with actual agent logic)."""
        print(f"[{config.agent_id}] Starting: {config.task[:50]}...")
        # Simulate work
        await asyncio.sleep(random.uniform(0.5, 2.0))
        result = f"Completed: {config.task}"
        print(f"[{config.agent_id}] Done: {config.task[:50]}...")
        return result


# ─── Context Stuffing ──────────────────────────────────────────────────────────

def stuff_context(components: List[Tuple[str, str]], max_tokens: int = 100000) -> str:
    """
    Stuff context with all relevant information.

    Example:
        context = stuff_context([
            ("objective", "build auth module"),
            ("code", all_code_files),
            ("docs", relevant_documentation),
            ("constraints", "must use OAuth2"),
        ], max_tokens=80000)
    """
    sections = []
    total_tokens = 0

    for label, content in components:
        tokens = count_tokens(content)
        if total_tokens + tokens > max_tokens:
            # Truncate this component
            max_chars = max_tokens - total_tokens
            content = content[:max_chars * 4]  # rough chars to tokens
            tokens = count_tokens(content)

        if tokens > 0:
            sections.append(f"# {label.upper()}\n{content}")
            total_tokens += tokens

    return "\n\n".join(sections)


# ─── Leverage Calculator ───────────────────────────────────────────────────────

@dataclass
class Task:
    name: str
    estimated_hours: float
    hourly_rate: float  # $/hour
    token_cost_estimate: float  # $ in tokens
    complexity: str = "medium"  # low, medium, high

    @property
    def human_cost(self) -> float:
        return self.estimated_hours * self.hourly_rate

    @property
    def leverage_ratio(self) -> float:
        if self.token_cost_estimate == 0:
            return float('inf')
        return self.human_cost / self.token_cost_estimate

    @property
    def net_savings(self) -> float:
        return self.human_cost - self.token_cost_estimate

class LeverageCalculator:
    """
    Calculate ROI of token spending vs human time.

    Example:
        calc = LeverageCalculator(hourly_rate=150)
        task = Task("build feature", estimated_hours=20, hourly_rate=150, token_cost_estimate=300)
        result = calc.calculate(task)
        # result tells you: 10x leverage, save $2700, worth doing
    """

    def __init__(self, hourly_rate: float = 100):
        self.hourly_rate = hourly_rate
        self.task_history: List[Dict] = []

    def calculate(self, task: Task) -> dict:
        leverage = task.human_cost / task.token_cost_estimate if task.token_cost_estimate > 0 else 999
        net_savings = task.human_cost - task.token_cost_estimate

        recommendation = "worth_doing"
        if leverage < 2:
            recommendation = "marginal"
        if leverage < 1:
            recommendation = "not_worth_it"
        if leverage > 20:
            recommendation = "highly_recommended"

        return {
            "task": task.name,
            "estimated_hours": task.estimated_hours,
            "human_cost": f"${task.human_cost:.2f}",
            "token_cost": f"${task.token_cost_estimate:.2f}",
            "leverage": f"{leverage:.1f}x",
            "net_savings": f"${net_savings:.2f}",
            "recommendation": recommendation
        }

    def weekly_savings(self, task: Task, times_per_week: int = 1) -> dict:
        weekly_human = task.human_cost * times_per_week
        weekly_tokens = task.token_cost_estimate * times_per_week
        weekly_savings = weekly_human - weekly_tokens

        return {
            "per_task": f"${task.human_cost - task.token_cost_estimate:.2f}",
            "weekly_human_time_saved": f"{task.estimated_hours * times_per_week:.1f} hours",
            "weekly_savings": f"${weekly_savings:.2f}",
            "yearly_savings": f"${weekly_savings * 52:.2f}"
        }

    def track(self, task: Task, actual_token_cost: float):
        self.task_history.append({
            "name": task.name,
            "estimated": task.token_cost_estimate,
            "actual": actual_token_cost,
            "timestamp": time.time()
        })


# ─── Token Burn Dashboard ───────────────────────────────────────────────────────

@dataclass
class SessionRecord:
    name: str
    tokens: int
    cost: float
    timestamp: float
    category: str = "general"

class TokenBurnDashboard:
    """
    Track token burn for professional metrics and optimization.

    Example:
        dashboard = TokenBurnDashboard()
        dashboard.track("feature_build", tokens=50000, cost=150)
        dashboard.track("code_review", tokens=5000, cost=15)
        print(dashboard.get_daily_total())  # "$450 today"
    """

    def __init__(self):
        self.sessions: List[SessionRecord] = []
        self.category_budgets: Dict[str, float] = {
            "research": 500,
            "implementation": 1000,
            "review": 200,
            "general": 300
        }
        self.daily_budget = 1000  # $1000/day default

    def track(self, name: str, tokens: int, cost: float, category: str = "general"):
        self.sessions.append(SessionRecord(name, tokens, cost, time.time(), category))

    def get_burn_rate(self) -> str:
        if not self.sessions:
            return "0 tokens/hr"
        hour_ago = time.time() - 3600
        recent = [s for s in self.sessions if s.timestamp > hour_ago]
        if not recent:
            return "0 tokens/hr"
        tokens = sum(s.tokens for s in recent)
        return f"{tokens} tokens/hr"

    def get_daily_total(self) -> dict:
        day_ago = time.time() - 86400
        today = [s for s in self.sessions if s.timestamp > day_ago]
        total_tokens = sum(s.tokens for s in today)
        total_cost = sum(s.cost for s in today)
        return {
            "tokens": total_tokens,
            "cost": f"${total_cost:.2f}",
            "sessions": len(today),
            "budget_remaining": f"${self.daily_budget - total_cost:.2f}"
        }

    def get_weekly_leaderboard_position(self, user_stats: dict) -> int:
        """Calculate where user ranks among team (simulated)."""
        # In reality, this would compare against team stats from backend
        # For now, just return a simulated position
        team_size = user_stats.get("team_size", 10)
        return random.randint(1, team_size)

    def get_category_breakdown(self) -> dict:
        day_ago = time.time() - 86400
        today = [s for s in self.sessions if s.timestamp > day_ago]

        breakdown = {}
        for cat in self.category_budgets:
            cat_sessions = [s for s in today if s.category == cat]
            total_cost = sum(s.cost for s in cat_sessions)
            breakdown[cat] = {
                "cost": f"${total_cost:.2f}",
                "budget": f"${self.category_budgets[cat]:.2f}",
                "usage_pct": f"{(total_cost / self.category_budgets[cat] * 100):.1f}%" if self.category_budgets[cat] > 0 else "0%"
            }
        return breakdown

    def get_optimization_suggestions(self) -> List[str]:
        suggestions = []
        stats = self.get_daily_total()

        # Check if over budget
        if float(stats["cost"].replace("$", "")) > self.daily_budget:
            suggestions.append("Over daily budget. Consider compressing context or caching more.")

        # Check category breakdown
        cat_breakdown = self.get_category_breakdown()
        for cat, data in cat_breakdown.items():
            usage = float(data["usage_pct"].replace("%", ""))
            if usage > 100:
                suggestions.append(f"{cat} is {usage:.0f}% of budget. Optimize here.")

        return suggestions

    def export_stats(self) -> dict:
        return {
            "total_sessions": len(self.sessions),
            "all_time_tokens": sum(s.tokens for s in self.sessions),
            "all_time_cost": sum(s.cost for s in self.sessions),
            "daily": self.get_daily_total(),
            "categories": self.get_category_breakdown()
        }


# ─── Schedule Workflow (Overnight Automation) ─────────────────────────────────

@dataclass
class WorkflowStep:
    name: str
    agent: str
    depends_on: List[str] = field(default_factory=list)

@dataclass
class Workflow:
    name: str
    steps: List[WorkflowStep]
    run_during: Tuple[str, str] = ("22:00", "07:00")  # 10pm to 7am

    def is_active_time(self) -> bool:
        now = datetime.now()
        current_hour = now.hour
        start_hour = int(self.run_during[0].split(":")[0])
        end_hour = int(self.run_during[1].split(":")[0])
        if start_hour < end_hour:
            return start_hour <= current_hour <= end_hour
        else:
            return current_hour >= start_hour or current_hour <= end_hour

    async def execute(self) -> dict:
        results = {}
        completed = set()

        for step in self.steps:
            if all(d in completed for d in step.depends_on):
                print(f"[{self.name}] Running step: {step.name}")
                await asyncio.sleep(random.uniform(0.5, 2.0))  # Simulate work
                results[step.name] = "completed"
                completed.add(step.name)

        return results


# ─── Streaming ────────────────────────────────────────────────────────────────

def stream_tokens(model: Any, prompt: str) -> Iterator[str]:
    try:
        if hasattr(model, 'stream'):
            for chunk in model.stream(prompt):
                yield chunk
            return
        if hasattr(model, 'messages_stream'):
            for chunk in model.messages_stream:
                yield chunk
            return
    except (AttributeError, TypeError):
        pass
    yield "Streaming not available"
    yield response if 'response' in dir() else ""


# ─── Combined Optimization ──────────────────────────────────────────────────────

@dataclass
class OptimizedInteraction:
    cache: SemanticCache
    tracker: TokenTracker
    dashboard: TokenBurnDashboard
    config: dict = field(default_factory=lambda: DEFAULT_CONFIG.copy())

def create_optimizer() -> OptimizedInteraction:
    return OptimizedInteraction(
        cache=SemanticCache(),
        tracker=TokenTracker(),
        dashboard=TokenBurnDashboard(),
        config=DEFAULT_CONFIG.copy()
    )


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Token Maxxing - Strategic token optimization")
    parser.add_argument("--stats", "-s", action="store_true", help="Show stats")
    parser.add_argument("--clear", action="store_true", help="Clear cache")
    parser.add_argument("--leverage", "-l", nargs=3, metavar=("HOURS", "RATE", "TOKEN_COST"),
                       help="Calculate leverage: hours hourly_rate token_cost")
    parser.add_argument("--parallel", "-p", nargs="+", help="Run parallel tasks")
    parser.add_argument("--dashboard", "-d", action="store_true", help="Show burn dashboard")

    args = parser.parse_args()

    cache = SemanticCache()
    tracker = TokenTracker()
    dashboard = TokenBurnDashboard()

    if args.clear:
        cache.clear()
        print("Cache cleared.")

    if args.stats:
        print("Cache:", json.dumps(cache.get_stats(), indent=2))
        print("Tracker:", json.dumps(tracker.stats(), indent=2))

    if args.leverage:
        hours, rate, token_cost = float(args.leverage[0]), float(args.leverage[1]), float(args.leverage[2])
        task = Task("task", hours, rate, token_cost)
        calc = LeverageCalculator(hourly_rate=rate)
        result = calc.calculate(task)
        print(json.dumps(result, indent=2))

    if args.dashboard:
        print("Token Burn:")
        print(json.dumps(dashboard.get_daily_total(), indent=2))
        print("Categories:", json.dumps(dashboard.get_category_breakdown(), indent=2))

    if not (args.stats or args.clear or args.leverage or args.dashboard):
        parser.print_help()


if __name__ == "__main__":
    main()