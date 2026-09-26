import React, { useState } from 'react';
import { ShipWheel, MapPin, CalendarClock, ArrowLeft, Check } from 'lucide-react';
import type { MissionContext } from '../../types/mission';
import { translateText, type SupportedLanguage } from '../../i18n/translations';
import { useSpokenGuidance } from '../../hooks/useSpokenGuidance';

interface GuidedTripSetupProps {
  context: MissionContext;
  language?: SupportedLanguage;
  onContextChange: (context: MissionContext) => void;
  onComplete: () => void;
  onCancel: () => void;
}

const HARBORS = [
  'Ratnagiri',
  'Malvan',
  'Panaji',
  'Mumbai',
  'Veraval',
  'Mangalore',
  'Cochin',
  'Tuticorin',
  'Chennai',
  'Visakhapatnam',
  'Paradip',
];
const CRAFT_PROFILES = [
  { value: 'traditional_non_motorized', label: 'Traditional craft' },
  { value: 'motorized_boat', label: 'Motorized boat' },
  { value: 'mechanized_trawler', label: 'Mechanized trawler' },
] as const;

export default function GuidedTripSetup({
  context,
  language = 'en',
  onContextChange,
  onComplete,
  onCancel,
}: GuidedTripSetupProps) {
  const [step, setStep] = useState(0);
  const { speak, stop } = useSpokenGuidance({ language });

  const steps = [
    {
      id: 'harbor',
      title: translateText('Which harbour?', language),
      icon: <MapPin size={48} />,
    },
    {
      id: 'boat',
      title: translateText('Which boat?', language),
      icon: <ShipWheel size={48} />,
    },
    {
      id: 'depart',
      title: translateText('When will you leave?', language),
      icon: <CalendarClock size={48} />,
    },
    {
      id: 'return',
      title: translateText('When will you return?', language),
      icon: <CalendarClock size={48} />,
    },
    {
      id: 'confirm',
      title: translateText('Confirm your trip', language),
      icon: <Check size={48} />,
    },
  ];

  // Speak the title whenever step changes
  React.useEffect(() => {
    if (step === steps.length - 1) {
      // Confirmation step
      const harbor = translateText(context.origin_harbor || 'Ratnagiri', language);
      const boat = translateText(
        CRAFT_PROFILES.find((c) => c.value === context.craft_profile)?.label || 'Motorized boat',
        language
      );
      const depart = translateText(context.departure_time || 'today', language);
      const returnTime = translateText(context.return_time || 'tomorrow', language);
      
      speak(`${steps[step].title}. Harbour, ${harbor}. Boat, ${boat}. Leaving, ${depart}. Returning, ${returnTime}.`);
    } else {
      speak(steps[step].title);
    }
  }, [step]);

  const handleNext = () => {
    if (step < steps.length - 1) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else {
      stop();
      onCancel();
    }
  };

  const handleComplete = () => {
    stop();
    onComplete();
  };

  const renderContent = () => {
    switch (step) {
      case 0:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            {HARBORS.map((h) => (
              <button
                key={h}
                onClick={() => {
                  onContextChange({ ...context, origin_harbor: h });
                  handleNext();
                }}
                style={{
                  padding: '24px',
                  fontSize: '1.5rem',
                  borderRadius: '12px',
                  background: context.origin_harbor === h ? '#3b82f6' : '#f1f5f9',
                  color: context.origin_harbor === h ? 'white' : 'black',
                  border: 'none',
                }}
              >
                {translateText(h, language)}
              </button>
            ))}
          </div>
        );
      case 1:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            {CRAFT_PROFILES.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  onContextChange({ ...context, craft_profile: c.value });
                  handleNext();
                }}
                style={{
                  padding: '24px',
                  fontSize: '1.5rem',
                  borderRadius: '12px',
                  background: context.craft_profile === c.value ? '#3b82f6' : '#f1f5f9',
                  color: context.craft_profile === c.value ? 'white' : 'black',
                  border: 'none',
                }}
              >
                {translateText(c.label, language)}
              </button>
            ))}
          </div>
        );
      case 2:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            {['today', 'tomorrow'].map((time) => (
              <button
                key={time}
                onClick={() => {
                  onContextChange({ ...context, departure_time: time });
                  handleNext();
                }}
                style={{
                  padding: '24px',
                  fontSize: '1.5rem',
                  borderRadius: '12px',
                  background: context.departure_time === time ? '#3b82f6' : '#f1f5f9',
                  color: context.departure_time === time ? 'white' : 'black',
                  border: 'none',
                }}
              >
                {translateText(time === 'today' ? 'Today' : 'Tomorrow', language)}
              </button>
            ))}
          </div>
        );
      case 3:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            {['tomorrow', 'in 2 days', 'in 3 days'].map((time) => (
              <button
                key={time}
                onClick={() => {
                  onContextChange({ ...context, return_time: time });
                  handleNext();
                }}
                style={{
                  padding: '24px',
                  fontSize: '1.5rem',
                  borderRadius: '12px',
                  background: context.return_time === time ? '#3b82f6' : '#f1f5f9',
                  color: context.return_time === time ? 'white' : 'black',
                  border: 'none',
                }}
              >
                {translateText(time === 'tomorrow' ? 'Tomorrow' : time === 'in 2 days' ? 'In 2 days' : 'In 3 days', language)}
              </button>
            ))}
          </div>
        );
      case 4:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '1.25rem' }}>
            <p><strong>{translateText('Harbour', language)}:</strong> {translateText(context.origin_harbor || 'Ratnagiri', language)}</p>
            <p>
              <strong>{translateText('Boat', language)}:</strong>{' '}
              {translateText(CRAFT_PROFILES.find((c) => c.value === context.craft_profile)?.label || 'Motorized boat', language)}
            </p>
            <p><strong>{translateText('Leaving', language)}:</strong> {translateText(context.departure_time === 'today' ? 'Today' : 'Tomorrow', language)}</p>
            <p><strong>{translateText('Returning', language)}:</strong> {translateText(context.return_time === 'tomorrow' ? 'Tomorrow' : context.return_time === 'in 2 days' ? 'In 2 days' : 'In 3 days', language)}</p>
            
            <button
              onClick={handleComplete}
              style={{
                padding: '24px',
                fontSize: '1.5rem',
                borderRadius: '12px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                marginTop: '32px',
              }}
            >
              {translateText('Assess Trip Safety', language)}
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', gap: '16px' }}>
        <button
          onClick={handleBack}
          style={{ background: 'transparent', border: 'none', padding: '12px' }}
          aria-label="Go back"
        >
          <ArrowLeft size={32} />
        </button>
        <div style={{ color: '#3b82f6' }}>{steps[step].icon}</div>
        <h2 style={{ fontSize: '2rem', margin: 0 }}>{steps[step].title}</h2>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {renderContent()}
      </div>
    </div>
  );
}
