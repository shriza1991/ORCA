"""Bounded field context, separate from official safety authority."""
from datetime import datetime, timezone
from backend.app.db.session import SessionLocal


def capture_field_signals(harbor, mode):
    from backend.app.api.v1.community import get_observations, get_demo_observations
    demo = mode.upper() in {"DEMO", "SNAPSHOT", "SYNTHETIC"}
    try:
        with SessionLocal() as db:
            return [s.model_dump(mode="json") for s in get_observations(harbor=harbor,observation_type=None,
                limit=10,hours=24,db=db,include_demo=demo).observations]
    except Exception:
        if demo:
            return [s.model_dump(mode="json") for s in get_demo_observations().observations if s.harbor_reference==harbor][:10]
        # Empty context is never positive evidence of safety.
        return []


def applicable_field_signals(signals, departure):
    when = datetime.fromisoformat(departure.replace("Z", "+00:00")) if departure else datetime.now(timezone.utc)
    if when.tzinfo is None: when=when.replace(tzinfo=timezone.utc)
    result=[]
    for signal in signals:
        try:
            start=datetime.fromisoformat(signal["observed_at"].replace("Z","+00:00"))
            end=datetime.fromisoformat(signal["valid_until"].replace("Z","+00:00"))
            if start <= when <= end: result.append(signal)
        except (KeyError,TypeError,ValueError): continue
    return result
