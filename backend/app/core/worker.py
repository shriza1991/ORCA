"""Background workers."""

import asyncio
import logging
from backend.app.services.alert_service import AlertService

logger = logging.getLogger(__name__)

# Basic lock flag for same-process concurrency. 
# For multi-process, we'd use a DB lock (e.g. pg_advisory_lock),
# but this is sufficient for the bounds of the current requirement without introducing external dependencies.
_IS_RUNNING = False

async def alert_monitor_loop(interval_seconds: int = 60):
    """Background task that runs the reassessment logic."""
    global _IS_RUNNING
    logger.info(f"Starting alert monitor loop (interval={interval_seconds}s)")
    while True:
        if not _IS_RUNNING:
            _IS_RUNNING = True
            try:
                # Wrap synchronous DB ops in asyncio.to_thread to avoid blocking event loop
                await asyncio.to_thread(AlertService.reassess_saved_trips)
            except Exception as e:
                logger.error(f"Error in alert monitor loop: {e}")
            finally:
                _IS_RUNNING = False
        else:
            logger.warning("Alert monitor loop skipped because previous run hasn't finished.")
        
        await asyncio.sleep(interval_seconds)
