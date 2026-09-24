import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  language: 'en' | 'hi' | 'mr';
  onChange: (lang: 'en' | 'hi' | 'mr') => void;
}

const LANGUAGES = [
  { code: 'en' as const, label: 'English' },
  { code: 'hi' as const, label: 'हिंदी' },
  { code: 'mr' as const, label: 'मराठी' },
];

export default function LanguageSelector({ language, onChange }: LanguageSelectorProps) {
  return (
    <div className="language-selector" role="group" aria-label="Language selection">
      <Globe size={14} className="lang-icon" />
      <div className="lang-options">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            className={`lang-btn ${language === lang.code ? 'active' : ''}`}
            onClick={() => onChange(lang.code)}
            aria-pressed={language === lang.code}
          >
            {lang.label}
          </button>
        ))}
      </div>
    </div>
  );
}
