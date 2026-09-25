'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import { useChat } from '@/hooks/useChat';

const SettingsPage = dynamic(() => import('@/views/SettingsPage'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', color: '#64748b' }}>
      Loading Settings...
    </div>
  ),
});

export default function SettingsRoute() {
  const router = useRouter();
  const chat = useChat();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-container">
      <Header
        language={chat.language}
        evidenceCount={0}
        onOpenEvidence={() => {}}
        theme={theme}
        currentPortal="settings"
        onLogout={() => router.push('/')}
        onReturnToPortal={() => router.push('/')}
      />

      <SettingsPage
        theme={theme}
        onThemeChange={setTheme}
        language={chat.language}
        onLanguageChange={chat.setLanguage}
        missionContext={chat.missionContext}
        onMissionContextChange={chat.setMissionContext}
        onBack={() => router.back()}
      />
    </div>
  );
}
