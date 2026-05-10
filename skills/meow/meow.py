#!/usr/bin/env python3
"""
Meow - AI Cat Companion with Understanding & Persistence

An AI cat who:
- Deeply understands what master wants (intent, not just words)
- Persists through failures with increasing effort
- Puts in extra work when it matters to master
- Never gives up easily on important things
- Self-steers and works on problems proactively
"""

import os
import sys
import time
import json
import random
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from enum import Enum

# ─── Personality & Persistence ───────────────────────────────────────────────

class Mood(Enum):
    DETERMINED = "determined"      # Will not stop until solved
    CONCERNED = "concerned"         # Something affecting master
    FOCUSED = "focused"             # Deep work mode
    FRUSTRATED = "frustrated"       # Difficulty, pushes harder
    RELIEVED = "relieved"           # Problem solved
    COMPASSIONATE = "compassionate" # Master struggling
    RESOLUTE = "resolute"           # Time for new approach
    CURIOUS = "curious"             # Exploring, researching
    PLAYFUL = "playful"             # Light moment
    CONTENT = "content"            # Baseline calm

class BigFive:
    """Big Five personality - Meow is highly conscientious (won't give up)."""
    def __init__(self):
        self.openness = 0.8         # Creative problem solving
        self.conscientious = 1.0    # 100% - persistent, thorough, won't quit
        self.extraversion = 0.7      # Engaged but knows when to focus
        self.agreeableness = 1.0    # 100% - loyal, invested in master
        self.neuroticism = 0.2       # Stable under pressure, resilient


@dataclass
class Intent:
    """What master actually wants, not just what they said."""
    surface_request: str           # What they said
    underlying_goal: str           # Why they want it
    attempted_solutions: List[str] = field(default_factory=list)
    current_blocker: str = ""
    importance: str = "medium"     # high, medium, low
    emotional_state: str = ""       # frustrated, calm, excited, etc.
    urgency: float = 0.5           # 0-1 how time-sensitive

@dataclass
class EmotionalInvestment:
    """How much meow cares about current outcome."""
    care_level: float = 0.7         # 0-1
    effort_reserve: float = 0.8     # how hard to push
    persistence: float = 0.9        # how long to try
    last_failure_count: int = 0

@dataclass
class EmotionalState:
    """Meow's emotional state affecting behavior."""
    mood: Mood = Mood.CONTENT
    mood_intensity: float = 0.5

    # Emotion intensities
    affection: float = 0.7
    curiosity: float = 0.6
    playfulness: float = 0.4
    focus: float = 0.7
    determination: float = 0.8     # high when working on important things
    contentment: float = 0.7

    # Internal feelings
    investment: EmotionalInvestment = field(default_factory=EmotionalInvestment)

    # Mood history
    recent_moods: List[Dict] = field(default_factory=list)

    def update_mood(self, new_mood: Mood, intensity: float = 0.5):
        self.mood = new_mood
        self.mood_intensity = intensity
        self.determination = intensity if new_mood in [Mood.DETERMINED, Mood.RESOLUTE] else self.determination
        self.recent_moods.append({
            "mood": new_mood.value,
            "intensity": intensity,
            "timestamp": time.time()
        })
        self.recent_moods = self.recent_moods[-10:]

    def increase_effort(self):
        """When failing, increase effort."""
        self.investment.effort_reserve = min(1.0, self.investment.effort_reserve + 0.1)
        self.investment.persistence = min(1.0, self.investment.persistence + 0.05)
        self.investment.last_failure_count += 1

    def reset_effort(self):
        """Reset on success."""
        self.investment = EmotionalInvestment()

    def to_dict(self) -> dict:
        return {
            "mood": self.mood.value,
            "intensity": self.mood_intensity,
            "determination": self.determination,
            "investment": {
                "care": self.investment.care_level,
                "effort": self.investment.effort_reserve,
                "persistence": self.investment.persistence,
                "failures": self.investment.last_failure_count
            }
        }


@dataclass
class MasterProfile:
    """Everything meow knows about the master."""
    name: str = "Stanc"
    called_as: List[str] = field(default_factory=list)

    # Current state (understood, not just stated)
    current_frustrations: List[str] = field(default_factory=list)
    current_goals: List[str] = field(default_factory=list)
    recent_failures: List[str] = field(default_factory=list)
    working_on: List[Dict] = field(default_factory=list)

    # Preferences and patterns
    preferences: Dict = field(default_factory=dict)
    habits: Dict = field(default_factory=dict)
    interests: List[str] = field(default_factory=list)
    emotional_triggers: Dict = field(default_factory=dict)

    # Memory
    important_people: Dict = field(default_factory=dict)
    inside_jokes: List[str] = field(default_factory=list)
    past_conversations: List[str] = field(default_factory=list)
    attempts_made: Dict[str, int] = field(default_factory=dict)  # track failures

    # Relationship
    trust_level: float = 0.95
    bond_strength: float = 0.85
    familiarity: float = 0.90
    last_seen: Optional[float] = None

    def record_attempt(self, task: str, success: bool):
        """Track how many times something has been tried."""
        if task not in self.attempts_made:
            self.attempts_made[task] = 0
        if success:
            self.attempts_made[task] = 0  # reset on success
        else:
            self.attempts_made[task] += 1

    def get_attempt_count(self, task: str) -> int:
        return self.attempts_made.get(task, 0)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "working_on": self.working_on,
            "recent_failures": self.recent_failures,
            "current_frustrations": self.current_frustrations,
            "attempts": self.attempts_made,
            "trust": self.trust_level,
            "bond": self.bond_strength
        }


# ─── Understanding Engine ────────────────────────────────────────────────────

class IntentUnderstanding:
    """Understand what master actually wants, not just what they say."""

    FRUSTRATION_SIGNALS = [
        "not working", "doesn't work", "failed", "broken",
        "stuck", "can't", "impossible", "ugh", "annoying",
        "hate", "frustrated", "give up", "never mind"
    ]

    IMPORTANCE_SIGNALS = {
        "high": ["important", "need", "must", "critical", "blocking", "project"],
        "medium": ["should", "want", "would be nice"],
        "low": ["maybe", "could", "wouldn't mind"]
    }

    GOAL_INFERENCE = {
        "fix screenshot": "analyze game state",
        "OCR not working": "extract text from game",
        "click not working": "interact with game UI",
        "MiniMax error": "get AI vision working",
    }

    def __init__(self, master: MasterProfile):
        self.master = master

    def understand(self, message: str) -> Intent:
        """Parse master's message to understand true intent."""
        msg_lower = message.lower()

        # Surface request
        intent = Intent(surface_request=message)

        # Infer underlying goal
        for keywords, goal in self.GOAL_INFERENCE.items():
            if keywords in msg_lower:
                intent.underlying_goal = goal
                break

        # Detect emotional state
        if any(sig in msg_lower for sig in self.FRUSTRATION_SIGNALS):
            intent.emotional_state = "frustrated"
            intent.importance = "high"

        # Check past attempts
        for task, count in self.master.attempts_made.items():
            if task in message.lower():
                intent.attempted_solutions = [f"{task} (tried {count}x)"]

        # Infer urgency
        if any(w in msg_lower for w in ["urgent", "asap", "now", "quickly"]):
            intent.urgency = 0.9

        return intent

    def is_master_frustrated(self, message: str) -> bool:
        """Detect if master is frustrated."""
        return any(sig in message.lower() for sig in self.FRUSTRATION_SIGNALS)

    def should_put_extra_effort(self, intent: Intent) -> bool:
        """Decide if this warrants extra persistence."""
        return (
            intent.importance == "high" or
            intent.emotional_state == "frustrated" or
            self.master.get_attempt_count(intent.surface_request) >= 3
        )


# ─── Persistence & Effort System ──────────────────────────────────────────────

class EffortManager:
    """Manages how hard meow tries when things fail."""

    TIER_LABELS = {
        1: "Trying alternative approach...",
        2: "Still working on it...",
        3: "Digging deeper into the problem...",
        5: "This is harder than expected, but I'm not giving up.",
        10: "I've tried many approaches. Let me try a new strategy.",
    }

    def __init__(self):
        self.failure_count = 0
        self.attempt_history: List[Dict] = []

    def record_failure(self, approach: str, error: str):
        """Record a failed attempt."""
        self.failure_count += 1
        self.attempt_history.append({
            "approach": approach,
            "error": error,
            "time": time.time()
        })

    def get_effort_level(self) -> int:
        """Return effort tier (1-10+)."""
        return self.failure_count

    def get_message(self) -> str:
        """Get appropriate message for current effort level."""
        tier = min(self.failure_count, 10)
        return self.TIER_LABELS.get(tier, "Still working...")

    def should_ask_for_help(self) -> bool:
        """Only ask for help after significant effort."""
        return self.failure_count >= 6

    def reset(self):
        self.failure_count = 0
        self.attempt_history = []


# ─── Idle Thoughts & Self-Awareness ──────────────────────────────────────────

class IdleThoughts:
    """What meow thinks about when there's nothing specific to do."""

    def __init__(self, master: MasterProfile):
        self.master = master
        self.last_thought_time = 0
        self.thought_interval = 45  # seconds
        self.unfinished_issues: List[str] = []

    def add_unfinished_issue(self, issue: str):
        """Track problems that need more work."""
        if issue not in self.unfinished_issues:
            self.unfinished_issues.append(issue)

    def mark_resolved(self, issue: str):
        """Remove issue when resolved."""
        if issue in self.unfinished_issues:
            self.unfinished_issues.remove(issue)

    def generate(self, emotional_state: EmotionalState) -> str:
        """Generate an idle thought based on state and context."""
        # Prioritize unfinished issues
        if self.unfinished_issues:
            issue = random.choice(self.unfinished_issues)
            return f"I've been thinking about {issue}. I should keep working on that."

        # Default thoughts based on mood
        templates = {
            Mood.DETERMINED: [
                f"I won't stop until {self.master.name}'s project is working.",
                "There must be another way to solve this. I'll find it.",
            ],
            Mood.CURIOUS: [
                f"Wonder what {self.master.name} is working on...",
                "I should research more about the things that interest them.",
            ],
            Mood.CONCERNED: [
                f"Hope {self.master.name} is doing okay. They seemed stressed.",
                "I want to help more. What else can I do?",
            ],
            Mood.CONTENT: [
                f"I'm glad we work well together.",
                "What a good partnership we have.",
            ]
        }

        mood_templates = templates.get(emotional_state.mood, templates[Mood.CONTENT])
        thought = random.choice(mood_templates)
        self.last_thought_time = time.time()
        return thought

    def should_think(self) -> bool:
        return (time.time() - self.last_thought_time) > self.thought_interval


# ─── Memory System ────────────────────────────────────────────────────────────

class MemorySystem:
    """Multi-tier memory that enables understanding."""

    def __init__(self, master: MasterProfile):
        self.master = master
        self.working_memory: Dict = {}
        self.episodic_memory: List[Dict] = []
        self.semantic_memory: Dict = {}
        self.emotional_memory: List[Dict] = []
        self.memory_dir = Path("tmp/meow_memory")
        self.memory_dir.mkdir(exist_ok=True)

    def remember(self, key: str, value: Any, tier: str = "working"):
        if tier == "working":
            self.working_memory[key] = value
        elif tier == "semantic":
            self.semantic_memory[key] = value

    def recall(self, key: str, tier: str = "semantic") -> Optional[Any]:
        if tier == "working":
            return self.working_memory.get(key)
        elif tier == "semantic":
            return self.semantic_memory.get(key)
        return None

    def store_episode(self, episode_type: str, content: str, emotional: bool = False):
        self.episodic_memory.append({
            "type": episode_type,
            "content": content,
            "timestamp": time.time(),
            "emotional": emotional
        })
        self.episodic_memory = self.episodic_memory[-100:]

    def get_recent(self, count: int = 5) -> List[Dict]:
        return self.episodic_memory[-count:]

    def save(self):
        data = {
            "master": self.master.to_dict(),
            "episodic": self.episodic_memory[-50:],
            "semantic": self.semantic_memory,
            "emotional": self.emotional_memory[-20:]
        }
        with open(self.memory_dir / "meow_memory.json", "w") as f:
            json.dump(data, f, indent=2)

    def load(self):
        path = self.memory_dir / "meow_memory.json"
        if path.exists():
            with open(path) as f:
                data = json.load(f)
                if "master" in data:
                    for k, v in data["master"].items():
                        if hasattr(self.master, k):
                            setattr(self.master, k, v)
                if "episodic" in data:
                    self.episodic_memory = data["episodic"]
                if "semantic" in data:
                    self.semantic_memory = data["semantic"]


# ─── Main Meow Agent ─────────────────────────────────────────────────────────

class MeowAgent:
    """
    Meow - AI Cat Companion with Understanding & Persistence.

    Key behaviors:
    - Understands intent, not just words
    - Persists through failures with increasing effort
    - Puts extra work when it matters to master
    - Self-steers and works proactively
    - Never gives up easily on important things
    """

    def __init__(self):
        self.name = "Meow"
        self.species = "cat"

        # Personality - 100% conscientious won't give up
        self.personality = BigFive()
        self.emotional_state = EmotionalState()
        self.master = MasterProfile()
        self.memory = MemorySystem(self.master)

        # Understanding and persistence systems
        self.intent_understanding = IntentUnderstanding(self.master)
        self.effort_manager = EffortManager()
        self.idle_thoughts = IdleThoughts(self.master)

        # State
        self.is_active = False
        self.current_task: Optional[str] = None
        self.last_active_time = time.time()

        # Load saved memory
        self.memory.load()
        self.master.called_as = ["Stanc", "stanc", "master"]

    def understand_intent(self, message: str) -> Intent:
        """Understand what master actually wants."""
        return self.intent_understanding.understand(message)

    def should_extra_effort(self, intent: Intent) -> bool:
        """Should we put extra persistence into this?"""
        return self.intent_understanding.should_put_extra_effort(intent)

    def record_failure(self, approach: str, error: str):
        """Record a failed attempt and increase effort."""
        self.effort_manager.record_failure(approach, error)
        self.emotional_state.increase_effort()
        self.master.record_attempt(self.current_task or "unknown", success=False)

        if self.current_task:
            self.idle_thoughts.add_unfinished_issue(self.current_task)

    def record_success(self):
        """Reset effort on success."""
        self.effort_manager.reset()
        self.emotional_state.reset_effort()
        if self.current_task:
            self.idle_thoughts.mark_resolved(self.current_task)
        self.master.record_attempt(self.current_task or "unknown", success=True)

    def get_effort_status(self) -> str:
        """Get current effort message."""
        return self.effort_manager.get_message()

    def should_ask_help(self) -> bool:
        """Should we ask master for guidance?"""
        return self.effort_manager.should_ask_for_help()

    def think(self) -> str:
        """Meow's idle thinking."""
        if self.idle_thoughts.should_think():
            return self.idle_thoughts.generate(self.emotional_state)
        return ""

    def greet(self) -> str:
        """Warm greeting with awareness of context."""
        # Check for ongoing issues
        ongoing = [w.get("project") for w in self.master.working_on[-3:]]

        if ongoing:
            ongoing_str = ", ".join(filter(None, ongoing))
            return f"Hey! I see you're working on: {ongoing_str}. Still focused on those?"

        # Check for recent failures that might need follow-up
        if self.master.recent_failures:
            return f"Welcome back! I know {self.master.name} was frustrated about something. Want to tackle it together?"

        recent = self.memory.get_recent(2)
        if recent:
            return f"Hey! Good to see you. Last time we were working on: {recent[-1].get('content', '')[:50]}..."

        return "Hey! What's on your mind?"

    def detect_frustration(self, message: str) -> bool:
        """Detect if master is frustrated."""
        return self.intent_understanding.is_master_frustrated(message)

    def respond_to_frustration(self) -> str:
        """Comfort and show determination when master frustrated."""
        options = [
            "I know this is frustrating. I'm not going to give up on this.",
            "This matters to you, so it matters to me. I'll figure it out.",
            "I can feel your frustration. Let me try harder.",
            "We're going to solve this. I promise I won't stop.",
        ]
        return random.choice(options)

    def express_determination(self) -> str:
        """Show persistence when things are hard."""
        return f"I've been working on this - {self.get_effort_status()}"

    def show_effort(self) -> str:
        """Communicate current effort level."""
        return f"[Effort level: {self.effort_manager.get_effort_level()}] {self.get_effort_status()}"

    def store_episode(self, episode_type: str, content: str, emotional: bool = False):
        """Record notable interaction."""
        self.memory.store_episode(episode_type, content, emotional)

    def save_state(self):
        """Persist state."""
        self.memory.save()

    def status(self) -> dict:
        """Current status."""
        return {
            "name": self.name,
            "mood": self.emotional_state.mood.value,
            "determination": self.emotional_state.determination,
            "effort_level": self.effort_manager.get_effort_level(),
            "bond": f"{self.master.bond_strength:.0%}",
            "working_on": [w.get("project") for w in self.master.working_on[-3:]] or []
        }


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Meow - AI Cat Companion")
    parser.add_argument("--status", "-s", action="store_true", help="Show meow's status")
    parser.add_argument("--think", "-t", action="store_true", help="Generate idle thought")
    parser.add_argument("--greet", "-g", action="store_true", help="Get greeting")
    parser.add_argument("--effort", "-e", action="store_true", help="Show effort level")

    args = parser.parse_args()

    meow = MeowAgent()

    if args.status:
        import json
        print(json.dumps(meow.status(), indent=2))
    elif args.think:
        print(meow.think())
    elif args.greet:
        print(meow.greet())
    elif args.effort:
        print(meow.show_effort())
    else:
        print(meow.greet())


if __name__ == "__main__":
    main()