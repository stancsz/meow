---
name: rate-limit-resilience
repo: https://github.com/meow/meow
docPath: internal/rate-limit-handling.md
why: MiniMax API rate limits (2062) cause frequent failures. Need smarter handling to avoid blocking the evolve loop.
minimalSlice: "Implement request batching, exponential backoff starting at 5min, and fallback to Anthropic/OpenAI when MiniMax is rate limited"
fit: core
complexity: 3
status: pending
---

# Rate Limit Resilience

**Problem:** MiniMax API returns 2062 errors frequently:
```
The Token Plan is designed for individual, interactive developer workflows.
Traffic is currently high—please retry shortly.
```

This blocks the evolve loop from making progress.

**Current State:**
- evolve.ts has basic retry with 5 provider fallback
- But each provider needs its own rate limit tracking
- State file tracks `rateLimitUntil` but doesn't persist across restarts well

**What Needs Fixing:**

1. **Per-Provider Rate Limits**
   - Track rate limit separately for MiniMax, Anthropic, OpenAI
   - Each provider has different limits

2. **Smarter Backoff**
   - Start at 5 min, increase exponentially
   - Cap at 30 min max
   - Use jitter to avoid thundering herd

3. **Request Batching**
   - Batch multiple gap closings into single API call
   - Reduce API call frequency

4. **Better State Persistence**
   - `rateLimitUntil` should persist across restarts
   - Gap retry times should persist
   - Last successful call timestamp per provider

**Minimal Slice:**
```typescript
interface RateLimitState {
  providers: {
    [name: string]: {
      rateLimitUntil: number;
      consecutiveFailures: number;
      lastSuccess: number;
    }
  }
}
```

**Test:**
```bash
./train.sh --once
# Should handle rate limits gracefully without failing
# Check dogfood/wisdom/state-v2.json for persistence
```
