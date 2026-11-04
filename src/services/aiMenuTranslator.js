import {
  getEffectiveGroqApiKey,
  sanitizeGroqModel,
  DEFAULT_MODEL_ID,
  BUILTIN_GROQ_API_KEY
} from './groqService';
import { transliterateFood } from '../utils/foodTransliteration';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Extracts a JSON object from a model's text response, removing markdown codeblocks if present.
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  // Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Try to find the outer-most { ... }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {}
  }

  return null;
}

/**
 * Translates a single dish name phonetically into Malayalam and Hindi using AI.
 * Falls back safely to rule-based transliteration on any network or API error.
 * 
 * @param {string} dishName - e.g. "Beef Birria Tacos"
 * @param {object} restaurant - Restaurant configuration object
 * @returns {Promise<{ ml: string, hi: string }>}
 */
export async function translateDishWithAI(dishName, restaurant = {}) {
  const fallback = {
    ml: transliterateFood(dishName, 'ml'),
    hi: transliterateFood(dishName, 'hi')
  };

  if (!dishName || !dishName.trim()) {
    return fallback;
  }

  const apiKey = getEffectiveGroqApiKey(restaurant);
  const model = sanitizeGroqModel(restaurant?.groqModel || DEFAULT_MODEL_ID);

  const systemPrompt = `You are a professional multilingual culinary expert and restaurant translator.
Translate/transliterate the given English dish name into conversational, natural phonetic script in Malayalam (മലയാളം) and Hindi (हिंदी).
RULES:
1. Phonetic Restaurant Pronunciation: Write how waiters and foodies pronounce the dish aloud in high-end restaurants, NOT literal word-by-word translation.
   - "Beef Birria Tacos" -> ml: "ബീഫ് ബിരിയ ടാക്കോസ്", hi: "बीफ बिरिया टैकोस"
   - "Garlic Chicken" -> ml: "ഗാർലിക് ചിക്കൻ", hi: "गार्लिक चिकन"
   - "Virgin Mojito" -> ml: "വെർജിൻ മൊജീറ്റോ", hi: "वर्जिन मोजीतो"
   - "Spaghetti Carbonara" -> ml: "സ്പഗെറ്റി കാർബൊനാര", hi: "स्पेगेटी कार्बोनेरा"
   - "Gnocchi" -> ml: "ന്യോക്കി", hi: "न्योकी"
   - "Watermelon Mint Splash" -> ml: "വാട്ടർമെലൻ മിന്റ് സ്പ്ലാഷ്", hi: "वॉटरमेलन मिंट स्प्लैश"
2. Clean Script: Use proper Malayalam and Hindi letters. Never use floating matras or broken vowels.
3. OUTPUT FORMAT: Respond ONLY with a valid JSON object:
{"ml": "മലയാളം പേര്", "hi": "हिंदी नाम"}`;

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Dish: "${dishName.trim()}"` }
        ],
        temperature: 0.2,
        max_tokens: 200
      })
    });

    if (!res.ok) {
      // If custom key failed, retry once with built-in key
      if (apiKey !== BUILTIN_GROQ_API_KEY) {
        return translateDishWithAI(dishName, { ...restaurant, groqApiKey: BUILTIN_GROQ_API_KEY });
      }
      return fallback;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);

    if (parsed && typeof parsed.ml === 'string' && typeof parsed.hi === 'string') {
      return {
        ml: parsed.ml.trim(),
        hi: parsed.hi.trim()
      };
    }

    return fallback;
  } catch (err) {
    console.warn('[translateDishWithAI] Falling back to rule-based transliterator:', err.message);
    return fallback;
  }
}

/**
 * Translates a list of dishes in a single batch AI call.
 * 
 * @param {string[]} dishNames - Array of dish names
 * @param {object} restaurant - Restaurant configuration object
 * @returns {Promise<Record<string, { ml: string, hi: string }>>}
 */
export async function batchTranslateDishesWithAI(dishNames, restaurant = {}) {
  const result = {};
  if (!Array.isArray(dishNames) || dishNames.length === 0) {
    return result;
  }

  // Pre-fill with fallback
  for (const name of dishNames) {
    if (name) {
      result[name] = {
        ml: transliterateFood(name, 'ml'),
        hi: transliterateFood(name, 'hi')
      };
    }
  }

  const apiKey = getEffectiveGroqApiKey(restaurant);
  const model = sanitizeGroqModel(restaurant?.groqModel || DEFAULT_MODEL_ID);

  const systemPrompt = `You are a professional multilingual restaurant translator.
Convert the given list of English restaurant dishes into natural phonetic script in Malayalam (മലയാളം) and Hindi (हिंदी).
RULES:
1. Phonetic transliteration: How dishes are spoken aloud in restaurants.
2. Clean valid script only.
3. OUTPUT FORMAT: Respond ONLY with a valid JSON object mapping each dish name to its native script:
{
  "Dish Name": { "ml": "മലയാളം", "hi": "हिंदी" }
}`;

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(dishNames) }
        ],
        temperature: 0.2,
        max_tokens: 1500
      })
    });

    if (!res.ok) {
      if (apiKey !== BUILTIN_GROQ_API_KEY) {
        return batchTranslateDishesWithAI(dishNames, { ...restaurant, groqApiKey: BUILTIN_GROQ_API_KEY });
      }
      return result;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);

    if (parsed && typeof parsed === 'object') {
      for (const [key, val] of Object.entries(parsed)) {
        if (val && typeof val.ml === 'string' && typeof val.hi === 'string') {
          // Normalize matching
          const matchKey = dishNames.find(d => d.toLowerCase().trim() === key.toLowerCase().trim()) || key;
          result[matchKey] = {
            ml: val.ml.trim(),
            hi: val.hi.trim()
          };
        }
      }
    }

    return result;
  } catch (err) {
    console.warn('[batchTranslateDishesWithAI] Using fallback transliteration:', err.message);
    return result;
  }
}
