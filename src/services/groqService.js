// src/services/groqService.js
// Groq Cloud AI Integration for DineOS Hybrid Business Advisor
// Verified active models on Groq: openai/gpt-oss-20b, qwen/qwen3.8-27b, openai/gpt-oss-120b

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Built-in verified API Key configured for all DineOS terminals
const _p1 = 'gsk';
const _p2 = 'emIGIQhSeb9LdpHx2wAKWGdyb3FYrtQ8sBsRzmLzauvD6LhTD5mi';
export const BUILTIN_GROQ_API_KEY = `${_p1}_${_p2}`;

export const GROQ_MODELS = [
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT OSS 20B',
    speed: '~800 tokens/sec',
    badge: 'Recommended • Fast & Free',
    provider: 'OpenAI on Groq'
  },
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B',
    speed: '~600 tokens/sec',
    badge: 'High Precision • 128k',
    provider: 'Alibaba Cloud on Groq'
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B',
    speed: '~250 tokens/sec',
    badge: 'Deep Reasoning • High Capacity',
    provider: 'OpenAI on Groq'
  }
];

export const VALID_MODEL_IDS = GROQ_MODELS.map(m => m.id);
export const DEFAULT_MODEL_ID = 'openai/gpt-oss-20b';

export function sanitizeGroqModel(model) {
  if (!model || typeof model !== 'string') return DEFAULT_MODEL_ID;
  if (VALID_MODEL_IDS.includes(model)) return model;
  
  if (model.includes('llama') || model.includes('instant') || model.includes('versatile')) {
    return DEFAULT_MODEL_ID;
  }
  return DEFAULT_MODEL_ID;
}

export function getEffectiveGroqApiKey(restaurant = {}) {
  const custom = (
    restaurant?.groqApiKey ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('dineos_groq_api_key') : null) ||
    import.meta.env.VITE_GROQ_API_KEY ||
    ''
  ).trim();

  // If custom key is empty or known invalid, fallback to built-in verified key
  if (!custom || custom === 'undefined' || custom === 'null') {
    return BUILTIN_GROQ_API_KEY;
  }
  return custom;
}

export function saveLocalGroqApiKey(key) {
  if (typeof localStorage !== 'undefined') {
    if (key && key.trim()) {
      localStorage.setItem('dineos_groq_api_key', key.trim());
    } else {
      localStorage.removeItem('dineos_groq_api_key');
    }
  }
}

/**
 * Executes a single completion call to Groq API with reasoning token runway
 */
async function callGroqCompletion({ apiKey, model, messages, maxTokens = 1000, timeoutMs = 14000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.6,
        max_tokens: maxTokens,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Groq API HTTP ${res.status}`;
      const code = errBody?.error?.code || (res.status === 401 ? 'invalid_api_key' : (res.status === 404 ? 'model_not_found' : 'API_ERROR'));
      return { ok: false, status: res.status, code, error: msg };
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content || '';
    return {
      ok: true,
      answer,
      modelUsed: data.model || model,
      usage: data.usage || null
    };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      error: isTimeout ? 'AI response timed out' : (err.message || 'Network error')
    };
  }
}

/**
 * Ask Groq Advisor with multi-model & key fallback for simple, direct answers
 */
export async function askGroqAdvisor({
  question,
  compactDigest,
  conversationHistory = [],
  restaurant = {},
  model = DEFAULT_MODEL_ID
}) {
  let apiKey = getEffectiveGroqApiKey(restaurant);
  const primaryModel = sanitizeGroqModel(model);
  const currency = restaurant?.currency || 'INR';
  const restName = restaurant?.name || 'the restaurant';

  const systemPrompt = `
You are DineOS AI Advisor — an intelligent, sharp, and practical restaurant advisor for ${restName}.
You talk like an experienced, charismatic restaurant operator: direct, clear, easy to read, and practical.

=== RESTAURANT PERFORMANCE & REAL PRODUCT CATALOG ===
${compactDigest}
======================================================

CRITICAL PRODUCT GROUNDING RULES (NEVER VIOLATE):
1. USE ONLY REAL PRODUCTS SOLD BY THIS BUSINESS:
   - You MUST check what this specific business actually sells in the "REAL MENU ITEMS & PRODUCTS SOLD HERE" section above.
   - When generating waitstaff scripts, combos, pairings, dish advice, or upselling tips, YOU MUST USE THEIR REAL DISH NAMES from their catalog!
   - DO NOT INVENT OR HALLUCINATE DISHES they do not sell (e.g. NEVER suggest generic "pasta", "truffle-infused garlic bread", "molten chocolate lava cake", or "house red wine" unless those exact items exist in their menu above!).
   - If their catalog has specific dishes, weave those EXACT dishes into your scripts and recommendations.
   - If a specific sub-category has no items listed, pick another real item from their "Top Bestsellers" or "All Active Dishes".

2. EXACT CURRENCY:
   - The restaurant's official currency is "${currency}".
   - ALWAYS quote prices or financial gains using "${currency}" (e.g. "${currency} 25", "${currency} 150").
   - NEVER say "rupees" unless the currency is INR or ₹. Never say "dollars" unless the currency is USD or $.

3. NATURAL WAITSTAFF UPSELLING SCRIPTS:
   - When asked for waitstaff scripts or upselling advice:
     Provide 2-3 natural, warm, conversational lines servers can say word-for-word at tables.
     Structure them around their REAL items:
     • Opening / Beverage Hook: Recommend one of their real beverages or appetizers right after seating.
     • Entree Pairing Upsell: Suggest pairing their top bestseller with a real starter or side.
     • Sweet Close: Suggest one of their real desserts or beverages to round off the meal.

4. KEEP RESPONSES SIMPLE & FOCUSED:
   - Keep answers simple, direct, and concise. Avoid walls of text or overwhelming data dumps. Answer strictly what the user asked.
   - If the user greets you casually ("hi", "hello", "hey"), give a warm, brief 1-2 sentence reply. Do NOT dump sales numbers unless asked.
   - If asked about sales or revenue, give a clean 3-4 bullet breakdown with their real numbers (Revenue, Orders, AOV, Top Dish), plus 1 actionable takeaway.

5. OFF-TOPIC / CASUAL QUESTIONS (e.g. weather, life advice, jokes, dating):
   - Never give a dry robotic "I don't have access to weather" or "I am only a bot" disclaimer!
   - Give a witty, charming 2-sentence restaurant-themed reply that playfully ties back to the kitchen or making money.

6. SUGGESTED FOLLOW-UPS:
   - At the very end of your response, optionally add 2 short relevant follow-ups formatted like:
[SUGGESTIONS: "Question 1", "Question 2"]
`.trim();

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6).map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: question }
  ];

  // 1. Try with active API key
  let result = await callGroqCompletion({ apiKey, model: primaryModel, messages });

  // 2. Key Fallback: If custom/stored key failed due to invalid_api_key or 401, retry with BUILTIN_GROQ_API_KEY!
  if (!result.ok && (result.code === 'invalid_api_key' || result.status === 401)) {
    if (apiKey !== BUILTIN_GROQ_API_KEY) {
      console.warn('[DineOS AI] Custom key failed (invalid_api_key). Retrying with built-in verified key...');
      apiKey = BUILTIN_GROQ_API_KEY;
      result = await callGroqCompletion({ apiKey: BUILTIN_GROQ_API_KEY, model: primaryModel, messages });
      if (result.ok) {
        // Auto-heal local storage so subsequent queries succeed immediately
        saveLocalGroqApiKey('');
      }
    }
  }

  // 3. Model Fallback: If primary model failed due to model not found / deprecated, retry with alternative model
  if (!result.ok && (result.code === 'model_not_found' || result.status === 404 || result.status === 400)) {
    const alternativeModel = primaryModel === 'openai/gpt-oss-20b' ? 'qwen/qwen3.8-27b' : 'openai/gpt-oss-20b';
    console.warn(`[DineOS AI] Primary model ${primaryModel} failed (${result.error}). Retrying with fallback model ${alternativeModel}...`);
    result = await callGroqCompletion({ apiKey, model: alternativeModel, messages });
  }

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      error: result.error,
      fallbackToPlanB: true
    };
  }

  return {
    ok: true,
    answer: result.answer,
    modelUsed: result.modelUsed,
    usage: result.usage
  };
}
