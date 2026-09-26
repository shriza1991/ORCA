const fs = require('fs');
const path = require('path');
// No dotenv needed; run with node --env-file=../.env

const TARGET_LANGUAGES = {
  hi: "Hindi",
  mr: "Marathi",
  ta: "Tamil",
  te: "Telugu"
};
const LOCALES_DIR = path.join(__dirname, 'src', 'i18n', 'locales');
const EN_JSON_PATH = path.join(LOCALES_DIR, 'en.json');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error("GROQ_API_KEY not found in .env!");
  process.exit(1);
}

// Ensure locales directory exists
if (!fs.existsSync(LOCALES_DIR)) {
  fs.mkdirSync(LOCALES_DIR, { recursive: true });
}

async function translateBatchWithGroq(texts, targetLangName) {
  try {
    const prompt = `Translate the following JSON object values from English to ${targetLangName}. Keep the exact same JSON keys. Do not translate variables wrapped in curly braces like {count}. Do not output any markdown formatting, only valid JSON.\n\n` + JSON.stringify(texts);
    
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL || "qwen/qwen3.8-27b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (err) {
    console.error(`Error translating to ${targetLangName}:`, err.message);
    return null;
  }
}

async function runTranslation() {
  const enData = JSON.parse(fs.readFileSync(EN_JSON_PATH, 'utf-8'));
  const totalStrings = Object.keys(enData).length;

  for (const [langCode, langName] of Object.entries(TARGET_LANGUAGES)) {
    console.log(`\nProcessing language: ${langName} (${langCode})`);
    const langFilePath = path.join(LOCALES_DIR, `${langCode}.json`);
    
    let existingData = {};
    if (fs.existsSync(langFilePath)) {
        try {
            existingData = JSON.parse(fs.readFileSync(langFilePath, 'utf-8'));
            // Filter out the mocked "[LANG] text" from previous runs
            for (const key in existingData) {
                if (existingData[key].startsWith(`[${langCode.toUpperCase()}]`)) {
                    delete existingData[key];
                }
            }
        } catch(e) {}
    }

    const keysToTranslate = Object.keys(enData).filter(key => !existingData[key]);
    console.log(`Found ${keysToTranslate.length} keys needing translation.`);
    
    if (keysToTranslate.length === 0) continue;

    // Batch in chunks of 50 to avoid token limits
    const BATCH_SIZE = 50;
    let newlyTranslated = 0;
    let failures = 0;

    for (let i = 0; i < keysToTranslate.length; i += BATCH_SIZE) {
        const batchKeys = keysToTranslate.slice(i, i + BATCH_SIZE);
        const batchObj = {};
        batchKeys.forEach(k => batchObj[k] = enData[k]);

        process.stdout.write(`Translating batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(keysToTranslate.length/BATCH_SIZE)}... `);
        
        const translatedBatch = await translateBatchWithGroq(batchObj, langName);
        
        if (translatedBatch) {
            for (const k of batchKeys) {
                if (translatedBatch[k]) {
                    existingData[k] = translatedBatch[k];
                    newlyTranslated++;
                } else {
                    failures++;
                }
            }
            console.log("Success.");
            // Write progressively
            fs.writeFileSync(langFilePath, JSON.stringify(existingData, null, 2));
        } else {
            failures += batchKeys.length;
            console.log("Failed.");
        }
        
        // Rate limit protection
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log(`- Translated ${newlyTranslated} strings for ${langName}. Failed: ${failures}`);
  }
}

runTranslation().catch(console.error);
