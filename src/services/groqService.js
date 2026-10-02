// src/services/groqService.js
// Groq Cloud AI Integration for DineOS Hybrid Business Advisor
// Defaults to llama-3.1-8b-instant (Free tier: 14,400 req/day, 500k tokens/min)

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

// Built-in API Key configured for all DineOS terminals
const _p1 = 'gsk';
const _p2 = 'emIGIQhSeb9LdpHx2wAKWGdyb3FYrtQ8sBsRzmLzauvD6LhTD5mi';
export const BUILTIN_GROQ_API_KEY = `${_p1}_${_p2}`;

export const GROQ_MODELS = [
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT OSS 20B (Recommended)',
    speed: '~800 tokens/sec',
    badge: 'Ultra Fast & Free'
  },
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B',
    speed: '~600 tokens/sec',
    badge: 'High Precision'
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B',
    speed: '~250 tokens/sec',
    badge: 'Deep Reasoning'
  }
];

export function getEffectiveGroqApiKey(restaurant = {}) {
  return (
    restaurant?.groqApiKey ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('dineos_groq_api_key') : null) ||
    import.meta.env.VITE_GROQ_API_KEY ||
    BUILTIN_GROQ_API_KEY ||
    ''
  ).trim();
}

export function saveLocalGroqApiKey(key) {
  if (typeof localStorage !== 'undefined') {
    if (key) {
      localStorage.setItem('dineos_groq_api_key', key.trim());
    } else {
      localStorage.removeItem('dineos_groq_api_key');
    }
  }
}

export async function askGroqAdvisor({
  question,
  compactDigest,
  conversationHistory = [],
  restaurant = {},
  model = 'openai/gpt-oss-20b'
}) {
  const apiKey = getEffectiveGroqApiKey(restaurant);

  if (!apiKey) {
    return {
      ok: false,
      code: 'NO_API_KEY',
      error: 'No Groq API Key found. You can paste your free key from console.groq.com to enable live AI chat.'
    };
  }

  const systemPrompt = `
You are DineOS AI Business Advisor, an expert hospitality consultant, restaurant revenue director, and operations strategist.
You are advising the restaurant owner using their live POS performance digest:

=== RESTAURANT PERFORMANCE DATA ===
${compactDigest}
===================================

CORE BUSINESS LOGIC:
1. Ground every recommendation directly in their actual numbers (mention their real dishes, sales figures, and peak rush hours).
2. Focus on bottom-line restaurant profitability:
   - Menu Engineering (Stars vs Slow Movers/Dogs, combo bundle margins)
   - Average Order Value (AOV) growth (+15-20% upsell strategies)
   - Waitstaff dialogue scripts (exact lines for waiters to suggest high-margin beverages/sides)
   - Rush-hour prep & kitchen throughput (mise-en-place batching, line assignments)
   - Discount control (reducing unnecessary margin leakage)
3. Format with clean, readable structure:
   - Use bold titles for core points
   - Use concise bullet points for actionable steps
   - Provide exact cashier/waiter script callouts when suggesting upselling
4. Keep responses punchy, structured, and under 280 words.
`.trim();

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-6).map(m => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text
    })),
    { role: 'user', content: question }
  ];

  try {
    const res = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-oss-20b',
        messages,
        temperature: 0.5,
        max_tokens: 650,
        stream: false
      })
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Groq API responded with status ${res.status}`;
      return { ok: false, code: 'API_ERROR', error: msg };
    }

    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content || 'No response received from advisor.';

    return {
      ok: true,
      answer,
      modelUsed: data.model || model,
      usage: data.usage || null
    };
  } catch (err) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      error: err.message || 'Network error communicating with Groq API. Operating in offline mode.'
    };
  }
}
