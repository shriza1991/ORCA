from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.services.data_service import DataService

ctx = ToolInvocationContext(origin_harbor='Ratnagiri', craft_profile='motorized_boat', data_mode='LIVE')
ds = DataService()
marine = ds.get_marine_conditions(ctx)
weather = ds.get_weather_conditions(ctx)
hazard = ds.get_hazard_bulletin(ctx)

from datetime import datetime, timezone
now_utc = datetime.now(timezone.utc)
from dateutil import parser
def is_stale(dt_str: str) -> bool:
    try:
        return parser.isoparse(dt_str) < now_utc
    except:
        return True

print("marine_stale:", is_stale(marine.valid_to) if marine else True)
print("weather_stale:", is_stale(weather.valid_to) if weather else True)
print("hazard_stale:", is_stale(hazard.valid_to) if hazard else True)
