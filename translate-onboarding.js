#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Onboarding prefixes
const ONBOARDING_PREFIXES = ['login_', 'language_selection_', 'username_', 'permission_'];

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
};

const PLACEHOLDER_REGEX = /\{\{[^}]+\}\}/g;

const maskPlaceholders = (text) => {
  const placeholders = [];
  const masked = text.replace(PLACEHOLDER_REGEX, (match) => {
    const token = `__PH_${placeholders.length}__`;
    placeholders.push(match);
    return token;
  });
  return {masked, placeholders};
};

const unmaskPlaceholders = (text, placeholders) => {
  let output = text;
  placeholders.forEach((ph, i) => {
    output = output.replace(new RegExp(`__PH_${i}__`, 'g'), ph);
  });
  return output;
};

// Translate text using MyMemory API with retries
const translateText = async (text, targetLang, retries = 2) => {
  if (targetLang === 'en') return text;
  const {masked, placeholders} = maskPlaceholders(text);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(masked)}&langpair=en|${targetLang}`;
      const response = await fetchWithTimeout(url);
      const data = await response.json();

      if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
        return unmaskPlaceholders(data.responseData.translatedText, placeholders);
      }
    } catch (error) {
      if (attempt === retries) {
        return text;
      }
    }
    await sleep(200 * (attempt + 1));
  }

  return text;
};

// Main translation function
const translateOnboarding = async () => {
  const labelsPath = path.join(__dirname, 'src', 'localization', 'labels.all.json');
  // Read all labels
  const allLabels = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const enLabels = allLabels.en;
  
  // Extract onboarding keys
  const onboardingKeys = Object.keys(enLabels).filter(key =>
    ONBOARDING_PREFIXES.some(prefix => key.startsWith(prefix))
  );
  
  console.log(`Found ${onboardingKeys.length} onboarding keys`);
  
  let translatedCount = 0;

  for (const langCode of Object.keys(allLabels)) {
    if (langCode === 'en') continue;

    const pendingKeys = onboardingKeys.filter((key) => {
      const existing = allLabels[langCode][key];
      return !existing || String(existing).trim() === String(enLabels[key]).trim();
    });

    if (pendingKeys.length === 0) {
      console.log(`✅ ${langCode}: already translated`);
      continue;
    }

    console.log(`\n📝 ${langCode}: translating ${pendingKeys.length} keys`);
    let langTranslated = 0;

    const BATCH_SIZE = 6;
    for (let i = 0; i < pendingKeys.length; i += BATCH_SIZE) {
      const batch = pendingKeys.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(batch.map(async (key) => {
        const englishText = enLabels[key];
        const translatedText = await translateText(englishText, langCode);
        return {key, englishText, translatedText};
      }));

      for (const result of results) {
        if (result.translatedText && result.translatedText !== result.englishText) {
          allLabels[langCode][result.key] = result.translatedText;
          translatedCount++;
          langTranslated++;
        }
      }

      const done = Math.min(i + BATCH_SIZE, pendingKeys.length);
      if (done % 12 === 0 || done === pendingKeys.length) {
        console.log(`   ...${langCode} ${done}/${pendingKeys.length}`);
      }
      await sleep(200);
    }

    console.log(`✅ ${langCode}: translated ${langTranslated}/${pendingKeys.length}`);
    fs.writeFileSync(labelsPath, JSON.stringify(allLabels, null, 2), 'utf8');
  }
  
  // Write updated labels
  fs.writeFileSync(labelsPath, JSON.stringify(allLabels, null, 2), 'utf8');
  
  console.log(`\n✅ Translation complete!`);
  console.log(`📊 Translated ${translatedCount} entries`);
  console.log(`💾 Saved to ${labelsPath}`);
};

// Run
translateOnboarding().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
