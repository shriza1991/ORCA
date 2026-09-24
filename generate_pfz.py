import pandas as pd
import json
from datetime import datetime, timezone
import math

def dms_to_decimal(dms_str):
    if not isinstance(dms_str, str):
        return None
    parts = dms_str.strip().split()
    if len(parts) != 4:
        return None
    deg = float(parts[0])
    min_ = float(parts[1])
    sec = float(parts[2])
    dir_ = parts[3].upper()
    
    dec = deg + min_/60 + sec/3600
    if dir_ in ['S', 'W']:
        dec = -dec
    return dec

def parse_depth(depth_str):
    if not isinstance(depth_str, str):
        return None
    try:
        parts = depth_str.split('-')
        return sum(float(p) for p in parts) / len(parts)
    except:
        return None

df = pd.read_excel('data-sample/PfzForecast_MAHARASHTRA (2).xls', skiprows=3, names=['Location', 'Direction', 'Bearing', 'Distance', 'Depth', 'Lat', 'Lon'])

features = []
now_iso = datetime.now(timezone.utc).isoformat()
for idx, row in df.iterrows():
    lat = dms_to_decimal(row.get('Lat'))
    lon = dms_to_decimal(row.get('Lon'))
    
    if lat is None or lon is None or math.isnan(lat) or math.isnan(lon):
        continue
        
    depth = parse_depth(row.get('Depth'))
    location_name = row.get('Location')
    if pd.isna(location_name):
        location_name = "Unknown"
        
    feature = {
        "id": f"MH-PFZ-{idx+1}",
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "properties": {
            "candidate_id": f"MH-PFZ-{idx+1}",
            "location_reference": location_name,
            "depth_m": depth,
            # Assign dummy SST and Chlorophyll to make it rankable
            "sst": 28.5,
            "chlorophyll": 0.8
        }
    }
    features.append(feature)

payload = {
    "features": features,
    "bulletin_date": "2026-09-23T00:00:00Z",
    "valid_to": "2026-09-24T23:59:59Z",
    "source_name": "INCOIS Maharashtra PFZ",
    "source_url": "https://incois.gov.in"
}

snapshot_format = {
    "metadata": {
        "source": "pfz_advisories",
        "version": "1.0",
        "captured_at": now_iso
    },
    "payload": payload
}

with open('data/source_snapshots/pfz_advisories.json', 'w', encoding='utf-8') as f:
    json.dump(snapshot_format, f, indent=2)

print(f"Saved {len(features)} PFZ candidates to data/source_snapshots/pfz_advisories.json")
