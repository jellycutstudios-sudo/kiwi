/**
 * Food Transliteration Engine for Restaurant Waiters
 * Converts English culinary dish names into natural phonetic script (Malayalam / Hindi).
 * 
 * Note: This produces natural PHONETIC transliteration (how it sounds in conversation),
 * NOT literal dictionary translation. For example, "Garlic Chicken" becomes "ഗാർലിക് ചിക്കൻ",
 * not "വെളുത്തുള്ളി കോഴി".
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
  ham:        { ml: 'ഹാം',         hi: 'हैम' },
  turkey:     { ml: 'ടർക്കി',      hi: 'टर्की' },
  duck:       { ml: 'ഡക്ക്',       hi: 'डक' },
  fish:       { ml: 'ഫിഷ്',        hi: 'फिश' },
  salmon:     { ml: 'സാൽമൺ',      hi: 'सैल्मन' },
  tuna:       { ml: 'ട്യൂണ',       hi: 'टूना' },
  prawns:     { ml: 'പ്രോൺസ്',     hi: 'प्रॉन्स' },
  prawn:      { ml: 'പ്രോൺ',       hi: 'प्रॉन' },
  shrimp:     { ml: 'ഷ്രിമ്പ്',    hi: 'झींगा' },
  calamari:   { ml: 'കലമാരി',      hi: 'कलामारी' },
  squid:      { ml: 'സ്ക്വിഡ്',    hi: 'स्क्विड' },
  crab:       { ml: 'ക്രാബ്',      hi: 'क्रैब' },
  steak:      { ml: 'സ്റ്റീക്ക്',   hi: 'स्टेक' },
  ribeye:     { ml: 'റിബ് ഐ',     hi: 'रिबआई' },
  sirloin:    { ml: 'സർലോയിൻ',    hi: 'सरलोइन' },
  meat:       { ml: 'മീറ്റ്',      hi: 'मीट' },
  patty:      { ml: 'പാറ്റി',      hi: 'पैटी' },
  patties:    { ml: 'പാറ്റീസ്',    hi: 'पैटीज़' },
  wings:      { ml: 'വിങ്സ്',      hi: 'विंग्स' },
  fillet:     { ml: 'ഫില്ലറ്റ്',    hi: 'फ़िले' },
  strips:     { ml: 'സ്ട്രിപ്സ്',    hi: 'स्ट्रिप्स' },
  nuggets:    { ml: 'നഗ്ഗറ്റ്സ്',    hi: 'नगेट्स' },
  popcorn:    { ml: 'പോപ്‌കോൺ',   hi: 'पॉपकॉर्न' },
  tender:     { ml: 'ടെൻഡർ',      hi: 'टेंडर' },
  tenders:    { ml: 'ടെൻഡേഴ്സ്',   hi: 'टेंडर्स' },

  // Plant-based, Dairy & Produce
  beyond:     { ml: 'ബിയോണ്ട്',    hi: 'बियॉन्ड' },
  vegan:      { ml: 'വീഗൻ',       hi: 'वीगन' },
  paneer:     { ml: 'പനീർ',        hi: 'पनीर' },
  cheese:     { ml: 'ചീസ്',        hi: 'चीज़' },
  cheesy:     { ml: 'ചീസി',        hi: 'चीज़ी' },
  mozzarella: { ml: 'മൊസറെല്ല',    hi: 'मोज़रेला' },
  parmesan:   { ml: 'പാർമസാൻ',    hi: 'पामिजान' },
  cheddar:    { ml: 'ചെദ്ദാർ',     hi: 'चेडर' },
  butter:     { ml: 'ബട്ടർ',       hi: 'बटर' },
  cream:      { ml: 'ക്രീം',       hi: 'क्रीम' },
  creamy:     { ml: 'ക്രീമി',      hi: 'क्रीमी' },
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
  jalapenos:  { ml: 'ജലാപെനോസ്',  hi: 'जलापिनोस' },
  avocado:    { ml: 'അവക്കാഡോ',   hi: 'एवोकैडो' },
  truffle:    { ml: 'ട്രഫിൾ',      hi: 'ट्रफल' },

  // Italian, Pasta & Pizza
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
  feast:      { ml: 'ഫീസ്റ്റ്',    hi: 'फीस्ट' },
  four:       { ml: 'ഫോർ',         hi: 'फोर' },
  risotto:    { ml: 'റിസോട്ടോ',    hi: 'रिसोट्टो' },
  garlicbread:{ ml: 'ഗാർലിക് ബ്രെഡ്', hi: 'गार्लिक ब्रेड' },
  bread:      { ml: 'ബ്രെഡ്',      hi: 'ब्रेड' },
  crust:      { ml: 'ക്രസ്റ്റ്',    hi: 'क्रस्ट' },
  mac:        { ml: 'മാക്',        hi: 'मैक' },
  macaroni:   { ml: 'മാക്രോണി',    hi: 'मैकरोनी' },

  // Burgers, Sandwiches & Finger Foods
  burger:     { ml: 'ബർഗർ',       hi: 'बर्गर' },
  cheeseburger: { ml: 'ചീസ് ബർഗർ', hi: 'चीज़बर्गर' },
  sandwich:   { ml: 'സാൻഡ്‌വിച്ച്', hi: 'सैंडविच' },
  sub:        { ml: 'സബ്',         hi: 'सब' },
  toast:      { ml: 'ടോസ്റ്റ്',     hi: 'टोस्ट' },
  wrap:       { ml: 'റാപ്പ്',       hi: 'रैप' },
  roll:       { ml: 'റോൾ',        hi: 'रोल' },
  fries:      { ml: 'ഫ്രൈസ്',      hi: 'फ्राइज' },
  french:     { ml: 'ഫ്രഞ്ച്',      hi: 'फ्रेंच' },
  wedges:     { ml: 'വെഡ്ജസ്',     hi: 'वेजेस' },
  rings:      { ml: 'റിങ്സ്',      hi: 'रिंग्स' },
  tacos:      { ml: 'ടാക്കോസ്',    hi: 'टैकोस' },
  nachos:     { ml: 'നാച്ചോസ്',    hi: 'नाचोस' },
  quesadilla: { ml: 'കെസഡിയ',     hi: 'केसाडिला' },
  burrito:    { ml: 'ബുറിറ്റോ',     hi: 'बरिटो' },
  shawarma:   { ml: 'ഷവർമ',       hi: 'शवरमा' },
  falafel:    { ml: 'ഫലാഫൽ',      hi: 'फलाफेल' },
  hummus:     { ml: 'ഹമ്മൂസ്',     hi: 'हम्मस' },
  sticks:     { ml: 'സ്റ്റിക്സ്',    hi: 'स्टिक्स' },

  // Indo-Chinese, Desi & Middle Eastern
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
  broast:     { ml: 'ബ്രോസ്റ്റ്',    hi: 'ब्रोस्ट' },
  broasted:   { ml: 'ബ്രോസ്റ്റഡ്',  hi: 'ब्रोस्टेड' },
  alfaham:    { ml: 'അൽഫഹാം',     hi: 'अलफहम' },
  faham:      { ml: 'ഫഹാം',       hi: 'फहम' },
  mandi:      { ml: 'മന്തി',       hi: 'मंदी' },
  kabab:      { ml: 'കബാബ്',      hi: 'कबाब' },
  kebab:      { ml: 'കബാബ്',      hi: 'कबाब' },
  tikka:      { ml: 'ടിക്ക',        hi: 'टिक्का' },
  tandoori:   { ml: 'തന്തൂരി',     hi: 'तंदूरी' },
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
  manchurian: { ml: 'മഞ്ചൂരിയൻ',   hi: 'मंचूरियन' },
  schezwan:   { ml: 'ഷെസ്വാൻ',     hi: 'शेज़वान' },
  momos:      { ml: 'മോമോസ്',      hi: 'मोमोज' },
  momo:       { ml: 'മോമോ',        hi: 'मोमो' },
  spring:     { ml: 'സ്പ്രിംഗ്',   hi: 'स्प्रिंग' },

  // Beverages, Mocktails, Juices & Cafe
  virgin:     { ml: 'വെർജിൻ',     hi: 'वर्जिन' },
  mojito:     { ml: 'മൊജീറ്റോ',    hi: 'मोजीतो' },
  blue:       { ml: 'ബ്ലൂ',        hi: 'ब्लू' },
  lagoon:     { ml: 'ലഗൂൺ',       hi: 'लगून' },
  cooler:     { ml: 'കൂളർ',       hi: 'कूलर' },
  watermelon: { ml: 'വാട്ടർമെലൻ', hi: 'वॉटरमेलन' },
  melon:      { ml: 'മെലൻ',       hi: 'मेलन' },
  mint:       { ml: 'മിന്റ്',      hi: 'मिंट' },
  splash:     { ml: 'സ്പ്ലാഷ്',    hi: 'स्प्लैश' },
  passion:    { ml: 'പാഷൻ',       hi: 'पैशन' },
  fruit:      { ml: 'ഫ്രൂട്ട്',     hi: 'फ्रूट' },
  passionfruit: { ml: 'പാഷൻഫ്രൂട്ട്', hi: 'पैशनफ्रूट' },
  mango:      { ml: 'മാംഗോ',      hi: 'मैंगो' },
  fizz:       { ml: 'ഫിസ്',       hi: 'फ़िज़' },
  fresh:      { ml: 'ഫ്രഷ്',       hi: 'फ्रेश' },
  lemonade:   { ml: 'ലെമനേഡ്',    hi: 'लेमनेड' },
  lemon:      { ml: 'ലെമൺ',       hi: 'लेमन' },
  lime:       { ml: 'ലൈം',        hi: 'लाइम' },
  orange:     { ml: 'ഓറഞ്ച്',     hi: 'ऑरेंज' },
  apple:      { ml: 'ആപ്പിൾ',     hi: 'एप्पल' },
  grape:      { ml: 'ഗ്രേപ്പ്',     hi: 'ग्रेप' },
  peach:      { ml: 'പീച്ച്',      hi: 'पीच' },
  berry:      { ml: 'ബെറി',       hi: 'बेरी' },
  berries:    { ml: 'ബെറീസ്',     hi: 'बेरीज़' },
  blueberry:  { ml: 'ബ്ലൂബെറി',   hi: 'ब्लूबेरी' },
  cranberry:  { ml: 'ക്രാൻബെറി',  hi: 'क्रैनबेरी' },
  raspberry:  { ml: 'റാസ്പ്ബെറി',  hi: 'रास्पबेरी' },
  strawberry: { ml: 'സ്ട്രോബെറി',  hi: 'स्ट्रॉबेरी' },
  pineapple:  { ml: 'പൈനാപ്പിൾ',  hi: 'पाइनएप्पल' },
  coconut:    { ml: 'കോക്കനട്ട്',   hi: 'कोकोनट' },
  water:      { ml: 'വാട്ടർ',      hi: 'वॉटर' },
  tea:        { ml: 'ടീ',          hi: 'चाय' },
  chai:       { ml: 'ചായ',        hi: 'चाय' },
  coffee:     { ml: 'കോഫി',       hi: 'कॉफ़ी' },
  latte:      { ml: 'ലാറ്റെ',      hi: 'लाते' },
  cappuccino: { ml: 'കാപ്പുച്ചിനോ', hi: 'कैपुचीनो' },
  espresso:   { ml: 'എസ്പ്രസ്സോ',  hi: 'एस्प्रेसो' },
  americano:  { ml: 'അമേരിക്കാനോ',hi: 'अमेरिकानो' },
  matcha:     { ml: 'മാച്ച',       hi: 'माचा' },
  iced:       { ml: 'ഐസ്ഡ്',      hi: 'आइस' },
  ice:        { ml: 'ഐസ്',        hi: 'आइस' },
  shake:      { ml: 'ഷേക്ക്',      hi: 'शेक' },
  milkshake:  { ml: 'മിൽക്ക്‌ഷേക്ക്', hi: 'मिल्कशेक' },
  smoothie:   { ml: 'സ്മൂത്തി',    hi: 'स्मूदी' },
  juice:      { ml: 'ജ്യൂസ്',      hi: 'जूस' },
  soda:       { ml: 'സോഡ',        hi: 'सोडा' },
  coke:       { ml: 'കോക്ക്',      hi: 'कोक' },
  pepsi:      { ml: 'പെപ്സി',      hi: 'पेप्सी' },
  sprite:     { ml: 'സ്പ്രൈറ്റ്',  hi: 'स्प्राइट' },
  redbull:    { ml: 'റെഡ് ബുൾ',   hi: 'रेड बुल' },
  brew:       { ml: 'ബ്രൂ',        hi: 'ब्रू' },
  cold:       { ml: 'കോൾഡ്',      hi: 'कोल्ड' },
  hot:        { ml: 'ഹോട്ട്',       hi: 'हॉट' },
  crush:      { ml: 'ക്രഷ്',       hi: 'क्रश' },
  punch:      { ml: 'പഞ്ച്',       hi: 'पंच' },
  mocktail:   { ml: 'മോക്ടൈൽ',     hi: 'मॉकटेल' },
  tonic:      { ml: 'ടോണിക്',      hi: 'टॉनिक' },

  // Cooking Styles, Adjectives & Sauces
  bbq:        { ml: 'ബിബിക്യു',    hi: 'बीबीक्यू' },
  barbecue:   { ml: 'ബാർബക്യു',    hi: 'बारबेक्यू' },
  grilled:    { ml: 'ഗ്രിൽഡ്',     hi: 'ग्रिल्ड' },
  crispy:     { ml: 'ക്രിസ്പി',     hi: 'क्रिस्पी' },
  crunchy:    { ml: 'ക്രഞ്ചി',     hi: 'क्रंची' },
  spicy:      { ml: 'സ്പൈസി',      hi: 'स्पाइसी' },
  sweet:      { ml: 'സ്വീറ്റ്',     hi: 'स्वीट' },
  sour:       { ml: 'സോർ',        hi: 'सोर' },
  classic:    { ml: 'ക്ലാസിക്',    hi: 'क्लासिक' },
  special:    { ml: 'സ്പെഷ്യൽ',    hi: 'स्पेशल' },
  loaded:     { ml: 'ലോഡഡ്',      hi: 'लोडेड' },
  smash:      { ml: 'സ്മാഷ്',      hi: 'स्मैश' },
  zinger:     { ml: 'സിംഗർ',       hi: 'ज़िंगर' },
  double:     { ml: 'ഡബിൾ',       hi: 'डबल' },
  single:     { ml: 'സിംഗിൾ',     hi: 'सिंगल' },
  triple:     { ml: 'ട്രിപ്പിൾ',    hi: 'ट्रिपल' },
  combo:      { ml: 'കോംബോ',      hi: 'कॉम्बो' },
  platter:    { ml: 'പ്ലാറ്റർ',     hi: 'प्लैट्टर' },
  deluxe:     { ml: 'ഡീലക്സ്',     hi: 'डीलक्स' },
  extra:      { ml: 'എക്സ്ട്രാ',    hi: 'एक्स्ट्रा' },
  mayo:       { ml: 'മയോ',        hi: 'मेयो' },
  mayonnaise: { ml: 'മയോണൈസ്',   hi: 'मेयोनेज़' },
  sauce:      { ml: 'സോസ്',       hi: 'सॉस' },
  dip:        { ml: 'ഡിപ്പ്',       hi: 'डिप' },
  peri:       { ml: 'പെരി',        hi: 'पेरी' },
  periperi:   { ml: 'പെരി പെരി',  hi: 'पेरी पेरी' },
  veggie:     { ml: 'വെജ്ജി',      hi: 'वेजी' },
  veg:        { ml: 'വെജ്',       hi: 'वेज' },
  nonveg:     { ml: 'നോൺ-വെജ്',   hi: 'नॉन-वेज' },
  with:       { ml: 'വിത്ത്',       hi: 'विथ' },

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
  caramel:    { ml: 'കാരമൽ',      hi: 'कारमेल' },
  pudding:    { ml: 'പുഡ്ഡിംഗ്',   hi: 'पुडिंग' },
  waffle:     { ml: 'വാഫിൾ',      hi: 'वाफ़ल' },
  pancake:    { ml: 'പാൻകേക്ക്',   hi: 'पैनकेक' },
  falooda:    { ml: 'ഫലൂദ',       hi: 'फालूदा' },
  kulfi:      { ml: 'കുൽഫി',      hi: 'कुल्फी' },
  gulab:      { ml: 'ഗുലാബ്',      hi: 'गुलाब' },
  jamun:      { ml: 'ജാമൂൺ',      hi: 'जामुन' }
};

// ── Multi-Word Common Dishes & Phrases ──────────────────────────────────
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
  'virgin mojito':          { ml: 'വെർജിൻ മൊജീറ്റോ',      hi: 'वर्जिन मोजीतो' },
  'blue lagoon cooler':     { ml: 'ബ്ലൂ ലഗൂൺ കൂളർ',        hi: 'ब्लू लगून कूलर' },
  'blue lagoon':            { ml: 'ബ്ലൂ ലഗൂൺ',             hi: 'ब्लू लगून' },
  'watermelon mint splash': { ml: 'വാട്ടർമെലൻ മിന്റ് സ്പ്ലാഷ്', hi: 'वॉटरमेलन मिंट स्प्लैश' },
  'passionfruit mango fizz':{ ml: 'പാഷൻഫ്രൂട്ട് മാംഗോ ഫിസ്', hi: 'पैशनफ्रूट मैंगो फ़िज़' },
  'vegan beyond burger':    { ml: 'വീഗൻ ബിയോണ്ട് ബർഗർ',    hi: 'वीगन बियॉन्ड बर्गर' },
  'fresh lemonade':         { ml: 'ഫ്രഷ് ലെമനേഡ്',        hi: 'फ्रेश लेमनेड' },
  'iced matcha latte':      { ml: 'ഐസ്ഡ് മാച്ച ലാറ്റെ',     hi: 'आइस माचा लाते' },
  'cold brew coffee':       { ml: 'കോൾഡ് ബ്രൂ കോഫി',      hi: 'कोल्ड ब्रू कॉफ़ी' },
  'fresh lime soda':        { ml: 'ഫ്രഷ് ലൈം സോഡ',       hi: 'फ्रेश लाइम सोडा' },
  'chocolate lava cake':    { ml: 'ചോക്ലേറ്റ് ലാവ കേക്ക്', hi: 'चॉकलेट लावा केक' },
  'new york cheesecake':    { ml: 'ന്യൂയോർക്ക് ചീസ്കേക്ക്', hi: 'न्यू यॉर्क चीज़केक' }
};

/**
 * Splits compound culinary words like "passionfruit", "cheeseburger", "milkshake"
 */
function decomposeCompoundWord(word, targetLang) {
  if (word.length < 5) return null;
  for (let splitIdx = 3; splitIdx <= word.length - 3; splitIdx++) {
    const part1 = word.slice(0, splitIdx);
    const part2 = word.slice(splitIdx);
    if (CULINARY_DICT[part1] && CULINARY_DICT[part1][targetLang] &&
        CULINARY_DICT[part2] && CULINARY_DICT[part2][targetLang]) {
      return CULINARY_DICT[part1][targetLang] + ' ' + CULINARY_DICT[part2][targetLang];
    }
  }
  return null;
}

/**
 * Syllable and cluster-aware phonetic transliterator for unlisted English words.
 * Correctly distinguishes between initial independent vowels and post-consonant matras,
 * avoiding broken disconnected letters (e.g. produces "സ്പ്ലാഷ്" instead of "സ്പലഅഷ്").
 */
function transliterateFallback(word, targetLang) {
  if (!word) return '';
  const isMl = targetLang === 'ml';
  const clean = word.toLowerCase().trim();

  let out = '';
  let prevWasConsonant = false;
  let i = 0;

  while (i < clean.length) {
    const rem = clean.slice(i);
    const isAtStart = (i === 0);
    const remLen = rem.length;

    // 1. Common English Prefixes
    if (rem.startsWith('water')) {
      out += isMl ? 'വാട്ടർ' : 'वॉटर';
      prevWasConsonant = true;
      i += 5;
      continue;
    }

    // 2. Word-Ending Syllables
    if (rem === 'tion' || rem === 'sion') {
      out += isMl ? 'ഷൻ' : 'शन';
      break;
    }
    if (rem === 'ing') {
      out += isMl ? 'ിംഗ്' : 'िंग';
      break;
    }
    if (rem === 'ed') {
      out += isMl ? 'ഡ്' : 'ड';
      break;
    }
    if (rem === 'er' || rem === 'ar' || rem === 'or') {
      out += isMl ? 'ർ' : 'र';
      break;
    }
    if (rem === 'es') {
      out += isMl ? 'സ്' : 'स';
      break;
    }
    if (rem === 'ies') {
      out += isMl ? 'ീസ്' : 'ीज़';
      break;
    }
    if (rem === 'nd') {
      out += isMl ? 'ണ്ട്' : 'न्ड';
      break;
    }
    if (rem === 'nt') {
      out += isMl ? 'ന്റ്' : 'न्ट';
      break;
    }
    if (rem === 'st') {
      out += isMl ? 'സ്റ്റ്' : 'स्ट';
      break;
    }
    if (rem === 'sh') {
      out += isMl ? 'ഷ്' : 'श';
      break;
    }
    if (rem === 'ch') {
      out += isMl ? 'ച്ച്' : 'च';
      break;
    }
    if (rem === 'ck') {
      out += isMl ? 'ക്ക്' : 'क';
      break;
    }

    // 3. Multi-Consonant Clusters (3 characters)
    if (rem.startsWith('spl')) {
      out += isMl ? 'സ്പ്ല' : 'स्प्ल';
      prevWasConsonant = true;
      i += 3;
      continue;
    }
    if (rem.startsWith('str')) {
      out += isMl ? 'സ്ട്ര' : 'स्ट्र';
      prevWasConsonant = true;
      i += 3;
      continue;
    }
    if (rem.startsWith('spr')) {
      out += isMl ? 'സ്പ്ര' : 'स्प्र';
      prevWasConsonant = true;
      i += 3;
      continue;
    }
    if (rem.startsWith('scr')) {
      out += isMl ? 'സ്ക്ര' : 'स्क्र';
      prevWasConsonant = true;
      i += 3;
      continue;
    }

    // 4. Multi-Consonant Clusters & Digraphs (2 characters)
    if (rem.startsWith('bl')) {
      out += isMl ? 'ബ്ല' : 'ब्ल';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('br')) {
      out += isMl ? 'ബ്ര' : 'ब्र';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('cl')) {
      out += isMl ? 'ക്ല' : 'क्ल';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('cr')) {
      out += isMl ? 'ക്ര' : 'क्र';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('dr')) {
      out += isMl ? 'ഡ്ര' : 'ड्र';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('fl')) {
      out += isMl ? 'ഫ്ല' : 'फ्ल';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('fr')) {
      out += isMl ? 'ഫ്ര' : 'फ्र';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('gl')) {
      out += isMl ? 'ഗ്ല' : 'ग्लो';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('gr')) {
      out += isMl ? 'ഗ്ര' : 'ग्र';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('pl')) {
      out += isMl ? 'പ്ല' : 'प्ल';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('pr')) {
      out += isMl ? 'പ്ര' : 'प्र';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('tr')) {
      out += isMl ? 'ട്ര' : 'ट्र';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('st')) {
      out += isMl ? 'സ്റ്റ' : 'स्ट';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('sp')) {
      out += isMl ? 'സ്പ' : 'स्प';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('sm')) {
      out += isMl ? 'സ്മ' : 'स्म';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('sn')) {
      out += isMl ? 'സ്ന' : 'स्न';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('sw')) {
      out += isMl ? 'സ്വ' : 'स्व';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('sl')) {
      out += isMl ? 'സ്ല' : 'स्ल';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('sk') || rem.startsWith('sc')) {
      out += isMl ? 'സ്ക' : 'स्क';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('ch')) {
      out += isMl ? (isAtStart ? 'ച' : 'ച്ച') : 'च';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('sh')) {
      out += isMl ? (remLen === 2 ? 'ഷ്' : 'ഷ') : 'श';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('th')) {
      out += isMl ? (remLen === 2 ? 'ത്' : 'ത') : 'थ';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('ph')) {
      out += isMl ? (remLen === 2 ? 'ഫ്' : 'ഫ') : 'फ';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('ck')) {
      out += isMl ? 'ക്ക്' : 'क';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('qu')) {
      out += isMl ? 'ക്വ' : 'क्व';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('zz')) {
      out += isMl ? (remLen === 2 ? 'സ്' : 'സ്സ്') : 'ज़';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('ss')) {
      out += isMl ? (remLen === 2 ? 'സ്' : 'സ്സ') : 'स';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('tt')) {
      out += isMl ? (remLen === 2 ? 'റ്റ്' : 'ട്ട') : 'ट';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('pp')) {
      out += isMl ? (remLen === 2 ? 'പ്പ്' : 'പ്പ') : 'प';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('bb')) {
      out += isMl ? (remLen === 2 ? 'ബ്' : 'ബ്ബ') : 'ब';
      prevWasConsonant = true;
      i += 2;
      continue;
    }
    if (rem.startsWith('ll')) {
      out += isMl ? (remLen === 2 ? 'ൽ' : 'ല്ല') : 'ल';
      prevWasConsonant = true;
      i += 2;
      continue;
    }

    // 5. Vowel Digraphs (Attaches Matra to previous consonant or independent vowel)
    if (rem.startsWith('ee') || rem.startsWith('ea')) {
      out += prevWasConsonant ? (isMl ? 'ീ' : 'ी') : (isMl ? 'ഈ' : 'ई');
      prevWasConsonant = false;
      i += 2;
      continue;
    }
    if (rem.startsWith('oo')) {
      out += prevWasConsonant ? (isMl ? 'ൂ' : 'ू') : (isMl ? 'ഊ' : 'ऊ');
      prevWasConsonant = false;
      i += 2;
      continue;
    }
    if (rem.startsWith('ai') || rem.startsWith('ay')) {
      out += prevWasConsonant ? (isMl ? 'ൈ' : 'ै') : (isMl ? 'ഐ' : 'ऐ');
      prevWasConsonant = false;
      i += 2;
      continue;
    }
    if (rem.startsWith('ou') || rem.startsWith('ow')) {
      out += prevWasConsonant ? (isMl ? 'ൗ' : 'ौ') : (isMl ? 'ഔ' : 'औ');
      prevWasConsonant = false;
      i += 2;
      continue;
    }
    if (rem.startsWith('oa')) {
      out += prevWasConsonant ? (isMl ? 'ോ' : 'ो') : (isMl ? 'ഓ' : 'ओ');
      prevWasConsonant = false;
      i += 2;
      continue;
    }

    const c = clean[i];

    // Silent terminal 'e' (like in cake, plate, lime, coke)
    if (c === 'e' && remLen === 1 && prevWasConsonant && clean.length > 2) {
      break;
    }

    // Single Vowels
    if (c === 'a') {
      if (prevWasConsonant) {
        out += isMl ? 'ാ' : 'ा';
      } else {
        out += isMl ? (isAtStart ? 'ആ' : 'ാ') : (isAtStart ? 'आ' : 'ा');
      }
      prevWasConsonant = false;
      i++;
      continue;
    }
    if (c === 'e') {
      if (prevWasConsonant) {
        out += isMl ? 'െ' : 'े';
      } else {
        out += isMl ? 'എ' : 'ए';
      }
      prevWasConsonant = false;
      i++;
      continue;
    }
    if (c === 'i') {
      if (prevWasConsonant) {
        out += isMl ? 'ി' : 'ि';
      } else {
        out += isMl ? 'ഇ' : 'इ';
      }
      prevWasConsonant = false;
      i++;
      continue;
    }
    if (c === 'o') {
      if (prevWasConsonant) {
        out += isMl ? 'ോ' : 'ो';
      } else {
        out += isMl ? 'ഒ' : 'ओ';
      }
      prevWasConsonant = false;
      i++;
      continue;
    }
    if (c === 'u') {
      if (prevWasConsonant) {
        out += isMl ? 'ു' : 'ु';
      } else {
        out += isMl ? 'ഉ' : 'उ';
      }
      prevWasConsonant = false;
      i++;
      continue;
    }

    // Terminal Single Consonants (Chillu / Virama)
    if (remLen === 1) {
      const endings = {
        r: { ml: 'ർ', hi: 'र' },
        n: { ml: 'ൻ', hi: 'न' },
        l: { ml: 'ൽ', hi: 'ल' },
        m: { ml: 'ം', hi: 'म' },
        t: { ml: 'റ്റ്', hi: 'ट' },
        d: { ml: 'ഡ്', hi: 'ड' },
        k: { ml: 'ക്ക്', hi: 'क' },
        p: { ml: 'പ്പ്', hi: 'प' },
        s: { ml: 'സ്', hi: 'स' },
        f: { ml: 'ഫ്', hi: 'फ़' },
        g: { ml: 'ഗ്', hi: 'ग' },
        b: { ml: 'ബ്', hi: 'ब' },
        v: { ml: 'വ്', hi: 'व' },
        z: { ml: 'സ്', hi: 'ज़' },
        y: { ml: 'ി', hi: 'ी' }
      };
      if (endings[c]) {
        out += isMl ? endings[c].ml : endings[c].hi;
        break;
      }
    }

    // Single Consonants (Base)
    const cons = {
      b: { ml: 'ബ', hi: 'ब' },
      c: { ml: 'ക', hi: 'क' },
      d: { ml: 'ഡ', hi: 'ड' },
      f: { ml: 'ഫ', hi: 'फ' },
      g: { ml: 'ഗ', hi: 'ग' },
      h: { ml: 'ഹ', hi: 'ह' },
      j: { ml: 'ജ', hi: 'ज' },
      k: { ml: 'ക', hi: 'क' },
      l: { ml: 'ല', hi: 'ल' },
      m: { ml: 'മ', hi: 'म' },
      n: { ml: 'ന', hi: 'न' },
      p: { ml: 'പ', hi: 'प' },
      q: { ml: 'ക്വ', hi: 'क्व' },
      r: { ml: 'ര', hi: 'र' },
      s: { ml: 'സ', hi: 'स' },
      t: { ml: 'ട', hi: 'ट' },
      v: { ml: 'വ', hi: 'व' },
      w: { ml: 'വ', hi: 'व' },
      x: { ml: 'ക്സ്', hi: 'क्स' },
      y: { ml: 'യ', hi: 'य' },
      z: { ml: 'സ', hi: 'ज़' }
    };

    if (cons[c]) {
      out += isMl ? cons[c].ml : cons[c].hi;
      prevWasConsonant = true;
    }
    i++;
  }

  return out;
}

/**
 * Main food transliteration function.
 * @param {string} dishName - The English dish name (e.g. "Garlic Chicken")
 * @param {string} targetLang - Target language code ('ml' for Malayalam, 'hi' for Hindi, 'en' for English)
 * @returns {string} Natural phonetic script in the target language
 */
export function transliterateFood(dishName, targetLang = 'en') {
  if (!dishName || typeof dishName !== 'string') return '';
  if (!targetLang || targetLang === 'en') return dishName;

  const normalized = dishName.trim().toLowerCase();

  // 1. Check exact full dish phrase first
  if (DISH_PHRASES[normalized] && DISH_PHRASES[normalized][targetLang]) {
    return DISH_PHRASES[normalized][targetLang];
  }

  // 2. Tokenize into individual words
  const words = dishName.trim().split(/\s+/);
  const convertedWords = words.map(rawWord => {
    // Strip common punctuation (e.g. "Chicken," -> "chicken")
    const cleanWord = rawWord.toLowerCase().replace(/[^a-z0-9&]/g, '');
    if (!cleanWord) return rawWord;
    
    // Check symbols and conjunctions
    if (cleanWord === '&' || cleanWord === 'and') {
      return '&';
    }

    // Direct vocabulary dictionary match
    if (CULINARY_DICT[cleanWord] && CULINARY_DICT[cleanWord][targetLang]) {
      return CULINARY_DICT[cleanWord][targetLang];
    }

    // Strip plural 's' or 'es' (e.g. "burgers" -> "burger")
    if (cleanWord.endsWith('s')) {
      const singular = cleanWord.endsWith('es') ? cleanWord.slice(0, -2) : cleanWord.slice(0, -1);
      if (CULINARY_DICT[singular] && CULINARY_DICT[singular][targetLang]) {
        return CULINARY_DICT[singular][targetLang];
      }
    }

    // Compound word decomposition (e.g. "passionfruit" -> "പാഷൻഫ്രൂട്ട്")
    const compound = decomposeCompoundWord(cleanWord, targetLang);
    if (compound) {
      return compound;
    }

    // Fallback to intelligent syllable-based phonetic transliterator
    return transliterateFallback(rawWord, targetLang);
  });

  return convertedWords.join(' ');
}

export const SUPPORTED_WAITER_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', flag: '🌴' },
  { code: 'hi', label: 'Hindi', native: 'हिंदी', flag: '🇮🇳' },
];
