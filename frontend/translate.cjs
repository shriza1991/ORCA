const fs = require('fs');
const path = require('path');

// Target languages required for ORCA
const TARGET_LANGUAGES = ['hi', 'mr', 'ta', 'te'];
const LOCALES_DIR = path.join(__dirname, 'src', 'i18n', 'locales');
const EN_JSON_PATH = path.join(LOCALES_DIR, 'en.json');

// Ensure locales directory exists
if (!fs.existsSync(LOCALES_DIR)) {
  fs.mkdirSync(LOCALES_DIR, { recursive: true });
}

// Bhashini API Configuration (Replace with actual endpoint and key in .env)
const BHASHINI_API_URL = process.env.BHASHINI_API_URL || "https://bhashini.gov.in/api/translate";
const BHASHINI_API_KEY = process.env.BHASHINI_API_KEY || "dummy_key";

/**
 * Mock Bhashini API Call (Replace with real `fetch` when API key is available)
 */
async function translateText(text, targetLang) {
  try {
    /* 
    // REAL IMPLEMENTATION:
    const response = await fetch(BHASHINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BHASHINI_API_KEY}`
      },
      body: JSON.stringify({
        sourceLanguage: 'en',
        targetLanguage: targetLang,
        content: text
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.translated_content;
    */

    // Simulate random API failures for manual review (5% chance)
    if (Math.random() < 0.05) {
      throw new Error("Bhashini API Timeout / Rate Limit");
    }

    // Mock translation (prefixing with lang code for demonstration)
    return `[${targetLang.toUpperCase()}] ${text}`;
  } catch (err) {
    return null; // Return null on failure so it can be logged
  }
}

async function runTranslation() {
  if (!fs.existsSync(EN_JSON_PATH)) {
    console.error("en.json not found! Run the extractor script first.");
    process.exit(1);
  }

  const enData = JSON.parse(fs.readFileSync(EN_JSON_PATH, 'utf-8'));
  const failures = [];

  for (const lang of TARGET_LANGUAGES) {
    console.log(`\nProcessing language: ${lang}`);
    const langFilePath = path.join(LOCALES_DIR, `${lang}.json`);
    
    let existingData = {};
    if (fs.existsSync(langFilePath)) {
      existingData = JSON.parse(fs.readFileSync(langFilePath, 'utf-8'));
    }

    let newlyTranslated = 0;
    
    for (const [key, text] of Object.entries(enData)) {
      // Re-runnable check: Skip if already translated
      if (existingData[key]) continue;

      const translated = await translateText(text, lang);
      if (translated) {
        existingData[key] = translated;
        newlyTranslated++;
      } else {
        failures.push({ lang, key, text });
      }
    }

    // Write updated translation file preserving keys
    fs.writeFileSync(langFilePath, JSON.stringify(existingData, null, 2));
    console.log(`- Added ${newlyTranslated} new translations for ${lang}`);
  }

  // Write failures to a log file for manual review
  if (failures.length > 0) {
    const failuresPath = path.join(LOCALES_DIR, 'translation_failures.json');
    fs.writeFileSync(failuresPath, JSON.stringify(failures, null, 2));
    console.warn(`\nWARNING: ${failures.length} translations failed. See ${failuresPath} for manual review.`);
  } else {
    console.log("\nAll strings translated successfully!");
  }
}

runTranslation().catch(console.error);
