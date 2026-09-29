"""Reliability, Timeout Enforcement, Bounded Retries & Fallback Snapshots for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA (Milestone M14).

CRITICAL ARCHITECTURAL & SAFETY RULES:
===============================================================================
1. BOUNDED RETRIES:
   Transient failures (TIMEOUT, UPSTREAM_FAILURE, 5xx, connection drop) are retried
   up to an explicit bound (max_retries, default 2). Never retry indefinitely.
   Deterministic validation errors (INVALID_INPUT, MISSING_CONTEXT) are NEVER retried.

2. SNAPSHOT FALLBACKS:
   When an external dependency fails, cached recent snapshots may be used if their
   age <= max_snapshot_age_hours (default 24h).
   Fallback data is explicitly tagged with:
     - quality_flags: ["FALLBACK_SNAPSHOT", "DEGRADED_FRESHNESS"]
     - warnings: ["Using fallback snapshot data (captured <time>, degraded freshness)"]
   Too-stale snapshots (> 24h) MUST BE REJECTED.

3. SAFETY INVARIANCE:
   Tool failure must NEVER cause the agent to hallucinate facts or produce an unsupported GO.
   If critical observations (marine/weather/risk) remain unavailable after retry/fallback,
   the system strictly yields UNKNOWN with low confidence and departure hold directives.
===============================================================================
"""

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime, timezone
import time
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.agents.integrations.contracts import (
    FallbackSnapshot,
    ReliabilityPolicy,
    ToolErrorCode,
)
from backend.app.contracts.chat import EvidenceItem
from backend.app.contracts.tools import ToolResult, ToolStatus
from backend.app.connectors.errors import ConnectorError


class ExecutionTelemetry(BaseModel):
    """Detailed telemetry metadata captured during reliable tool dispatch."""

    tool_name: str
    total_attempts: int = 1
    retries_attempted: int = 0
    timed_out: bool = False
    fallback_used: bool = False
    fallback_snapshot_id: Optional[str] = None
    transient_errors: List[str] = Field(default_factory=list)
    final_status: ToolStatus = ToolStatus.OK
    duration_ms: float = 0.0


class SnapshotStore:
    """In-memory repository for storing and retrieving cached domain observation snapshots."""

    def __init__(self) -> None:
        # Key: (tool_name, harbor_normalized) -> FallbackSnapshot
        self._store: Dict[str, FallbackSnapshot] = {}

    @staticmethod
    def _make_key(tool_name: str, harbor: Optional[str]) -> str:
        h = (harbor or "ratnagiri").strip().lower()
        return f"{tool_name.strip().lower()}::{h}"

    def save_snapshot(self, snapshot: FallbackSnapshot) -> None:
        """Saves or updates a fallback snapshot."""
        key = self._make_key(snapshot.tool_name, snapshot.harbor)
        self._store[key] = snapshot

    def get_snapshot(
        self,
        tool_name: str,
        harbor: Optional[str],
        max_age_hours: float = 24.0,
    ) -> Optional[FallbackSnapshot]:
        """Retrieves a snapshot if present and within acceptable freshness limits.

        Returns None if no snapshot exists or if the snapshot is older than max_age_hours.
        """
        key = self._make_key(tool_name, harbor)
        snapshot = self._store.get(key)
        if not snapshot:
            # Fall back to default harbor if specific harbor is not found
            default_key = self._make_key(tool_name, "Ratnagiri")
            snapshot = self._store.get(default_key)
            if not snapshot:
                return None

        if self.is_snapshot_stale(snapshot, max_age_hours=max_age_hours):
            return None

        return snapshot

    @staticmethod
    def is_snapshot_stale(
        snapshot: FallbackSnapshot,
        max_age_hours: float = 24.0,
    ) -> bool:
        """Determines if a snapshot exceeds the permitted freshness threshold."""
        try:
            captured_dt = datetime.fromisoformat(snapshot.captured_at)
            if captured_dt.tzinfo is None:
                captured_dt = captured_dt.replace(tzinfo=timezone.utc)
            now_dt = datetime.now(timezone.utc)
            age_seconds = (now_dt - captured_dt).total_seconds()
            age_hours = age_seconds / 3600.0
            return age_hours > max_age_hours
        except Exception:
            return True

    def clear(self) -> None:
        """Clears all stored snapshots (useful for test fixtures)."""
        self._store.clear()


# Global snapshot repository
global_snapshot_store = SnapshotStore()


def _is_transient_error(result: ToolResult) -> bool:
    """Classifies whether a failed ToolResult represents a retryable transient failure."""
    if result.status != ToolStatus.FAILED:
        return False

    code = (result.error_code or "").upper()
    transient_codes = {
        ToolErrorCode.UPSTREAM_FAILURE.value,
        ToolErrorCode.TIMEOUT.value,
        "SERVICE_UNAVAILABLE",
        "GATEWAY_TIMEOUT",
        "503",
        "504",
        "502",
        "500",
        "CONNECTIONERROR",
        "TIMEOUTERROR",
        "HTTPERROR",
    }
    if code in transient_codes:
        return True

    for w in result.warnings:
        w_lower = w.lower()
        if any(term in w_lower for term in ["timeout", "unavailable", "connection", "503", "504", "temporary", "transient"]):
            return True

    return False


def execute_with_reliability(
    handler: Callable[..., ToolResult],
    params: Dict[str, Any],
    tool_name: str,
    policy: Optional[ReliabilityPolicy] = None,
    snapshot_store: Optional[SnapshotStore] = None,
    on_retry: Optional[Callable[[int, ToolResult], None]] = None,
) -> tuple[ToolResult, ExecutionTelemetry]:
    """Executes a tool handler with timeout protection, bounded retries, and snapshot fallbacks.

    Returns:
        tuple of (ToolResult, ExecutionTelemetry)
    """
    pol = policy or ReliabilityPolicy()
    store = snapshot_store or global_snapshot_store
    telemetry = ExecutionTelemetry(tool_name=tool_name)

    start_all = time.perf_counter()
    attempts = 0
    last_result: Optional[ToolResult] = None

    max_attempts = 1 + max(0, pol.max_retries)

    for attempt_idx in range(1, max_attempts + 1):
        attempts += 1
        telemetry.total_attempts = attempts

        try:
            # Enforce bounded execution timeout
            if pol.timeout_seconds > 0:
                with ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(handler, **params)
                    try:
                        res = future.result(timeout=pol.timeout_seconds)
                    except FuturesTimeoutError:
                        telemetry.timed_out = True
                        res = ToolResult(
                            status=ToolStatus.FAILED,
                            data={},
                            evidence=[],
                            warnings=[f"Execution of tool '{tool_name}' timed out after {pol.timeout_seconds}s."],
                            error_code=ToolErrorCode.TIMEOUT.value,
                        )
            else:
                res = handler(**params)

        except ConnectorError:
            raise
        except Exception as exc:
            err_name = type(exc).__name__
            res = ToolResult(
                status=ToolStatus.FAILED,
                data={},
                evidence=[],
                warnings=[f"Exception during tool '{tool_name}': {str(exc)}"],
                error_code=err_name,
            )

        last_result = res

        # If execution succeeded or is partial, we are done
        if res.status in (ToolStatus.OK, ToolStatus.PARTIAL):
            telemetry.final_status = res.status
            telemetry.duration_ms = round((time.perf_counter() - start_all) * 1000, 2)
            return res, telemetry

        # Execution failed: inspect if retryable
        if _is_transient_error(res) and attempt_idx < max_attempts:
            telemetry.retries_attempted += 1
            telemetry.transient_errors.append(res.error_code or "TRANSIENT_ERROR")
            if on_retry:
                try:
                    on_retry(attempt_idx, res)
                except Exception:
                    pass
            if pol.retry_delay_seconds > 0:
                time.sleep(pol.retry_delay_seconds)
            continue
        else:
            # Not retryable or exhausted all retry attempts
            break

    # If we reached here, primary attempts failed. Check for snapshot fallback.
    if pol.enable_fallback and last_result and last_result.status == ToolStatus.FAILED:
        harbor = params.get("origin_harbor") or params.get("harbor") or "Ratnagiri"
        snapshot = store.get_snapshot(tool_name, harbor, max_age_hours=pol.max_snapshot_age_hours)

        if snapshot:
            telemetry.fallback_used = True
            telemetry.fallback_snapshot_id = snapshot.snapshot_id
            telemetry.final_status = ToolStatus.PARTIAL

            fallback_evidence: List[EvidenceItem] = []
            for ev in snapshot.evidence:
                if isinstance(ev, EvidenceItem):
                    ev_dict = ev.model_dump()
                elif isinstance(ev, dict):
                    ev_dict = dict(ev)
                else:
                    continue

                q_flags = list(ev_dict.get("quality_flags") or [])
                if "FALLBACK_SNAPSHOT" not in q_flags:
                    q_flags.append("FALLBACK_SNAPSHOT")
                if "DEGRADED_FRESHNESS" not in q_flags:
                    q_flags.append("DEGRADED_FRESHNESS")
                ev_dict["quality_flags"] = q_flags

                try:
                    fallback_evidence.append(EvidenceItem(**ev_dict))
                except Exception:
                    pass

            fallback_warnings = list(last_result.warnings)
            fallback_warnings.append(
                f"Using fallback snapshot '{snapshot.snapshot_id}' (captured {snapshot.captured_at}, degraded freshness)."
            )

            fallback_result = ToolResult(
                status=ToolStatus.PARTIAL,
                data=dict(snapshot.data),
                evidence=fallback_evidence,
                warnings=fallback_warnings,
                error_code=None,
            )
            telemetry.duration_ms = round((time.perf_counter() - start_all) * 1000, 2)
            return fallback_result, telemetry

    # No fallback available or fallback rejected: return the final failed result
    telemetry.final_status = last_result.status if last_result else ToolStatus.FAILED
    telemetry.duration_ms = round((time.perf_counter() - start_all) * 1000, 2)
    return last_result or ToolResult(status=ToolStatus.FAILED, data={}, evidence=[], warnings=["Execution failed."]), telemetry
