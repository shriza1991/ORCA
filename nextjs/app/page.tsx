'use client';

import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import PortalPage from '@/views/PortalPage';

export default function Home() {
  const router = useRouter();

  const handleSelectRole = (
    role: 'fisher' | 'authority' | 'researcher'
  ) => {
    if (role === 'fisher') router.push('/fisher');
    else if (role === 'authority') router.push('/authority');
    else if (role === 'researcher') router.push('/researcher');
  };

  return (
    <div className="app-container">
      <Header
        language="en"
        evidenceCount={0}
        onOpenEvidence={() => {}}
        theme="light"
        currentPortal="selection"
        onOpenSettings={() => router.push('/settings')}
      />
      <PortalPage onSelectRole={handleSelectRole} language="en" />
    </div>
  );
}
