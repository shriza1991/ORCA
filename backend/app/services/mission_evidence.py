"""Bounded process-local evidence and assessment replay store.

Stores copies of normalized provider inputs, never client-supplied verdicts.
Lost/evicted IDs fail explicitly; they never silently fetch a replacement.
"""
from collections import OrderedDict
from copy import deepcopy
from hashlib import sha256
import json
from threading import RLock

from backend.app.agents.integrations.dev2 import MarineConditionsPayload, WeatherConditionsPayload

EVALUATOR_VERSION = "mission-evaluation-v1"
_lock = RLock()
_bundles = OrderedDict()
_assessments = OrderedDict()
LIMIT = 256


class EvidenceUnavailable(ValueError):
    pass


def retain_bundle(context, mode, bundle, pfz):
    record = {"origin": context.origin_harbor, "coordinates": context.coordinates,
              "mode": mode.upper(), "bundle": bundle.model_dump(mode="json"),
              "pfz": pfz.model_dump(mode="json") if pfz else None}
    content = deepcopy(record)
    content["bundle"].pop("captured_at", None)
    evidence_id = "ev-" + sha256(json.dumps(content, sort_keys=True, default=str).encode()).hexdigest()[:24]
    with _lock:
        _bundles.setdefault(evidence_id, deepcopy(record))
        while len(_bundles) > LIMIT:
            _bundles.popitem(last=False)
    return evidence_id


def retain_assessment(response):
    with _lock:
        _assessments[response.assessment_id] = response.model_copy(deep=True)
        while len(_assessments) > LIMIT:
            _assessments.popitem(last=False)


def get_bundle(evidence_id):
    if not evidence_id:
        return None
    with _lock:
        record = _bundles.get(evidence_id)
        return deepcopy(record) if record is not None else None


def get_assessment(assessment_id):
    with _lock:
        response = _assessments.get(assessment_id)
        if response is None:
            raise EvidenceUnavailable("Assessment no longer retained. Reassess explicitly before comparing.")
        return response.model_copy(deep=True)


class FrozenDataService:
    def __init__(self, evidence_id, context, mode):
        from backend.app.contracts.observation import ObservationBundle
        with _lock:
            record = deepcopy(_bundles.get(evidence_id))
        if record is None:
            raise EvidenceUnavailable("Evidence bundle no longer retained. Refresh explicitly.")
        if record["mode"] != mode.upper():
            raise EvidenceUnavailable("Evidence mode differs from the mission mode.")
        if record["origin"] != context.origin_harbor or record["coordinates"] != context.coordinates:
            raise EvidenceUnavailable("Evidence bundle belongs to a different origin.")
        self.bundle = ObservationBundle(**record["bundle"])
        self.pfz = record["pfz"]
        self.data_mode = mode.upper()

    @staticmethod
    def is_archived_demo(context):
        from backend.app.services.data_service import DataService
        return DataService.is_archived_demo(context)

    def _payload(self, key, context, model):
        from datetime import datetime, timezone
        raw = deepcopy(getattr(self.bundle, key))
        if raw is None:
            raise EvidenceUnavailable(f"Retained {key} evidence is unavailable.")
        if hasattr(raw, "model_dump"):
            raw = raw.model_dump()
        # Select forecast values at the proposed time without changing source
        # issuance/validity or treating a forecast as a fresh observation.
        if context.departure_time and key in ("marine", "weather"):
            target = datetime.fromisoformat(context.departure_time.replace("Z", "+00:00"))
            if target.tzinfo is None:
                target = target.replace(tzinfo=timezone.utc)
            candidates = []
            forecast_times = []
            for row in self.bundle.hourly_forecast:
                stamp = row.get("observation_time") or row.get("timestamp_utc") or row.get("observed_at")
                if not stamp:
                    continue
                dt = datetime.fromisoformat(str(stamp).replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                forecast_times.append(dt)
                if dt <= target:
                    candidates.append((dt, row))
            if forecast_times and not min(forecast_times) <= target <= max(forecast_times):
                raise EvidenceUnavailable("Proposed departure falls outside the retained forecast coverage.")
            if candidates:
                row = max(candidates, key=lambda x: x[0])[1]
                aliases = {"significant_wave_height_m": "swh_m", "wind_speed_knots": "wind_speed_kn"}
                for field in model.model_fields:
                    if field in ("observed_at", "valid_to", "valid_from", "source_name", "source_url", "freshness_flags", "hourly_forecast"):
                        continue
                    value = row.get(field, row.get(aliases.get(field, field)))
                    if field == "significant_wave_height_m" and value is None:
                        value = row.get("wave_height_m", row.get("swh"))
                    if value is not None:
                        raw[field] = value
        return model(**raw)

    def get_marine_conditions(self, context):
        return self._payload("marine", context, MarineConditionsPayload)

    def get_weather_conditions(self, context):
        return self._payload("weather", context, WeatherConditionsPayload)

    def get_hazard_bulletin(self, context):
        from backend.app.agents.integrations.dev2 import HazardBulletinPayload
        from datetime import datetime, timezone
        payload = self._payload("hazard", context, HazardBulletinPayload)
        flags = payload.freshness_flags or {}
        if "hazard_records" not in flags:
            return payload
        parse = lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))
        start = parse(context.departure_time) if context.departure_time else datetime.now(timezone.utc)
        end = parse(context.return_time) if context.return_time else start
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if start < parse(flags["coverage_start"]) or end > parse(flags["coverage_end"]):
            raise EvidenceUnavailable("Mission extends beyond retained hazard scenario coverage.")
        active = [r for r in flags["hazard_records"] if parse(r["start"]) <= end and parse(r["end"]) >= start]
        payload.severity = "WARNING" if active else "NORMAL"
        payload.cyclone_warning_active = any("CYCLONE" in str(r["event_type"]).upper() for r in active)
        payload.squall_alert = any("SQUALL" in str(r["event_type"]).upper() for r in active)
        payload.headline = "; ".join(r["headline"] for r in active) or "No applicable warning in retained controlled scenario."
        payload.valid_from = min(r["start"] for r in active) if active else flags["coverage_start"]
        payload.valid_to = max(r["end"] for r in active) if active else flags["coverage_end"]
        return payload

    def get_pfz_raw_advisories(self, context):
        from backend.app.agents.integrations.dev2 import PFZSourceDataPayload
        from datetime import datetime, timezone
        payload = PFZSourceDataPayload(**deepcopy(self.pfz)) if self.pfz else PFZSourceDataPayload(features=[], bulletin_date=self.bundle.captured_at, valid_to=self.bundle.captured_at, source_name="Unavailable retained PFZ")
        if context.departure_time:
            target = datetime.fromisoformat(context.departure_time.replace("Z", "+00:00"))
            if target.tzinfo is None:
                target = target.replace(tzinfo=timezone.utc)
            def covers(feature):
                start, end = feature.get("valid_from"), feature.get("valid_to")
                if not start or not end:
                    end = payload.valid_to
                    return target <= datetime.fromisoformat(end.replace("Z", "+00:00"))
                return datetime.fromisoformat(start.replace("Z", "+00:00")) <= target <= datetime.fromisoformat(end.replace("Z", "+00:00"))
            payload.features = [feature for feature in payload.features if covers(feature)]
        return payload

    def get_hourly_marine_forecast(self, context, start_time, end_time):
        return deepcopy(self.bundle.hourly_forecast)

    def get_observation_bundle(self, context):
        return self.bundle.model_copy(deep=True)
