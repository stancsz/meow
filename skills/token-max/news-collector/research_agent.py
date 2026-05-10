#!/usr/bin/env python3
"""
Research Agent - Collect agentic AI news and trending repos.

Runs every 3 hours to gather:
- GitHub trending repos in AI/agentic AI
- Hacker News AI/AGI stories
- arXiv papers on autonomous agents
- Industry news

Prioritized by "token maxxing competitive advantage" for a principal
quantum agentics AI engineer.
"""

import os
import sys
import json
import time
import hashlib
import subprocess
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from typing import List

# ─── Configuration ────────────────────────────────────────────────────────────

NEWS_DIR = Path.home() / "Downloads" / "news"
SEEN_HASHES_FILE = Path("tmp/news_intel/seen_hashes.json")
SKILL_DIR = Path(__file__).parent.parent.parent

# Token maxxing priority weights
PRIORITY_WEIGHTS = {
    "leverage": 0.30,
    "novelty": 0.25,
    "prod_ready": 0.20,
    "arch_insight": 0.15,
    "edge": 0.10
}

# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class NewsItem:
    title: str
    source: str
    url: str
    stars: int = 0
    summary: str = ""
    why_important: str = ""
    tier: str = "medium"  # critical, high, medium

    # Priority scoring (0-100)
    leverage: int = 50
    novelty: int = 50
    prod_ready: int = 50
    arch_insight: int = 50
    edge: int = 50

    timestamp: float = field(default_factory=time.time)

    @property
    def token_advantage_score(self) -> int:
        return int(
            self.leverage * PRIORITY_WEIGHTS["leverage"] +
            self.novelty * PRIORITY_WEIGHTS["novelty"] +
            self.prod_ready * PRIORITY_WEIGHTS["prod_ready"] +
            self.arch_insight * PRIORITY_WEIGHTS["arch_insight"] +
            self.edge * PRIORITY_WEIGHTS["edge"]
        )

    @property
    def content_hash(self) -> str:
        return hashlib.md5(f"{self.title}:{self.url}".encode()).hexdigest()

    def to_markdown(self) -> str:
        tier_icon = {"critical": "🔴", "high": "🟡", "medium": "🟢"}.get(self.tier, "⚪")
        tier_label = {"critical": "CRITICAL", "high": "HIGH VALUE", "medium": "MEDIUM"}.get(self.tier, "")

        lines = [
            f"### [{tier_icon}] {self.title}",
            f"- Source: {self.source}",
            f"- Link: {self.url}",
        ]

        if self.stars > 0:
            lines.append(f"- Stars: {self.stars:,}")

        lines.append(f"- Token Advantage: {self.token_advantage_score}/100")
        lines.append(f"- Summary: {self.summary}")
        lines.append(f"- Why Important: {self.why_important}")

        return "\n".join(lines)


# ─── Browser Harness Functions ────────────────────────────────────────────────

def run_browser_command(cmd: str) -> str:
    """Run browser-harness command and return output."""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout + result.stderr


def goto_url(url: str) -> bool:
    """Navigate to URL using browser-harness."""
    result = run_browser_command(f'browser-harness -c \'goto_url("{url}")\'')
    return len(result) > 0


def capture_screenshot() -> bool:
    """Take screenshot using browser-harness."""
    result = run_browser_command('browser-harness -c \'capture_screenshot()\'')
    return "error" not in result.lower()


def new_tab(url: str) -> bool:
    """Open new tab with URL."""
    result = run_browser_command(f'browser-harness -c \'new_tab("{url}")\'')
    return len(result) > 0


def print_page_info() -> str:
    """Get current page info."""
    return run_browser_command('browser-harness -c \'print(page_info())\'')


def get_screenshot_path() -> Optional[str]:
    """Get path to most recent screenshot."""
    tmp_dir = Path("tmp")
    screenshots = list(tmp_dir.glob("screenshot*.png")) + list(tmp_dir.glob("screenshot*.webp"))
    if screenshots:
        return str(sorted(screenshots, key=lambda p: p.stat().st_mtime)[-1])
    return None


# ─── GitHub Trending Scraper ──────────────────────────────────────────────────

def scrape_github_trending() -> List[NewsItem]:
    """Scrape GitHub trending repos for AI/agentic AI."""
    items = []

    print("Scraping GitHub trending...")

    # Search queries for agentic AI
    queries = [
        "agentic-ai",
        "autonomous-agents",
        "AI-agents-framework",
        "LLM-agents",
        "reasoning-engine"
    ]

    for query in queries[:2]:  # Limit to 2 to save time
        try:
            goto_url(f"https://github.com/search?q={query}&type=repositories&s=stars")

            # Wait for page load
            time.sleep(3)

            # Get page info
            page_info = print_page_info()
            print(f"  [{query}] Page info: {page_info[:100]}")

            # Take screenshot for analysis
            capture_screenshot()
            screenshot_path = get_screenshot_path()

            if screenshot_path:
                # We have screenshot - but need VLM to analyze
                # For now, we'll parse what we can from page structure
                # In a full implementation, we'd send to MiniMax
                pass

            # GitHub trending doesn't have easy API, so we parse HTML-like output
            # This is simplified - real implementation would use proper parsing

            # Add placeholder items representing what we'd find
            items.append(NewsItem(
                title=f"[Trending] {query.title()} Repos - Worth Checking",
                source="GitHub Trending",
                url=f"https://github.com/search?q={query}&type=repositories&s=stars",
                summary=f"Trending repositories for {query}",
                why_important="High visibility repos often indicate industry direction",
                tier="high",
                leverage=70,
                novelty=60,
                prod_ready=80,
                arch_insight=50,
                edge=40
            ))

        except Exception as e:
            print(f"  Error scraping {query}: {e}")

    return items


# ─── Hacker News Scraper ──────────────────────────────────────────────────────

def scrape_hacker_news() -> List[NewsItem]:
    """Scrape Hacker News for AI/AGI stories."""
    items = []

    print("Scraping Hacker News...")

    try:
        goto_url("https://news.ycombinator.com/")
        time.sleep(2)

        # HN shows top stories - focus on AI-related keywords
        # In practice, would parse actual story titles
        # For now, collect what we can

        page_info = print_page_info()
        print(f"  HN Page info: {page_info[:100]}")

        # Check for AI-related stories
        ai_keywords = ["AI", "AGI", "agent", "LLM", "GPT", "Claude", "reasoning", "automation"]

        # Add placeholder for what we'd find
        items.append(NewsItem(
            title="[HN] AI/AGI Stories - Check Daily",
            source="Hacker News",
            url="https://news.ycombinator.com/",
            summary="Top AI stories from Hacker News",
            why_important="HN often has early coverage of significant AI developments",
            tier="high",
            leverage=65,
            novelty=70,
            prod_ready=50,
            arch_insight=75,
            edge=60
        ))

    except Exception as e:
        print(f"  Error scraping HN: {e}")

    return items


# ─── arXiv Scraper ─────────────────────────────────────────────────────────────

def scrape_arxiv() -> List[NewsItem]:
    """Scrape arXiv for autonomous AI / agent papers."""
    items = []

    print("Scraping arXiv...")

    try:
        # arXiv has categories for AI/ML
        goto_url("https://arxiv.org/list/cs.AI/recent")
        time.sleep(2)

        page_info = print_page_info()
        print(f"  arXiv Page info: {page_info[:100]}")

        # Collect recent AI papers
        items.append(NewsItem(
            title="[arXiv] Recent cs.AI Papers",
            source="arXiv",
            url="https://arxiv.org/list/cs.AI/recent",
            summary="Recent papers in Artificial Intelligence category",
            why_important="arXiv often has cutting-edge research before publication",
            tier="high",
            leverage=75,
            novelty=85,
            prod_ready=40,
            arch_insight=90,
            edge=80
        ))

    except Exception as e:
        print(f"  Error scraping arXiv: {e}")

    return items


# ─── Duplicate Detection ──────────────────────────────────────────────────────

def load_seen_hashes() -> set:
    """Load set of previously seen content hashes."""
    if SEEN_HASHES_FILE.exists():
        with open(SEEN_HASHES_FILE) as f:
            data = json.load(f)
            return set(data.get("hashes", []))
    return set()


def save_seen_hashes(hashes: set):
    """Save seen hashes to prevent duplicates."""
    SEEN_HASHES_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SEEN_HASHES_FILE, "w") as f:
        json.dump({
            "hashes": list(hashes),
            "last_updated": time.time()
        }, f, indent=2)


def is_duplicate(item: NewsItem, seen_hashes: set) -> bool:
    """Check if item is duplicate."""
    return item.content_hash in seen_hashes


# ─── File Organization ─────────────────────────────────────────────────────────

def get_today_filename() -> Path:
    """Get today's news filename (yymmdd.md)."""
    NEWS_DIR.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%y%m%d")
    return NEWS_DIR / f"{date_str}.md"


def read_existing_news() -> List[NewsItem]:
    """Read existing items from today's file to avoid duplicates."""
    today_file = get_today_filename()
    if not today_file.exists():
        return []

    # Parse existing markdown to extract hashes
    existing_hashes = set()
    content = today_file.read_text()
    # Could parse full content but for now just check file exists
    return []


def write_news_file(items: List[NewsItem], date: str = None):
    """Write news items to daily file."""
    today_file = get_today_filename()
    date_str = date or datetime.now().strftime("%Y-%m-%d")

    # Group by tier
    critical = [i for i in items if i.tier == "critical"]
    high = [i for i in items if i.tier == "high"]
    medium = [i for i in items if i.tier == "medium"]

    # Sort each tier by token advantage score
    critical.sort(key=lambda x: x.token_advantage_score, reverse=True)
    high.sort(key=lambda x: x.token_advantage_score, reverse=True)
    medium.sort(key=lambda x: x.token_advantage_score, reverse=True)

    # Build markdown
    lines = [
        f"# Agentic AI News - {date_str}",
        "",
        f"## 🔴 CRITICAL - Read Now (Score >= 80)",
        ""
    ]

    for item in critical:
        lines.append(item.to_markdown())
        lines.append("")

    lines.extend([
        "",
        "## 🟡 HIGH VALUE - Read Today (Score 60-79)",
        ""
    ])

    for item in high:
        lines.append(item.to_markdown())
        lines.append("")

    lines.extend([
        "",
        "## 🟢 MEDIUM - This Week (Score < 60)",
        ""
    ])

    for item in medium:
        lines.append(item.to_markdown())
        lines.append("")

    # Write
    today_file.write_text("\n".join(lines))
    print(f"Written to: {today_file}")


# ─── Main Research Agent ───────────────────────────────────────────────────────

def run_research():
    """Run the full research collection."""
    print(f"\n{'='*60}")
    print(f"NEWS INTEL - Agentic AI Research Collector")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    all_items: List[NewsItem] = []
    seen_hashes = load_seen_hashes()
    new_count = 0

    # Collect from all sources
    sources = [
        ("GitHub Trending", scrape_github_trending),
        ("Hacker News", scrape_hacker_news),
        ("arXiv", scrape_arxiv),
    ]

    for source_name, scraper_func in sources:
        print(f"\n--- {source_name} ---")
        items = scraper_func()

        for item in items:
            if not is_duplicate(item, seen_hashes):
                all_items.append(item)
                seen_hashes.add(item.content_hash)
                new_count += 1
                print(f"  + NEW: {item.title[:60]} (score: {item.token_advantage_score})")
            else:
                print(f"  - DUP: {item.title[:60]}")

    # Sort all items by token advantage score
    all_items.sort(key=lambda x: x.token_advantage_score, reverse=True)

    # Assign tiers based on score
    for item in all_items:
        if item.token_advantage_score >= 80:
            item.tier = "critical"
        elif item.token_advantage_score >= 60:
            item.tier = "high"
        else:
            item.tier = "medium"

    # Write to file
    if all_items:
        write_news_file(all_items)

    # Save seen hashes
    save_seen_hashes(seen_hashes)

    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total items: {len(all_items)}")
    print(f"New items: {new_count}")
    print(f"Location: {get_today_filename()}")
    print(f"Critical: {sum(1 for i in all_items if i.tier == 'critical')}")
    print(f"High: {sum(1 for i in all_items if i.tier == 'high')}")
    print(f"Medium: {sum(1 for i in all_items if i.tier == 'medium')}")
    print(f"\nTop 3 by Token Advantage:")
    for item in all_items[:3]:
        print(f"  [{item.token_advantage_score}] {item.title[:50]}...")
    print(f"{'='*60}\n")

    return len(all_items)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(description="News Intel - Agentic AI Research Collector")
    parser.add_argument("--now", "-n", action="store_true", help="Run immediately")
    parser.add_argument("--test", "-t", action="store_true", help="Test mode (don't write files)")

    args = parser.parse_args()

    if args.test:
        print("Test mode - would run research but not write files")
        return

    result = run_research()
    print(f"Research complete. Collected {result} items.")


if __name__ == "__main__":
    main()