"""Canonical Tool Result Contracts for ORCA.

Owned by Dev 2 (Backend Platform), implemented by Dev 4 (Domain/Tools), consumed by Dev 3 (Agents).
All deterministic domain functions in backend/app/tools/ MUST return ToolResult.
"""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.contracts.chat import EvidenceItem


class ToolStatus(str, Enum):
    OK = "ok"
    PARTIAL = "partial"
    FAILED = "failed"


class ToolResult(BaseModel):
    status: ToolStatus = Field(
        ..., description="Execution outcome status: ok | partial | failed"
    )
    data: Dict[str, Any] = Field(
        default_factory=dict, description="Structured output payload from the tool"
    )
    evidence: List[EvidenceItem] = Field(
        default_factory=list,
        description="Factual evidence items produced or consumed by this tool",
    )
    warnings: List[str] = Field(
        default_factory=list, description="Degradation warnings, stale notices, or clip alerts"
    )
    error_code: Optional[str] = Field(
        None, description="Standard error identifier if status is failed"
    )
