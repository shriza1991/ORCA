import importlib.util
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# Ensure project root and backend path are on sys.path
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

if importlib.util.find_spec("langgraph") is None:
    sys.modules["langgraph"] = MagicMock()
    sys.modules["langgraph.graph"] = MagicMock()

from backend.app.agents.memory import InMemoryConversationStore, memory_manager  # noqa: E402
from backend.app.main import app  # noqa: E402

# Force in-memory store for all agent evaluations so they don't require Postgres
memory_manager.set_store(InMemoryConversationStore())

from backend.app.core.config import settings  # noqa: E402
# Guarantee hermetic offline test execution by default
settings.GROQ_API_KEY = ""
settings.LLM_API_KEY = ""

from backend.app.agents.integrations.mocks import register_m2_contract_mocks  # noqa: E402
from backend.app.agents.tools import tool_registry  # noqa: E402

# Initialize tool registry with contract mocks for offline testing
register_m2_contract_mocks(tool_registry, override=True)


@pytest.fixture(autouse=True)
def reset_test_state():
    """Reset in-memory state and tool mocks between tests to prevent inter-test contamination."""
    if hasattr(memory_manager.store, "clear"):
        memory_manager.store.clear()
    register_m2_contract_mocks(tool_registry, override=True)
    yield
    if hasattr(memory_manager.store, "clear"):
        memory_manager.store.clear()
    register_m2_contract_mocks(tool_registry, override=True)


@pytest.fixture
def client():
    """Returns FastAPI synchronous TestClient."""
    with TestClient(app) as test_client:
        yield test_client

