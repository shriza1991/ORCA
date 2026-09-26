"""Structured Logging Configuration.

Owned by Dev 2 (Backend Platform).
"""

import json
import logging
import re
from datetime import datetime
from typing import Any

# Redact secrets (keys, tokens) and exact coordinates (round to 2 decimals)
SECRET_REGEX = re.compile(r'(?i)(api_key|token|password|secret)[\s=:]+[\'"]?([a-zA-Z0-9_\-]+)[\'"]?')
COORD_REGEX = re.compile(r'(\-?\d+\.\d{3,})')

class RedactingJsonFormatter(logging.Formatter):
    """Formats logs as JSON and redacts sensitive data."""

    def format(self, record: logging.LogRecord) -> str:
        log_data: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        }

        # Inject request_id if present on the thread/context (would require contextvars,
        # but for now we keep it simple or assume it's passed in extra)
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        for key in ("route", "method", "status_code", "error_type", "safe_message", "duration_ms", "data_mode"):
            if hasattr(record, key):
                log_data[key] = getattr(record, key)

        # Format message to string
        msg = log_data["message"]
        
        # Redact secrets
        msg = SECRET_REGEX.sub(r'\1=***REDACTED***', msg)
        
        # Redact precise coordinates
        def round_coords(match):
            val = float(match.group(1))
            return f"{val:.2f}"
            
        msg = COORD_REGEX.sub(round_coords, msg)
        log_data["message"] = msg

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)

def setup_logging(level: str = "INFO") -> None:
    """Initialize structured logging globally."""
    logger = logging.getLogger()
    
    # Remove existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        
    handler = logging.StreamHandler()
    handler.setFormatter(RedactingJsonFormatter())
    
    logger.addHandler(handler)
    logger.setLevel(level.upper())

    # Suppress loud loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy").setLevel(logging.WARNING)
