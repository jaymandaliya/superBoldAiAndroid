const fs = require('fs');
const path = require('path');

const labelsPath = path.join(__dirname, '..', 'src', 'localization', 'labels.all.json');
const data = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
const en = data.en || {};

let fixed = 0;

for (const [lang, obj] of Object.entries(data)) {
  if (lang === 'en' || !obj || typeof obj !== 'object') {
    continue;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === 'string' &&
      value.includes('MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY')
    ) {
      obj[key] = typeof en[key] === 'string' ? en[key] : '';
      fixed += 1;
    }
  }
}

fs.writeFileSync(labelsPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`Fixed ${fixed} warning entries in labels.all.json`);
