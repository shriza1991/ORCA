const fs = require('fs');

let content = fs.readFileSync('src/i18n/translations.ts', 'utf8');

// 1. Duplicate the 'en' config for 'ta' and 'te'
const taStr = `  ta: {
    appTagline: "AI-powered marine safety and operational advisory.",
    evidenceBtn: "View Evidence",
    welcomeTitle: "Fisher Console",
    welcomeSubtitle: "Voice-activated situational awareness",
    samplePromptsTitle: "Try asking:",
    inputPlaceholder: "Type or speak your request...",
    sendBtnAria: "Send message",
    agentsReasoning: "Agent's reasoning:",
    callStatusConnecting: "Connecting...",
    callStatusListening: "Listening...",
    callStatusHearing: "Hearing...",
    callStatusProcessing: "Processing...",
    callStatusSpeaking: "Speaking...",
    callStatusMuted: "Muted",
    callTapToFinish: "Tap to finish",
    callTapToSendNow: "Tap to send now",
    callEndBtn: "End Call",
    callRetryBtn: "Retry Connection",
    callMicDenied: "Microphone access denied",
    callNoSpeech: "No speech detected",
    callDetectedLanguage: "Detected:",
    callSubtitleUser: "You:",
    callSubtitleOrca: "Orca:",
    logoutBtn: "Logout",
    listenBtn: "Listen",
    stopAudioBtn: "Stop Audio",
    hearTheUpdate: "Hear the update",
    planMyTrip: "Plan my trip",
    viewTheMap: "View the map"
  },`;

const teStr = taStr.replace('ta:', 'te:');

content = content.replace(
  'export const TRANSLATIONS: Record<SupportedLanguage, LocaleContent> = {',
  'export const TRANSLATIONS: Record<SupportedLanguage, LocaleContent> = {\n' + taStr + '\n' + teStr
);

fs.writeFileSync('src/i18n/translations.ts', content);
console.log('Fixed TRANSLATIONS in translations.ts');
