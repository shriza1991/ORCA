export type SupportedLanguage = 'en' | 'hi' | 'mr';

export interface PromptTemplate {
  id: string;
  label: string;
  query: string;
}

export interface LocaleContent {
  appTagline: string;
  evidenceBtn: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  samplePromptsTitle: string;
  inputPlaceholder: string;
  sendBtnAria: string;
  agentsReasoning: string;
  viewEvidenceBtn: (count: number) => string;
  statusLabels: Record<string, string>;
  confidenceLabels: Record<string, string>;
  decisiveFactorsTitle: string;
  nextActionLabel: string;
  warningsTitle: string;
  drawerTitleEvidence: string;
  drawerTitleTrace: string;
  drawerEmptyEvidence: string;
  drawerEmptyTrace: string;
  prompts: PromptTemplate[];
  back: string;
  backToStart: string;
  newChat: string;
  chatTitle: string;
  micBtnAria: string;
  micRecordingAria: string;
  micTranscribingAria: string;
  recordingIndicator: string;
  transcribingIndicator: string;
  callSamudraBtn: string;
  callTitle: string;
  callStatusConnecting: string;
  callStatusListening: string;
  callStatusHearing: string;
  callStatusProcessing: string;
  callStatusSpeaking: string;
  callStatusMuted: string;
  callTapToFinish: string;
  callTapToSendNow: string;
  callEndBtn: string;
  callRetryBtn: string;
  callMicDenied: string;
  callNoSpeech: string;
  callDetectedLanguage: string;
  callSubtitleUser: string;
  callSubtitleSamudra: string;
  logoutBtn: string;
  listenBtn: string;
  stopAudioBtn: string;
  hearTheUpdate: string;
  planMyTrip: string;
  viewTheMap: string;
}


export const TRANSLATIONS: Record<SupportedLanguage, LocaleContent> = {
  en: {
    appTagline: 'Smart Autonomous Marine Understanding, Decision & Risk Assistant',
    evidenceBtn: 'Evidence',
    welcomeTitle: 'SAMUDRA Marine Assistant',
    welcomeSubtitle: 'Ask about fishing zones, departure safety, hazards, or route comparisons along the Maharashtra coast.',
    samplePromptsTitle: 'Canonical Evaluation Queries',
    inputPlaceholder: 'Ask about fishing zones, safety, hazards, or routes...',
    sendBtnAria: 'Send query',
    agentsReasoning: 'Agents analyzing ocean models and safety criteria...',
    viewEvidenceBtn: (count: number) => `📋 View ${count} verified evidence source${count > 1 ? 's' : ''}`,
    statusLabels: {
      GO: 'Within assessed limits',
      CAUTION: 'Be careful',
      NO_GO: 'Do not depart',
      UNKNOWN: 'Information unavailable',
      INFORMATIONAL: 'Advisory Only',
      LIVE: 'Live Data',
      CACHED: 'Offline Cached',
      EXPIRED: 'Expired Cache',
    },
    confidenceLabels: {
      HIGH: 'High Confidence',
      MEDIUM: 'Medium Confidence',
      LOW: 'Low Confidence',
    },
    decisiveFactorsTitle: 'Decisive Factors',
    nextActionLabel: 'Recommended Action',
    warningsTitle: 'Operational Alerts & Fallbacks',
    drawerTitleEvidence: 'Verified Evidence',
    drawerTitleTrace: 'Agent Activity & Audit Trail',
    drawerEmptyEvidence: 'No evidence records attached to this response.',
    drawerEmptyTrace: 'No agent trace events logged.',
    prompts: [
      {
        id: 'pfz',
        label: '🐟 Nearest Suggested Fishing Area',
        query: 'Where is the nearest suggested fishing area today from Ratnagiri?',
      },
      {
        id: 'safety',
        label: '⚓ Departure Safety Check',
        query: 'Is it safe to leave tomorrow at 6 AM from Ratnagiri?',
      },
      {
        id: 'hazard',
        label: '⚠️ Restricted Area & Hazard Alert',
        query: 'Any cyclone, lightning or restricted-water risk on this trip?',
      },
      {
        id: 'route',
        label: '🧭 Safe Route Comparison',
        query: 'Which route from Ratnagiri to the PFZ has the lowest risk?',
      },
    ],
    back: 'Back',
    backToStart: 'Back to Start',
    newChat: 'New Query',
    chatTitle: 'Maritime Consultation',
    micBtnAria: 'Record voice query',
    micRecordingAria: 'Stop recording and transcribe',
    micTranscribingAria: 'Transcribing voice audio...',
    recordingIndicator: 'Recording voice...',
    transcribingIndicator: 'Transcribing...',
    callSamudraBtn: 'Call SAMUDRA',
    callTitle: 'SAMUDRA Voice Call',
    callStatusConnecting: 'Connecting call...',
    callStatusListening: 'Listening... (Speak naturally)',
    callStatusHearing: 'Hearing you... (Speaking)',
    callStatusProcessing: 'SAMUDRA is analyzing...',
    callStatusSpeaking: 'SAMUDRA is speaking...',
    callStatusMuted: 'Microphone Muted',
    callTapToFinish: 'Done Speaking',
    callTapToSendNow: 'Send Now (Skip pause)',
    callEndBtn: 'End Call',
    callRetryBtn: 'Try Again',
    callMicDenied: 'Microphone permission denied. Please allow microphone access to talk with SAMUDRA.',
    callNoSpeech: 'No speech detected. Please speak into your microphone.',
    callDetectedLanguage: 'Detected Language',
    callSubtitleUser: 'You',
    callSubtitleSamudra: 'SAMUDRA',
    logoutBtn: 'Logout',
    listenBtn: 'Listen',
    stopAudioBtn: 'Stop',
    hearTheUpdate: 'Hear the update',
    planMyTrip: 'Plan my trip',
    viewTheMap: 'View the map',
  },
  hi: {
    appTagline: 'स्मार्ट स्वायत्त सागरी समझ, निर्णय और जोखिम सहायक',
    evidenceBtn: 'साक्ष्य एवं प्रमाण',
    welcomeTitle: 'समुद्र (SAMUDRA) सागरी सहायक',
    welcomeSubtitle: 'महाराष्ट्र तट पर मत्स्य क्षेत्र, प्रस्थान सुरक्षा, मौसम के खतरे या सुरक्षित मार्गों के बारे में पूछें।',
    samplePromptsTitle: 'मानक परीक्षण प्रश्न (Canonical Queries)',
    inputPlaceholder: 'मत्स्य क्षेत्र, सुरक्षा, मौसम के खतरे या सुरक्षित मार्ग के बारे में पूछें...',
    sendBtnAria: 'प्रश्न भेजें',
    agentsReasoning: 'एजेंट समुद्री डेटा और सुरक्षा मानकों का विश्लेषण कर रहे हैं...',
    viewEvidenceBtn: (count: number) => `📋 ${count} सत्यापित साक्ष्य स्रोत देखें`,
    statusLabels: {
      GO: 'प्रस्थान सुरक्षित है',
      CAUTION: 'सावधान रहें',
      NO_GO: 'प्रस्थान न करें',
      UNKNOWN: 'जानकारी अनुपलब्ध है',
      INFORMATIONAL: 'सूचनात्मक — केवल परामर्श',
      LIVE: 'लाइव डेटा',
      CACHED: 'ऑफ़लाइन सहेजा गया',
      EXPIRED: 'समय सीमा समाप्त',
    },
    confidenceLabels: {
      HIGH: 'उच्च आत्मविश्वास',
      MEDIUM: 'मध्यम आत्मविश्वास',
      LOW: 'निम्न आत्मविश्वास',
    },
    decisiveFactorsTitle: 'प्रमुख निर्णायक कारक',
    nextActionLabel: 'अनुशंसित अगली कार्रवाई',
    warningsTitle: 'परिचालन चेतावनी एवं सूचनाएं',
    drawerTitleEvidence: 'सत्यापित साक्ष्य एवं डेटा स्रोत',
    drawerTitleTrace: 'एजेंट गतिविधि एवं ऑडिट ट्रेल',
    drawerEmptyEvidence: 'इस उत्तर के साथ कोई साक्ष्य संलग्न नहीं है।',
    drawerEmptyTrace: 'कोई एजेंट ट्रेस रिकॉर्ड उपलब्ध नहीं है।',
    prompts: [
      {
        id: 'pfz',
        label: '🐟 निकटतम मत्स्य क्षेत्र (PFZ)',
        query: 'रत्नागिरी से आज सबसे निकटतम संभावित मत्स्य क्षेत्र (PFZ) कहाँ है?',
      },
      {
        id: 'safety',
        label: '⚓ प्रस्थान सुरक्षा जांच',
        query: 'क्या कल सुबह ६ बजे रत्नागिरी से प्रस्थान करना सुरक्षित है?',
      },
      {
        id: 'hazard',
        label: '⚠️ समुद्री खतरे एवं अलर्ट',
        query: 'क्या इस यात्रा में चक्रवात या खराब मौसम का कोई जोखिम है?',
      },
      {
        id: 'route',
        label: '🧭 सुरक्षित मार्ग तुलना',
        query: 'रत्नागिरी से PFZ के लिए कौन सा समुद्री मार्ग सबसे सुरक्षित है?',
      },
    ],
    back: 'वापस',
    backToStart: 'शुरुआत पर वापस',
    newChat: 'नया प्रश्न',
    chatTitle: 'सागरीय परामर्श',
    micBtnAria: 'आवाज इनपुट (वॉयस रिकॉर्ड)',
    micRecordingAria: 'रिकॉर्डिंग रोकें और रूपांतरित करें',
    micTranscribingAria: 'आवाज रूपांतरित हो रही है...',
    recordingIndicator: 'आवाज रिकॉर्ड हो रही है...',
    transcribingIndicator: 'पहचाना जा रहा है...',
    callSamudraBtn: 'समुद्र को कॉल करें',
    callTitle: 'समुद्र (SAMUDRA) वॉयस कॉल',
    callStatusConnecting: 'कॉल कनेक्ट हो रहा है...',
    callStatusListening: 'सुन रहा है... (अपनी भाषा में बोलें)',
    callStatusHearing: 'आपकी आवाज सुनी जा रही है... (बोलते रहें)',
    callStatusProcessing: 'समुद्र विश्लेषण कर रहा है...',
    callStatusSpeaking: 'समुद्र उत्तर दे रहा है...',
    callStatusMuted: 'माइक बंद (Muted)',
    callTapToFinish: 'बोलना समाप्त',
    callTapToSendNow: 'तुरंत भेजें',
    callEndBtn: 'कॉल समाप्त करें',
    callRetryBtn: 'पुनः प्रयास करें',
    callMicDenied: 'माइक्रोफ़ोन की अनुमति अस्वीकृत की गई। कृपया माइक्रोफ़ोन की अनुमति दें।',
    callNoSpeech: 'कोई आवाज नहीं सुनाई दी। कृपया माइक में बोलें।',
    callDetectedLanguage: 'पहचानी गई भाषा',
    callSubtitleUser: 'आप',
    callSubtitleSamudra: 'समुद्र (SAMUDRA)',
    logoutBtn: 'लॉग आउट',
    listenBtn: 'सुनें',
    stopAudioBtn: 'रोकें',
    hearTheUpdate: 'अपडेट सुनें',
    planMyTrip: 'मेरी यात्रा की योजना बनाएं',
    viewTheMap: 'मानचित्र देखें',
  },
  mr: {
    appTagline: 'स्मार्ट स्वायत्त सागरी आकलन, निर्णय आणि जोखीम सहाय्यक',
    evidenceBtn: 'सागरी पुरावा',
    welcomeTitle: 'समुद्र (SAMUDRA) सागरी सहाय्यक',
    welcomeSubtitle: 'कोकण व महाराष्ट्र किनारपट्टीवरील मासेमारी क्षेत्र, प्रस्थान सुरक्षितता, सागरी धोके किंवा सुरक्षित मार्गांबद्दल विचारा.',
    samplePromptsTitle: 'प्रामाणिक सागरी प्रश्न (Canonical Queries)',
    inputPlaceholder: 'मासेमारी क्षेत्र, सुरक्षितता, हवामानाचे धोके किंवा मार्गाबद्दल विचारा...',
    sendBtnAria: 'प्रश्न पाठवा',
    agentsReasoning: 'एजंट सागरी परिस्थिती आणि सुरक्षितता नियमांचे विश्लेषण करत आहेत...',
    viewEvidenceBtn: (count: number) => `📋 ${count} पडताळलेले अधिकृत पुरावे पहा`,
    statusLabels: {
      GO: 'प्रस्थान सुरक्षित आहे',
      CAUTION: 'काळजी घ्या',
      NO_GO: 'प्रस्थान करू नका',
      UNKNOWN: 'माहिती उपलब्ध नाही',
      INFORMATIONAL: 'माहितीपूर्ण — केवळ मार्गदर्शन',
      LIVE: 'थेट डेटा',
      CACHED: 'ऑफलाइन जतन केले',
      EXPIRED: 'कालबाह्य',
    },
    confidenceLabels: {
      HIGH: 'उच्च विश्वासार्हता',
      MEDIUM: 'मध्यम विश्वासार्हता',
      LOW: 'कमी विश्वासार्हता',
    },
    decisiveFactorsTitle: 'महत्त्वाचे निर्णायक घटक',
    nextActionLabel: 'पुढील कृती सल्ला',
    warningsTitle: 'सागरी सतर्कता सूचना व पर्यायी नोंदी',
    drawerTitleEvidence: 'पडताळलेले अधिकृत पुरावे (INCOIS / IMD)',
    drawerTitleTrace: 'एजंट कृती इतिहास व ऑडिट ट्रेल',
    drawerEmptyEvidence: 'या सल्ल्यासोबत कोणताही पुरावा जोडलेला नाही.',
    drawerEmptyTrace: 'कोणतीही एजंट नोंद उपलब्ध नाही.',
    prompts: [
      {
        id: 'pfz',
        label: '🐟 जवळचे मासेमारी क्षेत्र (PFZ)',
        query: 'रत्नागिरी जवळ सर्वात जवळचे संभाव्य मत्स्य क्षेत्र (PFZ) कुठे आहे?',
      },
      {
        id: 'safety',
        label: '⚓ प्रस्थान सुरक्षितता तपासणी',
        query: 'उद्या सकाळी ६ वाजता रत्नागिरीतून मासेमारीला जाणे सुरक्षित आहे का?',
      },
      {
        id: 'hazard',
        label: '⚠️ चक्रीवादळ व भू-कुंपण धोका',
        query: 'या प्रवासात चक्रीवादळ, वीज किंवा प्रतिबंधित सागरी क्षेत्राचा काही धोका आहे का?',
      },
      {
        id: 'route',
        label: '🧭 सुरक्षित सागरी मार्ग तुलना',
        query: 'रत्नागिरीवरून कोणता सागरी मार्ग सर्वात सुरक्षित आहे?',
      },
    ],
    back: 'मागे',
    backToStart: 'सुरुवातीस जा',
    newChat: 'नवीन प्रश्न',
    chatTitle: 'सागरी सल्लागार',
    micBtnAria: 'आवाज इनपुट (व्हॉइस रेकॉर्ड)',
    micRecordingAria: 'रेकॉर्डिंग थांबवा आणि पाठवा',
    micTranscribingAria: 'आवाज रूपांतरित होत आहे...',
    recordingIndicator: 'आवाज रेकॉर्ड होत आहे...',
    transcribingIndicator: 'ओळखले जात आहे...',
    callSamudraBtn: 'समुद्रला कॉल करा',
    callTitle: 'समुद्र (SAMUDRA) थेट व्हॉइस कॉल',
    callStatusConnecting: 'कॉल जोडला जात आहे...',
    callStatusListening: 'ऐकत आहे... (तुमच्या भाषेत बोला)',
    callStatusHearing: 'तुमचा आवाज ऐकत आहे... (बोलणे सुरू ठेवा)',
    callStatusProcessing: 'समुद्र माहिती तपासत आहे...',
    callStatusSpeaking: 'समुद्र उत्तर देत आहे...',
    callStatusMuted: 'माईक म्यूट (बंद)',
    callTapToFinish: 'बोलून झाले',
    callTapToSendNow: 'त्वरीत पाठवा',
    callEndBtn: 'कॉल संपवा',
    callRetryBtn: 'पुन्हा प्रयत्न करा',
    callMicDenied: 'मायक्रोफोनची परवानगी नाकारली आहे. कृपया ब्राउझरमध्ये मायक्रोफोन सुरू करा.',
    callNoSpeech: 'कोणताही आवाज ऐकू आला नाही. कृपया माईकमध्ये बोला.',
    callDetectedLanguage: 'ओळखलेली भाषा',
    callSubtitleUser: 'तुम्ही',
    callSubtitleSamudra: 'समुद्र (SAMUDRA)',
    logoutBtn: 'लॉग आउट करा',
    listenBtn: 'ऐका',
    stopAudioBtn: 'थांबा',
    hearTheUpdate: 'अपडेट ऐका',
    planMyTrip: 'माझ्या सहलीचे नियोजन करा',
    viewTheMap: 'नकाशा पहा',
  },
};


/**
 * Canonical phrase mapping dictionary for cross-lingual message translation.
 */
interface TranslationEntry {
  en: string;
  hi: string;
  mr: string;
}

export const CANONICAL_TRANSLATION_MAP: TranslationEntry[] = [
  // --- MarineWatch Translations ---
  { en: "Portal", hi: "पोर्टल", mr: "पोर्टल" },
  { en: "Return to Main Portal", hi: "मुख्य पोर्टल पर वापस लौटें", mr: "मुख्य पोर्टलवर परत जा" },
  { en: "India MarineWatch", hi: "इंडिया मरीनवॉच", mr: "इंडिया मरीनवॉच" },
  { en: "National Ocean Intelligence", hi: "राष्ट्रीय महासागर खुफिया", mr: "राष्ट्रीय महासागर बुद्धिमत्ता" },
  { en: "Pilot Region:", hi: "पायलट क्षेत्र:", mr: "पायलट क्षेत्र:" },
  { en: "Maharashtra & Goa Coastal Shelf", hi: "महाराष्ट्र और गोवा तटीय शेल्फ", mr: "महाराष्ट्र आणि गोवा किनारी शेल्फ" },
  { en: "Syncing…", hi: "सिंक हो रहा है…", mr: "सिंक होत आहे…" },
  { en: "OceanWatch (GIS)", hi: "ओशनवॉच (जीआईएस)", mr: "ओशनवॉच (जीआयएस)" },
  { en: "FisherWatch", hi: "फिशरवॉच", mr: "फिशरवॉच" },
  { en: "AquaWatch", hi: "एक्वावॉच", mr: "एक्वावॉच" },
  { en: "Marine Hazards", hi: "समुद्री खतरे", mr: "सागरी धोके" },
  { en: "PortWatch", hi: "पोर्टवॉच", mr: "पोर्टवॉच" },
  { en: "Data Catalogue (§212)", hi: "डेटा कैटलॉग (§212)", mr: "डेटा कॅटलॉग (§212)" },
  { en: "AquaWatch module initializing...", hi: "एक्वावॉच मॉड्यूल प्रारंभ हो रहा है...", mr: "एक्वावॉच मॉड्यूल सुरू होत आहे..." },
  { en: "Hazards detail view initializing...", hi: "खतरों का विवरण दृश्य प्रारंभ हो रहा है...", mr: "धोके तपशील दृश्य सुरू होत आहे..." },
  { en: "PortWatch detail view initializing...", hi: "पोर्टवॉच विवरण दृश्य प्रारंभ हो रहा है...", mr: "पोर्टवॉच तपशील दृश्य सुरू होत आहे..." },
  { en: "Auto-refresh active (30s) — click to pause", hi: "ऑटो-रिफ्रेश सक्रिय (30s) - रोकने के लिए क्लिक करें", mr: "ऑटो-रिफ्रेश सक्रिय (30s) - थांबवण्यासाठी क्लिक करा" },
  { en: "Auto-refresh paused — click to resume", hi: "ऑटो-रिफ्रेश रुका हुआ है - फिर से शुरू करने के लिए क्लिक करें", mr: "ऑटो-रिफ्रेश थांबवले आहे - पुन्हा सुरू करण्यासाठी क्लिक करा" },
  { en: "LIVE TELEMETRY", hi: "लाइव टेलीमेट्री", mr: "लाइव्ह टेलिमेट्री" },
  { en: "PAUSED", hi: "रुका हुआ", mr: "थांबवले" },
  { en: "Map View", hi: "मानचित्र दृश्य", mr: "नकाशा दृश्य" },
  { en: "Map", hi: "नक्शा", mr: "नकाशा" },
  { en: "List View", hi: "सूची दृश्य", mr: "सूची दृश्य" },
  { en: "List", hi: "सूची", mr: "सूची" },
  { en: "Forecast Horizon:", hi: "पूर्वानुमान क्षितिज:", mr: "अंदाज क्षितिज:" },
  { en: "Now", hi: "अभी", mr: "आता" },
  { en: "+3h", hi: "+3 घंटे", mr: "+3 तास" },
  { en: "+6h", hi: "+6 घंटे", mr: "+6 तास" },
  { en: "+12h", hi: "+12 घंटे", mr: "+12 तास" },
  { en: "+24h", hi: "+24 घंटे", mr: "+24 तास" },
  { en: "+48h", hi: "+48 घंटे", mr: "+48 तास" },
  { en: "LAYER REGISTRY (ALL INDIA)", hi: "परत रजिस्ट्री (संपूर्ण भारत)", mr: "स्तर नोंदणी (संपूर्ण भारत)" },
  { en: "Wave & Swell (INCOIS)", hi: "लहर और उफान (INCOIS)", mr: "लाट आणि सूज (INCOIS)" },
  { en: "Potential Fishing Zones", hi: "संभावित मछली पकड़ने के क्षेत्र", mr: "संभाव्य मासेमारी क्षेत्रे" },
  { en: "CMFRI Landing Centres", hi: "CMFRI लैंडिंग केंद्र", mr: "CMFRI लँडिंग केंद्रे" },
  { en: "DGLL Lighthouses", hi: "DGLL प्रकाश स्तंभ", mr: "DGLL दीपगृहे" },
  { en: "CAA Coastal Aquaculture", hi: "CAA तटीय जलीय कृषि", mr: "CAA किनारी जलचर पालन" },
  { en: "12nm / 200nm & Marine Parks", hi: "12nm / 200nm और समुद्री पार्क", mr: "12nm / 200nm आणि सागरी उद्याने" },
  { en: "GEBCO Depth Contours", hi: "GEBCO गहराई रूपरेखा", mr: "GEBCO खोली रूपरेषा" },
  { en: "Active Hazard Zones", hi: "सक्रिय खतरा क्षेत्र", mr: "सक्रिय धोक्याचे क्षेत्र" },
  { en: "UNIFIED MARITIME INTELLIGENCE", hi: "एकीकृत समुद्री खुफिया", mr: "एकात्मिक सागरी बुद्धिमत्ता" },
  { en: "Querying…", hi: "खोज रहा है…", mr: "शोधत आहे…" },
  { en: "GEBCO BATHYMETRY & SHELF", hi: "GEBCO बाथिमेट्री और शेल्फ", mr: "GEBCO बाथिमेट्री आणि शेल्फ" },
  { en: "m depth", hi: "मीटर गहराई", mr: "मीटर खोली" },
  { en: "Distance to coast:", hi: "तट से दूरी:", mr: "किनाऱ्यापासूनचे अंतर:" },
  { en: "nearest:", hi: "निकटतम:", mr: "जवळचे:" },
  { en: "INCOIS PREDICTED TIDE (PAT)", hi: "INCOIS अनुमानित ज्वार (PAT)", mr: "INCOIS अंदाजित भरती-ओहोटी (PAT)" },
  { en: "Elevation Above Chart Datum", hi: "चार्ट डेटम के ऊपर ऊंचाई", mr: "चार्ट डेटमच्या वरील उंची" },
  { en: "Station:", hi: "स्टेशन:", mr: "स्थानक:" },
  { en: "Next High Water", hi: "अगला उच्च ज्वार", mr: "पुढील उच्च भरती" },
  { en: "Next Low Water", hi: "अगला निम्न ज्वार", mr: "पुढील कमी ओहोटी" },
  { en: "INCOIS OSF / HIGH-RES MARINE", hi: "INCOIS OSF / उच्च-रिज़ॉल्यूशन समुद्री", mr: "INCOIS OSF / उच्च-रिझोल्यूशन सागरी" },
  { en: "Wave Height", hi: "लहर की ऊंचाई", mr: "लाटेची उंची" },
  { en: "SST", hi: "समुद्र की सतह का तापमान", mr: "समुद्र पृष्ठभाग तापमान" },
  { en: "Wind Speed", hi: "हवा की गति", mr: "वाऱ्याचा वेग" },
  { en: "Swell Period", hi: "उफान की अवधि", mr: "सूज कालावधी" },
  {
    en: 'Cannot assess due to missing data. Check source status.',
    hi: 'डेटा गायब होने के कारण मूल्यांकन नहीं किया जा सकता। स्रोत की स्थिति जांचें।',
    mr: 'डेटा नसल्यामुळे मूल्यमापन करता येत नाही. स्रोताची स्थिती तपासा.',
  },
  {
    en: 'Internal evaluation error occurred.',
    hi: 'आंतरिक मूल्यांकन त्रुटि हुई।',
    mr: 'अंतर्गत मूल्यमापन त्रुटी आली.',
  },
  {
    en: 'Missing critical inputs: Must provide either harbor or explicit starting coordinates.',
    hi: 'महत्वपूर्ण इनपुट गायब: बंदरगाह या स्पष्ट प्रारंभिक निर्देशांक प्रदान करना चाहिए।',
    mr: 'महत्त्वाचे इनपुट गहाळ: बंदर किंवा स्पष्ट प्रारंभिक निर्देशांक देणे आवश्यक आहे.',
  },
  {
    en: 'Checking current marine conditions…',
    hi: 'वर्तमान समुद्री स्थितियों की जाँच की जा रही है…',
    mr: 'सध्याची सागरी परिस्थिती तपासत आहे…',
  },
  {
    en: 'Unable to obtain a current safety assessment.',
    hi: 'वर्तमान सुरक्षा मूल्यांकन प्राप्त करने में असमर्थ।',
    mr: 'सध्याचे सुरक्षिततेचे मूल्यमापन प्राप्त करण्यात अक्षम.',
  },
  {
    en: 'No current safety assessment available.',
    hi: 'कोई वर्तमान सुरक्षा मूल्यांकन उपलब्ध नहीं है।',
    mr: 'सध्याचे कोणतेही सुरक्षिततेचे मूल्यमापन उपलब्ध नाही.',
  },
  {
    en: 'No operational summary available.',
    hi: 'कोई परिचालन सारांश उपलब्ध नहीं है।',
    mr: 'कोणताही परिचलनात्मक सारांश उपलब्ध नाही.',
  },
  {
    en: 'Evaluated Window:',
    hi: 'मूल्यांकन अवधि:',
    mr: 'मूल्यमापन कालावधी:',
  },
  {
    en: 'Assessment Time:',
    hi: 'मूल्यांकन का समय:',
    mr: 'मूल्यमापनाची वेळ:',
  },
  {
    en: 'Waves',
    hi: 'लहरें',
    mr: 'लाटा',
  },
  {
    en: 'Wind',
    hi: 'हवा',
    mr: 'वारा',
  },
  {
    en: 'Visibility',
    hi: 'दृश्यता',
    mr: 'दृश्यमानता',
  },
  {
    en: 'Tide',
    hi: 'ज्वार',
    mr: 'भरती-ओहोटी',
  },
  {
    en: 'Based on forecast',
    hi: 'पूर्वानुमान पर आधारित',
    mr: 'हवामानाच्या अंदाजावर आधारित',
  },
  {
    en: 'Based on current observation',
    hi: 'वर्तमान अवलोकन पर आधारित',
    mr: 'सध्याच्या निरीक्षणावर आधारित',
  },
  {
    en: 'No Active Hazards',
    hi: 'कोई सक्रिय खतरा नहीं',
    mr: 'कोणतेही सक्रिय धोके नाहीत',
  },
  {
    en: 'Status Unknown',
    hi: 'स्थिति अज्ञात',
    mr: 'स्थिती अज्ञात',
  },
  {
    en: 'Elevated Hazard',
    hi: 'बढ़ा हुआ खतरा',
    mr: 'वाढलेला धोका',
  },
  {
    en: 'Hazard Alert',
    hi: 'खतरे का अलर्ट',
    mr: 'धोक्याचा इशारा',
  },
  {
    en: 'What is happening:',
    hi: 'क्या हो रहा है:',
    mr: 'काय घडत आहे:',
  },
  {
    en: 'Does it affect this trip?',
    hi: 'क्या यह इस यात्रा को प्रभावित करता है?',
    mr: 'याचा या प्रवासावर परिणाम होतो का?',
  },
  {
    en: 'Yes, it directly affects your planned route.',
    hi: 'हां, यह आपके नियोजित मार्ग को सीधे प्रभावित करता है।',
    mr: 'होय, याचा तुमच्या नियोजित मार्गावर थेट परिणाम होतो.',
  },
  {
    en: 'What to do next:',
    hi: 'आगे क्या करना है:',
    mr: 'पुढे काय करावे:',
  },
  {
    en: 'Do not depart. Await further clearance.',
    hi: 'प्रस्थान न करें। आगे की मंजूरी की प्रतीक्षा करें।',
    mr: 'निघू नका. पुढील मंजुरीची प्रतीक्षा करा.',
  },
  {
    en: 'Hear the official advisory',
    hi: 'आधिकारिक सलाह सुनें',
    mr: 'अधिकृत सल्ला ऐका',
  },
  {
    en: 'Alert',
    hi: 'अलर्ट',
    mr: 'इशारा',
  },
  {
    en: 'affects your planned trip. Do not depart.',
    hi: 'आपकी यात्रा को प्रभावित करता है। प्रस्थान न करें।',
    mr: 'तुमच्या नियोजित प्रवासावर परिणाम करतो. निघू नका.',
  },
  {
    en: 'Conditions are within safe operating limits.',
    hi: 'स्थितियां सुरक्षित परिचालन सीमा के भीतर हैं।',
    mr: 'स्थिती सुरक्षित ऑपरेटिंग मर्यादेत आहे.',
  },
  {
    en: 'Conditions exceed safety limits.',
    hi: 'स्थितियां सुरक्षा सीमा से अधिक हैं।',
    mr: 'स्थिती सुरक्षिततेच्या मर्यादेपेक्षा जास्त आहे.',
  },
  {
    en: 'A safety recommendation is not available from the current evidence.',
    hi: 'वर्तमान साक्ष्य से सुरक्षा अनुशंसा उपलब्ध नहीं है।',
    mr: 'सध्याच्या पुराव्यावरून सुरक्षिततेची शिफारस उपलब्ध नाही.',
  },
  // Sample Prompts
  {
    en: 'Where is the nearest Potential Fishing Zone today from Ratnagiri?',
    hi: 'रत्नागिरी से आज सबसे निकटतम संभावित मत्स्य क्षेत्र (PFZ) कहाँ है?',
    mr: 'रत्नागिरी जवळ सर्वात जवळचे संभाव्य मत्स्य क्षेत्र (PFZ) कुठे आहे?',
  },
  {
    en: 'Is it safe to leave tomorrow at 6 AM from Ratnagiri?',
    hi: 'क्या कल सुबह 6 बजे रत्नागिरी से मछली पकड़ने जाना सुरक्षित है?',
    mr: 'उद्या सकाळी ६ वाजता रत्नागिरीहून मासेमारीसाठी जाणे सुरक्षित आहे का?',
  },
  {
    en: 'Any cyclone, lightning or restricted-water risk on this trip?',
    hi: 'क्या इस यात्रा में चक्रवात, बिजली या प्रतिबंधित क्षेत्र का कोई खतरा है?',
    mr: 'या प्रवासात चक्रीवादळ, वीज किंवा प्रतिबंधित सागरी क्षेत्राचा काही धोका आहे का?',
  },
  {
    en: 'Which route from Ratnagiri to the PFZ has the lowest risk?',
    hi: 'रत्नागिरी से PFZ के लिए कौन सा समुद्री मार्ग सबसे सुरक्षित है?',
    mr: 'रत्नागिरीवरून कोणता सागरी मार्ग सर्वात सुरक्षित आहे?',
  },

  // Canonical Assistant Answers
  {
    en: 'The nearest Potential Fishing Zone is approximately 42.6 km southwest of Ratnagiri Harbor, bearing 245°. The zone shows favorable SST (28.4°C) and chlorophyll-a concentration (1.2 mg/m³).',
    hi: 'रत्नागिरी बंदरगाह से दक्षिण-पश्चिम में लगभग 42.6 किमी (दिशा 245°) की दूरी पर निकटतम संभावित मत्स्य क्षेत्र (PFZ) स्थित है। अनुकूल समुद्री सतह तापमान (28.4°C) और क्लोरोफिल-ए (1.2 mg/m³) दर्ज किया गया है।',
    mr: 'रत्नागिरी बंदरापासून नैऋत्येस अंदाजे 42.6 किमी (दिशा 245°) अंतरावर संभाव्य मत्स्य क्षेत्र (PFZ) आढळले आहे. अनुकूल सागरी पृष्ठभाग तापमान (28.4°C) आणि क्लोरोफिल-ए (1.2 mg/m³) नोंदवले गेले आहे.',
  },
  {
    en: 'Departure from Ratnagiri tomorrow at 06:00 is advised against (NO-GO). Severe sea state with significant wave heights of 3.4m and active IMD squall alert.',
    hi: 'रत्नागिरी से कल सुबह 06:00 बजे प्रस्थान न करने की सख्त सलाह दी जाती है (NO-GO)। समुद्र में 3.4 मीटर की खतरनाक लहरें और IMD द्वारा जारी सक्रिय तूफान की चेतावनी प्रभावी है।',
    mr: 'रत्नागिरीवरून उद्या सकाळी 06:00 वाजता प्रस्थान न करण्याचा सल्ला दिला जात आहे (NO-GO). 3.4 मीटरच्या धोकादायक लाटा आणि IMD ची सक्रिय वादळी चेतावणी सुरू आहे.',
  },
  {
    en: 'Coastal hazard alert: Active IMD squall advisory across Ratnagiri coastal waters. Keep clear of restricted naval boundary zones.',
    hi: 'तटीय चेतावनी: रत्नागिरी के तटीय जलक्षेत्र में IMD की तेज हवाओं और तूफान की सक्रिय चेतावनी। नौसैनिक प्रतिबंधित सीमा क्षेत्रों से दूर रहें।',
    mr: 'किनारपट्टी धोक्याचा इशारा: रत्नागिरी सागरी क्षेत्रात IMD चा वादळी वारे इशारा लागू आहे. प्रतिबंधित नौदल सीमा क्षेत्रांपासून दूर राहा.',
  },
  {
    en: 'Route Comparison: Recommended Route 1 via coastal passage has lowest cumulative risk. Deep-sea route crosses elevated wave height corridor.',
    hi: 'मार्ग तुलना: तटीय मार्ग 1 सबसे कम संचयी जोखिम वाला अनुशंसित मार्ग है। गहरे समुद्र का मार्ग ऊंची लहरों के गलियारे से होकर गुजरता है।',
    mr: 'मार्ग तुलना: किनारपट्टी मार्ग 1 हा सर्वात कमी धोक्याचा शिफारस केलेला मार्ग आहे. खोल समुद्राचा मार्ग उंच लाटांच्या पट्ट्यातून जातो.',
  },

  // Mission Twin & Operational Corridors
  {
    en: 'Mission Twin',
    hi: 'मिशन ट्विन',
    mr: 'मिशन ट्विन',
  },
  {
    en: 'What-If Simulation',
    hi: 'काल्पनिक परिस्थिति सिमुलेशन (What-If)',
    mr: 'पर्यायी परिस्थिती मॉडेलिंग (What-If)',
  },
  {
    en: 'Safest Corridor',
    hi: 'सुरक्षिततम गलियारा (न्यूनतम जोखिम)',
    mr: 'सर्वात सुरक्षित सागरी मार्ग (किमान धोका)',
  },
  {
    en: 'Balanced Corridor',
    hi: 'संतुलित मार्ग',
    mr: 'संतुलित सागरी मार्ग',
  },
  {
    en: 'Direct Passage',
    hi: 'सीधा मार्ग',
    mr: 'थेट जलमार्ग',
  },
  {
    en: 'Run What-If Simulation',
    hi: 'सिमुलेशन प्रारंभ करें',
    mr: 'सिम्युलेशन सुरू करा',
  },
  {
    en: 'Counterfactual Decision Impact',
    hi: 'निर्णय प्रभाव विश्लेषण',
    mr: 'निर्णयावरील संभाव्य परिणाम',
  },

  // Decisive factors
  {
    en: 'Significant wave height 3.4m exceeds craft safety ceiling (2.5m)',
    hi: 'महत्वपूर्ण लहर ऊंचाई 3.4 मी शिल्प सुरक्षा सीमा (2.5 मी) से अधिक है',
    mr: 'महत्त्वाची लाट उंची 3.4 मी बोटीच्या सुरक्षा मर्यादेपेक्षा (2.5 मी) जास्त आहे',
  },
  {
    en: 'IMD coastal squall warning active across Konkan coast until 14:00 tomorrow',
    hi: 'कल दोपहर 14:00 बजे तक कोंकण तट पर IMD तटीय तूफान चेतावनी सक्रिय',
    mr: 'उद्या दुपारी 14:00 वाजेपर्यंत कोकण किनारपट्टीवर IMD किनारपट्टी वादळी चेतावणी सक्रिय',
  },
  {
    en: 'PFZ zone PFZ-MH-20260905-01 identified 42.6 km from harbor',
    hi: 'बंदरगाह से 42.6 किमी की दूरी पर मत्स्य क्षेत्र PFZ-MH-20260905-01 चिन्हित',
    mr: 'बंदरापासून 42.6 किमी अंतरावर PFZ-MH-20260905-01 मत्स्य क्षेत्र निश्चित',
  },
  {
    en: 'Sea conditions within safe operational limits',
    hi: 'समुद्री स्थितियां सुरक्षित परिचालन सीमा के भीतर हैं',
    mr: 'सागरी परिस्थिती सुरक्षित कार्य मर्यादेत आहे',
  },
  {
    en: 'SST 28.4°C favorable for target species',
    hi: 'लक्षित प्रजातियों के लिए समुद्री तापमान (28.4°C) अनुकूल है',
    mr: 'माशांच्या प्रजातींसाठी सागरी पृष्ठभाग तापमान (28.4°C) अनुकूल आहे',
  },

  // Recommendations & Next Actions
  {
    en: 'High risk of craft swamping due to elevated wave heights and squall conditions.',
    hi: 'ऊंची लहरों और तेज तूफान के कारण नाव पलटने का अत्यधिक जोखिम।',
    mr: 'उंच लाटा आणि वादळी परिस्थितीमुळे बोट उलटण्याचा मोठा धोका.',
  },
  {
    en: 'Favorable conditions for fishing trip to nearest PFZ.',
    hi: 'निकटतम मत्स्य क्षेत्र की यात्रा के लिए अनुकूल और सुरक्षित स्थितियां।',
    mr: 'जवळच्या मत्स्य क्षेत्राच्या मासेमारी प्रवासासाठी अनुकूल परिस्थिती.',
  },
  {
    en: 'Postpone departure until wave heights abate below 2.0m (expected after 18:00 tomorrow).',
    hi: 'लहरों की ऊंचाई 2.0 मीटर से नीचे आने तक प्रस्थान स्थगित करें (कल 18:00 के बाद अपेक्षित)।',
    mr: 'लाटांची उंची 2.0 मीटरपेक्षा कमी होईपर्यंत प्रस्थान पुढे ढकला (उद्या संध्याकाळी 18:00 नंतर अपेक्षित).',
  },
  {
    en: 'Proceed with trip planning. Check departure safety before leaving.',
    hi: 'यात्रा योजना के साथ आगे बढ़ें। प्रस्थान करने से पहले सुरक्षा स्थिति पुनः जांचें।',
    mr: 'प्रवासाचे नियोजन सुरू करा. निघण्यापूर्वी प्रस्थान सुरक्षिततेची खात्री करा.',
  },

  // Suggested Followups
  {
    en: 'When will sea conditions improve?',
    hi: 'समुद्र की स्थिति कब सुधरेगी?',
    mr: 'सागरी परिस्थिती कधी सुधारेल?',
  },
  {
    en: 'Alternative sheltered route options',
    hi: 'तट के पास सुरक्षित वैकल्पिक मार्ग',
    mr: 'पर्यायी सुरक्षित/आश्रय असलेले सागरी मार्ग',
  },
  {
    en: 'Port authority emergency contacts',
    hi: 'पत्तन प्राधिकरण आपातकालीन संपर्क',
    mr: 'बंदर प्राधिकरण आणीबाणी संपर्क',
  },
  {
    en: 'Check weather conditions at PFZ',
    hi: 'मत्स्य क्षेत्र (PFZ) पर मौसम की स्थिति जांचें',
    mr: 'मत्स्य क्षेत्रातील हवामान स्थिती तपासा',
  },
  {
    en: 'Safe navigation route to PFZ',
    hi: 'PFZ के लिए सुरक्षित नौवहन मार्ग',
    mr: 'PFZ साठी सुरक्षित सागरी मार्ग',
  },
  {
    en: 'Nearest landing center',
    hi: 'निकटतम लैंडिंग केंद्र/बंदरगाह',
    mr: 'जवळचे लँडिंग केंद्र/बंदर',
  },
  {
    en: 'Weather forecast on recommended route',
    hi: 'अनुशंसित मार्ग पर मौसम पूर्वानुमान',
    mr: 'शिफारस केलेल्या मार्गावरील हवामान अंदाज',
  },
  {
    en: 'Restricted zone details',
    hi: 'प्रतिबंधित क्षेत्र विवरण',
    mr: 'प्रतिबंधित क्षेत्राचा तपशील',
  },
  {
    en: 'Alternative inshore passage',
    hi: 'वैकल्पिक तटीय सुरक्षित जलमार्ग',
    mr: 'पर्यायी किनारपट्टी मार्ग',
  },
  {
    en: 'Active cyclone advisories',
    hi: 'सक्रिय चक्रवात चेतावनी',
    mr: 'सक्रिय चक्रीवादळ चेतावणी',
  },
  {
    en: 'Geofence boundaries near harbor',
    hi: 'बंदरगाह के पास जियोफेंस सीमा',
    mr: 'बंदराजवळील सागरी प्रतिबंधित सीमा',
  },
  {
    en: 'Safe departure window',
    hi: 'सुरक्षित प्रस्थान समय',
    mr: 'सुरक्षित प्रस्थान वेळ',
  },
  {
    en: 'Wave height forecast tomorrow',
    hi: 'कल तरंग ऊंचाई कितनी होगी?',
    mr: 'उद्याच्या लाटांच्या उंचीचा अंदाज',
  },
  {
    en: 'Wind speed and swell period',
    hi: 'हवा की गति और स्वेल अवधि',
    mr: 'वाऱ्याचा वेग आणि उसळीचा कालावधी',
  },
  {
    en: 'Is it safe to depart?',
    hi: 'क्या प्रस्थान करना सुरक्षित है?',
    mr: 'प्रस्थान करणे सुरक्षित आहे का?',
  },
  {
    en: 'Check tomorrow morning forecast',
    hi: 'कल सुबह का मौसम कैसा रहेगा?',
    mr: 'उद्या सकाळचा हवामान अंदाज तपासा',
  },
  {
    en: 'What are the nearest hazards?',
    hi: 'आसपास क्या खतरे हैं?',
    mr: 'जवळचे धोके कोणते आहेत?',
  },
  {
    en: 'Compare passage routes',
    hi: 'सुरक्षित वैकल्पिक मार्ग बताएं',
    mr: 'सागरी मार्गांची तुलना करा',
  },
  {
    en: 'Check safety window for tomorrow evening',
    hi: 'कल शाम के लिए सुरक्षित प्रस्थान समय जांचें',
    mr: 'उद्या संध्याकाळसाठी सुरक्षित वेळ तपासा',
  },
  {
    en: 'Where is the nearest safe anchorage near Ratnagiri?',
    hi: 'रत्नागिरी के पास सबसे निकटतम सुरक्षित लंगरगाह (anchorage) कहाँ है?',
    mr: 'रत्नागिरी जवळ सर्वात सुरक्षित बंदर/थांबा कुठे आहे?',
  },
  {
    en: 'Is it safe to depart for this PFZ tomorrow at 6 AM?',
    hi: 'क्या कल सुबह 6 बजे इस PFZ के लिए प्रस्थान करना सुरक्षित है?',
    mr: 'उद्या सकाळी ६ वाजता या PFZ कडे जाणे सुरक्षित आहे का?',
  },
  {
    en: 'Show alternative PFZ options further south',
    hi: 'दक्षिण में आगे वैकल्पिक मत्स्य क्षेत्र (PFZ) विकल्प दिखाएं',
    mr: 'दक्षिणेकडील पर्यायी मासेमारी क्षेत्रे (PFZ) दाखवा',
  },

  // Confidence reasons & Warnings
  {
    en: 'Evaluated against M2 mock threshold ceilings',
    hi: 'M2 सिमुलेशन सुरक्षा सीमा थ्रेशोल्ड के आधार पर मूल्यांकित',
    mr: 'M2 सिम्युलेशन सुरक्षा मर्यादा थ्रेशोल्डनुसार मूल्यमापन',
  },
  {
    en: 'M2 Contract Mock evaluation — not for real navigation.',
    hi: 'M2 अनुबंध सिमुलेशन मूल्यांकन — वास्तविक नौवहन के लिए नहीं।',
    mr: 'M2 कॉन्ट्रॅक्ट सिम्युलेशन मूल्यमापन — प्रत्यक्ष सागरी प्रवासासाठी नाही.',
  },
  {
    en: 'M2 Contract Mock evaluation — not for real navigation',
    hi: 'M2 अनुबंध सिमुलेशन मूल्यांकन — वास्तविक नौवहन के लिए नहीं',
    mr: 'M2 कॉन्ट्रॅक्ट सिम्युलेशन मूल्यमापन — प्रत्यक्ष सागरी प्रवासासाठी नाही',
  },
  {
    en: 'Deterministic Dev 4 test double evaluation',
    hi: 'डेव 4 टेस्ट डबल के आधार पर निर्धारित मूल्यांकन',
    mr: 'डेव्ह 4 टेस्ट डबलवर आधारित मूल्यमापन',
  },
  {
    en: 'Recent INCOIS Ocean State Forecast updated 2 hours ago',
    hi: 'नवीनतम INCOIS महासागर पूर्वानुमान 2 घंटे पहले अपडेट किया गया',
    mr: 'ताजा INCOIS सागरी अंदाज २ तासांपूर्वी अपडेट केला गेला',
  },
  {
    en: 'Corroborated by IMD coastal bulletin issued at 18:00 IST',
    hi: '18:00 IST पर जारी IMD तटीय बुलेटिन द्वारा पुष्ट',
    mr: 'संध्याकाळी 18:00 वाजता जारी केलेल्या IMD किनारपट्टी बुलेटिनद्वारे पुष्टी',
  },
  {
    en: 'INCOIS PFZ advisory valid for today',
    hi: 'आज के लिए INCOIS मत्स्य क्षेत्र (PFZ) सलाह वैध',
    mr: 'आजच्या दिवसासाठी INCOIS PFZ सल्ला वैध',
  },
  {
    en: 'Ocean State Forecast corroborates calm conditions',
    hi: 'महासागर पूर्वानुमान शांत और अनुकूल परिस्थितियों की पुष्टि करता है',
    mr: 'सागरी अंदाज शांत आणि अनुकूल परिस्थितीची पुष्टी करतो',
  },
  {
    en: 'Open-Meteo fallback was not needed. Primary data is fresh.',
    hi: 'Open-Meteo बैकअप की आवश्यकता नहीं थी। प्राथमिक डेटा अद्यतित और ताज़ा है।',
    mr: 'Open-Meteo पर्यायाची गरज नव्हती. प्राथमिक डेटा ताजा आणि वैध आहे.',
  },
  {
    en: '[SNAPSHOT] Data sourced from M2 contract mocks — not live.',
    hi: '[SNAPSHOT] M2 अनुबंध सिमुलेशन से लिया गया डेटा — लाइव नहीं।',
    mr: '[SNAPSHOT] M2 सिम्युलेशनवरून घेतलेला डेटा — थेट नाही.',
  },
  {
    en: 'No external evidence required',
    hi: 'किसी बाहरी साक्ष्य की आवश्यकता नहीं है',
    mr: 'कोणत्याही बाह्य पुराव्याची आवश्यकता नाही',
  },
  {
    en: 'Operational baseline verified',
    hi: 'परिचालन आधार रेखा सत्यापित',
    mr: 'सागरी सुरक्षा निकष पडताळले',
  },
  {
    en: 'Active simulated cyclone alert',
    hi: 'सक्रिय सिम्युलेटेड चक्रवात अलर्ट',
    mr: 'सक्रिय सिम्युलेटेड चक्रीवादळ सतर्कता',
  },
  {
    en: 'Simulated PFZ coordinates available',
    hi: 'सिम्युलेटेड मत्स्य क्षेत्र निर्देशांक उपलब्ध',
    mr: 'सिम्युलेटेड PFZ निर्देशांक उपलब्ध',
  },
  {
    en: 'Passage conditions verified',
    hi: 'मार्ग स्थितियां सत्यापित',
    mr: 'सागरी मार्ग परिस्थिती पडताळली',
  },
  {
    en: 'Verify local harbor weather prior to departure (Simulation only).',
    hi: 'प्रस्थान करने से पहले स्थानीय बंदरगाह मौसम की पुष्टि करें (केवल सिमुलेशन)।',
    mr: 'प्रस्थानापूर्वी स्थानिक बंदराचे हवामान तपासा (केवळ सिम्युलेशन).',
  },
  {
    en: 'Depart only with experienced crew and adequate safety gear.',
    hi: 'केवल अनुभवी दल और पर्याप्त सुरक्षा उपकरणों के साथ ही प्रस्थान करें।',
    mr: 'केवळ अनुभवी खलाशी आणि पुरेशी सुरक्षा उपकरणे सोबत घेऊनच जावे.',
  },
  {
    en: 'Elevated wave heights forecast. Exercise caution.',
    hi: 'ऊंची लहरों का पूर्वानुमान है। सावधानी बरतें।',
    mr: 'उंच लाटांचा अंदाज आहे. खबरदारी बाळगा.',
  },
  {
    en: 'Simulated conditions are calm and safe for departure.',
    hi: 'सिम्युलेटेड स्थितियां शांत हैं और प्रस्थान के लिए सुरक्षित हैं।',
    mr: 'सिम्युलेटेड परिस्थिती शांत असून प्रस्थानासाठी सुरक्षित आहे.',
  },
  {
    en: 'Remain moored in port (Simulation only).',
    hi: 'बंदरगाह में ही लंगर डालकर रहें (केवल सिमुलेशन)।',
    mr: 'बंदरातच नांगर टाकून थांबा (केवळ सिम्युलेशन).',
  },
  {
    en: 'Proceed with voyage under standard VHF watch (Simulation only).',
    hi: 'मानक VHF रेडियो संपर्क के तहत यात्रा जारी रखें (केवल सिमुलेशन)।',
    mr: 'प्रमाणित VHF संपर्कात राहून प्रवास सुरू ठेवा (केवळ सिम्युलेशन).',
  },
  {
    en: 'Insufficient or conflicting conditions preclude conclusive assessment.',
    hi: 'अपर्याप्त या परस्पर विरोधी डेटा के कारण निश्चित निष्कर्ष संभव नहीं है।',
    mr: 'अपुऱ्या किंवा विसंगत माहितीमुळे अंतिम निष्कर्ष काढणे शक्य नाही.',
  },
  {
    en: 'Hold departure until authoritative advisory is verified.',
    hi: 'आधिकारिक सलाह सत्यापित होने तक प्रस्थान स्थगित रखें।',
    mr: 'अधिकृत सल्ला पडताळेपर्यंत प्रस्थान थांबवा.',
  },
  {
    en: 'Hold departure.',
    hi: 'प्रस्थान स्थगित रखें।',
    mr: 'प्रस्थान थांबवा.',
  },
  {
    en: 'Operate within 5 nm of coastline.',
    hi: 'तटरेखा से 5 समुद्री मील के भीतर ही संचालन करें।',
    mr: 'किनारपट्टीपासून ५ सागरी मैलाच्या आतच बोट चालवा.',
  },
  {
    en: 'Operate within 5 nm of coastline (Simulation only).',
    hi: 'तटरेखा से 5 समुद्री मील के भीतर ही संचालन करें (केवल सिमुलेशन)।',
    mr: 'किनारपट्टीपासून ५ सागरी मैलाच्या आतच बोट चालवा (केवळ सिम्युलेशन).',
  },

  // --- PORTAL PAGE TRANSLATIONS ---
  {
    en: 'Select Your Operational Mission Portal',
    hi: 'अपना परिचालन मिशन पोर्टल चुनें',
    mr: 'तुमचे ऑपरेशनल मिशन पोर्टल निवडा',
  },
  {
    en: 'ISRO & INCOIS Marine Intelligence Platform',
    hi: 'इसरो (ISRO) एवं इनकोइस (INCOIS) सागरीय बुद्धिमत्ता मंच',
    mr: 'इस्रो (ISRO) आणि इनकोइस (INCOIS) सागरी बुद्धिमत्ता मंच',
  },
  {
    en: "SAMUDRA orchestrates India's oceanographic, meteorological, and regulatory data into deterministic voyage advisories, risk evaluations, and maritime surveillance.",
    hi: 'समुद्र (SAMUDRA) भारत के समुद्र विज्ञान, मौसम विज्ञान और नियामक डेटा को निश्चित यात्रा सलाह, जोखिम मूल्यांकन और समुद्री निगरानी में संयोजित करता है।',
    mr: 'समुद्र (SAMUDRA) भारताचा समुद्रशास्त्र, हवामानशास्त्र आणि नियामक डेटा निश्चित प्रवास सल्ले, जोखीम मूल्यांकन आणि सागरी पाळतीमध्ये एकत्रित करतो.',
  },
  {
    en: 'Artisanal Fishers & Vessel Skippers',
    hi: 'पारंपरिक मछुआरे और नौका नाविक',
    mr: 'पारंपारिक मच्छीमार आणि बोट चालक',
  },
  {
    en: 'Fisher Console',
    hi: 'मत्स्य पालन कंसोल',
    mr: 'मच्छीमार कन्सोल',
  },
  {
    en: 'Purpose-built for coastal fishermen and vessel operators preparing to depart harbor. Answers operational voyage questions with rigid safety thresholds and vernacular voice support.',
    hi: 'बंदरगाह से प्रस्थान करने वाले तटीय मछुआरों और नौका चालकों के लिए विशेष निर्मित। कठोर सुरक्षा सीमाओं और क्षेत्रीय भाषा में वॉयस समर्थन के साथ परिचालन प्रश्नों का उत्तर देता है।',
    mr: 'बंदरातून प्रस्थान करणाऱ्या किनारपट्टीवरील मच्छीमार आणि बोट चालकांसाठी खास तयार केलेले. कडक सुरक्षा मर्यादा आणि स्थानिक भाषा व्हॉइस सहाय्यासह सागरी प्रश्नांची उत्तरे देतो.',
  },
  {
    en: 'Departure Safety Status:',
    hi: 'प्रस्थान सुरक्षा स्थिति:',
    mr: 'प्रस्थान सुरक्षा स्थिती:',
  },
  {
    en: 'Instant GO / CAUTION / NO-GO verdicts.',
    hi: 'त्वरित GO / CAUTION / NO-GO सुरक्षा निर्णय।',
    mr: 'त्वरित GO / CAUTION / NO-GO सुरक्षा निर्णय.',
  },
  {
    en: 'Potential Fishing Zones (PFZ):',
    hi: 'संभावित मत्स्य क्षेत्र (PFZ):',
    mr: 'संभाव्य मासेमारी क्षेत्र (PFZ):',
  },
  {
    en: 'Distance, bearing, SST, and chlorophyll gradients.',
    hi: 'दूरी, दिशा, समुद्री तापमान (SST) और क्लोरोफिल प्रवणता।',
    mr: 'अंतर, दिशा, सागरी तापमान (SST) आणि क्लोरोफिल प्रमाण.',
  },
  {
    en: 'Mission Twin What-If:',
    hi: 'मिशन ट्विन काल्पनिक सिमुलेशन:',
    mr: 'मिशन ट्विन व्हॉट-इफ मॉडेलिंग:',
  },
  {
    en: 'Test departure delay windows (+2h, +4h) and craft types.',
    hi: 'प्रस्थान विलंब (+2 घंटे, +4 घंटे) और नौका प्रकारों का परीक्षण करें।',
    mr: 'प्रस्थान विलंब (+2 तास, +4 तास) आणि बोट प्रकारांची चाचणी घ्या.',
  },
  {
    en: 'Voice Calls with VAD:',
    hi: 'VAD युक्त वॉयस कॉल:',
    mr: 'VAD सह व्हॉइस कॉलिंग:',
  },
  {
    en: 'Bidirectional audio assistance in Hindi, Marathi, and English.',
    hi: 'हिंदी, मराठी और अंग्रेजी में द्विदिशीय ऑडियो सहायता।',
    mr: 'हिंदी, मराठी आणि इंग्रजीमध्ये दुहेरी ऑडिओ सहाय्य.',
  },
  {
    en: 'Corridor Optimization:',
    hi: 'जलमार्ग गलियारा अनुकूलन:',
    mr: 'सागरी मार्ग अनुकूलन:',
  },
  {
    en: 'Compare Safest vs. Direct vs. Balanced route options.',
    hi: 'सुरक्षिततम, सीधा और संतुलित समुद्री मार्गों की तुलना करें।',
    mr: 'सर्वात सुरक्षित, थेट आणि संतुलित सागरी मार्गांची तुलना करा.',
  },
  {
    en: 'Enter Fisher Console',
    hi: 'मत्स्य कंसोल में प्रवेश करें',
    mr: 'मच्छीमार कन्सोल उघडा',
  },
  {
    en: 'Port Officials & Maritime Authorities',
    hi: 'पत्तन अधिकारी और समुद्री नियामक प्राधिकरण',
    mr: 'बंदर अधिकारी आणि सागरी प्राधिकरण',
  },
  {
    en: 'Authority Command Deck',
    hi: 'प्राधिकरण कमान डेक',
    mr: 'प्राधिकरण कमांड डेक',
  },
  {
    en: 'Dedicated command interface for Port Authorities, Fisheries Departments, and Coastal Disaster Management teams auditing fleet compliance and active hazard sectors.',
    hi: 'पत्तन प्राधिकरण, मत्स्य विभाग और तटीय आपदा प्रबंधन टीमों के लिए समर्पित कमान इंटरफ़ेस, जो नौका अनुपालन और सक्रिय खतरा क्षेत्रों का ऑडिट करता है।',
    mr: 'बंदर प्राधिकरण, मत्स्य व्यवसाय विभाग आणि किनारपट्टी आपत्ती व्यवस्थापन पथकांसाठी समर्पित कमांड इंटरफेस, जो नौकांचे नियमन आणि धोक्याच्या क्षेत्रांचे परीक्षण करतो.',
  },
  {
    en: 'Coastal Sector Surveillance:',
    hi: 'तटीय क्षेत्र निगरानी:',
    mr: 'किनारपट्टी क्षेत्र पाळत:',
  },
  {
    en: 'Monitor Ratnagiri, Malvan, Goa, and Mumbai waters.',
    hi: 'रत्नागिरी, मालवण, गोवा और मुंबई जलक्षेत्र की निगरानी करें।',
    mr: 'रत्नागिरी, मालवण, गोवा आणि मुंबई सागरी क्षेत्रावर पाळत ठेवा.',
  },
  {
    en: 'Live Hazard Polygons:',
    hi: 'लाइव खतरा क्षेत्र पॉलीगॉन:',
    mr: 'थेट धोक्याचे सागरी पट्टे:',
  },
  {
    en: 'Track IMD squall warnings, MPAs, and naval firing areas.',
    hi: 'IMD तूफान चेतावनियों, समुद्री संरक्षित क्षेत्रों और नौसैनिक फायरिंग रेंजों को ट्रैक करें।',
    mr: 'IMD वादळी इशारे, सागरी संरक्षित क्षेत्रे आणि नौदल फायरिंग क्षेत्रांचा मागोवा घ्या.',
  },
  {
    en: 'Evidence & Provenance Audit:',
    hi: 'साक्ष्य एवं डेटा स्रोत ऑडिट:',
    mr: 'पुरावे आणि माहिती स्रोत ऑडिट:',
  },
  {
    en: 'Direct in-page inspection of official INCOIS/IMD feeds.',
    hi: 'आधिकारिक INCOIS/IMD डेटा फ़ीड का सीधा पृष्ठ पर निरीक्षण।',
    mr: 'अधिकृत INCOIS/IMD डेटा फीडची थेट तपासणी.',
  },
  {
    en: 'Autonomous Reasoning Trail:',
    hi: 'स्वायत्त एजेंट निष्पादन निशान:',
    mr: 'स्वायत्त एजंट अंमलबजावणी माग:',
  },
  {
    en: 'Full LangGraph agent execution trace logs.',
    hi: 'संपूर्ण LangGraph एजेंट निष्पादन ट्रेस लॉग।',
    mr: 'संपूर्ण LangGraph एजंट अंमलबजावणी ट्रेस लॉग.',
  },
  {
    en: 'Surveillance Query Terminal:',
    hi: 'निगरानी प्रश्न टर्मिनल:',
    mr: 'पाळत ठेवणे प्रश्न टर्मिनल:',
  },
  {
    en: 'Run regional simulations and query decision records.',
    hi: 'क्षेत्रीय सिमुलेशन चलाएं और निर्णय अभिलेखों की खोज करें।',
    mr: 'प्रादेशिक सिम्युलेशन चालवा आणि निर्णय नोंदी तपासा.',
  },
  {
    en: 'Enter Authority Deck',
    hi: 'प्राधिकरण डेक में प्रवेश करें',
    mr: 'प्राधिकरण डेक उघडा',
  },
  {
    en: 'Marine Researchers & Data Scientists',
    hi: 'समुद्री शोधकर्ता और डेटा वैज्ञानिक',
    mr: 'सागरी संशोधक आणि डेटा शास्त्रज्ञ',
  },
  {
    en: 'Researcher Lab',
    hi: 'शोधकर्ता प्रयोगशाला',
    mr: 'संशोधक प्रयोगशाळा',
  },
  {
    en: "Explore ocean observation data, satellite EO products, evaluate benchmark scenarios, and inspect evidence provenance across SAMUDRA's marine data ecosystem.",
    hi: 'समुद्र (SAMUDRA) के सागरीय डेटा तंत्र में महासागर अवलोकन डेटा, उपग्रह ईओ उत्पादों का अन्वेषण करें, बेंचमार्क परिदृश्यों का मूल्यांकन करें और साक्ष्य स्रोतों का निरीक्षण करें।',
    mr: 'समुद्र (SAMUDRA) च्या सागरी डेटा परिसंस्थेतील महासागर निरीक्षण डेटा, उपग्रह ईओ उत्पादने एक्सप्लोर करा, बेंचमार्क परिस्थितींचे मूल्यांकन करा आणि पुराव्यांचे परीक्षण करा.',
  },
  {
    en: 'Ocean Data Explorer:',
    hi: 'महासागर डेटा एक्सप्लोरर:',
    mr: 'महासागर डेटा एक्सप्लोरर:',
  },
  {
    en: 'Marine conditions, SST, wave heights, and current speeds by harbor.',
    hi: 'बंदरगाह अनुसार समुद्री स्थितियां, SST, लहर ऊंचाई और धारा गति।',
    mr: 'बंदरांनुसार सागरी स्थिती, SST, लाटांची उंची आणि प्रवाहाचा वेग.',
  },
  {
    en: 'Satellite EO Grid:',
    hi: 'उपग्रह ईओ ग्रिड:',
    mr: 'उपग्रह ईओ ग्रिड:',
  },
  {
    en: 'Chlorophyll-a concentrations, SST rasters, and cloud cover from MOSDAC.',
    hi: 'MOSDAC से क्लोरोफिल-ए सांद्रता, SST रास्टर और बादल आवरण।',
    mr: 'MOSDAC कडून क्लोरोफिल-ए प्रमाण, SST रास्टर आणि ढगांचे आच्छादन.',
  },
  {
    en: 'Scenario Lab:',
    hi: 'परिदृश्य प्रयोगशाला (सिनेरियो लैब):',
    mr: 'परिस्थिती प्रयोगशाळा (सिनेरिओ लॅब):',
  },
  {
    en: 'Execute S1–S8 benchmark evaluations and audit recommendation traces.',
    hi: 'S1–S8 बेंचमार्क मूल्यांकनों को निष्पादित करें और अनुशंसा निशानों का ऑडिट करें।',
    mr: 'S1–S8 बेंचमार्क मूल्यमापन चालवा आणि शिफारस ट्रेसचे ऑडिट करा.',
  },
  {
    en: 'Source Provenance:',
    hi: 'स्रोत सत्यापन एवं उद्गम:',
    mr: 'माहिती स्रोत आणि सत्यता:',
  },
  {
    en: 'Data freshness, quality flags, and authoritative source hierarchy.',
    hi: 'डेटा नवीनता, गुणवत्ता टैग और आधिकारिक स्रोत पदानुक्रम।',
    mr: 'डेटा ताजेपणा, गुणवत्ता टॅग आणि अधिकृत स्रोत क्रमवारी.',
  },
  {
    en: 'Query Workbench:',
    hi: 'शोध प्रश्न कार्यमंच:',
    mr: 'संशोधन प्रश्न कार्यशाळा:',
  },
  {
    en: 'Exploratory natural language queries with inline evidence and trace.',
    hi: 'इनलाइन साक्ष्य और ट्रेस के साथ अन्वेषणात्मक प्राकृतिक भाषा प्रश्न।',
    mr: 'इनलाइन पुरावे आणि ट्रेससह अन्वेषणात्मक नैसर्गिक भाषा प्रश्न.',
  },
  {
    en: 'Enter Researcher Lab',
    hi: 'शोधकर्ता प्रयोगशाला में प्रवेश करें',
    mr: 'संशोधक प्रयोगशाळेत प्रवेश करा',
  },
  {
    en: 'Deterministic Marine Decision Engine · Complying with Official Government Feeds (INCOIS OSF, PFZ, SVAS, IMD Marine)',
    hi: 'निश्चित सागरी निर्णय इंजन · आधिकारिक सरकारी फ़ीड (INCOIS OSF, PFZ, SVAS, IMD Marine) के अनुरूप',
    mr: 'निश्चित सागरी निर्णय इंजिन · अधिकृत सरकारी माहिती फीड (INCOIS OSF, PFZ, SVAS, IMD Marine) शी सुसंगत',
  },

  // --- FISHER WORKSPACE & VOYAGE CONTROLS ---
  {
    en: 'Advisory Chat',
    hi: 'सलाहकार चैट',
    mr: 'सल्लागार चॅट',
  },
  {
    en: 'Voyage Settings',
    hi: 'यात्रा सेटिंग्स',
    mr: 'प्रवास सेटिंग्ज',
  },
  {
    en: 'Voyage controls',
    hi: 'यात्रा नियंत्रण',
    mr: 'प्रवास नियंत्रणे',
  },
  {
    en: 'Mission context',
    hi: 'मिशन संदर्भ',
    mr: 'मिशन संदर्भ',
  },
  {
    en: 'Departure harbor',
    hi: 'प्रस्थान बंदरगाह',
    mr: 'प्रस्थान बंदर',
  },
  {
    en: 'Vessel profile',
    hi: 'नौका प्रोफ़ाइल',
    mr: 'बोट प्रोफाइल',
  },
  {
    en: 'Traditional craft',
    hi: 'पारंपरिक नाव',
    mr: 'पारंपारिक नाव',
  },
  {
    en: 'Motorized boat',
    hi: 'मोटरबोट',
    mr: 'मोटारबोट',
  },
  {
    en: 'Mechanized trawler',
    hi: 'यांत्रिक ट्रॉलर',
    mr: 'यांत्रिकी ट्रॉलर',
  },
  {
    en: 'Traditional',
    hi: 'पारंपरिक',
    mr: 'पारंपारिक',
  },
  {
    en: 'Motorized',
    hi: 'मोटरबोट',
    mr: 'मोटारबोट',
  },
  {
    en: 'Trawler',
    hi: 'ट्रॉलर',
    mr: 'ट्रॉलर',
  },
  {
    en: 'Voyage departure parameters and craft profile for deterministic marine safety calculation.',
    hi: 'निश्चित समुद्री सुरक्षा गणना के लिए यात्रा प्रस्थान पैरामीटर और नौका प्रोफ़ाइल।',
    mr: 'निश्चित सागरी सुरक्षा गणनेसाठी प्रवास प्रस्थान मापदंड आणि बोट प्रोफाइल.',
  },
  {
    en: 'Edit Voyage',
    hi: 'यात्रा बदलें',
    mr: 'प्रवास बदला',
  },
  {
    en: 'Toggle voyage settings',
    hi: 'यात्रा सेटिंग्स चालू/बंद करें',
    mr: 'प्रवास सेटिंग्ज उघडा',
  },

  // --- WHAT-IF SIMULATOR ---
  {
    en: 'Mission Twin What-If Simulator',
    hi: 'मिशन ट्विन काल्पनिक सिमुलेटर',
    mr: 'मिशन ट्विन व्हॉट-इफ सिम्युलेटर',
  },
  {
    en: 'Test departure delay windows and vessel craft types for risk reduction',
    hi: 'जोखिम कम करने के लिए प्रस्थान विलंब समय और नौका प्रकारों का परीक्षण करें',
    mr: 'धोका कमी करण्यासाठी प्रस्थान विलंब वेळ आणि बोट प्रकारांची चाचणी घ्या',
  },
  {
    en: 'Departure delay window:',
    hi: 'प्रस्थान विलंब अवधि:',
    mr: 'प्रस्थान विलंब वेळ:',
  },
  {
    en: 'Craft profile override:',
    hi: 'नौका प्रकार बदलें:',
    mr: 'बोट प्रकार बदला:',
  },
  {
    en: 'Optimization target:',
    hi: 'अनुकूलन लक्ष्य:',
    mr: 'अनुकूलन उद्दिष्ट:',
  },
  {
    en: 'Simulate What-If Scenario',
    hi: 'काल्पनिक परिदृश्य सिमुलेट करें',
    mr: 'व्हॉट-इफ परिस्थिती सिम्युलेट करा',
  },
  {
    en: 'Simulating Twin...',
    hi: 'सिमुलेशन जारी है...',
    mr: 'सिम्युलेशन सुरू आहे...',
  },
  {
    en: 'Apply Selected Parameters',
    hi: 'चयनित पैरामीटर लागू करें',
    mr: 'निवडलेले मापदंड लागू करा',
  },
  {
    en: 'Applied to Mission Context',
    hi: 'मिशन संदर्भ में लागू किया गया',
    mr: 'मिशन संदर्भामध्ये लागू केले',
  },
  {
    en: 'Coastal Safety',
    hi: 'तटीय सुरक्षा',
    mr: 'किनारपट्टी सुरक्षा',
  },
  {
    en: 'Safe Passage',
    hi: 'सुरक्षित जलमार्ग',
    mr: 'सुरक्षित प्रवास',
  },
  {
    en: 'PFZ Harvesting',
    hi: 'मत्स्य संचयन (PFZ)',
    mr: 'मासेमारी संचयन (PFZ)',
  },
  {
    en: 'Now',
    hi: 'अभी',
    mr: 'आता',
  },

  // --- AUTHORITY COMMAND DECK ---
  {
    en: 'Surveillance Sector',
    hi: 'निगरानी क्षेत्र',
    mr: 'पाळत क्षेत्र',
  },
  {
    en: 'Sector:',
    hi: 'क्षेत्र:',
    mr: 'विभाग:',
  },
  {
    en: 'Advisory Verdict',
    hi: 'सलाहकार निर्णय',
    mr: 'सल्लागार निर्णय',
  },
  {
    en: 'Verdict:',
    hi: 'निर्णय:',
    mr: 'निर्णय:',
  },
  {
    en: 'Active Hazard Zones',
    hi: 'सक्रिय खतरा क्षेत्र',
    mr: 'सक्रिय धोक्याचे क्षेत्र',
  },
  {
    en: 'Hazards',
    hi: 'खतरे',
    mr: 'धोके',
  },
  {
    en: 'Official Sources',
    hi: 'आधिकारिक स्रोत',
    mr: 'अधिकृत स्रोत',
  },
  {
    en: 'Sources',
    hi: 'स्रोत',
    mr: 'स्रोत',
  },
  {
    en: 'Agent Execution',
    hi: 'एजेंट निष्पादन',
    mr: 'एजंट अंमलबजावणी',
  },
  {
    en: 'Steps',
    hi: 'कदम',
    mr: 'पायऱ्या',
  },
  {
    en: 'Audit Terminal',
    hi: 'ऑडिट टर्मिनल',
    mr: 'ऑडिट टर्मिनल',
  },
  {
    en: 'Fleet Surveillance',
    hi: 'नौका बेड़ा निगरानी',
    mr: 'नौका दल पाळत',
  },
  {
    en: 'Benchmark Runner',
    hi: 'मानदंड धावक',
    mr: 'बेंचमार्क चाचणी',
  },
  {
    en: 'Evidence & Trace',
    hi: 'साक्ष्य व ट्रेस',
    mr: 'पुरावे व ट्रेस',
  },
  {
    en: 'Surveillance Query Terminal',
    hi: 'निगरानी प्रश्न टर्मिनल',
    mr: 'पाळत ठेवणे प्रश्न टर्मिनल',
  },
  {
    en: 'Reset',
    hi: 'रीसेट',
    mr: 'रीसेट',
  },
  {
    en: 'Verified Official Evidence',
    hi: 'सत्यापित आधिकारिक साक्ष्य',
    mr: 'सत्यापित अधिकृत पुरावे',
  },
  {
    en: 'No active evidence items. Run an advisory query to inspect official telemetry.',
    hi: 'कोई सक्रिय साक्ष्य उपलब्ध नहीं है। आधिकारिक डेटा देखने के लिए सलाह प्रश्न पूछें।',
    mr: 'सध्या कोणतेही सक्रिय पुरावे नाहीत. अधिकृत माहिती तपासण्यासाठी प्रश्न विचारा.',
  },
  {
    en: 'Active System Warnings & Fallbacks',
    hi: 'सक्रिय सिस्टम चेतावनियां और फ़ॉलबैक',
    mr: 'सक्रिय चेतावणी आणि पर्यायी माहिती',
  },
  {
    en: 'Autonomous Agent Execution Trail',
    hi: 'स्वायत्त एजेंट निष्पादन निशान',
    mr: 'स्वायत्त एजंट अंमलबजावणी माग',
  },
  {
    en: 'No trace recorded. Queries processed by the cognitive graph will log execution steps here.',
    hi: 'कोई ट्रेस दर्ज नहीं है। एजेंट द्वारा संसाधित प्रश्नों के निष्पादन चरण यहाँ दर्ज होंगे।',
    mr: 'कोणताही ट्रेस नोंदवला गेला नाही. एजंटद्वारे तपासलेल्या प्रश्नांची पायऱ्या येथे दिसतील.',
  },

  // --- FLEET TRACKING DECK ---
  {
    en: 'Maritime Fleet Surveillance & Trajectory Replay',
    hi: 'समुद्री नौका बेड़ा निगरानी और प्रक्षेपवक्र रीप्ले',
    mr: 'सागरी नौका दल पाळत आणि जलमार्ग रीप्ले',
  },
  {
    en: 'Auditing active coastal vessel positions, time-series GPS replay logs, and multi-agency broadcast alerts.',
    hi: 'सक्रिय तटीय पोत स्थितियों, जीपीएस रीप्ले लॉग और बहु-एजेंसी प्रसारण अलर्ट का ऑडिट।',
    mr: 'सक्रिय नौकांचे स्थान, जीपीएस रीप्ले नोंदी आणि अधिकृत सागरी संदेशांचे परीक्षण.',
  },
  {
    en: 'Monitored Coastal Fleet',
    hi: 'निगरानी अधीन तटीय नौका बेड़ा',
    mr: 'पाळतीखालील किनारपट्टी नौका दल',
  },
  {
    en: 'Length:',
    hi: 'लंबाई:',
    mr: 'लांबी:',
  },
  {
    en: 'Home:',
    hi: 'बंदरगाह:',
    mr: 'मूळ बंदर:',
  },
  {
    en: 'Engine:',
    hi: 'इंजन:',
    mr: 'इंजिन:',
  },
  {
    en: 'GPS Trajectory Replay',
    hi: 'जीपीएस प्रक्षेपवक्र रीप्ले',
    mr: 'जीपीएस जलमार्ग रीप्ले',
  },
  {
    en: 'Pause',
    hi: 'रोकें',
    mr: 'थांबवा',
  },
  {
    en: 'Play',
    hi: 'चलाएं',
    mr: 'सुरू करा',
  },
  {
    en: 'Reset to departure',
    hi: 'प्रस्थान स्थिति पर रीसेट करें',
    mr: 'प्रस्थान स्थितीवर रीसेट करा',
  },
  {
    en: 'Start',
    hi: 'प्रारंभ',
    mr: 'सुरुवात',
  },
  {
    en: 'End',
    hi: 'समाप्त',
    mr: 'शेवट',
  },
  {
    en: 'Speed:',
    hi: 'गति:',
    mr: 'वेग:',
  },
  {
    en: 'Heading:',
    hi: 'दिशा:',
    mr: 'दिशा:',
  },
  {
    en: 'Pos:',
    hi: 'स्थान:',
    mr: 'स्थान:',
  },
  {
    en: 'Maritime Broadcast Alerts',
    hi: 'समुद्री प्रसारण चेतावनियां',
    mr: 'सागरी प्रसारण संदेश',
  },
  {
    en: 'Role:',
    hi: 'भूमिका:',
    mr: 'भूमिका:',
  },

  // --- BENCHMARK RUNNER ---
  {
    en: 'LangGraph Scenario Benchmark Runner',
    hi: 'लैंगग्राफ परिदृश्य बेंचमार्क धावक',
    mr: 'LangGraph परिस्थिती बेंचमार्क चाचणी',
  },
  {
    en: 'Automated end-to-end evaluation suite testing canonical multi-agent marine scenarios against live pipeline rules.',
    hi: 'लाइव पाइपलाइन नियमों के विरुद्ध मानक मल्टी-एजेंट समुद्री परिदृश्यों का स्वचालित संपूर्ण परीक्षण सुइट।',
    mr: 'थेट नियमांनुसार सागरी मल्टी-एजंट परिस्थितींचे स्वयंचलित मूल्यमापन.',
  },
  {
    en: 'Canonical Test Scenarios',
    hi: 'मानक परीक्षण परिदृश्य',
    mr: 'प्रामाणिक चाचणी परिस्थिती',
  },
  {
    en: 'Run Benchmark Test',
    hi: 'बेंचमार्क परीक्षण चलाएं',
    mr: 'बेंचमार्क चाचणी चालवा',
  },
  {
    en: 'Executing Graph...',
    hi: 'एजेंट निष्पादित हो रहा है...',
    mr: 'एजंट प्रक्रिया सुरू आहे...',
  },
  {
    en: 'Standard Query:',
    hi: 'मानक प्रश्न:',
    mr: 'प्रामाणिक प्रश्न:',
  },
  {
    en: 'Target Intent',
    hi: 'लक्षित उद्देश्य',
    mr: 'उद्दिष्ट प्रकार',
  },
  {
    en: 'Expected Status',
    hi: 'अपेक्षित स्थिति',
    mr: 'अपेक्षित स्थिती',
  },
  {
    en: 'Confidence Bar',
    hi: 'विश्वास स्तर',
    mr: 'विश्वासार्हता स्तर',
  },
  {
    en: 'Harbor Sector',
    hi: 'बंदरगाह क्षेत्र',
    mr: 'बंदर विभाग',
  },
  {
    en: 'TEST SUITE PASSED',
    hi: 'परीक्षण सुइट उत्तीर्ण',
    mr: 'चाचणी यशस्वी',
  },
  {
    en: 'TEST SUITE FAILED',
    hi: 'परीक्षण सुइट विफल',
    mr: 'चाचणी अयशस्वी',
  },
  {
    en: 'Pipeline Verification:',
    hi: 'पाइपलाइन सत्यापन:',
    mr: 'पाइपलाइन पडताळणी:',
  },
  {
    en: 'execution steps',
    hi: 'निष्पादन चरण',
    mr: 'अंमलबजावणी पायऱ्या',
  },
  {
    en: 'evidence records',
    hi: 'साक्ष्य रिकॉर्ड',
    mr: 'पुरावे नोंदी',
  },
  {
    en: 'Status Match',
    hi: 'स्थिति मिलान',
    mr: 'स्थिती जुळणी',
  },
  {
    en: 'Intent Match',
    hi: 'उद्देश्य मिलान',
    mr: 'उद्दिष्ट जुळणी',
  },
  {
    en: 'Evidence Grounding',
    hi: 'साक्ष्य आधार',
    mr: 'पुरावा आधार',
  },
  {
    en: 'Confidence Level',
    hi: 'विश्वास स्तर',
    mr: 'विश्वास पातळी',
  },
  {
    en: '100% Grounded',
    hi: '100% प्रमाणित',
    mr: '१००% प्रमाणित',
  },
  {
    en: 'Unverified',
    hi: 'असत्यापित',
    mr: 'अप्रमाणित',
  },
  {
    en: 'Executed LangGraph Tools:',
    hi: 'निष्पादित टूल्स (LangGraph Tools):',
    mr: 'वापरलेले टूल्स (LangGraph Tools):',
  },
  {
    en: 'Composed Advisory Output:',
    hi: 'तैयार की गई सलाह (Advisory Output):',
    mr: 'तयार केलेला सल्ला (Advisory Output):',
  },
  {
    en: 'Validation Criteria Check:',
    hi: 'सत्यापन मानदंड जांच:',
    mr: 'पडताळणी निकष तपासणी:',
  },
  {
    en: 'Select an evaluation scenario from the left and click "Run Benchmark Test" to execute the backend LangGraph agent pipeline and audit the response in real time.',
    hi: 'बाईं ओर से एक परीक्षण परिदृश्य चुनें और बैकएंड LangGraph एजेंट पाइपलाइन को निष्पादित करने और वास्तविक समय में प्रतिक्रिया का ऑडिट करने के लिए "बेंचमार्क परीक्षण चलाएं" पर क्लिक करें।',
    mr: 'डाव्या बाजूने चाचणी परिस्थिती निवडा आणि बॅकएंड LangGraph एजंट चालवून रिअल-टाइममध्ये उत्तराचे परीक्षण करण्यासाठी "बेंचमार्क चाचणी चालवा" वर क्लिक करा.',
  },

  // --- MAP & LAYERS ---
  {
    en: 'Map Layers',
    hi: 'मानचित्र परतें',
    mr: 'नकाशा स्तर',
  },
  {
    en: 'Safety Critical',
    hi: 'सुरक्षा महत्वपूर्ण',
    mr: 'सुरक्षिततेसाठी महत्त्वाचे',
  },
  {
    en: 'Navigation & Operational',
    hi: 'नेविगेशन व संचालन',
    mr: 'नेव्हिगेशन व संचलन',
  },
  {
    en: 'Current status:',
    hi: 'वर्तमान स्थिति:',
    mr: 'सध्याची स्थिती:',
  },
  {
    en: 'Simulate counterfactual voyage parameters (temporal window, vessel limits) against deterministic risk rules.',
    hi: 'निश्चित जोखिम नियमों के विरुद्ध काल्पनिक यात्रा मापदंडों (समय खिड़की, पोत सीमाएं) का अनुकरण करें।',
    mr: 'निश्चित जोखीम नियमांविरूद्ध काल्पनिक प्रवास मापदंड (वेळ, बोट मर्यादा) सिम्युलेट करा.',
  },
  {
    en: 'Departure window offset:',
    hi: 'प्रस्थान समय विलंब:',
    mr: 'प्रस्थान वेळ विलंब:',
  },
  {
    en: 'Objective',
    hi: 'उद्देश्य',
    mr: 'उद्दिष्ट',
  },
  {
    en: 'Simulating...',
    hi: 'सिमुलेशन जारी है...',
    mr: 'सिम्युलेशन सुरू आहे...',
  },
  {
    en: 'Baseline',
    hi: 'मूल आधार',
    mr: 'मूळ स्थिती',
  },
  {
    en: 'Simulated',
    hi: 'सिम्युलेटेड',
    mr: 'सिम्युलेटेड',
  },
  {
    en: 'Profile Applied',
    hi: 'प्रोफ़ाइल लागू किया गया',
    mr: 'प्रोफाइल लागू केले',
  },
  {
    en: 'Apply simulated craft to mission context',
    hi: 'मिशन संदर्भ में सिम्युलेटेड नाव लागू करें',
    mr: 'मिशन संदर्भात सिम्युलेटेड बोट लागू करा',
  },
  {
    en: 'Canonical Evaluation Scenarios (S1–S8 Benchmark Runner)',
    hi: 'मानक मूल्यांकन परिदृश्य (S1–S8 बेंचमार्क रनर)',
    mr: 'प्रामाणिक मूल्यमापन परिस्थिती (S1–S8 बेंचमार्क रनर)',
  },
  {
    en: 'Execute deterministic evaluation pipelines on the LangGraph agent graph to verify safety decisions, evidence grounding, and rule compliance.',
    hi: 'सुरक्षा निर्णयों, साक्ष्य आधार और नियम अनुपालन को सत्यापित करने के लिए LangGraph एजेंट पर मूल्यांकन पाइपलाइन चलाएं।',
    mr: 'सुरक्षा निर्णय, पुरावे आणि नियम पडताळणीसाठी LangGraph एजंटवर मूल्यमापन पाइपलाइन चालवा.',
  },
  {
    en: 'Evaluation Benchmarks',
    hi: 'मूल्यांकन बेंचमार्क',
    mr: 'मूल्यमापन बेंचमार्क',
  },
  {
    en: 'Scenario Specification',
    hi: 'परिदृश्य विनिर्देश',
    mr: 'परिस्थिती तपशील',
  },
  {
    en: 'Actual:',
    hi: 'वास्तविक:',
    mr: 'वास्तविक:',
  },
  {
    en: 'Expected:',
    hi: 'अपेक्षित:',
    mr: 'अपेक्षित:',
  },
  {
    en: 'Harbor:',
    hi: 'बंदरगाह:',
    mr: 'बंदर:',
  },
  {
    en: 'Ask a mission question to view its PFZ, route, and safety layers here.',
    hi: 'मानचित्र पर PFZ, मार्ग और सुरक्षा परतें देखने के लिए मिशन संबंधी प्रश्न पूछें।',
    mr: 'नकाशावर PFZ, मार्ग आणि सुरक्षा स्तर पाहण्यासाठी प्रश्न विचारा.',
  },
  {
    en: 'Mission map & corridors',
    hi: 'मिशन मानचित्र व गलियारे',
    mr: 'मिशन नकाशा व जलमार्ग',
  },
  {
    en: 'Operational Strategy:',
    hi: 'परिचालन रणनीति:',
    mr: 'कार्यपद्धती धोरण:',
  },
  {
    en: 'Min Risk',
    hi: 'न्यूनतम जोखिम',
    mr: 'किमान धोका',
  },
  {
    en: 'Optimal',
    hi: 'इष्टतम',
    mr: 'सर्वोत्तम',
  },
  {
    en: 'Fastest',
    hi: 'तीव्रतम',
    mr: 'सर्वात जलद',
  },
  {
    en: 'Maximizes distance from squall advisory & naval firing buffers',
    hi: 'तूफान चेतावनी और नौसेना फायरिंग बफ़र्स से दूरी को अधिकतम करता है',
    mr: 'वादळ चेतावणी आणि नौदल क्षेत्रांपासून अंतर जास्तीत जास्त ठेवते',
  },
  {
    en: 'Balanced transit time & wave height exposure along coast',
    hi: 'तट के साथ पारगमन समय और लहर की ऊंचाई का संतुलित समन्वय',
    mr: 'किनाऱ्यालगत प्रवासाची वेळ आणि लाटांचा समतोल समन्वय',
  },
  {
    en: 'Direct bearing to target PFZ coordinate (highest weather sensitivity)',
    hi: 'लक्षित PFZ निर्देशांक के लिए सीधा मार्ग (मौसम के प्रति उच्चतम संवेदनशीलता)',
    mr: 'लक्ष्य PFZ कडे थेट मार्ग (हवामानास अत्यंत संवेदनशील)',
  },
  {
    en: 'Routes',
    hi: 'जलमार्ग',
    mr: 'सागरी मार्ग',
  },
  {
    en: 'Est. Distance:',
    hi: 'अनुमानित दूरी:',
    mr: 'अंदाजे अंतर:',
  },
  {
    en: 'Indian Exclusive Economic Zone (Mainland & Arabian Sea / Bay of Bengal)',
    hi: 'भारतीय विशेष आर्थिक क्षेत्र (मुख्य भूमि, अरब सागर एवं बंगाल की खाड़ी)',
    mr: 'भारतीय विशेष आर्थिक क्षेत्र (मुख्य भूमी, अरबी समुद्र व बंगालचा उपसागर)',
  },
  {
    en: 'Indian Exclusive Economic Zone (Andaman & Nicobar Islands)',
    hi: 'भारतीय विशेष आर्थिक क्षेत्र (अंडमान और निकोबार द्वीप समूह)',
    mr: 'भारतीय विशेष आर्थिक क्षेत्र (अंदमान आणि निकोबार बेटे)',
  },
  {
    en: 'Lakshadweep Islands Sovereign Territorial Waters (12 NM)',
    hi: 'लक्षद्वीप द्वीप समूह संप्रभु प्रादेशिक जलसीमा (12 समुद्री मील)',
    mr: 'लक्षद्वीप बेटे सार्वभौम सागरी सीमा (12 समुद्री मैल)',
  },
  {
    en: 'Andaman & Nicobar Islands Sovereign Territorial Waters (12 NM)',
    hi: 'अंडमान और निकोबार संप्रभु प्रादेशिक जलसीमा (12 समुद्री मील)',
    mr: 'अंदमान आणि निकोबार सार्वभौम सागरी सीमा (12 समुद्री मैल)',
  },
  {
    en: 'Indian Exclusive Economic Zone (West Coast)',
    hi: 'भारतीय विशेष आर्थिक क्षेत्र (पश्चिमी तट)',
    mr: 'भारतीय विशेष आर्थिक क्षेत्र (पश्चिम किनारपट्टी)',
  },
];

const CRAFT_TRANSLATIONS: Record<string, { hi: string; mr: string }> = {
  motorized_boat: { hi: 'मोटराइज्ड नाव', mr: 'मोटार बोट' },
  traditional_non_motorized: { hi: 'पारंपरिक नाव (अमोटराइज्ड)', mr: 'पारंपरिक विना-इंजिन होडी' },
  mechanized_trawler: { hi: 'यंत्रीकृत ट्रॉलर', mr: 'यांत्रिकी ट्रॉलर' },
  trawler: { hi: 'ट्रॉलर', mr: 'ट्रॉलर' },
  boat: { hi: 'नाव/बोट', mr: 'बोट' },
  craft: { hi: 'शिल्प/नाव', mr: 'बोट' },
};

function translateCraft(craft: string, lang: 'hi' | 'mr'): string {
  const clean = craft.trim().toLowerCase();
  return CRAFT_TRANSLATIONS[clean]?.[lang] || craft;
}

interface PatternMatcher {
  pattern: RegExp;
  translate: (match: RegExpMatchArray, lang: 'hi' | 'mr') => string;
}

const DYNAMIC_PATTERNS: PatternMatcher[] = [
  // Moderate wave state (1.6m) requires caution for motorized_boat.
  {
    pattern: /moderate\s+wave\s+state\s*\(([\d.]+)\s*m\)\s*requires\s*caution\s*for\s*([^.]+)\.?/i,
    translate: (m, lang) => {
      const wave = m[1];
      const craft = translateCraft(m[2], lang);
      return lang === 'hi'
        ? `मध्यम समुद्री लहर स्थिति (${wave} मी) के कारण ${craft} के लिए सावधानी आवश्यक है।`
        : `मध्यम सागरी लाट स्थिती (${wave} मी) मुळे ${craft} साठी सावधगिरी बाळगणे आवश्यक आहे.`;
    },
  },
  // Simulated conditions exceed safety ceiling: wave height 3.4m.
  {
    pattern: /simulated\s+conditions\s+exceed\s+safety\s+ceiling:?\s*(?:wave\s+height\s*)?([\d.]+)\s*m\.?/i,
    translate: (m, lang) => {
      const wave = m[1];
      return lang === 'hi'
        ? `सिम्युलेटेड स्थितियां सुरक्षा सीमा से अधिक: लहर ऊंचाई ${wave} मी।`
        : `सिम्युलेटेड परिस्थिती सुरक्षा मर्यादेपेक्षा जास्त: लाटांची उंची ${wave} मी.`;
    },
  },
  // Simulated conditions exceed safety ceiling for motorized_boat.
  {
    pattern: /simulated\s+conditions\s+exceed\s+safety\s+ceiling\s+for\s*([^.]+)\.?/i,
    translate: (m, lang) => {
      const craft = translateCraft(m[1], lang);
      return lang === 'hi'
        ? `सिम्युलेटेड स्थितियां ${craft} के लिए सुरक्षा सीमा से अधिक हैं।`
        : `सिम्युलेटेड परिस्थिती ${craft} साठी सुरक्षा मर्यादेपेक्षा जास्त आहे.`;
    },
  },
  // Simulated conditions require operational caution for motorized_boat.
  {
    pattern: /simulated\s+conditions\s+require\s+operational\s+caution\s+for\s*([^.]+)\.?/i,
    translate: (m, lang) => {
      const craft = translateCraft(m[1], lang);
      return lang === 'hi'
        ? `सिम्युलेटेड स्थितियां ${craft} के लिए परिचालन सावधानी की मांग करती हैं।`
        : `सिम्युलेटेड परिस्थिती ${craft} साठी कार्यशील सावधगिरी बाळगण्यास सांगते.`;
    },
  },
  // Significant wave height: 1.6m or Significant wave height: 2.1 m
  {
    pattern: /significant\s+wave\s+height:?\s*([\d.]+)\s*m/i,
    translate: (m, lang) => {
      const wave = m[1];
      return lang === 'hi' ? `महत्वपूर्ण लहर ऊंचाई: ${wave} मी` : `महत्त्वाची लाट उंची: ${wave} मी`;
    },
  },
  // Sustained wind: 15.0 knots / Wind speed: 18 kn
  {
    pattern: /(?:sustained\s+wind|wind\s+speed):?\s*([\d.]+)\s*(?:knots|kn)/i,
    translate: (m, lang) => {
      const wind = m[1];
      return lang === 'hi' ? `हवा की गति: ${wind} नॉट्स` : `वाऱ्याचा वेग: ${wind} नॉट्स`;
    },
  },
  // Vessel profile: motorized_boat
  {
    pattern: /vessel\s+profile:?\s*([a-zA-Z_]+)/i,
    translate: (m, lang) => {
      const craft = translateCraft(m[1], lang);
      return lang === 'hi' ? `पोत/नाव का प्रकार: ${craft}` : `बोटीचा प्रकार: ${craft}`;
    },
  },
  // Operate within 5 nm of coastline (Simulation only).
  {
    pattern: /operate\s+within\s*([\d.]+)\s*nm\s+of\s+coastline(?:\s*\(simulation\s+only\)\.?)?/i,
    translate: (m, lang) => {
      const dist = m[1];
      return lang === 'hi'
        ? `तटरेखा से ${dist} समुद्री मील के भीतर ही संचालन करें (केवल सिमुलेशन)।`
        : `किनारपट्टीपासून ${dist} सागरी मैलाच्या आतच बोट चालवा (केवळ सिम्युलेशन).`;
    },
  },
  // Passage unsafe due to 3.5m wave height.
  {
    pattern: /passage\s+unsafe\s+due\s+to\s*([\d.]+)\s*m\s+wave\s+height\.?/i,
    translate: (m, lang) => {
      const wave = m[1];
      return lang === 'hi'
        ? `${wave} मी लहर ऊंचाई के कारण समुद्री मार्ग असुरक्षित है।`
        : `${wave} मी लाटांच्या उंचीमुळे सागरी मार्ग असुरक्षित आहे.`;
    },
  },
  // Significant wave height exceeds 3.0m threshold
  {
    pattern: /significant\s+wave\s+height\s+exceeds\s*([\d.]+)\s*m\s+threshold/i,
    translate: (m, lang) => {
      const wave = m[1];
      return lang === 'hi'
        ? `लहर ऊंचाई ${wave} मी की सुरक्षा सीमा से अधिक है`
        : `लाटांची उंची ${wave} मी सुरक्षा मर्यादेपेक्षा जास्त आहे`;
    },
  },
  // Simulated PFZ located 12.4 nm bearing 285° from Ratnagiri.
  {
    pattern: /simulated\s+pfz\s+located\s*([\d.]+)\s*nm\s+bearing\s*([\d°]+)\s+from\s*([a-zA-Z]+)\.?/i,
    translate: (m, lang) => {
      const dist = m[1];
      const bearing = m[2];
      const harbor = m[3] === 'Ratnagiri' ? (lang === 'hi' ? 'रत्नागिरी' : 'रत्नागिरी') : m[3];
      return lang === 'hi'
        ? `सिम्युलेटेड मत्स्य क्षेत्र ${harbor} से ${dist} समुद्री मील (दिशा ${bearing}) पर स्थित है।`
        : `सिम्युलेटेड मत्स्य क्षेत्र ${harbor} वरून ${dist} सागरी मैल (दिशा ${bearing}) अंतरावर आहे.`;
    },
  },
  // Authoritative evaluation status: CAUTION / NO_GO
  {
    pattern: /authoritative\s+evaluation\s+status:?\s*(\w+)/i,
    translate: (m, lang) => {
      const stat = m[1];
      return lang === 'hi' ? `आधिकारिक मूल्यांकन स्थिति: ${stat}` : `अधिकृत मूल्यमापन स्थिती: ${stat}`;
    },
  },
];

/**
 * Normalizes text for lenient phrase matching (ignores case, extra spaces, trailing punctuation).
 */
function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"॥।]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Translates general text or phrases to target language using canonical dictionary and dynamic pattern matchers.
 */
export function translateText(text: string, targetLang: SupportedLanguage): string {
  if (!text || targetLang === 'en') return text;
  const clean = normalizeForMatch(text);

  // 1. Direct canonical match
  for (const entry of CANONICAL_TRANSLATION_MAP) {
    if (
      normalizeForMatch(entry.en) === clean ||
      normalizeForMatch(entry.hi) === clean ||
      normalizeForMatch(entry.mr) === clean
    ) {
      return entry[targetLang];
    }
  }

  // 2. Dynamic regex pattern matchers
  for (const dm of DYNAMIC_PATTERNS) {
    const match = text.match(dm.pattern);
    if (match) {
      return dm.translate(match, targetLang as 'hi' | 'mr');
    }
  }

  // 3. Fallback lenient substring match
  for (const entry of CANONICAL_TRANSLATION_MAP) {
    if (
      (clean.includes('nearest potential fishing zone') || clean.includes('pfz') || clean.includes('मत्स्य')) &&
      clean.includes('ratnagiri') &&
      entry.en.includes('Potential Fishing Zone')
    ) {
      return entry[targetLang];
    }
    if (
      (clean.includes('departure from ratnagiri') || clean.includes('no-go') || clean.includes('3.4m') || clean.includes('squall')) &&
      entry.en.includes('NO-GO')
    ) {
      return entry[targetLang];
    }
    if (
      (clean.includes('hazard') || clean.includes('squall') || clean.includes('naval') || clean.includes('restricted')) &&
      entry.en.includes('hazard alert')
    ) {
      return entry[targetLang];
    }
    if (
      (clean.includes('route comparison') || clean.includes('route 1') || clean.includes('lowest cumulative risk')) &&
      entry.en.includes('Route Comparison')
    ) {
      return entry[targetLang];
    }
  }

  return text;
}

/**
 * Translates chat message content, handling multi-line markdown advisories and canonical intents.
 */
export function translateChatMessage(
  content: string,
  targetLang: SupportedLanguage,
  intent?: string
): string {
  if (!content || targetLang === 'en') return content;

  // Intent-directed canonical translation if exact match available
  if (intent) {
    if (intent === 'NEAREST_PFZ' || intent === 'PFZ') {
      const match = CANONICAL_TRANSLATION_MAP.find(e => e.en.includes('Potential Fishing Zone'));
      if (match && (content.includes('Potential Fishing Zone') || content.includes('PFZ'))) {
        return match[targetLang];
      }
    } else if (intent === 'GO_NO_GO_SAFETY') {
      const match = CANONICAL_TRANSLATION_MAP.find(e => e.en.includes('NO-GO'));
      if (match && (content.includes('NO-GO') || content.includes('advised against'))) {
        return match[targetLang];
      }
    } else if (intent === 'HAZARD_BOUNDARY' || intent === 'HAZARDS') {
      const match = CANONICAL_TRANSLATION_MAP.find(e => e.en.includes('hazard alert'));
      if (match && (content.includes('hazard') || content.includes('squall'))) {
        return match[targetLang];
      }
    } else if (intent === 'SAFER_ROUTE' || intent === 'ROUTE') {
      const match = CANONICAL_TRANSLATION_MAP.find(e => e.en.includes('Route Comparison'));
      if (match && (content.includes('Route Comparison') || content.includes('lowest cumulative risk'))) {
        return match[targetLang];
      }
    }
  }

  // Multi-line structured translation
  const lines = content.split('\n');
  const translatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Operational Advisory Header translation
    const advMatch = trimmed.match(/^\[([A-Z_]+)\]\s*(?:Operational\s+Safety\s+Advisory\s+for|Operational\s+Advisory\s+for)\s*([a-zA-Z]+):?$/i);
    if (advMatch) {
      const stat = advMatch[1];
      const harbor = advMatch[2] === 'Ratnagiri' ? 'रत्नागिरी' : advMatch[2];
      return targetLang === 'hi'
        ? `[${stat}] ${harbor} के लिए समुद्री सुरक्षा सलाह:`
        : `[${stat}] ${harbor} साठी सागरी सुरक्षा सल्ला:`;
    }

    // Section headers & inline directives
    if (/^Key Decisive Factors:?$/i.test(trimmed)) {
      return targetLang === 'hi' ? 'प्रमुख निर्णायक कारक:' : 'महत्त्वाचे निर्णायक घटक:';
    }
    const actMatch = trimmed.match(/^(?:Actionable\s+Directive|Recommended\s+Action|Next\s+Action):\s*(.*)$/i);
    if (actMatch) {
      const prefix = targetLang === 'hi' ? 'कार्रवाई निर्देश: ' : 'कृती सल्ला: ';
      return prefix + (actMatch[1] ? translateText(actMatch[1], targetLang) : '');
    }
    const suppMatch = trimmed.match(/^Supporting\s+Evidence:\s*(.*)$/i);
    if (suppMatch) {
      const prefix = targetLang === 'hi' ? 'साक्ष्य आधार: ' : 'पुरावा आधार: ';
      return prefix + (suppMatch[1] ? translateText(suppMatch[1], targetLang) : '');
    }
    const warnMatch = trimmed.match(/^Operational\s+Warnings:\s*(.*)$/i);
    if (warnMatch) {
      const prefix = targetLang === 'hi' ? 'परिचालन चेतावनी: ' : 'परिचालन सूचना: ';
      return prefix + (warnMatch[1] ? translateText(warnMatch[1], targetLang) : '');
    }
    if (/^Notice:\s*Advisory analysis based on authoritative marine and weather observations\.?$/i.test(trimmed)) {
      return targetLang === 'hi'
        ? 'सूचना: यह मूल्यांकन आधिकारिक समुद्री और मौसम डेटा पर आधारित सलाह है।'
        : 'सूचना: हे मूल्यमापन अधिकृत सागरी व हवामान माहितीवर आधारित सल्लागार विश्लेषण आहे.';
    }
    if (/^Notice:\s*This is demonstration data for software verification and is NOT a live fishing advisory\.?$/i.test(trimmed)) {
      return targetLang === 'hi'
        ? 'सूचना: यह सॉफ्टवेयर सत्यापन के लिए प्रदर्शन डेटा है और लाइव मत्स्य पालन सलाह नहीं है।'
        : 'सूचना: हे सॉफ्टवेअर पडताळणीसाठी प्रात्यक्षिक डेटा आहे आणि थेट मासेमारी सल्ला नाही.';
    }

    // Bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const prefix = trimmed.slice(0, 2);
      const itemText = trimmed.slice(2);
      return prefix + translateText(itemText, targetLang);
    }

    return translateText(line, targetLang);
  });

  return translatedLines.join('\n');
}

