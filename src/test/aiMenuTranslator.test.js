import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateDishWithAI, batchTranslateDishesWithAI } from '../services/aiMenuTranslator';

describe('AI Menu Translator Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('translates dish using AI when Groq API succeeds', async () => {
    const mockJson = JSON.stringify({
      ml: 'ബീഫ് ബിരിയ ടാക്കോസ്',
      hi: 'बीफ बिरिया टैकोस'
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockJson } }]
      })
    });

    const res = await translateDishWithAI('Beef Birria Tacos');
    expect(res.ml).toBe('ബീഫ് ബിരിയ ടാക്കോസ്');
    expect(res.hi).toBe('बीफ बिरिया टैकोस');
  });

  it('falls back to rule-based transliterator when fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const res = await translateDishWithAI('Garlic Chicken');
    expect(res.ml).toBe('ഗാർലിക് ചിക്കൻ');
    expect(res.hi).toBe('गार्लिक चिकन');
  });

  it('batch translates dishes with AI', async () => {
    const mockBatch = JSON.stringify({
      'Watermelon Mint Splash': { ml: 'വാട്ടർമെലൻ മിന്റ് സ്പ്ലാഷ്', hi: 'वॉटरमेलन मिंट स्प्लैश' },
      'Virgin Mojito': { ml: 'വെർജിൻ മൊജീറ്റോ', hi: 'वर्जिन मोजीतो' }
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: mockBatch } }]
      })
    });

    const res = await batchTranslateDishesWithAI(['Watermelon Mint Splash', 'Virgin Mojito']);
    expect(res['Watermelon Mint Splash'].ml).toBe('വാട്ടർമെലൻ മിന്റ് സ്പ്ലാഷ്');
    expect(res['Virgin Mojito'].hi).toBe('वर्जिन मोजीतो');
  });
});
