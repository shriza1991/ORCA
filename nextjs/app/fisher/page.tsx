'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useChat } from '@/hooks/useChat';
import { MessageSquare, Map as MapIcon } from 'lucide-react';

const FisherPage = dynamic(() => import('@/views/FisherPage'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: '#64748b' }}>
      Loading Fisher Console...
    </div>
  ),
});

const EvidenceDrawer = dynamic(() => import('@/components/evidence/EvidenceDrawer'), {
  ssr: false,
});

const CallModal = dynamic(() => import('@/components/call/CallModal'), {
  ssr: false,
});

export default function FisherRoute() {
  const router = useRouter();
  const chat = useChat();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileView, setMobileView] = useState<'chat' | 'map'>('chat');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const evidenceItems = chat.activeResponse?.evidence ?? [];
  const traceItems = chat.activeResponse?.trace ?? [];
  const layerCount = chat.activeResponse?.map_layers?.length ?? 0;

  const handleBack = () => {
    if (chat.messages.length > 0) {
      chat.clearChat();
    } else if (mobileView === 'chat') {
      router.push('/');
    } else {
      setMobileView('chat');
    }
  };

  return (
    <div className="app-container">
      <Header
        language={chat.language}
        evidenceCount={evidenceItems.length}
        onOpenEvidence={() => setIsDrawerOpen(true)}
        theme={theme}
        currentPortal="fisher"
        onLogout={() => router.push('/')}
        onReturnToPortal={() => router.push('/')}
        onOpenSettings={() => router.push('/settings')}
      />

      {/* Mobile Segmented View Tabs */}
      <nav className="mobile-view-tabs" role="tablist" aria-label="Mobile viewport selection">
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileView('chat')}
          role="tab"
          aria-selected={mobileView === 'chat'}
        >
          <MessageSquare size={16} />
          <span>Console</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${mobileView === 'map' ? 'active' : ''}`}
          onClick={() => setMobileView('map')}
          role="tab"
          aria-selected={mobileView === 'map'}
        >
          <MapIcon size={16} />
          <span>Map</span>
          {layerCount > 0 && <span className="mobile-tab-badge">{layerCount}</span>}
        </button>
      </nav>

      <FisherPage
        chat={chat}
        theme={theme}
        mobileView={mobileView}
        onStartCall={() => setIsCallModalOpen(true)}
        onOpenEvidence={() => setIsDrawerOpen(true)}
        onBack={handleBack}
        onViewMap={() => setMobileView('map')}
      />

      <EvidenceDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        evidence={evidenceItems}
        trace={traceItems}
      />

      <CallModal
        isOpen={isCallModalOpen}
        onClose={() => setIsCallModalOpen(false)}
        language={chat.language}
        originHarbor={chat.missionContext.origin_harbor}
        craftProfile={chat.missionContext.craft_profile}
      />
    </div>
  );
}
