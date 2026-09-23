"""Base Importer Module.

Defines the standard interface for importing genuine official data files
(PFZ, Hazard Bulletins, Satellite Products) when automated access is unconfigured.
"""
from abc import ABC, abstractmethod
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime, UTC


class InvalidRecordError(Exception):
    """Raised when a record is quarantined due to validation failure."""
    pass


class BaseImporter(ABC):
    """Base class for verifiable file ingestion."""

    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        if not self.file_path.exists():
            raise FileNotFoundError(f"Import file not found: {self.file_path}")
            
    def _generate_checksum(self) -> str:
        """Generate SHA-256 checksum of the source file."""
        sha256_hash = hashlib.sha256()
        with open(self.file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    @abstractmethod
    def process(self) -> Dict[str, Any]:
        """Process the file and return the normalized payload.
        
        Must preserve metadata, handle invalid records (quarantine), 
        and extract dataset metadata.
        """
        pass
