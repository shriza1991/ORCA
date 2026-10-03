import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LocationWarningsOverlay from './LocationWarningsOverlay';
import type { GeofenceAlert } from '../../hooks/useGeofence';

describe('Task 4: LocationWarningsOverlay & Boundary Geofencing Presentation', () => {
  const mockInsideAlert: GeofenceAlert = {
    layer_id: 'POLY-NAV-GOA-01',
    name: 'Naval Firing Range Foxtrot (Goa Sector)',
    distanceKm: 0.0,
    isInside: true,
    type: 'NAVAL_FIRING_RANGE',
    isHardRestriction: true,
    restrictionLevel: 'NO_GO',
  };

  const mockApproachingAlert: GeofenceAlert = {
    layer_id: 'POLY-NAV-GOA-01',
    name: 'Naval Firing Range Foxtrot (Goa Sector)',
    distanceKm: 3.3,
    isInside: false,
    type: 'NAVAL_FIRING_RANGE',
    isHardRestriction: true,
    restrictionLevel: 'NO_GO',
    projectedCrossing: false,
  };

  const mockApproachingWithProjectedCrossing: GeofenceAlert = {
    layer_id: 'POLY-MPA-MAL-01',
    name: 'Malvan Marine Sanctuary Core',
    distanceKm: 4.8,
    isInside: false,
    type: 'MPA_SANCTUARY_CORE',
    isHardRestriction: true,
    restrictionLevel: 'NO_GO',
    projectedCrossing: true,
    timeToCrossHours: 0.8,
  };

  it('Case 1: APPROACHING warning is visibly rendered (not filtered out by isInside)', () => {
    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockApproachingAlert],
        language: 'en',
        evaluationState: 'APPROACHING',
      })
    );

    // Must be rendered and contain key elements
    expect(html).toContain('location-warnings-overlay');
    expect(html).toContain('Near Restricted Area');
    expect(html).toContain('Naval Firing Range Foxtrot (Goa Sector)');
    expect(html).toContain('3.3 km');
    expect(html).toContain('Navigate with caution and stay clear of restricted waters.');
  });

  it('Case 2: INSIDE warning is visibly rendered with high-severity styling', () => {
    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockInsideAlert],
        language: 'en',
        evaluationState: 'INSIDE',
      })
    );

    expect(html).toContain('Inside Restricted Area');
    expect(html).toContain('Naval Firing Range Foxtrot (Goa Sector)');
    expect(html).toContain('NO_GO');
    expect(html).toContain('Check the applicable restriction and navigate away when safe.');
  });

  it('Case 3: Projected crossing displays intercept time when supported by heading/speed', () => {
    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockApproachingWithProjectedCrossing],
        language: 'en',
        evaluationState: 'APPROACHING',
      })
    );

    expect(html).toContain('Malvan Marine Sanctuary Core');
    expect(html).toContain('4.8 km');
    expect(html).toContain('Course intercepts boundary in 0.8h.');
  });

  it('Case 4: CLEAR state renders no warning banners', () => {
    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [],
        language: 'en',
        evaluationState: 'CLEAR',
      })
    );

    // When clear and no alerts, returns null (empty string in static markup)
    expect(html).toBe('');
  });

  it('Case 5: Lost/stale GPS renders GPS Signal Lost warning and last known location label', () => {
    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'stale',
        alerts: [],
        language: 'en',
      })
    );

    expect(html).toContain('GPS Signal Lost');
    expect(html).toContain('Showing last known location.');
  });

  it('Case 6: Denied GPS renders Location Denied warning', () => {
    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'denied',
        alerts: [],
        language: 'en',
      })
    );

    expect(html).toContain('Location Denied');
    expect(html).toContain('Cannot track your position.');
  });

  it('Case 7: Backend evaluation service failure displays UNKNOWN banner', () => {
    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [],
        language: 'en',
        evaluationState: 'UNKNOWN',
        unknownReason: 'RESTRICTION_DATASET_UNAVAILABLE',
      })
    );

    expect(html).toContain('Boundary evaluation unavailable. Your location cannot currently be checked.');
    expect(html).toContain('RESTRICTION_DATASET_UNAVAILABLE');
  });

  it('Case 8: Warning localization works across English, Hindi, and Marathi', () => {
    // English
    const enHtml = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockApproachingAlert],
        language: 'en',
        evaluationState: 'APPROACHING',
      })
    );
    expect(enHtml).toContain('Near Restricted Area');

    // Hindi
    const hiHtml = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockApproachingAlert],
        language: 'hi',
        evaluationState: 'APPROACHING',
      })
    );
    expect(hiHtml).toContain('प्रतिबंधित क्षेत्र के समीप');

    // Marathi
    const mrHtml = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockApproachingAlert],
        language: 'mr',
        evaluationState: 'APPROACHING',
      })
    );
    expect(mrHtml).toContain('प्रतिबंधित क्षेत्राजवळ');

    // Inside warning in Hindi
    const hiInside = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockInsideAlert],
        language: 'hi',
        evaluationState: 'INSIDE',
      })
    );
    expect(hiInside).toContain('प्रतिबंधित क्षेत्र के अंदर');

    // Inside warning in Marathi
    const mrInside = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [mockInsideAlert],
        language: 'mr',
        evaluationState: 'INSIDE',
      })
    );
    expect(mrInside).toContain('प्रतिबंधित क्षेत्राच्या आत');
  });

  it('Case 9: Multiple warnings sort deterministically: INSIDE first, then APPROACHING by distance', () => {
    const alertNear: GeofenceAlert = {
      layer_id: 'ALERT-NEAR',
      name: 'Advisory Buffer Zone',
      distanceKm: 2.1,
      isInside: false,
      type: 'RESTRICTION',
    };
    const alertFar: GeofenceAlert = {
      layer_id: 'ALERT-FAR',
      name: 'Far Warning Sector',
      distanceKm: 8.5,
      isInside: false,
      type: 'RESTRICTION',
    };
    const alertInside: GeofenceAlert = {
      layer_id: 'ALERT-INSIDE',
      name: 'Active Firing Polygon',
      distanceKm: 0.0,
      isInside: true,
      type: 'NAVAL_FIRING_RANGE',
      isHardRestriction: true,
    };

    const html = renderToStaticMarkup(
      React.createElement(LocationWarningsOverlay, {
        status: 'accurate',
        alerts: [alertFar, alertNear, alertInside],
        language: 'en',
      })
    );

    const insideIdx = html.indexOf('Active Firing Polygon');
    const nearIdx = html.indexOf('Advisory Buffer Zone');
    const farIdx = html.indexOf('Far Warning Sector');

    // Must be sorted inside first, then nearest, then far
    expect(insideIdx).toBeLessThan(nearIdx);
    expect(nearIdx).toBeLessThan(farIdx);
  });
});
