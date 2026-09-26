import { useTranslation } from 'react-i18next';
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

const HARBORS = ['Ratnagiri', 'Malvan', 'Panaji', 'Mumbai', 'Veraval', 'Porbandar'];
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
  const { t } = useTranslation();

  const steps = [
    {
      id: 'harbor',
      title: t('GuidedTripSetup.from_which_port', 'From which port?'),
      icon: <MapPin size={48} />,
    },
    {
      id: 'pfz',
      title: t('GuidedTripSetup.select_pfz', 'Select PFZ'),
      icon: <MapPin size={48} />,
    },
    {
      id: 'boat',
      title: t('GuidedTripSetup.boat_vessel_size_type', 'Boat vessel size type?'),
      icon: <ShipWheel size={48} />,
    },
    {
      id: 'depart',
      title: t('GuidedTripSetup.depart_day', 'Day when you will depart?'),
      icon: <CalendarClock size={48} />,
    },
    {
      id: 'return',
      title: t('GuidedTripSetup.return_day', 'Day when you will return?'),
      icon: <CalendarClock size={48} />,
    },
    {
      id: 'sea_condition',
      title: t('GuidedTripSetup.sea_condition', 'See the sea condition'),
      icon: <Check size={48} />,
    },
    {
      id: 'confirm',
      title: t('GuidedTripSetup.plan_trip', 'Plan the trip'),
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
                {t('Harbor.' + h, h)}
              </button>
            ))}
          </div>
        );
      case 4:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            {['today', 'tomorrow', '2_days', '3_days'].map((time) => (
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
                {t('GuidedTripSetup.return_time.' + time, time.replace('_', ' '))}
              </button>
            ))}
          </div>
        );
      case 1:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            {[
              { value: 'auto', label: 'Auto-select best PFZ' },
              { value: 'custom', label: 'Use my own coordinates' }
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onContextChange({ ...context, target_pfz: opt.value });
                  handleNext();
                }}
                style={{
                  padding: '24px',
                  fontSize: '1.5rem',
                  borderRadius: '12px',
                  background: context.target_pfz === opt.value ? '#3b82f6' : '#f1f5f9',
                  color: context.target_pfz === opt.value ? 'white' : 'black',
                  border: 'none',
                }}
              >
                {t('GuidedTripSetup.pfz_opt.' + opt.value, opt.label)}
              </button>
            ))}
          </div>
        );
      case 2:
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
                {t('GuidedTripSetup.craft.' + c.value, c.label)}
              </button>
            ))}
          </div>
        );
      case 3:
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
                {t('GuidedTripSetup.time.' + time, time === 'today' ? 'Today' : 'Tomorrow')}
              </button>
            ))}
          </div>
        );
      case 5:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '1.25rem', textAlign: 'center' }}>
            <p style={{ color: '#64748b' }}>
              {translateText('We are ready to fetch live wind, wave, and hazard conditions for your voyage.', language)}
            </p>
            <button
              onClick={handleNext}
              style={{
                padding: '24px',
                fontSize: '1.5rem',
                borderRadius: '12px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                marginTop: '16px',
              }}
            >
              {translateText('Proceed to Plan', language)}
            </button>
          </div>
        );
      case 6:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '1.25rem' }}>
            <p><strong>{translateText('Harbour', language)}:</strong> {translateText(context.origin_harbor || 'Ratnagiri', language)}</p>
            <p><strong>{translateText('PFZ', language)}:</strong> {translateText(context.target_pfz === 'custom' ? 'Custom' : 'Auto-select', language)}</p>
            <p>
              <strong>{translateText('Boat', language)}:</strong>{' '}
              {translateText(CRAFT_PROFILES.find((c) => c.value === context.craft_profile)?.label || 'Motorized boat', language)}
            </p>
            <p><strong>{translateText('Leaving', language)}:</strong> {translateText(context.departure_time === 'today' ? 'Today' : 'Tomorrow', language)}</p>
            
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
              {translateText('Generate Complete Summary', language)}
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
