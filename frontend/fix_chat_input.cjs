const fs = require('fs');
let f = fs.readFileSync('src/components/chat/ChatInput.tsx', 'utf8');
f = f.replace('const { t } = useTranslation();', 'const { t: i18nT } = useTranslation();');
f = f.replace(/\{t\('ChatInput.voicedetectedva'/g, "{i18nT('ChatInput.voicedetectedva'");
fs.writeFileSync('src/components/chat/ChatInput.tsx', f);
