import time
from typing import Any


class AnalysisLog:
    """Collects structured events during analysis for debugging and transparency."""

    def __init__(self):
        self.events = []
        self._start = time.time()

    def add(self, category: str, message: str, details: dict | None = None):
        """Add a timestamped event."""
        self.events.append({
            "time": round(time.time() - self._start, 3),
            "category": category,
            "message": message,
            "details": details or {},
        })

    def to_list(self) -> list:
        return self.events

    def summary(self) -> dict:
        categories = {}
        for e in self.events:
            cat = e["category"]
            categories[cat] = categories.get(cat, 0) + 1
        return {
            "total_events": len(self.events),
            "duration_sec": round(time.time() - self._start, 3),
            "by_category": categories,
        }
