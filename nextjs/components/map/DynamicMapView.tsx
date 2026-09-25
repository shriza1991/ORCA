'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type MapView from './MapView';

export const DynamicMapView = dynamic<ComponentProps<typeof MapView>>(
  () => import('./MapView'),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: '100%',
          width: '100%',
          minHeight: '400px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#94a3b8',
        }}
      >
        <span>Loading Marine GIS Engine...</span>
      </div>
    ),
  }
);

export default DynamicMapView;
