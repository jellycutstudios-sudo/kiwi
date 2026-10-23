// Client-Side Zero-Cloud Chat History Persistence
// Strict retention rules: auto-purge > 180 days (6 months) & cap to latest 50 messages (<40 KB)
export const AI_CHAT_STORAGE_KEY = 'dineos_ai_chat_history';
export const MAX_SAVED_MESSAGES = 50;
export const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export function loadStoredAiChat() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AI_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const now = Date.now();
    // Auto-clean: drop messages older than 6 months (180 days)
    const fresh = parsed.filter(m => {
      const msgTime = m.time ? new Date(m.time).getTime() : now;
      return (now - msgTime) < SIX_MONTHS_MS;
    });

    // Auto-cap: keep maximum latest 50 messages so device memory never exceeds ~40 KB
    const capped = fresh.slice(-MAX_SAVED_MESSAGES);
    if (capped.length !== parsed.length) {
      localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(capped));
    }
    return capped;
  } catch (err) {
    console.warn('[DineOS AI] Failed to load chat history:', err);
    return [];
  }
}

export function saveStoredAiChat(messages) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!messages || messages.length === 0) {
      localStorage.removeItem(AI_CHAT_STORAGE_KEY);
      return;
    }
    const capped = messages.slice(-MAX_SAVED_MESSAGES);
    localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(capped));
  } catch (err) {
    console.warn('[DineOS AI] Failed to save chat history:', err);
  }
}
