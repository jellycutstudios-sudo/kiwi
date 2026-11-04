/**
 * Food Transliteration Engine for Restaurant Waiters
 * Converts English culinary dish names into natural phonetic script (Malayalam / Hindi).
 * 
 * Note: This produces PHONETIC transliteration (how it sounds), NOT literal word-by-word
 * dictionary translations. For example, "Garlic Chicken" becomes "ഗാർലിക് ചിക്കൻ",
 * not "വെളുത്തുള്ളി കോഴി" (which no waiter or customer calls it).
 */

// ── Curated High-Accuracy Culinary Vocabulary ───────────────────────────
const CULINARY_DICT = {
  // Meats & Seafood
  chicken:    { ml: 'ചിക്കൻ',      hi: 'चिकन' },
  beef:       { ml: 'ബീഫ്',        hi: 'बीफ' },
  mutton:     { ml: 'മട്ടൻ',       hi: 'मटन' },
  lamb:       { ml: 'ലാംബ്',       hi: 'लैम्ब' },
  pork:       { ml: 'പോർക്ക്',     hi: 'पोर्क' },
  bacon:      { ml: 'ബേക്കൺ',      hi: 'बेकन' },
  fish:       { ml: 'ഫിഷ്',        hi: 'फिश' },
  salmon:     { ml: 'സാൽമൺ',      hi: 'सैल्मन' },
  prawns:     { ml: 'പ്രോൺസ്',     hi: 'प्रॉन्स' },
  shrimp:     { ml: 'ഷ്രിമ്പ്',    hi: 'झींगा' },
  calamari:   { ml: 'കലമാരി',      hi: 'कलामारी' },
  squid:      { ml: 'സ്ക്വിഡ്',    hi: 'स्क्विड' },
  crab:       { ml: 'ക്രാബ്',      hi: 'क्रैब' },
  steak:      { ml: 'സ്റ്റീക്ക്',   hi: 'स्टेक' },
  ribeye:     { ml: 'റിബ് ഐ',     hi: 'रिबआई' },
  meat:       { ml: 'മീറ്റ്',      hi: 'मीट' },

  // Vegetarian & Dairy
  paneer:     { ml: 'പനീർ',        hi: 'पनीर' },
  cheese:     { ml: 'ചീസ്',        hi: 'चीज़' },
  mozzarella: { ml: 'മൊസറെല്ല',    hi: 'मोज़रेला' },
  parmesan:   { ml: 'പാർമസാൻ',    hi: 'पामिजान' },
  cheddar:    { ml: 'ചെദ്ദാർ',     hi: 'चेडर' },
  butter:     { ml: 'ബട്ടർ',       hi: 'बटर' },
  cream:      { ml: 'ക്രീം',       hi: 'क्रीम' },
  milk:       { ml: 'മിൽക്ക്',     hi: 'मिल्क' },
  egg:        { ml: 'എഗ്ഗ്',       hi: 'एग' },
  eggs:       { ml: 'എഗ്ഗ്സ്',     hi: 'एग्स' },
  mushroom:   { ml: 'മഷ്റൂം',      hi: 'मशरूम' },
  corn:       { ml: 'കോൺ',        hi: 'कॉर्न' },
  potato:     { ml: 'പൊട്ടറ്റോ',   hi: 'पोटैटो' },
  onion:      { ml: 'ഒനിയൻ',      hi: 'अनियन' },
  garlic:     { ml: 'ഗാർലിക്',     hi: 'गार्लिक' },
  ginger:     { ml: 'ജിഞ്ചർ',      hi: 'जिंजर' },
  chilli:     { ml: 'ചില്ലി',      hi: 'चिली' },
  chili:      { ml: 'ചില്ലി',      hi: 'चिली' },
  pepper:     { ml: 'പെപ്പർ',      hi: 'पेपर' },
  tomato:     { ml: 'ടൊമാറ്റോ',    hi: 'टमाटर' },
  olives:     { ml: 'ഒലിവ്സ്',     hi: 'ऑलिव्स' },
  olive:      { ml: 'ഒലിവ്',       hi: 'ऑलिव' },
  jalapeno:   { ml: 'ജലാപെനോ',    hi: 'जलापिनो' },
  avocado:    { ml: 'അവക്കാഡോ',   hi: 'एवोकैडो' },

  // Italian & Pasta & Pizza
  pizza:      { ml: 'പിസ്സ',       hi: 'पिज़्ज़ा' },
  pasta:      { ml: 'പാസ്ത',       hi: 'पास्ता' },
  spaghetti:  { ml: 'സ്പഗെറ്റി',   hi: 'स्पेगेटी' },
  carbonara:  { ml: 'കാർബൊനാര',   hi: 'कार्बोनेरा' },
  fettuccine: { ml: 'ഫെത്തുച്ചിനി', hi: 'फेतुचिनी' },
  alfredo:    { ml: 'ആൽഫ്രെഡോ',   hi: 'अल्फ्रेडो' },
  penne:      { ml: 'പെന്നെ',      hi: 'पेने' },
  lasagna:    { ml: 'ലസാനിയ',     hi: 'लज़ानिया' },
  ravioli:    { ml: 'റാവിയോളി',    hi: 'रावियोली' },
  margherita: { ml: 'മാർഗരീത്ത',   hi: 'मार्गराटा' },
  pepperoni:  { ml: 'പെപ്പറോണി',   hi: 'पेपरोनी' },
  supreme:    { ml: 'സുപ്രീം',     hi: 'सुप्रीम' },
  four:       { ml: 'ഫോർ',         hi: 'फोर' },
  risotto:    { ml: 'റിസോട്ടോ',    hi: 'रिसोट्टो' },
  garlicbread:{ ml: 'ഗാർലിക് ബ്രെഡ്', hi: 'गार्लिक ब्रेड' },

  // Burgers, Sandwiches, Appetizers
  burger:     { ml: 'ബർഗർ',       hi: 'बर्गर' },
  sandwich:   { ml: 'സാൻഡ്‌വിച്ച്', hi: 'सैंडविच' },
  wrap:       { ml: 'റാപ്പ്',       hi: 'रैप' },
  roll:       { ml: 'റോൾ',        hi: 'रोल' },
  fries:      { ml: 'ഫ്രൈസ്',      hi: 'फ्राइज' },
  french:     { ml: 'ഫ്രഞ്ച്',      hi: 'फ्रेंच' },
  wedges:     { ml: 'വെഡ്ജസ്',     hi: 'वेजेस' },
  nuggets:    { ml: 'നഗ്ഗറ്റ്സ്',    hi: 'नगेट्स' },
  strips:     { ml: 'സ്ട്രിപ്സ്',    hi: 'स्ट्रिप्स' },
  wings:      { ml: 'വിങ്സ്',      hi: 'विंग्स' },
  popcorn:    { ml: 'പോപ്‌കോൺ',   hi: 'पॉपकॉर्न' },
  sticks:     { ml: 'സ്റ്റിക്സ്',    hi: 'स्टिक्स' },
  tacos:      { ml: 'ടാക്കോസ്',    hi: 'टैकोस' },
  nachos:     { ml: 'നാച്ചോസ്',    hi: 'नाचोस' },
  quesadilla: { ml: 'കെസഡിയ',     hi: 'केसाडिला' },

  // Middle Eastern, Indo-Chinese & Desi
  biryani:    { ml: 'ബിരിയാണി',    hi: 'बिरयानी' },
  porotta:    { ml: 'പൊറോട്ട',     hi: 'परोटा' },
  parotta:    { ml: 'പൊറോട്ട',     hi: 'परोटा' },
  paratha:    { ml: 'പരാത്ത',      hi: 'पराठा' },
  roti:       { ml: 'റൊട്ടി',      hi: 'रोटी' },
  naan:       { ml: 'നാൻ',         hi: 'नान' },
  kulcha:     { ml: 'കുൽച്ച',      hi: 'कुलचा' },
  rice:       { ml: 'റൈസ്',        hi: 'राइस' },
  fried:      { ml: 'ഫ്രൈഡ്',      hi: 'फ्राइड' },
  noodles:    { ml: 'നൂഡിൽസ്',     hi: 'नूडल्स' },
  shawarma:   { ml: 'ഷവർമ',       hi: 'शवरमा' },
  broast:     { ml: 'ബ്രോസ്റ്റ്',    hi: 'ब्रोस्ट' },
  broasted:   { ml: 'ബ്രോസ്റ്റഡ്',  hi: 'ब्रोस्टेड' },
  alfaham:    { ml: 'അൽഫഹാം',     hi: 'अलफहम' },
  faham:      { ml: 'ഫഹാം',       hi: 'फहम' },
  mandi:      { ml: 'മന്തി',       hi: 'मंदी' },
  kabab:      { ml: 'കബാബ്',      hi: 'कबाब' },
  kebab:      { ml: 'കബാബ്',      hi: 'कबाब' },
  tikka:      { ml: 'ടിക്ക',        hi: 'टिक्का' },
  masala:     { ml: 'മസാല',       hi: 'मसाला' },
  curry:      { ml: 'കറി',         hi: 'करी' },
  korma:      { ml: 'കുർമ',       hi: 'कोरमा' },
  dal:        { ml: 'ദാൽ',         hi: 'दाल' },
  dosa:       { ml: 'ദോശ',        hi: 'डोसा' },
  idli:       { ml: 'ഇഡ്ഡലി',      hi: 'इडली' },
  samosa:     { ml: 'സമോസ',       hi: 'समोसा' },
  soup:       { ml: 'സൂപ്പ്',       hi: 'सूप' },
  salad:      { ml: 'സലാഡ്',      hi: 'सलाद' },
  caesar:     { ml: 'സീസർ',       hi: 'सीज़र' },
  manchow:    { ml: 'മഞ്ചൗ',       hi: 'मांचो' },
  hotnsour:   { ml: 'ഹോട്ട് & സോർ', hi: 'हॉट एंड सोर' },

  // Cooking Styles, Adjectives & Sauces
  bbq:        { ml: 'ബിബിക്യു',    hi: 'बीबीक्यू' },
  barbecue:   { ml: 'ബാർബക്യു',    hi: 'बारबेक्यू' },
  grilled:    { ml: 'ഗ്രിൽഡ്',     hi: 'ग्रिल्ड' },
  crispy:     { ml: 'ക്രിസ്പി',     hi: 'क्रिस्पी' },
  spicy:      { ml: 'സ്പൈസി',      hi: 'स्पाइसी' },
  sweet:      { ml: 'സ്വീറ്റ്',     hi: 'स्वीट' },
  sour:       { ml: 'സോർ',        hi: 'सोर' },
  classic:    { ml: 'ക്ലാസിക്',    hi: 'क्लासिक' },
  special:    { ml: 'സ്പെഷ്യൽ',    hi: 'स्पेशल' },
  loaded:     { ml: 'ലോഡഡ്',      hi: 'लोडेड' },
  smash:      { ml: 'സ്മാഷ്',      hi: 'स्मैश' },
  double:     { ml: 'ഡബിൾ',       hi: 'डबल' },
  single:     { ml: 'സിംഗിൾ',     hi: 'सिंगल' },
  combo:      { ml: 'കോംബോ',      hi: 'कॉम्बो' },
  platter:    { ml: 'പ്ലാറ്റർ',     hi: 'प्लैट्टर' },
  mayo:       { ml: 'മയോ',        hi: 'मेयो' },
  mayonnaise: { ml: 'മയോണൈസ്',   hi: 'मेयोनेज़' },
  sauce:      { ml: 'സോസ്',       hi: 'सॉस' },
  peri:       { ml: 'പെരി',        hi: 'पेरी' },
  periperi:   { ml: 'പെരി പെരി',  hi: 'पेरी पेरी' },
  veggie:     { ml: 'വെജ്ജി',      hi: 'वेजी' },
  veg:        { ml: 'വെജ്',       hi: 'वेज' },
  nonveg:     { ml: 'നോൺ-വെജ്',   hi: 'नॉन-वेज' },
  vegan:      { ml: 'വീഗൻ',       hi: 'वीगन' },

  // Beverages & Drinks
  water:      { ml: 'വാട്ടർ',       hi: 'वॉटर' },
  tea:        { ml: 'ടീ',          hi: 'चाय' },
  chai:       { ml: 'ചായ',        hi: 'चाय' },
  coffee:     { ml: 'കോഫി',       hi: 'कॉफ़ी' },
  latte:      { ml: 'ലാറ്റെ',      hi: 'लाते' },
  cappuccino: { ml: 'കാപ്പുച്ചിനോ', hi: 'कैपुचीनो' },
  espresso:   { ml: 'എസ്പ്രസ്സോ',  hi: 'एस्प्रेसो' },
  americano:  { ml: 'അമേരിക്കാനോ',hi: 'अमेरिकानो' },
  matcha:     { ml: 'മാച്ച',       hi: 'माचा' },
  iced:       { ml: 'ഐസ്ഡ്',      hi: 'आइस' },
  shake:      { ml: 'ഷേക്ക്',      hi: 'शेक' },
  milkshake:  { ml: 'മിൽക്ക്‌ഷേക്ക്', hi: 'मिल्कशेक' },
  smoothie:   { ml: 'സ്മൂത്തി',    hi: 'स्मूदी' },
  juice:      { ml: 'ജ്യൂസ്',      hi: 'जूस' },
  mojito:     { ml: 'മൊഹിത്തോ',   hi: 'मोहितो' },
  lemonade:   { ml: 'ലെമണേഡ്',    hi: 'लेमनेड' },
  lime:       { ml: 'ലൈം',        hi: 'लाइम' },
  soda:       { ml: 'സോഡ',        hi: 'सोडा' },
  coke:       { ml: 'കോക്ക്',      hi: 'कोक' },
  pepsi:      { ml: 'പെപ്സി',      hi: 'पेप्सी' },
  sprite:     { ml: 'സ്പ്രൈറ്റ്',  hi: 'स्प्राइट' },
  redbull:    { ml: 'റെഡ് ബുൾ',   hi: 'रेड बुल' },

  // Desserts & Sweets
  cake:       { ml: 'കേക്ക്',       hi: 'केक' },
  cheesecake: { ml: 'ചീസ് കേക്ക്', hi: 'चीज़केक' },
  tiramisu:   { ml: 'തിരമിസു',     hi: 'तिरामिसू' },
  brownie:    { ml: 'ബ്രൗണി',     hi: 'ब्राउनी' },
  lava:       { ml: 'ലാവ',        hi: 'लावा' },
  icecream:   { ml: 'ഐസ് ക്രീം',   hi: 'आइसक्रीम' },
  gelato:     { ml: 'ജലാറ്റോ',     hi: 'जिलेटो' },
  chocolate:  { ml: 'ചോക്ലേറ്റ്',   hi: 'चॉकलेट' },
  vanilla:    { ml: 'വാനില',      hi: 'वेनिला' },
  strawberry: { ml: 'സ്ട്രോബെറി',  hi: 'स्ट्रॉबेरी' },
  mango:      { ml: 'മാംഗോ',      hi: 'मैंगो' },
  pudding:    { ml: 'പുഡ്ഡിംഗ്',   hi: 'पुडिंग' },
  waffle:     { ml: 'വാഫിൾ',      hi: 'वाफ़ल' },
  pancake:    { ml: 'പാൻകേക്ക്',   hi: 'पैनकेक' },
};

// ── Multi-Word Common Dishes ───────────────────────────────────────────
const DISH_PHRASES = {
  'spaghetti carbonara':    { ml: 'സ്പഗെറ്റി കാർബൊനാര',    hi: 'स्पेगेटी कार्बोनेरा' },
  'fettuccine alfredo':     { ml: 'ഫെത്തുച്ചിനി ആൽഫ്രെഡോ',  hi: 'फेतुचिनी अल्फ्रेडो' },
  'grilled salmon':         { ml: 'ഗ്രിൽഡ് സാൽമൺ',       hi: 'ग्रिल्ड सैल्मन' },
  'ribeye steak':           { ml: 'റിബ് ഐ സ്റ്റീക്ക്',      hi: 'रिबआई स्टेक' },
  'grilled chicken':        { ml: 'ഗ്രിൽഡ് ചിക്കൻ',       hi: 'ग्रिल्ड चिकन' },
  'garlic chicken':         { ml: 'ഗാർലിക് ചിക്കൻ',       hi: 'गार्लिक चिकन' },
  'bbq chicken pizza':      { ml: 'ബിബിക്യു ചിക്കൻ പിസ്സ', hi: 'बीबीक्यू चिकन पिज़्ज़ा' },
  'bbq chicken':            { ml: 'ബിബിക്യു ചിക്കൻ',       hi: 'बीबीक्यू चिकन' },
  'veggie supreme':         { ml: 'വെജ്ജി സുപ്രീം',        hi: 'वेजी सुप्रीम' },
  'four cheese':            { ml: 'ഫോർ ചീസ്',             hi: 'फोर चीज़' },
  'pepperoni feast':        { ml: 'പെപ്പറോണി ഫീസ്റ്റ്',    hi: 'पेपरोनी फीस्ट' },
  'french fries':           { ml: 'ഫ്രഞ്ച് ഫ്രൈസ്',        hi: 'फ्रेंच फ्राइज' },
  'garlic bread':           { ml: 'ഗാർലിക് ബ്രെഡ്',        hi: 'गार्लिक ब्रेड' },
  'mozzarella sticks':      { ml: 'മൊസറെല്ല സ്റ്റിക്സ്',   hi: 'मोज़रेला स्टिक्स' },
  'buffalo wings':          { ml: 'ബഫല്ലോ വിങ്സ്',        hi: 'बफेलो विंग्स' },
  'caesar salad':           { ml: 'സീസർ സലാഡ്',          hi: 'सीज़र सलाद' },
  'chicken biryani':        { ml: 'ചിക്കൻ ബിരിയാണി',       hi: 'चिकन बिरयानी' },
  'mutton biryani':         { ml: 'മട്ടൻ ബിരിയാണി',        hi: 'मटन बिरयानी' },
  'beef biryani':           { ml: 'ബീഫ് ബിരിയാണി',         hi: 'बीफ बिरयानी' },
  'chicken fried rice':     { ml: 'ചിക്കൻ ഫ്രൈഡ് റൈസ്',    hi: 'चिकन फ्राइड राइस' },
  'chicken noodles':        { ml: 'ചിക്കൻ നൂഡിൽസ്',       hi: 'चिकन नूडल्स' },
  'butter chicken':         { ml: 'ബട്ടർ ചിക്കൻ',          hi: 'बटर चिकन' },
  'chicken tikka':          { ml: 'ചിക്കൻ ടിക്ക',          hi: 'चिकन टिक्का' },
  'paneer tikka':           { ml: 'പനീർ ടിക്ക',           hi: 'पनीर टिक्का' },
  'chicken shawarma':       { ml: 'ചിക്കൻ ഷവർമ',          hi: 'चिकन शवरमा' },
  'classic mojito':         { ml: 'ക്ലാസിക് മൊഹിത്തോ',    hi: 'क्लासिक मोहितो' },
  'iced latte':             { ml: 'ഐസ്ഡ് ലാറ്റെ',          hi: 'आइस लाते' },
  'cold coffee':            { ml: 'കോൾഡ് കോഫി',          hi: 'कोल्ड कॉफ़ी' },
  'fresh lime soda':        { ml: 'ഫ്രഷ് ലൈം സോഡ',       hi: 'फ्रेश लाइम सोडा' },
  'chocolate lava cake':    { ml: 'ചോക്ലേറ്റ് ലാവ കേക്ക്', hi: 'चॉकलेट लावा केक' },
  'new york cheesecake':    { ml: 'ന്യൂയോർക്ക് ചീസ്കേക്ക്', hi: 'न्यू यॉर्क चीज़केक' }
};

// ── Phonetic Syllable Transliteration Rules (Fallback Engine) ───────────
const SYLLABLE_RULES_ML = [
  // Multi-char consonants & vowels
  [/\bch/gi, 'ച'], [/ch/gi, 'ച്ച'],
  [/\bsh/gi, 'ഷ'], [/sh/gi, 'ഷ്'],
  [/\bth/gi, 'ത'], [/th/gi, 'ത്'],
  [/ph/gi, 'ഫ'],
  [/gh/gi, 'ഘ'],
  [/wh/gi, 'വ'],
  [/ck\b/gi, 'ക്ക്'], [/ck/gi, 'ക്ക്'],
  [/bb/gi, 'ബ്ബ്'],
  [/dd/gi, 'ഡ്ഡ്'],
  [/ff/gi, 'ഫ്ഫ്'],
  [/gg/gi, 'ഗ്ഗ്'],
  [/ll/gi, 'ല്ല്'],
  [/mm/gi, 'മ്മ്'],
  [/nn/gi, 'ന്ന്'],
  [/pp/gi, 'പ്പ്'],
  [/rr/gi, 'ർ'],
  [/ss/gi, 'സ്സ്'],
  [/tt/gi, 'ട്ട്'],
  [/zz/gi, 'സ്സ്'],
  [/ee/gi, 'ീ'],
  [/oo/gi, 'ൂ'],
  [/ou/gi, 'ൗ'],
  [/ai/gi, 'ൈ'],
  [/ay\b/gi, 'േ'],
  [/ey\b/gi, 'ി'],
  [/ie/gi, 'ൈ'],
  [/ea/gi, 'ീ'],
  [/oa/gi, 'ോ'],

  // Word-ending consonants with Virama (Chandrakkala)
  [/k\b/gi, 'ക്'],
  [/t\b/gi, 'റ്റ്'],
  [/d\b/gi, 'ഡ്'],
  [/p\b/gi, 'പ്പ്'],
  [/b\b/gi, 'ബ്'],
  [/m\b/gi, 'ം'],
  [/n\b/gi, 'ൻ'],
  [/r\b/gi, 'ർ'],
  [/l\b/gi, 'ൽ'],
  [/s\b/gi, 'സ്'],
  [/f\b/gi, 'ഫ്'],
  [/g\b/gi, 'ഗ്'],
  [/v\b/gi, 'വ്'],
  [/z\b/gi, 'സ്'],

  // Base Single Consonants
  [/b/gi, 'ബ'], [/c/gi, 'ക'], [/d/gi, 'ഡ'],
  [/f/gi, 'ഫ'], [/g/gi, 'ഗ'], [/h/gi, 'ഹ'],
  [/j/gi, 'ജ'], [/k/gi, 'ക'], [/l/gi, 'ല'],
  [/m/gi, 'മ'], [/n/gi, 'ന'], [/p/gi, 'പ'],
  [/q/gi, 'ക്യൂ'], [/r/gi, 'ര'], [/s/gi, 'സ'],
  [/t/gi, 'ട'], [/v/gi, 'വ'], [/w/gi, 'വ'],
  [/x/gi, 'ക്സ്'], [/y/gi, 'യ'], [/z/gi, 'സ'],

  // Vowels
  [/\ba/gi, 'അ'], [/a/gi, 'ാ'],
  [/\be/gi, 'എ'], [/e/gi, 'െ'],
  [/\bi/gi, 'ഇ'], [/i/gi, 'ി'],
  [/\bo/gi, 'ഒ'], [/o/gi, 'ോ'],
  [/\bu/gi, 'ഉ'], [/u/gi, 'ു'],
];

function phoneticFallback(word, targetLang) {
  if (!word) return '';
  if (targetLang === 'ml') {
    let result = word;
    for (const [pattern, replacement] of SYLLABLE_RULES_ML) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }
  return word;
}

/**
 * Main food transliteration function.
 * @param {string} dishName - The English dish name (e.g. "Garlic Chicken")
 * @param {string} targetLang - Target language code ('ml' for Malayalam, 'hi' for Hindi, 'en' for English)
 * @returns {string} Transliterated name in the target language script
 */
export function transliterateFood(dishName, targetLang = 'en') {
  if (!dishName || typeof dishName !== 'string') return '';
  if (!targetLang || targetLang === 'en') return dishName;

  const normalized = dishName.trim().toLowerCase();

  // 1. Check exact full dish phrase first
  if (DISH_PHRASES[normalized] && DISH_PHRASES[normalized][targetLang]) {
    return DISH_PHRASES[normalized][targetLang];
  }

  // 2. Tokenize into individual words and translate word-by-word
  const words = dishName.trim().split(/\s+/);
  const convertedWords = words.map(rawWord => {
    // Strip common punctuation (e.g. "Chicken," -> "chicken")
    const cleanWord = rawWord.toLowerCase().replace(/[^a-z0-9&]/g, '');
    
    // Check symbols
    if (cleanWord === '&' || cleanWord === 'and') {
      return targetLang === 'ml' ? '&' : '&';
    }

    // Check vocabulary dictionary
    if (CULINARY_DICT[cleanWord] && CULINARY_DICT[cleanWord][targetLang]) {
      return CULINARY_DICT[cleanWord][targetLang];
    }

    // Strip plural 's' (e.g. "burgers" -> "burger")
    if (cleanWord.endsWith('s')) {
      const singular = cleanWord.slice(0, -1);
      if (CULINARY_DICT[singular] && CULINARY_DICT[singular][targetLang]) {
        return CULINARY_DICT[singular][targetLang];
      }
    }

    // Fallback to phonetic rule-based transliterator
    return phoneticFallback(rawWord, targetLang);
  });

  return convertedWords.join(' ');
}

export const SUPPORTED_WAITER_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', flag: '🌴' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी', flag: '🇮🇳' },
];
