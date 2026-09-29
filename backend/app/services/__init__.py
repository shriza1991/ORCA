"""Services Package for ORCA.

Owned by Dev 2 (Backend Platform) — integration coordination layer.

Import policy
-------------
Sub-modules are NOT imported here at package level to avoid pulling the
heavy agents/graph/langgraph dependency chain at application startup.
Consumers that need DataService or AgentRunService should import directly
from the respective modules:

    from backend.app.services.data_service import data_service
    from backend.app.services.agent_run_service import agent_run_service
"""

__all__ = ["DataService", "data_service", "AgentRunService", "agent_run_service"]
