const fs = require('fs');

const hi = {
  Ratnagiri: "रत्नागिरी",
  Malvan: "मालवण",
  Panaji: "पणजी",
  Mumbai: "मुंबई",
  Veraval: "वेरावल",
  Porbandar: "पोरबंदर"
};

const mr = {
  Ratnagiri: "रत्नागिरी",
  Malvan: "मालवण",
  Panaji: "पणजी",
  Mumbai: "मुंबई",
  Veraval: "वेरावळ",
  Porbandar: "पोरबंदर"
};

const ta = {
  Ratnagiri: "ரத்னகிரி",
  Malvan: "மால்வன்",
  Panaji: "பனாஜி",
  Mumbai: "மும்பை",
  Veraval: "வெராவல்",
  Porbandar: "போர்பந்தர்"
};

const te = {
  Ratnagiri: "రత్నగిరి",
  Malvan: "మాల్వన్",
  Panaji: "పనాజీ",
  Mumbai: "ముంబై",
  Veraval: "వెరావల్",
  Porbandar: "పోర్బందర్"
};

const dicts = { hi, mr, ta, te };

for (const lang of Object.keys(dicts)) {
  const path = `src/i18n/locales/${lang}/place_names.json`;
  if (!fs.existsSync(`src/i18n/locales/${lang}`)) {
    fs.mkdirSync(`src/i18n/locales/${lang}`, { recursive: true });
  }
  fs.writeFileSync(path, JSON.stringify(dicts[lang], null, 2));
  console.log(`Saved ${path}`);
}
