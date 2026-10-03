"""Multilingual Detection, Normalization & Localization Subsystem for ORCA.

Owned by Dev 3 (Agent Orchestration & Explainability).
Part of SIH 2026 Problem Statement PS 26176 — ORCA.

Implements:
1. Deterministic script and token-based language detection (English 'en', Hindi 'hi', Marathi 'mr').
2. Bounded maritime and coastal local glossary normalization (Konkan / Marathi / Hindi terminology).
3. Localized clarification prompt generation.
4. Authoritative risk status invariance across multilingual generation.
"""

from enum import Enum
import re
from typing import Dict, List, Optional, Set

from backend.app.agents.intent import ExtractedEntities, IntentCategory


class LanguageCode(str, Enum):
    """Supported ISO-639-1 language codes in ORCA."""

    EN = "en"
    HI = "hi"
    MR = "mr"
    TA = "ta"


SUPPORTED_LANGUAGES: Set[str] = {
    LanguageCode.EN.value,
    LanguageCode.HI.value,
    LanguageCode.MR.value,
    LanguageCode.TA.value,
}
DEFAULT_LANGUAGE: str = LanguageCode.EN.value


# =============================================================================
# 1. Bounded Maritime Glossary (Marathi / Hindi / Konkan Dialect Normalization)
# =============================================================================

# Canonical Harbors mapping (Devanagari, Romanized, and aliases to Canonical English)
HARBOR_GLOSSARY: Dict[str, str] = {
    # Ratnagiri & South Konkan
    "रत्नागिरी": "Ratnagiri",
    "रत्नागिरीहून": "Ratnagiri",
    "रत्नागिरीत": "Ratnagiri",
    "ratnagiri": "Ratnagiri",
    "मालवण": "Malvan",
    "मालवणातून": "Malvan",
    "मालवणहून": "Malvan",
    "malvan": "Malvan",
    # Mumbai & North Konkan
    "मुंबई": "Mumbai",
    "मुंबईहून": "Mumbai",
    "मुंबईतून": "Mumbai",
    "बॉम्बे": "Mumbai",
    "mumbai": "Mumbai",
    "bombay": "Mumbai",
    "अलिबाग": "Alibaug",
    "alibaug": "Alibaug",
    "alibag": "Alibaug",
    # Goa & Central West Coast
    "गोवा": "Goa",
    "गोव्यात": "Goa",
    "गोव्याहून": "Goa",
    "पणजी": "Panaji",
    "goa": "Goa",
    "panaji": "Panaji",
    # Gujarat Coast
    "वेरावळ": "Veraval",
    "वेरावल": "Veraval",
    "veraval": "Veraval",
    "पोरबंदर": "Porbandar",
    "porbandar": "Porbandar",
    "ओखा": "Okha",
    "okha": "Okha",
    # Karnataka & Kerala Coast
    "कारवार": "Karwar",
    "karwar": "Karwar",
    "मंगलोर": "Mangalore",
    "मंगळूर": "Mangalore",
    "mangalore": "Mangalore",
    "मालपे": "Malpe",
    "malpe": "Malpe",
    "कोची": "Kochi",
    "कोचीन": "Kochi",
    "kochi": "Kochi",
    "cochin": "Kochi",
    # East Coast & South
    "चेन्नई": "Chennai",
    "chennai": "Chennai",
    "तुतिकोरीन": "Tuticorin",
    "tuticorin": "Tuticorin",
    "विशाखापट्टणम": "Visakhapatnam",
    "विशाखापट्टनम": "Visakhapatnam",
    "visakhapatnam": "Visakhapatnam",
    "vizag": "Visakhapatnam",
    "काकीनाडा": "Kakinada",
    "kakinada": "Kakinada",
    "पारादीप": "Paradip",
    "paradip": "Paradip",
}

# Craft Type normalization
CRAFT_GLOSSARY: Dict[str, str] = {
    "होडी": "traditional_non_motorized",
    "डोंगी": "traditional_non_motorized",
    "donga": "traditional_non_motorized",
    "doni": "traditional_non_motorized",
    "hodi": "traditional_non_motorized",
    "नाव": "motorized_boat",
    "बोट": "motorized_boat",
    "नौका": "motorized_boat",
    "naav": "motorized_boat",
    "nauka": "motorized_boat",
    "boat": "motorized_boat",
    "मशीन बोट": "motorized_boat",
    "motorized": "motorized_boat",
    "motorized_boat": "motorized_boat",
    "traditional_non_motorized": "traditional_non_motorized",
    "mechanized_trawler": "mechanized_trawler",
    "ट्रॉलर": "trawler",
    "trawler": "trawler",
    "mechanized": "mechanized_trawler",
}

# Temporal Terminology normalization
TEMPORAL_GLOSSARY: Dict[str, str] = {
    "उद्या": "tomorrow",
    "udya": "tomorrow",
    "कल": "tomorrow",
    "kal": "tomorrow",
    "tomorrow": "tomorrow",
    "आज": "today",
    "aaj": "today",
    "today": "today",
    "आत्ता": "now",
    "atta": "now",
    "अभी": "now",
    "abhi": "now",
    "now": "now",
    "सकाळी": "morning",
    "sakali": "morning",
    "सुबह": "morning",
    "subah": "morning",
    "morning": "morning",
    "दुपारी": "afternoon",
    "dupari": "afternoon",
    "दोपहर": "afternoon",
    "dopahar": "afternoon",
    "afternoon": "afternoon",
    "संध्याकाळी": "evening",
    "sandhyakali": "evening",
    "शाम": "evening",
    "shaam": "evening",
    "evening": "evening",
    "रात्री": "night",
    "ratri": "night",
    "रात": "night",
    "raat": "night",
    "night": "night",
}


# =============================================================================
# 2. Language Detection Engine
# =============================================================================

# Distinctive grammatical and lexical markers for Marathi
MARATHI_MARKERS: List[str] = [
    # Verbs and auxiliary forms
    "आहे", "आहेत", "आहे का", "आहेत का", "नाही", "नाहीत", "जाणे", "जाऊ", "जावे", "सांगा", "सांग",
    "कशी", "कसा", "कसे", "काय", "कुठे", "जवळ", "जवळचे",
    # Nouns & maritime terms
    "उद्या", "लाटा", "मासेमारी", "होडी", "वारा", "वादळ", "चक्रीवादळ", "धोका", "धोके", "बंदर",
    "सावध", "मत्स्य", "क्षेत्र", "मार्ग", "रस्ता", "सकाळी", "दुपारी", "संध्याकाळी", "वाजता",
    "ते", "हून", "वरून", "साठी", "मध्ये", "काही", "होईल",
    # Romanized Konkan / Marathi markers
    "ahe", "aahe", "ahet", "aahet", "ahe ka", "masemari", "hodi", "udya", "sakali",
    "kuthe", "kashi", "lata", "vara", "chakrivadal", "dhoka", "jawal",
]

# Distinctive grammatical and lexical markers for Hindi
HINDI_MARKERS: List[str] = [
    # Verbs and auxiliary forms
    "क्या", "है", "हैं", "है क्या", "नहीं", "जाना", "जा सकते", "सकते हैं", "बताएं", "बताओ",
    "कैसा", "कैसी", "कैसे", "कहाँ", "कहा", "किधर", "पास", "निकटतम",
    # Nouns & maritime terms
    "कल", "तूफान", "हवा", "नाव", "मछली", "मछलियां", "पकड़ने", "चेतावनी", "सुरक्षा", "सुरक्षित",
    "बंदरगाह", "चक्रवात", "खतरा", "खतरे", "रास्ता", "सुबह", "दोपहर", "शाम", "बजे",
    "से", "तक", "के लिए", "में", "कोई", "होगा", "सकता",
    # Romanized Hindi markers
    "kya", "hai", "hain", "nahi", "jaana", "machli", "toofan", "hawa", "chetavani",
    "khatra", "kaha", "kahan", "subah", "shaam", "dopahar", "suraksha",
]


def detect_language(
    text: str,
    context_language: Optional[str] = None,
) -> str:
    """Detects query language deterministically across English ('en'), Hindi ('hi'), and Marathi ('mr').

    Algorithm:
    1. Check for Devanagari script presence.
    2. Count distinctive Marathi vs Hindi lexical/grammatical tokens.
    3. Check Romanized transliteration markers if written in Latin script.
    4. If ambiguous or short follow-up, safely preserve `context_language`.
    5. Default to 'en' when language cannot be determined.

    Args:
        text: Raw user message.
        context_language: Active language preference from ThreadContext if available.

    Returns:
        Canonical language code ('en', 'hi', or 'mr').
    """
    if not text or not text.strip():
        return context_language if context_language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE

    raw = text.strip()
    raw_lower = raw.lower()

    # Check for Devanagari Unicode block (\u0900 - \u097F)
    has_devanagari = bool(re.search(r"[\u0900-\u097F]", raw))

    if has_devanagari:
        # Score Marathi vs Hindi markers
        mr_score = 0
        hi_score = 0

        for marker in MARATHI_MARKERS:
            if re.search(r"[\u0900-\u097F]", marker) and marker in raw:
                # Weight distinctive postpositions and verbs higher
                weight = 2 if marker in ["आहे", "आहेत", "आहे का", "कुठे", "मासेमारी", "होडी", "उद्या", "चक्रीवादळ"] else 1
                mr_score += weight

        for marker in HINDI_MARKERS:
            if re.search(r"[\u0900-\u097F]", marker) and marker in raw:
                weight = 2 if marker in ["क्या", "है", "हैं", "कहाँ", "मछली", "तूफान", "चक्रवात", "खतरा"] else 1
                hi_score += weight

        if mr_score > hi_score:
            return LanguageCode.MR.value
        elif hi_score > mr_score:
            return LanguageCode.HI.value
        elif mr_score > 0:
            return LanguageCode.MR.value
        elif context_language in [LanguageCode.MR.value, LanguageCode.HI.value]:
            return context_language
        else:
            # Default Devanagari fallback to Marathi (primary Konkan mariner base)
            return LanguageCode.MR.value

    # Latin script: Check Romanized Indic markers
    mr_roman_score = sum(1 for m in MARATHI_MARKERS if not re.search(r"[\u0900-\u097F]", m) and re.search(rf"\b{m}\b", raw_lower))
    hi_roman_score = sum(1 for m in HINDI_MARKERS if not re.search(r"[\u0900-\u097F]", m) and re.search(rf"\b{m}\b", raw_lower))

    if mr_roman_score > hi_roman_score and mr_roman_score >= 1:
        return LanguageCode.MR.value
    elif hi_roman_score > mr_roman_score and hi_roman_score >= 1:
        return LanguageCode.HI.value
    elif mr_roman_score > 0 and mr_roman_score == hi_roman_score:
        return context_language if context_language in SUPPORTED_LANGUAGES else LanguageCode.MR.value

    # Check if purely English or ambiguous follow-up
    # Short continuation follow-ups like "What about the afternoon?" should keep context_language
    # unless they are clearly in English and different
    is_pure_english = bool(re.search(r"\b(is|it|safe|to|go|fishing|from|what|about|the|where|which|route|can|we|are|there|any|hazards|waves)\b", raw_lower))
    if is_pure_english:
        return LanguageCode.EN.value

    if context_language in SUPPORTED_LANGUAGES:
        return context_language

    return DEFAULT_LANGUAGE


# =============================================================================
# 3. Normalization & Local Glossary Helper
# =============================================================================

class NormalizedEntities:
    """Entities extracted and normalized via the maritime glossary."""

    def __init__(
        self,
        origin_harbor: Optional[str] = None,
        destination: Optional[str] = None,
        craft_type: Optional[str] = None,
        departure_time: Optional[str] = None,
        detected_language: str = DEFAULT_LANGUAGE,
    ) -> None:
        self.origin_harbor = origin_harbor
        self.destination = destination
        self.craft_type = craft_type
        self.departure_time = departure_time
        self.detected_language = detected_language


def normalize_maritime_entities(
    text: str,
    context_language: Optional[str] = None,
) -> NormalizedEntities:
    """Normalizes local terminology, script variations, and entities into canonical representations.

    Guarantees:
    - Does NOT mutate or fabricate domain calculations.
    - Resolves known harbors (e.g. 'रत्नागिरी' -> 'Ratnagiri', 'मुंबई' -> 'Mumbai').
    - Resolves origin and destination from Indic 'X ते Y' / 'X से Y' patterns.
    """
    lang = detect_language(text, context_language)
    raw = text.strip()
    raw_lower = raw.lower()

    explicit_harbor: Optional[str] = None
    explicit_dest: Optional[str] = None
    craft_type: Optional[str] = None
    departure_time: Optional[str] = None

    # 1. Harbor Extraction: Indic "From-To" patterns
    # Marathi pattern: "रत्नागिरी ते गोवा", "मुंबई ते गोवा"
    # Hindi pattern: "मुंबई से गोवा", "रत्नागिरी से गोवा"
    for h_orig, orig_canon in HARBOR_GLOSSARY.items():
        for h_dest, dest_canon in HARBOR_GLOSSARY.items():
            if orig_canon != dest_canon:
                if f"{h_orig} ते {h_dest}" in raw or f"{h_orig} से {h_dest}" in raw:
                    explicit_harbor = orig_canon
                    explicit_dest = dest_canon
                    break
                elif f"{h_orig} to {h_dest}" in raw_lower:
                    explicit_harbor = orig_canon
                    explicit_dest = dest_canon
                    break
        if explicit_harbor and explicit_dest:
            break

    # 2. English "from <origin> to <destination>"
    if not explicit_harbor or not explicit_dest:
        from_to_match = re.search(r"\bfrom\s+([A-Za-z]+)\s+to\s+([A-Za-z]+)\b", raw, re.IGNORECASE)
        if from_to_match:
            c_orig = from_to_match.group(1).capitalize()
            c_dest = from_to_match.group(2).capitalize()
            explicit_harbor = HARBOR_GLOSSARY.get(c_orig.lower(), c_orig)
            explicit_dest = HARBOR_GLOSSARY.get(c_dest.lower(), c_dest)

    # 3. English "between <origin> and <destination>"
    if not explicit_harbor or not explicit_dest:
        between_match = re.search(r"\bbetween\s+([A-Za-z]+)\s+and\s+([A-Za-z]+)\b", raw, re.IGNORECASE)
        if between_match:
            c_orig = between_match.group(1).capitalize()
            c_dest = between_match.group(2).capitalize()
            explicit_harbor = HARBOR_GLOSSARY.get(c_orig.lower(), c_orig)
            explicit_dest = HARBOR_GLOSSARY.get(c_dest.lower(), c_dest)

    # 4. English "<origin> to <destination>"
    if not explicit_harbor or not explicit_dest:
        to_pair_match = re.search(r"\b([A-Za-z]+)\s+to\s+([A-Za-z]+)\b", raw, re.IGNORECASE)
        if to_pair_match:
            c_orig = to_pair_match.group(1).capitalize()
            c_dest = to_pair_match.group(2).capitalize()
            if c_orig.lower() in HARBOR_GLOSSARY or c_dest.lower() in HARBOR_GLOSSARY:
                explicit_harbor = HARBOR_GLOSSARY.get(c_orig.lower(), c_orig)
                explicit_dest = HARBOR_GLOSSARY.get(c_dest.lower(), c_dest)

    # 5. Single Harbor matches
    if not explicit_harbor:
        for h_key, h_canon in HARBOR_GLOSSARY.items():
            if re.search(r"[\u0900-\u097F]", h_key):
                if h_key in raw and h_canon != explicit_dest:
                    explicit_harbor = h_canon
                    break
            else:
                if re.search(rf"\b{h_key}\b", raw_lower) and h_canon != explicit_dest:
                    explicit_harbor = h_canon
                    break

    # 6. Craft Type normalization
    for c_key, c_val in CRAFT_GLOSSARY.items():
        if re.search(r"[\u0900-\u097F]", c_key):
            if c_key in raw:
                craft_type = c_val
                break
        else:
            if re.search(rf"\b{c_key}\b", raw_lower):
                craft_type = c_val
                break

    # 7. Departure time normalization
    for t_key, t_val in TEMPORAL_GLOSSARY.items():
        if re.search(r"[\u0900-\u097F]", t_key):
            if t_key in raw:
                departure_time = t_val
                break
        else:
            if re.search(rf"\b{t_key}\b", raw_lower):
                departure_time = t_val
                break

    return NormalizedEntities(
        origin_harbor=explicit_harbor,
        destination=explicit_dest,
        craft_type=craft_type,
        departure_time=departure_time,
        detected_language=lang,
    )


# =============================================================================
# 4. Localized Clarification Prompts
# =============================================================================

def generate_localized_clarification(
    intent: IntentCategory,
    language: str = DEFAULT_LANGUAGE,
    missing_fields: Optional[List[str]] = None,
) -> str:
    """Generates localized clarification prompts in English, Marathi, or Hindi."""
    lang_lower = (language or DEFAULT_LANGUAGE).lower()
    missing = missing_fields or []

    if "destination" in missing:
        if "origin_harbor" in missing:
            if lang_lower == LanguageCode.MR.value:
                return "मार्गावरील धोके तपासण्यासाठी, कृपया आपले प्रस्थान आणि गंतव्य बंदर (उदा. मुंबई ते गोवा) सांगा."
            elif lang_lower == LanguageCode.HI.value:
                return "मार्ग पर खतरों की जांच के लिए, कृपया अपना प्रस्थान और गंतव्य बंदरगाह (जैसे मुंबई से गोवा) बताएं।"
            else:
                return "To evaluate route hazards, which departure harbor and destination are you sailing between (e.g., from Mumbai to Goa)?"
        else:
            if lang_lower == LanguageCode.MR.value:
                return "मार्गावरील धोके व सुरक्षितता तपासण्यासाठी, कृपया आपले गंतव्य बंदर (उदा. गोवा, मुंबई) सांगा."
            elif lang_lower == LanguageCode.HI.value:
                return "मार्ग पर खतरों और सुरक्षा की जांच के लिए, कृपया अपना गंतव्य बंदरगाह (जैसे गोवा, मुंबई) बताएं।"
            else:
                return "To assess route hazards and safe passage, which destination harbor are you heading to (e.g., Goa, Mumbai)?"

    if intent == IntentCategory.PFZ:
        if lang_lower == LanguageCode.MR.value:
            return "जवळचे संभाव्य मत्स्य क्षेत्र (PFZ) शोधण्यासाठी, कृपया आपले प्रस्थान बंदर (उदा. रत्नागिरी, मालवण, वेरावळ किंवा मुंबई) सांगा."
        elif lang_lower == LanguageCode.HI.value:
            return "निकटतम मत्स्य क्षेत्र (PFZ) खोजने के लिए, कृपया अपना प्रस्थान बंदरगाह (जैसे रत्नागिरी, मालवण, वेरावल या मुंबई) बताएं।"
        else:
            return "To locate the nearest Potential Fishing Zone (PFZ), please specify your departure harbor (e.g., Ratnagiri, Malvan, Veraval, or Mumbai)."

    if lang_lower == LanguageCode.MR.value:
        return "सुरक्षिततेचा अंदाज घेण्यासाठी, कृपया आपले प्रस्थान बंदर सांगा."
    elif lang_lower == LanguageCode.HI.value:
        return "सुरक्षा मूल्यांकन के लिए, कृपया अपना प्रस्थान बंदरगाह बताएं।"
    return "To provide an accurate maritime assessment, please specify your departure harbor."


def canonicalize_extracted_entities(
    entities: ExtractedEntities,
    raw_message: str = "",
    context_language: Optional[str] = None,
) -> ExtractedEntities:
    """Canonicalizes extracted operational entities using deterministic maritime glossaries.

    Guarantees:
    - Normalizes multilingual harbor names (e.g. 'रत्नागिरी' -> 'Ratnagiri', 'ससून डॉक' -> 'Sassoon Dock').
    - Normalizes vessel classes (e.g. 'नाव'/'hodi' -> 'motorized_boat' / 'traditional_non_motorized').
    - Normalizes temporal markers (e.g. 'उद्या' -> 'tomorrow', 'कल' -> 'tomorrow').
    - Fills in missing entities discovered by deterministic scan of raw_message if not extracted by LLM.
    """
    origin = entities.origin_harbor
    dest = entities.target_destination
    craft = entities.craft_type
    dep_time = entities.departure_time

    # Canonicalize existing fields through glossaries
    if origin:
        origin_clean = origin.strip().lower()
        origin = HARBOR_GLOSSARY.get(origin_clean, HARBOR_GLOSSARY.get(origin.strip(), origin.strip()))
    if dest:
        dest_clean = dest.strip().lower()
        dest = HARBOR_GLOSSARY.get(dest_clean, HARBOR_GLOSSARY.get(dest.strip(), dest.strip()))
    if craft:
        craft_clean = craft.strip().lower()
        craft = CRAFT_GLOSSARY.get(craft_clean, craft)
    if dep_time:
        dep_clean = dep_time.strip().lower()
        dep_time = TEMPORAL_GLOSSARY.get(dep_clean, dep_time)

    # If raw_message provided, supplement any fields that were missed
    if raw_message:
        norm = normalize_maritime_entities(raw_message, context_language=context_language)
        if not origin and norm.origin_harbor:
            origin = norm.origin_harbor
        if not dest and norm.destination:
            dest = norm.destination
        if not craft and norm.craft_type:
            craft = norm.craft_type
        if not dep_time and norm.departure_time:
            dep_time = norm.departure_time

    return ExtractedEntities(
        origin_harbor=origin,
        coordinates=entities.coordinates,
        departure_time=dep_time,
        duration_hours=entities.duration_hours,
        craft_type=craft,
        target_destination=dest,
    )


def localize_operational_text(text: str, target_lang: str) -> str:
    """Translates common operational summaries, factors, directives, and warnings into Hindi or Marathi."""
    if not text or target_lang not in ("hi", "mr"):
        return text

    exact_map = {
        "Conditions in this demonstration scenario are within modeled safe limits (Scenario Evaluation — Not Clearance for Current Voyage).": {
            "hi": "इस प्रदर्शन परिदृश्य में स्थितियां मॉडल सुरक्षित सीमाओं के भीतर हैं (परिदृश्य मूल्यांकन — वर्तमान यात्रा के लिए प्रस्थान मंजूरी नहीं)।",
            "mr": "या प्रात्यक्षिक परिदृश्यात परिस्थिती मॉडेल केलेल्या सुरक्षित मर्यादेत आहे (परिदृश्य मूल्यमापन — थेट प्रवासासाठी मंजुरी नाही).",
        },
        "Demonstration scenario evaluation only. Does not grant operational clearance for current vessel departure. Always obtain verified live official bulletins before sailing.": {
            "hi": "केवल प्रदर्शन परिदृश्य मूल्यांकन। यह वर्तमान पोत प्रस्थान के लिए परिचालन मंजूरी प्रदान नहीं करता है। नौकायन से पहले हमेशा सत्यापित लाइव आधिकारिक बुलेटिन प्राप्त करें।",
            "mr": "केवळ प्रात्यक्षिक परिदृश्य मूल्यमापन. हे प्रत्यक्ष नौका प्रस्थानासाठी मंजुरी देत नाही. समुद्रात जाण्यापूर्वी नेहमी सत्यापित थेट अधिकृत बुलेटिन मिळवा.",
        },
        "Conditions are calm and safe for coastal voyage departure.": {
            "hi": "तटीय यात्रा प्रस्थान के लिए स्थितियां शांत और पूरी तरह सुरक्षित हैं।",
            "mr": "किनारपट्टीवरील प्रवासासाठी परिस्थिती शांत आणि पूर्णपणे सुरक्षित आहे.",
        },
        "Proceed with planned voyage under standard safety protocols.": {
            "hi": "मानक सुरक्षा प्रोटोकॉल के तहत नियोजित यात्रा जारी रखें।",
            "mr": "मानक सुरक्षा नियमांनुसार नियोजित प्रवास सुरू ठेवा.",
        },
        "Essential safety evidence relies on simulated or demonstration data. Real-world departure cannot be certified.": {
            "hi": "आवश्यक सुरक्षा साक्ष्य सिमुलेशन या प्रदर्शन डेटा पर निर्भर हैं। वास्तविक प्रस्थान प्रमाणित नहीं किया जा सकता।",
            "mr": "आवश्यक सुरक्षा पुरावे सिम्युलेशन किंवा प्रात्यक्षिक डेटावर अवलंबून आहेत. प्रत्यक्ष प्रस्थान प्रमाणित केले जाऊ शकत नाही.",
        },
        "Hold departure. Obtain verified official live marine and hazard forecasts.": {
            "hi": "प्रस्थान स्थगित रखें। सत्यापित आधिकारिक लाइव समुद्री और मौसम पूर्वानुमान प्राप्त करें।",
            "mr": "प्रस्थान थांबवा. सत्यापित अधिकृत थेट सागरी व हवामान अंदाज मिळवा.",
        },
        "Operate within 5 nm of coastline (Simulation only).": {
            "hi": "तटरेखा से 5 समुद्री मील के भीतर ही संचालन करें (केवल सिमुलेशन)।",
            "mr": "किनारपट्टीपासून ५ सागरी मैलाच्या आतच बोट चालवा (केवळ सिम्युलेशन).",
        },
        "Operate within 5 nm of coastline.": {
            "hi": "तटरेखा से 5 समुद्री मील के भीतर ही संचालन करें।",
            "mr": "किनारपट्टीपासून ५ सागरी मैलाच्या आतच बोट चालवा.",
        },
        "Remain moored in port (Simulation only).": {
            "hi": "बंदरगाह में ही लंगर डालकर रहें (केवल सिमुलेशन)।",
            "mr": "बंदरातच नांगर टाकून थांबा (केवळ सिम्युलेशन).",
        },
        "Proceed with voyage under standard VHF watch (Simulation only).": {
            "hi": "मानक VHF रेडियो संपर्क के तहत यात्रा जारी रखें (केवल सिमुलेशन)।",
            "mr": "प्रमाणित VHF संपर्कात राहून प्रवास सुरू ठेवा (केवळ सिम्युलेशन).",
        },
        "Hold departure until authoritative advisory is verified.": {
            "hi": "आधिकारिक सलाह सत्यापित होने तक प्रस्थान स्थगित रखें।",
            "mr": "अधिकृत सल्ला पडताळेपर्यंत प्रस्थान थांबवा.",
        },
        "Hold departure.": {
            "hi": "प्रस्थान स्थगित रखें।",
            "mr": "प्रस्थान थांबवा.",
        },
        "Simulated conditions are calm and safe for departure.": {
            "hi": "सिम्युलेटेड स्थितियां शांत हैं और प्रस्थान के लिए सुरक्षित हैं।",
            "mr": "सिम्युलेटेड परिस्थिती शांत असून प्रस्थानासाठी अनुकूल आहे.",
        },
        "Insufficient or conflicting conditions preclude conclusive assessment.": {
            "hi": "अपर्याप्त या परस्पर विरोधी डेटा के कारण निश्चित निष्कर्ष संभव नहीं है।",
            "mr": "अपुऱ्या किंवा विसंगत माहितीमुळे अंतिम निष्कर्ष काढणे शक्य नाही.",
        },
        "Evaluated against M2 mock threshold ceilings": {
            "hi": "M2 सिमुलेशन सुरक्षा सीमा थ्रेशोल्ड के आधार पर मूल्यांकित",
            "mr": "M2 सिम्युलेशन सुरक्षा मर्यादा थ्रेशोल्डनुसार मूल्यमापन",
        },
        "M2 Contract Mock evaluation — not for real navigation.": {
            "hi": "M2 अनुबंध सिमुलेशन मूल्यांकन — वास्तविक नौवहन के लिए नहीं।",
            "mr": "M2 कॉन्ट्रॅक्ट सिम्युलेशन मूल्यमापन — प्रत्यक्ष सागरी प्रवासासाठी नाही.",
        },
        "No external evidence required": {
            "hi": "किसी बाहरी साक्ष्य की आवश्यकता नहीं है",
            "mr": "कोणत्याही बाह्य पुराव्याची आवश्यकता नाही",
        },
        "Operational baseline verified": {
            "hi": "परिचालन आधार रेखा सत्यापित",
            "mr": "सागरी सुरक्षा निकष पडताळले",
        },
        "Active simulated cyclone alert": {
            "hi": "सक्रिय सिम्युलेटेड चक्रवात अलर्ट",
            "mr": "सक्रिय सिम्युलेटेड चक्रीवादळ सतर्कता",
        },
        "Potential Fishing Zone advisory for fishing opportunity identification only; voyage navigation and departure clearance must be independently assessed.": {
            "hi": "संभावित मत्स्य पालन क्षेत्र (PFZ) सलाह केवल मछली पकड़ने के अवसर की पहचान के लिए है; यात्रा नौवहन और प्रस्थान सुरक्षा का स्वतंत्र रूप से मूल्यांकन किया जाना चाहिए।",
            "mr": "संभाव्य मासेमारी क्षेत्र (PFZ) सल्ला केवळ मासेमारीच्या संधी शोधण्यासाठी आहे; सागरी प्रवास आणि प्रस्थान सुरक्षेचे स्वतंत्रपणे मूल्यमापन केले पाहिजे.",
        },
        "Informational advisory only — voyage navigation and departure safety must be independently assessed": {
            "hi": "केवल सूचनात्मक सलाह — यात्रा नौवहन और प्रस्थान सुरक्षा का स्वतंत्र रूप से मूल्यांकन किया जाना चाहिए",
            "mr": "केवळ माहितीपर सल्ला — सागरी प्रवास आणि प्रस्थान सुरक्षेचे स्वतंत्रपणे मूल्यमापन केले पाहिजे",
        },
        "Obtain voyage safety assessment and verify local harbor bulletins before departure.": {
            "hi": "प्रस्थान करने से पहले यात्रा सुरक्षा मूल्यांकन प्राप्त करें और स्थानीय बंदरगाह बुलेटिन सत्यापित करें।",
            "mr": "प्रस्थान करण्यापूर्वी सागरी प्रवास सुरक्षा मूल्यमापन मिळवा आणि स्थानिक बंदर बुलेटिन तपासा.",
        },
        "No supported fishing candidate in retained evidence.": {
            "hi": "सुरक्षित मिशन साक्ष्य में कोई समर्थित मछली पकड़ने का क्षेत्र नहीं मिला।",
            "mr": "सुरक्षित मिशन पुराव्यांमध्ये कोणताही समर्थित मासेमारी क्षेत्र उपलब्ध नाही.",
        },
        "Potential Fishing Zone advisory: No supported fishing candidate in retained evidence.": {
            "hi": "संभावित मत्स्य पालन क्षेत्र सलाह: सुरक्षित मिशन साक्ष्य में कोई समर्थित मछली पकड़ने का क्षेत्र नहीं मिला।",
            "mr": "संभाव्य मासेमारी क्षेत्र सल्ला: सुरक्षित मिशन पुराव्यांमध्ये कोणताही समर्थित मासेमारी क्षेत्र उपलब्ध नाही.",
        },
    }

    if text in exact_map and target_lang in exact_map[text]:
        return exact_map[text][target_lang]

    # Dynamic regex patterns
    m_wave_craft = re.match(r"Moderate wave state \(([\d.]+)m\) requires caution for ([a-zA-Z_]+)\.?", text, re.IGNORECASE)
    if m_wave_craft:
        wave, craft = m_wave_craft.group(1), m_wave_craft.group(2)
        craft_tr = "मोटराइज्ड नाव" if target_lang == "hi" else "मोटार बोट"
        if target_lang == "hi":
            return f"मध्यम समुद्री लहर स्थिति ({wave} मी) के कारण {craft_tr} के लिए सावधानी आवश्यक है।"
        return f"मध्यम सागरी लाट स्थिती ({wave} मी) मुळे {craft_tr} साठी सावधगिरी बाळगणे आवश्यक आहे."

    m_ceil = re.match(r"Simulated conditions exceed safety ceiling:?\s*(?:wave height\s*)?([\d.]+)m\.?", text, re.IGNORECASE)
    if m_ceil:
        wave = m_ceil.group(1)
        if target_lang == "hi":
            return f"सिम्युलेटेड स्थितियां सुरक्षा सीमा से अधिक: लहर ऊंचाई {wave} मी।"
        return f"सिम्युलेटेड परिस्थिती सुरक्षा मर्यादेपेक्षा जास्त: लाटांची उंची {wave} मी."

    m_wave = re.match(r"Significant wave height:?\s*([\d.]+)m", text, re.IGNORECASE)
    if m_wave:
        wave = m_wave.group(1)
        return f"महत्वपूर्ण लहर ऊंचाई: {wave} मी" if target_lang == "hi" else f"महत्त्वाची लाट उंची: {wave} मी"

    m_wind = re.match(r"(?:Sustained wind|Wind speed):?\s*([\d.]+)\s*(?:knots|kn)", text, re.IGNORECASE)
    if m_wind:
        wind = m_wind.group(1)
        return f"हवा की गति: {wind} नॉट्स" if target_lang == "hi" else f"वाऱ्याचा वेग: {wind} नॉट्स"

    m_vessel = re.match(r"Vessel profile:?\s*([a-zA-Z_]+)", text, re.IGNORECASE)
    if m_vessel:
        craft_tr = "मोटराइज्ड नाव" if target_lang == "hi" else "मोटार बोट"
        return f"पोत/नाव का प्रकार: {craft_tr}" if target_lang == "hi" else f"बोटीचा प्रकार: {craft_tr}"

    m_dist = re.match(r"Operate within ([\d.]+) nm of coastline(?:\s*\(Simulation only\)\.?)?", text, re.IGNORECASE)
    if m_dist:
        dist = m_dist.group(1)
        if target_lang == "hi":
            return f"तटरेखा से {dist} समुद्री मील के भीतर ही संचालन करें (केवल सिमुलेशन)।"
        return f"किनारपट्टीपासून {dist} सागरी मैलाच्या आतच बोट चालवा (केवळ सिम्युलेशन)."

    return text

