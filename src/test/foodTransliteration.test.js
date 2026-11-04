import { describe, it, expect } from 'vitest';
import { transliterateFood, SUPPORTED_WAITER_LANGUAGES } from '../utils/foodTransliteration';

describe('Food Transliteration Engine', () => {
  it('returns English name when target is en or omitted', () => {
    expect(transliterateFood('Garlic Chicken', 'en')).toBe('Garlic Chicken');
    expect(transliterateFood('Garlic Chicken')).toBe('Garlic Chicken');
  });

  it('transliterates all waiter mobile screenshot items to natural Malayalam', () => {
    expect(transliterateFood('Vegan Beyond Burger', 'ml')).toBe('വീഗൻ ബിയോണ്ട് ബർഗർ');
    expect(transliterateFood('Garlic chicken', 'ml')).toBe('ഗാർലിക് ചിക്കൻ');
    expect(transliterateFood('Virgin Mojito', 'ml')).toBe('വെർജിൻ മൊജീറ്റോ');
    expect(transliterateFood('Blue Lagoon Cooler', 'ml')).toBe('ബ്ലൂ ലഗൂൺ കൂളർ');
    expect(transliterateFood('Watermelon Mint Splash', 'ml')).toBe('വാട്ടർമെലൻ മിന്റ് സ്പ്ലാഷ്');
    expect(transliterateFood('Passionfruit Mango Fizz', 'ml')).toBe('പാഷൻഫ്രൂട്ട് മാംഗോ ഫിസ്');
    expect(transliterateFood('Iced Matcha Latte', 'ml')).toBe('ഐസ്ഡ് മാച്ച ലാറ്റെ');
    expect(transliterateFood('Fresh Lemonade', 'ml')).toBe('ഫ്രഷ് ലെമനേഡ്');
  });

  it('transliterates all waiter mobile screenshot items to natural Hindi', () => {
    expect(transliterateFood('Vegan Beyond Burger', 'hi')).toBe('वीगन बियॉन्ड बर्गर');
    expect(transliterateFood('Garlic chicken', 'hi')).toBe('गार्लिक चिकन');
    expect(transliterateFood('Virgin Mojito', 'hi')).toBe('वर्जिन मोजीतो');
    expect(transliterateFood('Blue Lagoon Cooler', 'hi')).toBe('ब्लू लगून कूलर');
    expect(transliterateFood('Watermelon Mint Splash', 'hi')).toBe('वॉटरमेलन मिंट स्प्लैश');
    expect(transliterateFood('Passionfruit Mango Fizz', 'hi')).toBe('पैशनफ्रूट मैंगो फ़िज़');
    expect(transliterateFood('Iced Matcha Latte', 'hi')).toBe('आइस माचा लाते');
    expect(transliterateFood('Fresh Lemonade', 'hi')).toBe('फ्रेश लेमनेड');
  });

  it('transliterates popular Italian dishes to Malayalam', () => {
    expect(transliterateFood('Spaghetti Carbonara', 'ml')).toBe('സ്പഗെറ്റി കാർബൊനാര');
    expect(transliterateFood('Fettuccine Alfredo', 'ml')).toBe('ഫെത്തുച്ചിനി ആൽഫ്രെഡോ');
    expect(transliterateFood('Four Cheese', 'ml')).toBe('ഫോർ ചീസ്');
    expect(transliterateFood('Margherita', 'ml')).toBe('മാർഗരീത്ത');
    expect(transliterateFood('BBQ Chicken Pizza', 'ml')).toBe('ബിബിക്യു ചിക്കൻ പിസ്സ');
  });

  it('handles multi-word and plural terms correctly', () => {
    expect(transliterateFood('French Fries', 'ml')).toBe('ഫ്രഞ്ച് ഫ്രൈസ്');
    expect(transliterateFood('Buffalo Wings', 'ml')).toBe('ബഫല്ലോ വിങ്സ്');
  });

  it('provides language options list', () => {
    expect(SUPPORTED_WAITER_LANGUAGES.map(l => l.code)).toEqual(['en', 'ml', 'hi']);
  });
});
