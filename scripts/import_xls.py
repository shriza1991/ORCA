import pandas as pd
import json

def dms_to_dd(dms_str):
    if pd.isna(dms_str): return 0.0
    parts = str(dms_str).strip().split()
    if len(parts) < 3: return 0.0
    try:
        d = float(parts[0])
        m = float(parts[1])
        s = float(parts[2])
        dd = d + m/60.0 + s/3600.0
        if len(parts) > 3 and parts[3] in ['S', 'W']:
            dd = -dd
        return dd
    except:
        return 0.0

def parse_range(range_str):
    if pd.isna(range_str): return 0.0
    parts = str(range_str).split('-')
    if len(parts) == 2:
        try:
            return (float(parts[0].strip()) + float(parts[1].strip())) / 2.0
        except:
            return 0.0
    try:
        return float(parts[0].strip())
    except:
        return 0.0

df = pd.read_excel('C:/Users/vikram/OneDrive/Desktop/SAMUDRA/data-sample/PfzForecast_GUJARAT.xls', skiprows=3)

# Load existing json
with open('C:/Users/vikram/OneDrive/Desktop/SAMUDRA/data/source_snapshots/pfz_advisories.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

start_id = 100
count = 0
for idx, row in df.iterrows():
    loc = row.iloc[0]
    if pd.isna(loc) or 'Coast' in str(loc): continue
    
    lat_str = row.iloc[5]
    lon_str = row.iloc[6]
    
    lat = dms_to_dd(lat_str)
    lon = dms_to_dd(lon_str)
    
    if lat == 0.0 or lon == 0.0: continue
    
    dist = parse_range(row.iloc[3])
    depth = parse_range(row.iloc[4])
    bearing = str(row.iloc[2]).strip()
    
    cand_id = f"GJ-PFZ-{start_id+idx}"
    feature = {
        "id": cand_id,
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat]
        },
        "properties": {
            "candidate_id": cand_id,
            "location_reference": str(loc),
            "depth_m": depth,
            "distance_km": dist,
            "bearing_degrees": float(bearing) if bearing.isdigit() else 0.0,
            "sst": 28.5,
            "chlorophyll": 0.8
        }
    }
    data['payload']['features'].append(feature)
    count += 1

with open('C:/Users/vikram/OneDrive/Desktop/SAMUDRA/data/source_snapshots/pfz_advisories.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)

print(f"Added {count} GUJARAT PFZ records to pfz_advisories.json")
