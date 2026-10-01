"use client";
import { ArrowUpRight, Anchor, Fish, RadioTower, Waves } from 'lucide-react';
import type { SupportedLanguage } from '../i18n/translations';
interface PortalPageProps {
  onSelectRole: (role: 'fisher' | 'authority' | 'researcher') => void;
  language?: SupportedLanguage;
}
export default function PortalPage({ onSelectRole }: PortalPageProps) {
  return <main className="workspace-entry">
    <section className="entry-intro">
      <span className="eyebrow"><Anchor size={16} /> MARINE MISSION INTELLIGENCE</span>
      <h1>Know the sea.<br />Plan your next move.</h1>
      <p>Marine conditions, routes and evidence.<br />One clear decision for the mission ahead.</p>
      <div className="entry-course" aria-hidden="true"><span>01 ? Ask</span><i /><span>02 ? Assess</span><i /><span>03 ? Adapt</span></div>
    </section>
    <section className="workspace-choices" aria-labelledby="workspace-title">
      <span className="eyebrow">WELCOME TO ORCA</span>
      <h2 id="workspace-title">Choose your workspace</h2>
      <p className="muted">Open access to the prototype. No sign-in required.</p>
      {([
        ['fisher', Fish, 'Fisher Console', 'Plan a trip. Find your fishing area. Know when to go.', 'Mission & decision'],
        ['authority', RadioTower, 'Authority Command Deck', 'Follow your coastal sectors, vessels and active hazards.', 'Coastal operations'],
        ['researcher', Waves, 'Researcher Lab', 'Explore marine observations, evidence and scenarios.', 'Data & analysis'],
      ] as const).map(([role, Icon, title, description, label]) => <button className="workspace-choice" key={role} onClick={() => onSelectRole(role)}>
        <Icon size={24} /><span><small>{label}</small><strong>{title}</strong><span>{description}</span></span><ArrowUpRight size={20} />
      </button>)}
      <p className="entry-note">Decision support for coastal missions ? Evidence available with every assessment</p>
    </section>
  </main>;
}
