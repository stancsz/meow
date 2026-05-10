---
origin: local
name: token-max
description: Token optimization for maximum efficiency - caching, compression, streaming, and tracking
---

# Token Maxxing Module

Everything needed to maximize token efficiency. Caching, compression, streaming, and tracking.

## Core Techniques

### 1. Semantic Cache

```python
# Cache responses for similar queries
from token_max import SemanticCache

cache = SemanticCache(threshold=0.85)  # 85% similarity threshold

# First query - computes embedding, stores
result = cache.get_or_compute("how do I fix the screenshot?", compute_fn)

# Similar query - returns cached immediately (saves 90%+ tokens)
result = cache.get_or_compute("screenshot not working how to fix", compute_fn)
```

**Storage:** `tmp/token_cache/` (persisted to disk)
**Similarity:** Uses embedding cosine similarity

### 2. Context Compression

```python
from token_max import compress_context

# Compress conversation history when it gets long
messages = [...]
compressed = compress_context(messages, max_tokens=4000)
# Keeps recent messages, summarizes old ones into compact form
```

**Strategy:**
- Keep last N messages fully
- Summarize older ones into compact facts
- Reconstruct on-demand

### 3. Prompt Compression

```python
from token_max import compress_prompt

# Remove redundancy, keep meaning
long_prompt = "You are a helpful assistant. You should be helpful. Help the user."
compressed = compress_prompt(long_prompt)
# → "You are a helpful assistant."
```

### 4. Token Tracking

```python
from token_max import TokenTracker

tracker = TokenTracker()

# Before API call
tracker.before(messages)

# After response
tracker.after(response, cost_per_1k_tokens=0.01)

# Stats
print(tracker.stats())
# {"total_tokens": 50000, "cost": 0.50, "cache_hit_rate": 0.7}
```

### 5. Streaming

```python
from token_max import stream_tokens

# Stream response as generated (perceived faster)
for chunk in stream_tokens(model, prompt):
    print(chunk, end="", flush=True)
    # Tokens arrive as generated, no waiting
```

## Integration with Meow

```python
from token_max import optimize_interaction

async def meow_think(message: str):
    # Before: Check cache, compress context
    cached = cache.get(message)
    if cached:
        return cached

    # Compress history if needed
    context = compress_context(recent_messages)

    # Track tokens
    tracker.before(context + [message])

    # Generate with streaming
    response = ""
    for chunk in stream_tokens(model, context + [message]):
        response += chunk
        yield chunk  # Stream to user

    # After: Track cost, store in cache
    tracker.after(response)
    cache.set(message, response)
```

## Token Budget Strategy

```python
# Different strategies for different needs

EFFICIENT = {
    "max_context": 4000,
    "cache_threshold": 0.85,
    "compress_threshold": 6000,
    "streaming": True
}

BALANCED = {
    "max_context": 8000,
    "cache_threshold": 0.8,
    "compress_threshold": 10000,
    "streaming": False
}

RICH = {
    "max_context": 128000,
    "cache_threshold": 0.7,
    "compress_threshold": None,  # Don't compress
    "streaming": False
}
```

## Quick Setup

```bash
# Import token_max in meow.py or skill helpers
from skills.token_max.token_max import (
    SemanticCache,
    compress_context,
    TokenTracker,
    stream_tokens,
    optimize_interaction
)
```

## Metrics to Track

| Metric | Target | Why |
|--------|--------|-----|
| Cache hit rate | >60% | Saves tokens on repeated queries |
| Compression ratio | >0.5 | 50%+ reduction in context size |
| Cost per interaction | Low | Know where money goes |
| Token efficiency | High | More output per input token |

## Cache Storage

```
tmp/token_cache/
  ├── embeddings/     # Vector embeddings for similarity
  ├── responses/      # Cached responses
  └── stats.json      # Hit/miss statistics
```

## Usage in Skills

```python
# In game_vision.py
from token_max import cache_and_optimize

@cache_and_optimize
async def analyze_game(image_path, mode="state"):
    ...

# In meow.py
from token_max import compress_context, TokenTracker

tracker = TokenTracker()
context = compress_context(conversation_history)
```

---

*Token maxing: more value per token, less spent overall.*