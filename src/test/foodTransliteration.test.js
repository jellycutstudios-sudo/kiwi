import { describe, it, expect } from 'vitest';
import { transliterateFood, SUPPORTED_WAITER_LANGUAGES } from '../utils/foodTransliteration';

describe('Food Transliteration Engine', () => {
  it('returns English name when target is en or omitted', () => {
    expect(transliterateFood('Garlic Chicken', 'en')).toBe('Garlic Chicken');
    expect(transliterateFood('Garlic Chicken')).toBe('Garlic Chicken');
  });

  it('transliterates Garlic Chicken to Malayalam phonetic script', () => {
    const ml = transliterateFood('Garlic Chicken', 'ml');
    expect(ml).toBe('ഗാർലിക് ചിക്കൻ');
  });

  it('transliterates popular Italian dishes to Malayalam', () => {
    expect(transliterateFood('Spaghetti Carbonara', 'ml')).toBe('സ്പഗെറ്റി കാർബൊനാര');
    expect(transliterateFood('Fettuccine Alfredo', 'ml')).toBe('ഫെത്തുച്ചിനി ആൽഫ്രെഡോ');
    expect(transliterateFood('Four Cheese', 'ml')).toBe('ഫോർ ചീസ്');
    expect(transliterateFood('Margherita', 'ml')).toBe('മാർഗരീത്ത');
    expect(transliterateFood('BBQ Chicken Pizza', 'ml')).toBe('ബിബിക്യു ചിക്കൻ പിസ്സ');
  });

  it('transliterates to Hindi phonetic script', () => {
    expect(transliterateFood('Garlic Chicken', 'hi')).toBe('गार्लिक चिकन');
    expect(transliterateFood('Butter Chicken', 'hi')).toBe('बटर चिकन');
    expect(transliterateFood('Chicken Biryani', 'hi')).toBe('चिकन बिरयानी');
  });

  it('handles multi-word and plural terms correctly', () => {
    expect(transliterateFood('French Fries', 'ml')).toBe('ഫ്രഞ്ച് ഫ്രൈസ്');
    expect(transliterateFood('Buffalo Wings', 'ml')).toBe('ബഫല്ലോ വിങ്സ്');
  });

  it('provides language options list', () => {
    expect(SUPPORTED_WAITER_LANGUAGES.map(l => l.code)).toEqual(['en', 'ml', 'hi']);
  });
});
