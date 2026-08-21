#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PLACEHOLDER_REGEX = /\{\{[^}]+\}\}/g;

const maskPlaceholders = (text) => {
  const placeholders = [];
  const masked = text.replace(PLACEHOLDER_REGEX, (m) => {
    const token = `__PH_${placeholders.length}__`;
    placeholders.push(m);
    return token;
  });
  return {masked, placeholders};
};

const unmaskPlaceholders = (text, placeholders) => {
  let out = text;
  placeholders.forEach((ph, i) => {
    out = out.replace(new RegExp(`__PH_${i}__`, 'g'), ph);
  });
  return out;
};

const fetchWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
};

const translateText = async (text, lang) => {
  if (!text || lang === 'en') return text;
  const {masked, placeholders} = maskPlaceholders(text);

  for (let i = 0; i < 2; i++) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(masked)}&langpair=en|${lang}`;
      const res = await fetchWithTimeout(url);
      const json = await res.json();
      const translated = json && json.responseData && json.responseData.translatedText;
      if (translated && translated !== masked) {
        return unmaskPlaceholders(translated, placeholders);
      }
      return text;
    } catch (e) {
      await sleep(150 * (i + 1));
    }
  }

  return text;
};

(async () => {
  const labelsPath = path.join(__dirname, 'src', 'localization', 'labels.all.json');
  const all = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const en = all.en;

  const usernameKeys = Object.keys(en).filter((k) => k.startsWith('username_'));
  console.log(`Found ${usernameKeys.length} username keys`);

  let total = 0;
  for (const [lang, obj] of Object.entries(all)) {
    if (lang === 'en') continue;

    const pending = usernameKeys.filter((k) => String(obj[k] || '').trim() === String(en[k] || '').trim());
    if (!pending.length) {
      console.log(`✅ ${lang}: already done`);
      continue;
    }

    console.log(`\n📝 ${lang}: translating ${pending.length} username keys`);
    let done = 0;

    for (let i = 0; i < pending.length; i++) {
      const key = pending[i];
      const result = await translateText(en[key], lang);
      if (result && result !== en[key]) {
        obj[key] = result;
        done++;
        total++;
      }
      if ((i + 1) % 8 === 0 || i + 1 === pending.length) {
        console.log(`   ...${lang} ${i + 1}/${pending.length}`);
      }
      await sleep(120);
    }

    console.log(`✅ ${lang}: translated ${done}/${pending.length}`);
    fs.writeFileSync(labelsPath, JSON.stringify(all, null, 2), 'utf8');
  }

  console.log(`\n✅ Username translation complete. Updated ${total} values.`);
})();
