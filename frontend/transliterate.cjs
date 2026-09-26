const fs = require('fs');
const https = require('https');
const envContent = fs.readFileSync('../.env', 'utf8');
const groqMatch = envContent.match(/GROQ_API_KEY=(.*)/);
if (groqMatch) process.env.GROQ_API_KEY = groqMatch[1].trim();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error("GROQ_API_KEY not set in process.env!");
  process.exit(1);
}

const harbors = ['Ratnagiri', 'Malvan', 'Panaji', 'Mumbai', 'Veraval', 'Porbandar'];
const targets = ['hi', 'mr', 'ta', 'te'];

const langNames = {
  hi: 'Hindi',
  mr: 'Marathi',
  ta: 'Tamil',
  te: 'Telugu'
};

async function transliterate(targetLang) {
  const prompt = `You are an expert linguistic transliterator. Transliterate the following Indian port/harbor names from English into ${langNames[targetLang]} script. DO NOT translate them, just transliterate (e.g. Mumbai -> मुंबई). 
Return ONLY a valid JSON object where the keys are the English names exactly as provided, and the values are the transliterated ${langNames[targetLang]} strings.
Names to transliterate: ${JSON.stringify(harbors)}`;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "llama3-70b-8192", // Use available model
      messages: [
        { role: "system", content: "You output only valid JSON. No markdown, no explanations." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1
    });

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const resp = JSON.parse(body);
          if (resp.error) throw new Error(resp.error.message);
          let content = resp.choices[0].message.content.trim();
          if (content.startsWith('```json')) content = content.replace(/```json\n?/, '').replace(/```/, '');
          resolve(JSON.parse(content));
        } catch (e) {
          console.log("Raw response:", body);
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  for (const lang of targets) {
    console.log(`Transliterating for ${lang}...`);
    try {
      const result = await transliterate(lang);
      const outPath = `src/i18n/locales/${lang}/place_names.json`;
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`Saved ${outPath}`);
    } catch (e) {
      console.error(`Failed for ${lang}:`, e);
    }
    // Delay to avoid rate limit
    await new Promise(r => setTimeout(r, 2000));
  }
}

run();
