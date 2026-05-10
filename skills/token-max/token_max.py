#!/usr/bin/env python3
"""
Token Maxxing - Token optimization for maximum efficiency.

Features:
- Semantic caching for repeated queries
- Context compression for long conversations
- Prompt compression for redundancy removal
- Token tracking and cost monitoring
- Streaming for perceived speed
"""

import os
import sys
import json
import time
import hashlib
import sqlite3
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any, Iterator, Tuple
from datetime import datetime
from collections import OrderedDict
import re

# ─── Configuration ────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "max_context": 8000,
    "cache_threshold": 0.85,
    "compress_threshold": 10000,
    "streaming": True,
    "track_costs": True,
    "price_per_1k_input": 0.001,  # Adjust per model
    "price_per_1k_output": 0.003,
}

# ─── Token Counting ────────────────────────────────────────────────────────────

def count_tokens(text: str) -> int:
    """Simple token counter (approximation)."""
    # Rough estimate: ~4 chars per token for English
    return len(text) // 4

def count_messages_tokens(messages: List[Dict]) -> int:
    """Count tokens in a message list."""
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
        total += count_tokens(msg.get("role", ""))  # role token overhead
    return total

def estimate_cost(input_tokens: int, output_tokens: int,
                 price_in: float = 0.001, price_out: float = 0.003) -> float:
    """Estimate cost in dollars."""
    return (input_tokens * price_in + output_tokens * price_out) / 1000


# ─── Prompt Compression ─────────────────────────────────────────────────────────

def compress_prompt(prompt: str) -> str:
    """Remove redundant phrases from prompts."""
    if not prompt:
        return prompt

    # Common redundancy patterns
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

    # Clean up multiple spaces
    compressed = re.sub(r'\s+', ' ', compressed).strip()

    # Remove trailing redundant phrases
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
    """Convert message dicts to Message objects."""
    result = []
    for m in messages:
        content = m.get("content", "")
        if isinstance(content, list):
            text = " ".join(c.get("text", "") if isinstance(c, dict) else str(c) for c in content)
        else:
            text = str(content)
        result.append(Message(
            role=m.get("role", "user"),
            content=text,
            tokens=count_tokens(text)
        ))
    return result

def compress_context(messages: List[Dict], max_tokens: int = 8000,
                     summarize_older: bool = True) -> List[Dict]:
    """
    Compress conversation context to fit within token limit.

    Strategy:
    1. Keep most recent messages fully
    2. Summarize older messages into compact facts
    3. If still too long, compress recent messages
    """
    if not messages:
        return []

    objs = messages_to_objects(messages)
    total = sum(m.tokens for m in objs)

    if total <= max_tokens:
        return messages  # No compression needed

    # Calculate how many recent messages to keep fully
    recent_messages = []
    summarized_history = []

    # Work backwards from most recent
    accumulated = 0
    for msg in reversed(objs):
        if accumulated + msg.tokens > max_tokens * 0.4:  # Keep 40% for recent
            break
        recent_messages.insert(0, msg)
        accumulated += msg.tokens

    # Summarize older messages
    if len(objs) > len(recent_messages):
        older = objs[:-len(recent_messages)] if recent_messages else objs
        older_content = "\n".join(f"[{m.role}]: {m.content[:200]}" for m in older)

        # Simple summarization - just compress
        summary = compress_prompt(older_content)
        if len(summary) > 300:
            # Further compress long summaries
            summary = summary[:300] + "..."

        summarized_history.append(Message(
            role="system",
            content=f"[Earlier conversation summarized: {summary}]",
            tokens=count_tokens(summary)
        ))

    # Rebuild
    result = []
    if summarized_history:
        result.append(summarized_history[0].to_dict())
    result.extend(m.to_dict() for m in recent_messages)

    return result


# ─── Semantic Cache ─────────────────────────────────────────────────────────────

class SemanticCache:
    """
    Cache responses for semantically similar queries.

    Uses simple hash-based similarity for now.
    Can be upgraded to embedding-based similarity.
    """

    def __init__(self, threshold: float = 0.85, cache_dir: str = "tmp/token_cache"):
        self.threshold = threshold
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Simple key-value store using sqlite for speed
        self.db_path = self.cache_dir / "cache.db"
        self._init_db()

        # Stats
        self.stats = {"hits": 0, "misses": 0, "total": 0}

    def _init_db(self):
        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                value TEXT,
                token_count INTEGER,
                created_at REAL,
                access_count INTEGER DEFAULT 1,
                last_access REAL
            )
        """)
        # Simple similarity cache (key = normalized query)
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
        """Normalize text for similarity comparison."""
        # Lowercase, remove extra spaces, remove punctuation
        normalized = text.lower().strip()
        normalized = re.sub(r'[^\w\s]', '', normalized)
        normalized = re.sub(r'\s+', ' ', normalized)
        return normalized

    def _get_similarity_key(self, text: str) -> str:
        """Get a similarity key for the text."""
        normalized = self._normalize(text)
        # Simple approach: use first 50 chars as approximate
        return hashlib.md5(normalized[:100].encode()).hexdigest()

    def get(self, query: str) -> Optional[str]:
        """Get cached response if exists."""
        norm_key = self._normalize(query)
        sim_key = self._get_similarity_key(query)

        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()

        # Try exact match first
        c.execute("SELECT value FROM sim_cache WHERE normalized_key = ?", (norm_key,))
        row = c.fetchone()
        if row:
            # Update access stats
            c.execute("UPDATE sim_cache SET last_access = ? WHERE normalized_key = ?",
                     (time.time(), norm_key))
            conn.commit()
            conn.close()
            self.stats["hits"] += 1
            self.stats["total"] += 1
            return row[0]

        # Try similarity match (check nearby keys)
        c.execute("SELECT key, value FROM sim_cache")
        rows = c.fetchall()
        conn.close()

        for key, value in rows:
            # Simple similarity: normalized strings match > 85%
            if self._similar(norm_key, self._normalize(key)):
                self.stats["hits"] += 1
                self.stats["total"] += 1
                return value

        self.stats["misses"] += 1
        self.stats["total"] += 1
        return None

    def _similar(self, s1: str, s2: str) -> bool:
        """Check if two normalized strings are similar."""
        # Simple: compare lengths and common chars
        if abs(len(s1) - len(s2)) > len(s1) * 0.2:
            return False

        # Character overlap
        set1, set2 = set(s1), set(s2)
        overlap = len(set1 & set2) / max(len(set1), len(set2))
        return overlap >= self.threshold

    def set(self, query: str, value: str):
        """Store response in cache."""
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
        """Clear all cache."""
        conn = sqlite3.connect(str(self.db_path))
        c = conn.cursor()
        c.execute("DELETE FROM sim_cache")
        conn.commit()
        conn.close()
        self.stats = {"hits": 0, "misses": 0, "total": 0}

    def get_hit_rate(self) -> float:
        if self.stats["total"] == 0:
            return 0.0
        return self.stats["hits"] / self.stats["total"]

    def get_stats(self) -> dict:
        return {
            **self.stats,
            "hit_rate": self.get_hit_rate(),
            "cache_size": self._get_cache_size()
        }

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
    """Track token usage and costs."""

    def __init__(self, price_in: float = 0.001, price_out: float = 0.003):
        self.price_in = price_in
        self.price_out = price_out
        self.records: List[TokenRecord] = []
        self.session_start = time.time()

    def before(self, messages: List[Dict]) -> int:
        """Call before API call to get input token count."""
        return count_messages_tokens(messages)

    def after(self, input_tokens: int, output_tokens: int, cache_hit: bool = False):
        """Record the API call."""
        cost = estimate_cost(input_tokens, output_tokens, self.price_in, self.price_out)
        self.records.append(TokenRecord(
            timestamp=time.time(),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost=cost,
            cache_hit=cache_hit
        ))

    def stats(self) -> dict:
        """Get current statistics."""
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
        """Save stats to file."""
        stats = self.stats()
        with open(path, "w") as f:
            json.dump(stats, f, indent=2)


# ─── Streaming ────────────────────────────────────────────────────────────────

def stream_tokens(model: Any, prompt: str) -> Iterator[str]:
    """
    Stream tokens from a model (if supported).

    Falls back to non-streaming if model doesn't support it.
    """
    try:
        # Try OpenAI-style streaming
        if hasattr(model, 'stream'):
            for chunk in model.stream(prompt):
                yield chunk
            return

        # Try Anthropic-style
        if hasattr(model, 'messages_stream'):
            for chunk in model.messages_stream:
                yield chunk
            return

    except (AttributeError, TypeError):
        pass

    # Fallback: yield entire response at once
    # Monkey patch would go here for actual streaming
    response = "Streaming not available - model doesn't support it"
    yield response


# ─── Combined Optimization ────────────────────────────────────────────────────

@dataclass
class OptimizedInteraction:
    cache: SemanticCache
    tracker: TokenTracker
    config: dict = field(default_factory=lambda: DEFAULT_CONFIG.copy())

def create_optimizer() -> OptimizedInteraction:
    """Create an optimized interaction handler."""
    return OptimizedInteraction(
        cache=SemanticCache(),
        tracker=TokenTracker(),
        config=DEFAULT_CONFIG.copy()
    )

async def optimize_interaction(
    optimizer: OptimizedInteraction,
    messages: List[Dict],
    compute_fn: Callable,
    force_refresh: bool = False
) -> str:
    """
    Run an interaction with full optimization.

    1. Check cache
    2. Compress context if needed
    3. Track tokens
    4. Compute
    5. Cache result
    6. Track cost
    """
    # Get the latest user message for cache key
    latest_msg = messages[-1] if messages else ""
    if isinstance(latest_msg, dict):
        cache_key = latest_msg.get("content", "")
    else:
        cache_key = str(latest_msg)

    # Check cache
    if not force_refresh:
        cached = optimizer.cache.get(cache_key)
        if cached:
            return cached

    # Compress context if needed
    max_ctx = optimizer.config.get("max_context", 8000)
    compressed = compress_context(messages, max_tokens=max_ctx)

    # Track input tokens
    input_tokens = count_messages_tokens(compressed)
    optimizer.tracker.before(compressed)

    # Compute
    result = await compute_fn(compressed) if callable(compute_fn) else result

    # Count output tokens
    output_tokens = count_tokens(result)

    # Record
    optimizer.tracker.after(input_tokens, output_tokens)

    # Cache result
    optimizer.cache.set(cache_key, result)

    return result


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Token Maxxing - Optimize token usage")
    parser.add_argument("--stats", "-s", action="store_true", help="Show cache stats")
    parser.add_argument("--clear", "-c", action="store_true", help="Clear cache")
    parser.add_argument("--test", "-t", action="store_true", help="Test compression")

    args = parser.parse_args()

    cache = SemanticCache()
    tracker = TokenTracker()

    if args.clear:
        cache.clear()
        print("Cache cleared.")

    if args.stats:
        print("Cache stats:", json.dumps(cache.get_stats(), indent=2))
        print("Token stats:", json.dumps(tracker.stats(), indent=2))

    if args.test:
        test_text = """
        I want you to help me with this task. As an AI assistant,
        you should be helpful and provide good responses.
        Please help me understand this better.
        """
        print("Original:", test_text)
        print("Compressed:", compress_prompt(test_text))

    if not (args.stats or args.clear or args.test):
        parser.print_help()


if __name__ == "__main__":
    main()