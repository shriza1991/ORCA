"""Sanitized Agent Execution Trace Contracts & Logger for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

CRITICAL SECURITY & TRANSPARENCY REQUIREMENT:
===============================================================================
The agent execution trace is public-facing and rendered in the user UI.
It MUST NEVER contain:
- Private internal reasoning / chain-of-thought tokens (e.g. '<think>', 'Thought:')
- Raw system prompt instructions or internal secrets
- Unsanitized exception stack traces or raw database queries

It should ONLY expose high-level milestones such as:
- 'Intent detected'
- 'Weather forecast tool invoked'
- 'Deterministic risk evaluation completed'
- 'Evidence citations validated'
- 'Multilingual response generated'
===============================================================================
"""

from datetime import datetime, timezone
from enum import Enum
import re
from typing import List, Optional
from pydantic import BaseModel, Field

from backend.app.contracts.chat import AgentTraceItem


class TraceStatus(str, Enum):
    """Execution status for an individual trace event."""

    STARTED = "started"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class TraceEvent(BaseModel):
    """High-level sanitized trace event representing a milestone in pipeline execution."""

    step: int = Field(..., description="Sequential 1-indexed step number")
    agent: str = Field(..., description="Node or specialist agent identifier (e.g. 'Supervisor')")
    action: str = Field(..., description="Sanitized, user-comprehensible description of action")
    status: TraceStatus = Field(TraceStatus.COMPLETED, description="Status of the step")
    duration_ms: Optional[float] = Field(0.0, description="Execution duration in milliseconds")
    evidence_ids: List[str] = Field(
        default_factory=list, description="IDs of evidence items produced or consumed"
    )
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat(),
        description="ISO-8601 UTC timestamp",
    )

    def to_contract_item(self) -> AgentTraceItem:
        """Converts to the shared AgentTraceItem model for frontend delivery."""
        return AgentTraceItem(
            step=self.step,
            node=self.agent,
            agent=self.agent,
            action=self.action,
            status=self.status.value,
            duration_ms=self.duration_ms if self.duration_ms is not None else 0.0,
            evidence_ids=self.evidence_ids,
            timestamp=self.timestamp,
        )


# Disallowed patterns that indicate chain-of-thought or prompt leakage
_DISALLOWED_PATTERNS = [
    re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE),
    re.compile(r"thought:", re.IGNORECASE),
    re.compile(r"internal reasoning", re.IGNORECASE),
    re.compile(r"api_key|password|secret|bearer", re.IGNORECASE),
]


class AgentTraceLogger:
    """Collects and sanitizes trace events during a single graph execution run."""

    def __init__(self) -> None:
        self._events: List[TraceEvent] = []
        self._current_step: int = 1

    def record_event(
        self,
        agent: str,
        action: str,
        status: TraceStatus = TraceStatus.COMPLETED,
        duration_ms: Optional[float] = None,
        evidence_ids: Optional[List[str]] = None,
    ) -> TraceEvent:
        """Records a sanitized trace event.

        Raises:
            ValueError: If the action string contains disallowed chain-of-thought markers.
        """
        sanitized_action = self._sanitize_text(action)
        dur = duration_ms if duration_ms is not None else 0.0

        event = TraceEvent(
            step=self._current_step,
            agent=agent,
            action=sanitized_action,
            status=status,
            duration_ms=dur,
            evidence_ids=evidence_ids or [],
        )
        self._events.append(event)
        self._current_step += 1
        return event

    @staticmethod
    def _sanitize_text(text: str) -> str:
        """Strips out forbidden chain-of-thought or sensitive patterns."""
        cleaned = text.strip()
        for pattern in _DISALLOWED_PATTERNS:
            if pattern.search(cleaned):
                # Mask out any detected leak
                cleaned = pattern.sub("[REDACTED_INTERNAL]", cleaned)
        return cleaned

    def get_events(self) -> List[TraceEvent]:
        """Returns all recorded high-level trace events."""
        return list(self._events)

    def to_contract_trace(self) -> List[AgentTraceItem]:
        """Exports the entire trace to the frontend contract format."""
        return [ev.to_contract_item() for ev in self._events]
