/**
 * Merges test_ui_* strings into every locale in labels.all.json.
 * Run from repo root: node learning-mobile-frontend/scripts/merge-test-ui-labels.cjs
 */
const fs = require('fs');
const path = require('path');

const labelsPath = path.join(__dirname, '..', 'src', 'localization', 'labels.all.json');

const UI_EN = {
  test_ui_quiz_title: 'Quiz test - {{checkpoint}}',
  test_ui_your_answer: 'Your answer',
  test_ui_tap_words_hint: 'Tap words below to build the sentence',
  test_ui_correct_answer_label: 'Correct answer',
  test_ui_submit: 'Submit',
  test_ui_next: 'Next →',
  test_ui_feedback_correct: 'Correct!',
  test_ui_feedback_wrong: 'Wrong',
  test_ui_go_back: 'Go back',
  test_ui_starting_session: 'Starting test session…',
  test_ui_connecting_examiner: 'Connecting to your examiner…',
  test_ui_listen_first_question: 'Listen for your first question',
  test_ui_loading_next_question: 'Loading next question…',
  test_ui_not_authenticated: 'Not authenticated',
  test_ui_failed_start_session: 'Failed to start test session',
  test_ui_connection_error: 'Connection error. Please try again.',
};

/** Per-language overrides; missing keys fall back to UI_EN */
const UI_BY_LANG = {
  hi: {
    test_ui_quiz_title: 'क्विज़ टेस्ट - {{checkpoint}}',
    test_ui_your_answer: 'आपका उत्तर',
    test_ui_tap_words_hint: 'वाक्य बनाने के लिए नीचे शब्दों पर टैप करें',
    test_ui_correct_answer_label: 'सही उत्तर',
    test_ui_submit: 'जमा करें',
    test_ui_next: 'आगे →',
    test_ui_feedback_correct: 'सही!',
    test_ui_feedback_wrong: 'गलत',
    test_ui_go_back: 'वापस जाएँ',
    test_ui_starting_session: 'टेस्ट सत्र शुरू हो रहा है…',
    test_ui_connecting_examiner: 'परीक्षक से जुड़ रहे हैं…',
    test_ui_listen_first_question: 'अपना पहला सवाल सुनें',
    test_ui_loading_next_question: 'अगला प्रश्न लोड हो रहा है…',
    test_ui_not_authenticated: 'लॉग इन नहीं है',
    test_ui_failed_start_session: 'टेस्ट सत्र शुरू नहीं हो सका',
    test_ui_connection_error: 'कनेक्शन में समस्या। कृपया फिर कोशिश करें।',
  },
  gu: {
    test_ui_quiz_title: 'ક્વિઝ ટેસ્ટ - {{checkpoint}}',
    test_ui_your_answer: 'તમારો જવાબ',
    test_ui_tap_words_hint: 'વાક્ય બનાવવા નીચેના શબ્દો પર ટૅપ કરો',
    test_ui_correct_answer_label: 'સાચો જવાબ',
    test_ui_submit: 'સબમિટ કરો',
    test_ui_next: 'આગળ →',
    test_ui_feedback_correct: 'સાચું!',
    test_ui_feedback_wrong: 'ખોટું',
    test_ui_go_back: 'પાછા જાઓ',
    test_ui_starting_session: 'ટેસ્ટ સત્ર શરૂ થઈ રહ્યું છે…',
    test_ui_connecting_examiner: 'પરીક્ષક સાથે જોડાઈ રહ્યા છીએ…',
    test_ui_listen_first_question: 'તમારો પહેલો પ્રશ્ન સાંભળો',
    test_ui_loading_next_question: 'આગલો પ્રશ્ન લોડ થઈ રહ્યો છે…',
    test_ui_not_authenticated: 'લૉગ ઇન નથી',
    test_ui_failed_start_session: 'ટેસ્ટ સત્ર શરૂ થયું નહીં',
    test_ui_connection_error: 'કનેક્શનમાં સમસ્યા। ફરી પ્રયાસ કરો।',
  },
  mr: {
    test_ui_quiz_title: 'क्विझ टेस्ट - {{checkpoint}}',
    test_ui_your_answer: 'तुमचे उत्तर',
    test_ui_tap_words_hint: 'वाक्य बनवण्यासाठी खालील शब्दांवर टॅप करा',
    test_ui_correct_answer_label: 'योग्य उत्तर',
    test_ui_submit: 'सबमिट करा',
    test_ui_next: 'पुढे →',
    test_ui_feedback_correct: 'बरोबर!',
    test_ui_feedback_wrong: 'चूक',
    test_ui_go_back: 'मागे जा',
    test_ui_starting_session: 'चाचणी सत्र सुरू होत आहे…',
    test_ui_connecting_examiner: 'परीक्षकाशी जोडत आहे…',
    test_ui_listen_first_question: 'तुमचा पहिला प्रश्न ऐका',
    test_ui_loading_next_question: 'पुढचा प्रश्न लोड होत आहे…',
    test_ui_not_authenticated: 'लॉग इन नाही',
    test_ui_failed_start_session: 'चाचणी सत्र सुरू झाले नाही',
    test_ui_connection_error: 'कनेक्शनमध्ये समस्या। पुन्हा प्रयत्न करा।',
  },
  bn: {
    test_ui_quiz_title: 'কুইজ টেস্ট - {{checkpoint}}',
    test_ui_your_answer: 'আপনার উত্তর',
    test_ui_tap_words_hint: 'বাক্য তৈরি করতে নিচের শব্দে ট্যাপ করুন',
    test_ui_correct_answer_label: 'সঠিক উত্তর',
    test_ui_submit: 'জমা দিন',
    test_ui_next: 'পরবর্তী →',
    test_ui_feedback_correct: 'সঠিক!',
    test_ui_feedback_wrong: 'ভুল',
    test_ui_go_back: 'ফিরে যান',
    test_ui_starting_session: 'টেস্ট সেশন শুরু হচ্ছে…',
    test_ui_connecting_examiner: 'পরীক্ষকের সাথে সংযোগ হচ্ছে…',
    test_ui_listen_first_question: 'আপনার প্রথম প্রশ্ন শুনুন',
    test_ui_loading_next_question: 'পরবর্তী প্রশ্ন লোড হচ্ছে…',
    test_ui_not_authenticated: 'লগইন নেই',
    test_ui_failed_start_session: 'টেস্ট সেশন শুরু হয়নি',
    test_ui_connection_error: 'সংযোগে সমস্যা। আবার চেষ্টা করুন।',
  },
  ta: {
    test_ui_quiz_title: 'வினாடி வினா - {{checkpoint}}',
    test_ui_your_answer: 'உங்கள் பதில்',
    test_ui_tap_words_hint: 'வாக்கியத்தை உருவாக்க கீழுள்ள சொற்களைத் தட்டவும்',
    test_ui_correct_answer_label: 'சரியான பதில்',
    test_ui_submit: 'சமர்ப்பிக்கவும்',
    test_ui_next: 'அடுத்து →',
    test_ui_feedback_correct: 'சரி!',
    test_ui_feedback_wrong: 'தவறு',
    test_ui_go_back: 'பின்செல்',
    test_ui_starting_session: 'தேர்வு அமர்வு தொடங்குகிறது…',
    test_ui_connecting_examiner: 'தேர்வாளருடன் இணைகிறது…',
    test_ui_listen_first_question: 'முதல் கேள்வியைக் கேளுங்கள்',
    test_ui_loading_next_question: 'அடுத்த கேள்வி ஏற்றப்படுகிறது…',
    test_ui_not_authenticated: 'உள்நுழையவில்லை',
    test_ui_failed_start_session: 'தேர்வு அமர்வு தொடங்கவில்லை',
    test_ui_connection_error: 'இணைப்பில் சிக்கல். மீண்டும் முயலவும்.',
  },
  te: {
    test_ui_quiz_title: 'క్విజ్ టెస్ట్ - {{checkpoint}}',
    test_ui_your_answer: 'మీ సమాధానం',
    test_ui_tap_words_hint: 'వాక్యం కట్టడానికి క్రింది పదాలపై టాప్ చేయండి',
    test_ui_correct_answer_label: 'సరైన సమాధానం',
    test_ui_submit: 'సమర్పించండి',
    test_ui_next: 'తర్వాత →',
    test_ui_feedback_correct: 'సరైనది!',
    test_ui_feedback_wrong: 'తప్పు',
    test_ui_go_back: 'వెనక్కి',
    test_ui_starting_session: 'టెస్ట్ సెషన్ ప్రారంభమవుతోంది…',
    test_ui_connecting_examiner: 'పరీక్షకుడితో కనెక్ట్ అవుతోంది…',
    test_ui_listen_first_question: 'మీ మొదటి ప్రశ్న వినండి',
    test_ui_loading_next_question: 'తదుపరి ప్రశ్న లోడ్ అవుతోంది…',
    test_ui_not_authenticated: 'లాగిన్ లేదు',
    test_ui_failed_start_session: 'టెస్ట్ సెషన్ ప్రారంభం కాలేదు',
    test_ui_connection_error: 'కనెక్షన్ సమస్య। మళ్లీ ప్రయత్నించండి.',
  },
  kn: {
    test_ui_quiz_title: 'ಕ್ವಿಜ್ ಟೆಸ್ಟ್ - {{checkpoint}}',
    test_ui_your_answer: 'ನಿಮ್ಮ ಉತ್ತರ',
    test_ui_tap_words_hint: 'ವಾಕ್ಯ ರಚಿಸಲು ಕೆಳಗಿನ ಪದಗಳ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ',
    test_ui_correct_answer_label: 'ಸರಿಯಾದ ಉತ್ತರ',
    test_ui_submit: 'ಸಲ್ಲಿಸಿ',
    test_ui_next: 'ಮುಂದೆ →',
    test_ui_feedback_correct: 'ಸರಿ!',
    test_ui_feedback_wrong: 'ತಪ್ಪು',
    test_ui_go_back: 'ಹಿಂದೆ ಹೋಗಿ',
    test_ui_starting_session: 'ಪರೀಕ್ಷೆ ಅಧಿವೇಶನ ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ…',
    test_ui_connecting_examiner: 'ಪರೀಕ್ಷಕರೊಂದಿಗೆ ಸಂಪರ್ಕಿಸಲಾಗುತ್ತಿದೆ…',
    test_ui_listen_first_question: 'ನಿಮ್ಮ ಮೊದಲ ಪ್ರಶ್ನೆಯನ್ನು ಕೇಳಿ',
    test_ui_loading_next_question: 'ಮುಂದಿನ ಪ್ರಶ್ನೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ…',
    test_ui_not_authenticated: 'ಲಾಗಿನ್ ಇಲ್ಲ',
    test_ui_failed_start_session: 'ಪರೀಕ್ಷೆ ಅಧಿವೇಶನ ಪ್ರಾರಂಭವಾಗಲಿಲ್ಲ',
    test_ui_connection_error: 'ಸಂಪರ್ಕದಲ್ಲಿ ಸಮಸ್ಯೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
  ml: {
    test_ui_quiz_title: 'ക്വിസ് ടെസ്റ്റ് - {{checkpoint}}',
    test_ui_your_answer: 'നിങ്ങളുടെ ഉത്തരം',
    test_ui_tap_words_hint: 'വാക്യം ഉണ്ടാക്കാൻ താഴെയുള്ള വാക്കുകൾ ടാപ്പ് ചെയ്യുക',
    test_ui_correct_answer_label: 'ശരിയായ ഉത്തരം',
    test_ui_submit: 'സമർപ്പിക്കുക',
    test_ui_next: 'അടുത്തത് →',
    test_ui_feedback_correct: 'ശരി!',
    test_ui_feedback_wrong: 'തെറ്റ്',
    test_ui_go_back: 'പിന്നിലേക്ക്',
    test_ui_starting_session: 'ടെസ്റ്റ് സെഷൻ ആരംഭിക്കുന്നു…',
    test_ui_connecting_examiner: 'പരീക്ഷകനുമായി ബന്ധിപ്പിക്കുന്നു…',
    test_ui_listen_first_question: 'ആദ്യ ചോദ്യം കേൾക്കുക',
    test_ui_loading_next_question: 'അടുത്ത ചോദ്യം ലോഡ് ചെയ്യുന്നു…',
    test_ui_not_authenticated: 'ലോഗിൻ ഇല്ല',
    test_ui_failed_start_session: 'ടെസ്റ്റ് സെഷൻ ആരംഭിച്ചില്ല',
    test_ui_connection_error: 'കണക്ഷനിൽ പ്രശ്നം. വീണ്ടും ശ്രമിക്കുക.',
  },
  pa: {
    test_ui_quiz_title: 'ਕਵਿਜ਼ ਟੈਸਟ - {{checkpoint}}',
    test_ui_your_answer: 'ਤੁਹਾਡਾ ਜਵਾਬ',
    test_ui_tap_words_hint: "ਵਾਕ ਬਣਾਉਣ ਲਈ ਹੇਠਾਂ ਦਿੱਤੇ ਸ਼ਬਦਾਂ 'ਤੇ ਟੈਪ ਕਰੋ",
    test_ui_correct_answer_label: 'ਸਹੀ ਜਵਾਬ',
    test_ui_submit: 'ਜਮ੍ਹਾ ਕਰੋ',
    test_ui_next: 'ਅੱਗੇ →',
    test_ui_feedback_correct: 'ਸਹੀ!',
    test_ui_feedback_wrong: 'ਗਲਤ',
    test_ui_go_back: 'ਪਿੱਛੇ ਜਾਓ',
    test_ui_starting_session: 'ਟੈਸਟ ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਹੋ ਰਿਹਾ ਹੈ…',
    test_ui_connecting_examiner: 'ਪਰੀਖਕ ਨਾਲ ਜੁੜ ਰਹੇ ਹਾਂ…',
    test_ui_listen_first_question: 'ਆਪਣਾ ਪਹਿਲਾ ਸਵਾਲ ਸੁਣੋ',
    test_ui_loading_next_question: 'ਅਗਲਾ ਸਵਾਲ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…',
    test_ui_not_authenticated: 'ਲੌਗਇਨ ਨਹੀਂ',
    test_ui_failed_start_session: 'ਟੈਸਟ ਸੈਸ਼ਨ ਸ਼ੁਰੂ ਨਹੀਂ ਹੋਇਆ',
    test_ui_connection_error: 'ਕਨੈਕਸ਼ਨ ਵਿੱਚ ਸਮੱਸਿਆ। ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।',
  },
  ur: {
    test_ui_quiz_title: 'کوئز ٹیسٹ - {{checkpoint}}',
    test_ui_your_answer: 'آپ کا جواب',
    test_ui_tap_words_hint: 'جملہ بنانے کے لیے نیچے دیے گئے الفاظ پر ٹیپ کریں',
    test_ui_correct_answer_label: 'درست جواب',
    test_ui_submit: 'جمع کرائیں',
    test_ui_next: 'آگے →',
    test_ui_feedback_correct: 'درست!',
    test_ui_feedback_wrong: 'غلط',
    test_ui_go_back: 'واپس جائیں',
    test_ui_starting_session: 'ٹیسٹ سیشن شروع ہو رہا ہے…',
    test_ui_connecting_examiner: 'ممتحن سے جڑ رہا ہے…',
    test_ui_listen_first_question: 'اپنا پہلا سوال سنیں',
    test_ui_loading_next_question: 'اگلا سوال لوڈ ہو رہا ہے…',
    test_ui_not_authenticated: 'لاگ ان نہیں',
    test_ui_failed_start_session: 'ٹیسٹ سیشن شروع نہیں ہوا',
    test_ui_connection_error: 'کنکشن میں مسئلہ۔ دوبارہ کوشش کریں۔',
  },
};

const data = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
const keys = Object.keys(UI_EN);

for (const lang of Object.keys(data)) {
  const extra = UI_BY_LANG[lang] || {};
  for (const k of keys) {
    data[lang][k] = extra[k] ?? UI_EN[k];
  }
}

// Drop keys removed from UI_EN so stale entries do not linger in labels.all.json
const removedKeys = ['test_ui_jumbled_meaning_caption'];
for (const lang of Object.keys(data)) {
  for (const k of removedKeys) {
    delete data[lang][k];
  }
}

fs.writeFileSync(labelsPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('Merged test_ui_* into', Object.keys(data).length, 'locales');
