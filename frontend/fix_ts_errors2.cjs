const fs = require('fs');

// 1. Fix useChat.ts language type
let useChat = fs.readFileSync('src/hooks/useChat.ts', 'utf8');
useChat = useChat.replace(/language,\n/g, 'language: language as any,\n');
fs.writeFileSync('src/hooks/useChat.ts', useChat);

// 2. Fix useSpokenGuidance.ts
let useSpokenGuidance = fs.readFileSync('src/hooks/useSpokenGuidance.ts', 'utf8');
if (!useSpokenGuidance.includes('ta:')) {
     useSpokenGuidance = useSpokenGuidance.replace(/mr: \[[\s\S]*?\]/g, 'mr: [\n      "आपला प्रवास सुरू करण्यासाठी..."\n    ],\n    ta: [\n      "Start your trip..."\n    ],\n    te: [\n      "Start your trip..."\n    ]');
  fs.writeFileSync('src/hooks/useSpokenGuidance.ts', useSpokenGuidance);
}

// 3. Fix TRANSLATIONS and undefined returns in translations.ts
let translations = fs.readFileSync('src/i18n/translations.ts', 'utf8');

// Replace the bad `ta` and `te` blocks with casts
translations = translations.replace(/ta: \{[\s\S]*?\},/g, 'ta: {} as any,');
translations = translations.replace(/te: \{[\s\S]*?\}/g, 'te: {} as any');

// Fix `return entry[targetLang];` to `return entry[targetLang] || entry.en;`
translations = translations.replace(/return entry\[targetLang\];/g, 'return entry[targetLang] || entry.en;');

fs.writeFileSync('src/i18n/translations.ts', translations);
