import { useState, useEffect, useMemo } from 'react';
import * as turf from '@turf/turf';
import type { LocationData, GeolocationStatus } from './useGeolocation';
import type { MapLayer } from '../types/contracts';

export interface GeofenceAlert {
  layer_id: string;
  name: string;
  distanceKm: number;
  isInside: boolean;
  type: string;
}

export function useGeofence(
  location: LocationData | null,
  status: GeolocationStatus,
  layers: MapLayer[],
  hysteresisBufferKm = 1.0
) {
  const [alerts, setAlerts] = useState<GeofenceAlert[]>([]);

  const geofenceLayers = useMemo(() => {
    return layers.filter(
      l => 
        l.style?.layer_category === 'hazard' || 
        l.style?.layer_category === 'restriction'
    );
  }, [layers]);

  useEffect(() => {
    if (!location || (status !== 'accurate' && status !== 'stale')) {
      return;
    }

    const pt = turf.point([location.longitude, location.latitude]);
    
    setAlerts(prev => {
      const nextAlerts: GeofenceAlert[] = [];

      for (const layer of geofenceLayers) {
        if (!layer.geojson) continue;
        
        let isInside = false;
        let distanceKm = Infinity;

        try {
          const features = layer.geojson.type === 'FeatureCollection' 
            ? (layer.geojson.features || [])
            : layer.geojson.type === 'Feature' ? [layer.geojson] : [];

          for (const feat of features) {
            if (feat.geometry.type === 'Polygon' || feat.geometry.type === 'MultiPolygon') {
              const inside = turf.booleanPointInPolygon(pt, feat as any);
              if (inside) {
                isInside = true;
                distanceKm = 0;
                break;
              }

              const lines = turf.polygonToLine(feat as any);
              // @ts-ignore
              const dist = turf.pointToLineDistance(pt, lines as any, { units: 'kilometers' });
              if (dist < distanceKm) {
                distanceKm = dist;
              }
            }
          }
        } catch (e) {
          console.error("Geofence check failed for layer", layer.layer_id, e);
          continue;
        }

        const prevAlert = prev.find(a => a.layer_id === layer.layer_id);
        const wasInside = prevAlert ? prevAlert.isInside : false;

        let nowInside = wasInside;
        if (!wasInside && isInside) {
          nowInside = true;
        } else if (wasInside && !isInside && distanceKm > hysteresisBufferKm) {
          nowInside = false;
        } else if (wasInside && !isInside && distanceKm <= hysteresisBufferKm) {
          nowInside = true; // within buffer
        }

        if (nowInside || distanceKm < 5.0) {
          nextAlerts.push({
            layer_id: layer.layer_id,
            name: layer.name,
            distanceKm,
            isInside: nowInside,
            type: layer.style?.layer_category || 'unknown'
          });
        }
      }

      return nextAlerts;
    });
  }, [location, status, geofenceLayers, hysteresisBufferKm]);

  return { alerts };
}
