"""Prompts Package for ORCA LangGraph Nodes.

Owned by Dev 3 (Agent Orchestration).
Contains prompt templates and loader utilities for:
- Intent and entity extraction
- Task planning / supervisor
- Clarification generator
- Multilingual response composition (English, Hindi, Marathi, Tamil)
- Prompt injection defense & XML sandboxing
"""

from functools import lru_cache
from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent


@lru_cache(maxsize=16)
def load_prompt(template_name: str) -> str:
    """Loads a prompt template from disk by filename (e.g. 'intent.md')."""
    target = PROMPTS_DIR / template_name
    if not target.exists():
        target = PROMPTS_DIR / f"{template_name}.md"
    if not target.exists():
        raise FileNotFoundError(f"Prompt template '{template_name}' not found in {PROMPTS_DIR}")
    return target.read_text(encoding="utf-8")
