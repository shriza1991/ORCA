'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';

const MarineWatchPage = dynamic(() => import('@/views/MarineWatchPage'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: '#64748b' }}>
      Loading India MarineWatch...
    </div>
  ),
});

export default function MarineWatchRoute() {
  const router = useRouter();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-container">
      <Header
        language="en"
        evidenceCount={0}
        onOpenEvidence={() => {}}
        theme={theme}
        currentPortal="marinewatch"
        onLogout={() => router.push('/')}
        onReturnToPortal={() => router.push('/')}
        onOpenSettings={() => router.push('/settings')}
      />

      <MarineWatchPage onBackToPortal={() => router.push('/')} theme={theme} />
    </div>
  );
}
