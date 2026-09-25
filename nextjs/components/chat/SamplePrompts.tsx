import { useEffect, useState } from 'react';
import { getDemoScenarios, type DemoScenario } from '../../api/client';
import { TRANSLATIONS, type SupportedLanguage, type PromptTemplate } from '../../i18n/translations';
import { Compass, ShieldAlert, Navigation, Fish } from 'lucide-react';

interface SamplePromptsProps {
  language: SupportedLanguage;
  onSelect: (query: string) => void;
  disabled?: boolean;
}

const ICON_MAP: Record<string, any> = {
  pfz: Fish,
  safety: ShieldAlert,
  hazard: Compass,
  route: Navigation,
};

export default function SamplePrompts({ language, onSelect, disabled }: SamplePromptsProps) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const [prompts, setPrompts] = useState<PromptTemplate[]>(t.prompts);

  // When language changes, update prompts immediately to the selected language's templates
  useEffect(() => {
    setPrompts(t.prompts);
  }, [language, t]);

  // Optionally augment with custom dynamic queries from backend if available in this language
  useEffect(() => {
    let isMounted = true;
    getDemoScenarios()
      .then((scenarios: DemoScenario[]) => {
        if (!isMounted || !scenarios || scenarios.length === 0) return;
        // If backend provides scenario list and English is active, we can overlay
        if (language === 'en') {
          const dynamicPrompts: PromptTemplate[] = scenarios.map((s) => ({
            id: s.id,
            label: s.name,
            query: s.query || (
              s.intent === 'NEAREST_PFZ'
                ? `Where is the nearest Potential Fishing Zone today? (${s.name})`
                : s.intent === 'HAZARD_BOUNDARY'
                ? `Check hazards and restricted water zones (${s.name})`
                : s.intent === 'SAFER_ROUTE'
                ? `Which alternative route is safer? (${s.name})`
                : `Is it safe to depart? (${s.name})`
            ),
          }));
          setPrompts(dynamicPrompts);
        }
      })
      .catch(() => {
        // Retain canonical translated prompts
      });

    return () => {
      isMounted = false;
    };
  }, [language]);

  return (
    <div className="sample-prompts">
      <h4 className="sample-prompts-title">{t.samplePromptsTitle}</h4>
      <div className="sample-prompts-grid">
        {prompts.map((item) => {
          const Icon = ICON_MAP[item.id] || Compass;
          return (
            <button
              key={item.id}
              className="sample-prompt-btn"
              onClick={() => onSelect(item.query)}
              disabled={disabled}
              aria-label={`Prompt: ${item.query}`}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon size={14} className="sample-prompt-icon" />
                <span className="sample-prompt-label">{item.label}</span>
              </div>
              <span className="sample-prompt-text">{item.query}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
