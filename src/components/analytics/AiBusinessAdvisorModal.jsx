// src/components/analytics/AiBusinessAdvisorModal.jsx
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles, Send, Key, Check,
  Lightbulb, TrendingUp, Clock, Flame, Copy, CheckCheck,
  ChevronDown, ChevronUp, PanelLeftClose, PanelLeft, Plus,
  ArrowLeft, UtensilsCrossed, Users, Percent, Zap, ShieldCheck,
  ArrowUpRight, ArrowRight, Bot, Trash2
} from 'lucide-react';
import { analyzeBusinessData, generateCompactDigest } from '../../utils/localBusinessAnalyzer';
import {
  askGroqAdvisor,
  getEffectiveGroqApiKey,
  saveLocalGroqApiKey,
  sanitizeGroqModel,
  GROQ_MODELS
} from '../../services/groqService';
import { generatePlanBAdvice } from '../../services/localAdvisorEngine';
import { formatCurrency } from '../../utils/formatCurrency';
import { useMenuStore } from '../../stores/menuStore';
import toast from 'react-hot-toast';
import './AiBusinessAdvisorModal.css';

const ALL_MODELS = [
  ...GROQ_MODELS,
  {
    id: 'plan-b-local',
    name: 'Plan B (Local AI)',
    speed: 'Instant (0ms)',
    badge: '100% Offline • Always Available',
    provider: 'Client-Side Engine'
  }
];

// Client-Side Zero-Cloud Chat History Persistence
// Strict retention rules: auto-purge > 180 days (6 months) & cap to latest 50 messages (<40 KB)
const AI_CHAT_STORAGE_KEY = 'dineos_ai_chat_history';
const MAX_SAVED_MESSAGES = 50;
const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

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

const STRATEGY_TOPICS = [
  {
    id: 'aov',
    icon: TrendingUp,
    color: '#10b981',
    title: "Boost Order Value (AOV)",
    subtitle: "Identify high-margin pairings & upselling tactics",
    getBadge: (m, curr) => `AOV: ${formatCurrency(m.aov, curr)} → Target: ${formatCurrency(Math.round(m.aov * 1.2), curr)}`,
    prompt: "How can I increase our Average Order Value (AOV) based on our recent sales? Give me 3 concrete strategies."
  },
  {
    id: 'slow',
    icon: Flame,
    color: '#f59e0b',
    title: "Fix Slow Movers",
    subtitle: "Combo bundling ideas for our lowest selling dishes",
    getBadge: (m) => `Focus: ${m.slowMovers[0]?.name || 'Bottom item'} (${m.slowMovers[0]?.qty || 0} sold)`,
    prompt: "Suggest a profitable combo bundle and menu promotion for our slowest moving items to clear inventory."
  },
  {
    id: 'rush',
    icon: Clock,
    color: '#38bdf8',
    title: "Peak Rush Strategy",
    subtitle: "Staffing & kitchen prep checklist for peak hours",
    getBadge: (m) => `Peak: ${m.peakWindow}`,
    prompt: "How should we prep, batch, and staff for our peak rush window to eliminate ticket delays?"
  },
  {
    id: 'growth',
    icon: Lightbulb,
    color: '#c084fc',
    title: "Weekly Growth Tactics",
    subtitle: "3 high-impact promotional ideas for this week",
    getBadge: () => "Target: +15% repeat diners",
    prompt: "Give me 3 high-impact, actionable promotional ideas to drive restaurant sales and repeat footfall this week."
  }
];

const SIDEBAR_TOPICS = [
  {
    icon: TrendingUp,
    label: "Sales Pulse & Profit",
    prompt: "How are our sales looking today? Give me an honest, witty executive breakdown of our revenue and health score."
  },
  {
    icon: TrendingUp,
    label: "AOV & Upselling",
    prompt: "Give me a step-by-step upselling plan to raise our restaurant's Average Order Value by 15%."
  },
  {
    icon: UtensilsCrossed,
    label: "Menu Engineering & Combos",
    prompt: "Analyze our bestsellers and slow movers. Which items should we bundle or re-price for better margins?"
  },
  {
    icon: Clock,
    label: "Peak Rush & Kitchen Prep",
    prompt: "How should our kitchen line and runners be organized during our peak rush hours to speed up table turnaround?"
  },
  {
    icon: Users,
    label: "Waitstaff Sales Scripts",
    prompt: "Give me 3 natural, non-pushy dialog scripts our waitstaff can use at tables to upsell beverages and desserts."
  },
  {
    icon: Percent,
    label: "Discount & Margin Audit",
    prompt: "Review our discount burn rate and suggest how to protect margins without hurting customer satisfaction."
  },
  {
    icon: Lightbulb,
    label: "Weekend Promotion Ideas",
    prompt: "Give me 2 creative weekend event or promotion ideas tailored for our restaurant cuisine."
  }
];

const QUICK_CHIPS = [
  "How are our sales looking today?",
  "How can I increase AOV?",
  "Waitstaff upselling script",
  "Suggest a combo bundle for slow dishes",
  "Kitchen rush prep checklist",
  "How to lower discount costs?"
];

// Helper to parse markdown-like bold, code, and italic inline tokens safely into React JSX
function parseInlineMarkdown(text) {
  if (!text) return null;
  const parts = [];
  const regex = /(\*\*.*?\*\*|`.*?`|\*[^*]+?\*)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={key++} className="ai-markdown-bold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={key++} className="ai-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={key++} className="ai-markdown-italic">{token.slice(1, -1)}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

// Extracts [SUGGESTIONS: "q1", "q2"] from response text
function parseSuggestionsFromText(text) {
  if (!text) return { cleanText: '', suggestions: [] };
  const match = text.match(/\[SUGGESTIONS:\s*(.+?)\]\s*$/s);
  if (!match) return { cleanText: text, suggestions: [] };

  const cleanText = text.replace(match[0], '').trim();
  const rawList = match[1];
  const items = rawList.match(/"([^"]+)"|'([^']+)'/g);
  const suggestions = items ? items.map(s => s.replace(/^["']|["']$/g, '').trim()) : [];
  return { cleanText, suggestions };
}

// Full structured renderer for AI message responses (headings, bullet points, numbered lists, cards)
function FormattedAiResponse({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let currentList = null;
  let listKey = 0;

  const flushList = () => {
    if (currentList) {
      elements.push(
        <ul key={`ul-${listKey++}`} className="ai-response-list">
          {currentList.map((item, idx) => (
            <li key={idx} className="ai-response-list-item">
              {parseInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      currentList = null;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    // Heading 3 or 2
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ') || trimmed.startsWith('#### ')) {
      flushList();
      const headingText = trimmed.replace(/^#{2,4}\s+/, '');
      elements.push(
        <h4 key={`h-${idx}`} className="ai-response-heading">
          {parseInlineMarkdown(headingText)}
        </h4>
      );
      return;
    }

    // Bullet item
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.replace(/^[•\-*]\s+/, '');
      if (!currentList) currentList = [];
      currentList.push(itemText);
      return;
    }

    // Numbered item
    if (/^\d+\.\s+/.test(trimmed)) {
      flushList();
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      const num = trimmed.match(/^(\d+)\./)[1];
      elements.push(
        <div key={`num-${idx}`} className="ai-numbered-item">
          <span className="ai-numbered-badge">{num}</span>
          <div className="ai-numbered-content">{parseInlineMarkdown(itemText)}</div>
        </div>
      );
      return;
    }

    // Callout Box (Script, Snapshot, or Pro-Tip)
    if (trimmed.startsWith('📊') || trimmed.startsWith('⚡') || trimmed.startsWith('💡') || trimmed.toLowerCase().includes('script:') || trimmed.startsWith('>')) {
      flushList();
      const cleanText = trimmed.replace(/^>\s*/, '');
      elements.push(
        <div key={`card-${idx}`} className="ai-callout-box">
          {parseInlineMarkdown(cleanText)}
        </div>
      );
      return;
    }

    // Normal paragraph
    flushList();
    elements.push(
      <p key={`p-${idx}`} className="ai-response-paragraph">
        {parseInlineMarkdown(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className="ai-formatted-text">{elements}</div>;
}

export default function AiBusinessAdvisorModal({
  isOpen,
  onClose,
  orders = [],
  menuItems = [],
  restaurant = {},
  periodLabel = 'Last 7 Days'
}) {
  const [apiKey, setApiKey] = useState(() => getEffectiveGroqApiKey(restaurant));
  const [selectedModel, setSelectedModel] = useState(() => {
    const raw = restaurant?.groqModel;
    if (raw === 'plan-b-local') return 'plan-b-local';
    return sanitizeGroqModel(raw);
  });
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' ? window.innerWidth > 900 : true);
  const [tempKeyInput, setTempKeyInput] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  // Ensure menu products are always available even if parent passed empty array
  const effectiveMenuItems = useMemo(() => {
    if (Array.isArray(menuItems) && menuItems.length > 0) return menuItems;
    try {
      const cats = useMenuStore.getState().categories || [];
      const extracted = [];
      cats.forEach(c => {
        if (Array.isArray(c.items)) {
          c.items.forEach(it => {
            extracted.push({ ...it, category: it.category || c.name });
          });
        }
      });
      return extracted;
    } catch {
      return [];
    }
  }, [menuItems]);

  // Local analytics engine
  const metrics = useMemo(() => {
    return analyzeBusinessData(orders, effectiveMenuItems, restaurant);
  }, [orders, effectiveMenuItems, restaurant]);

  const compactDigest = useMemo(() => {
    return generateCompactDigest(metrics, restaurant, periodLabel);
  }, [metrics, restaurant, periodLabel]);

  // Chat conversation state (persisted locally with auto-purge)
  const [messages, setMessages] = useState(() => loadStoredAiChat());
  const [inputQuestion, setInputQuestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Sync chat changes to localStorage with rolling cap (0 Firebase/Vercel usage)
  useEffect(() => {
    saveStoredAiChat(messages);
  }, [messages]);

  // Synchronize API key when opened
  useEffect(() => {
    if (!isOpen) return;
    const initialKey = getEffectiveGroqApiKey(restaurant);
    setApiKey(initialKey);
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen, restaurant]);

  // Keyboard shortcut: Esc to exit fullscreen
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiLoading]);

  if (!isOpen) return null;

  const handleClearChat = () => {
    setMessages([]);
    setInputQuestion('');
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AI_CHAT_STORAGE_KEY);
    }
    toast.success('Chat history cleared');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleStartNewChat = () => {
    handleClearChat();
  };

  const handleSendQuestion = async (customPrompt) => {
    const queryText = (customPrompt || inputQuestion).trim();
    if (!queryText || isAiLoading) return;

    const userMsgId = 'usr-' + Date.now();
    const newMessages = [...messages, { id: userMsgId, sender: 'user', text: queryText, time: new Date() }];
    setMessages(newMessages);
    setInputQuestion('');
    setIsAiLoading(true);

    if (typeof window !== 'undefined' && window.innerWidth <= 900) {
      setSidebarOpen(false);
    }

    // Mode 1: User explicitly chose Plan B (Local AI)
    if (selectedModel === 'plan-b-local') {
      setTimeout(() => {
        const planBText = generatePlanBAdvice({ question: queryText, metrics, restaurant });
        setMessages(prev => [
          ...prev,
          {
            id: 'ai-' + Date.now(),
            sender: 'ai',
            text: planBText,
            time: new Date(),
            isPlanB: true,
            model: 'Plan B: Local Intelligence'
          }
        ]);
        setIsAiLoading(false);
      }, 250);
      return;
    }

    // Mode 2: Call Groq Cloud API with automatic Plan B fallback
    const result = await askGroqAdvisor({
      question: queryText,
      compactDigest,
      conversationHistory: newMessages,
      restaurant,
      model: selectedModel
    });

    if (result.ok) {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: 'ai',
          text: result.answer,
          time: new Date(),
          model: result.modelUsed || 'GPT OSS 20B (Groq)',
          isPlanB: false
        }
      ]);
    } else {
      const planBText = generatePlanBAdvice({ question: queryText, metrics, restaurant });

      setMessages(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sender: 'ai',
          text: planBText,
          time: new Date(),
          isPlanB: true
        }
      ]);
    }

    setIsAiLoading(false);
  };

  const handleCopyText = (id, text) => {
    navigator.clipboard?.writeText(text);
    setCopiedMsgId(id);
    toast.success('Advice copied to clipboard');
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleSaveKey = () => {
    saveLocalGroqApiKey(tempKeyInput);
    setApiKey(tempKeyInput.trim());
    setShowKeyConfig(false);
    toast.success(tempKeyInput ? 'Custom Groq key saved!' : 'Key reset to default');
  };

  const currency = restaurant.currency || 'INR';
  const currentModelObj = ALL_MODELS.find(m => m.id === selectedModel) || ALL_MODELS[0];
  const isChatEmpty = messages.length === 0;

  return (
    <div 
      className="ai-fullscreen-workspace"
      role="dialog"
      aria-modal="true"
    >
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div 
          className="ai-sidebar-backdrop" 
          onClick={() => setSidebarOpen(false)} 
          role="button" 
          tabIndex={-1} 
          aria-label="Close sidebar" 
        />
      )}

      {/* Collapsible Left Sidebar */}
      <aside className={`ai-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="ai-sidebar-header">
          <button 
            type="button" 
            className="ai-new-chat-btn"
            onClick={handleStartNewChat}
            title="Start New Business Conversation"
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="ai-sidebar-scroll">
          <span className="ai-sidebar-section-title">Strategic Playbooks</span>
          {SIDEBAR_TOPICS.map((topic, idx) => {
            const IconCmp = topic.icon;
            return (
              <button
                key={idx}
                type="button"
                className="ai-sidebar-topic-item"
                onClick={() => handleSendQuestion(topic.prompt)}
              >
                <div className="ai-sidebar-topic-icon">
                  <IconCmp size={14} />
                </div>
                <span>{topic.label}</span>
              </button>
            );
          })}
        </div>

        <div className="ai-sidebar-footer">
          <div className="ai-sidebar-mini-pulse">
            <div>
              <div className="ai-mini-pulse-label">Health Score</div>
              <div className="ai-mini-pulse-val" style={{ color: metrics.healthScore >= 80 ? '#10b981' : '#f59e0b' }}>
                {metrics.healthScore}/100
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="ai-mini-pulse-label">Avg Order (AOV)</div>
              <div className="ai-mini-pulse-val" style={{ color: '#ffffff' }}>
                {formatCurrency(metrics.aov, currency)}
              </div>
            </div>
          </div>

          <div className="ai-sidebar-brand-status">
            <span>{restaurant.name || 'DineOS POS'}</span>
            <span className="ai-status-active">
              <Zap size={11} /> Ready
            </span>
          </div>
        </div>
      </aside>

      {/* Main Conversational Workspace */}
      <main className="ai-main-workspace">
        {/* Top Header Navigation */}
        <header className="ai-workspace-nav">
          <div className="ai-nav-left">
            <button
              type="button"
              className="ai-icon-toggle-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
            </button>

            <div className="ai-nav-title-group">
              <div className="ai-brand-badge">
                <Sparkles size={14} className="ai-sparkle-spin" />
                <h2 className="ai-nav-brand-title">DineOS Advisor</h2>
              </div>
              
              <div style={{ position: 'relative' }}>
                <button 
                  type="button" 
                  className={`ai-model-pill ${selectedModel === 'plan-b-local' ? 'plan-b-active' : ''}`}
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  title="Switch AI Model or Plan B"
                >
                  {selectedModel === 'plan-b-local' ? (
                    <ShieldCheck size={13} color="#10b981" />
                  ) : (
                    <Bot size={13} color="#38bdf8" />
                  )}
                  <span className="ai-model-pill-text">{currentModelObj.name}</span>
                  <ChevronDown size={12} />
                </button>

                {showModelPicker && (
                  <div className="ai-model-dropdown-menu">
                    <div className="ai-dropdown-header">Select Intelligence Engine</div>
                    {ALL_MODELS.map(m => {
                      const isSelected = selectedModel === m.id;
                      const isPlanB = m.id === 'plan-b-local';
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`ai-model-option-btn ${isSelected ? 'selected' : ''} ${isPlanB ? 'plan-b-option' : ''}`}
                          onClick={() => {
                            setSelectedModel(m.id);
                            setShowModelPicker(false);
                            toast.success(`Switched to ${m.name}`);
                          }}
                        >
                          <div className="ai-model-option-top">
                            <span className="ai-model-option-name">{m.name}</span>
                            {isSelected && <Check size={14} color="#10b981" />}
                          </div>
                          <div className="ai-model-option-badge">{m.badge}</div>
                          <div className="ai-model-option-speed">{m.speed} • {m.provider}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="ai-nav-right">
            {messages.length > 0 && (
              <button
                type="button"
                className="ai-clear-chat-btn"
                onClick={handleClearChat}
                title="Clear Chat Conversation"
              >
                <Trash2 size={13} />
                <span>Clear Chat</span>
              </button>
            )}

            <button
              type="button"
              className={`ai-pulse-toggle-btn ${showPulse ? 'active' : ''}`}
              onClick={() => setShowPulse(!showPulse)}
              title="Toggle Live Business Pulse KPI Cards"
            >
              <Zap size={13} />
              <span>Business Pulse</span>
              {showPulse ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            <button
              type="button"
              className="ai-icon-toggle-btn"
              onClick={() => {
                setTempKeyInput(apiKey);
                setShowKeyConfig(!showKeyConfig);
              }}
              title="Configure Groq Cloud API Key"
            >
              <Key size={15} />
            </button>

            <button
              type="button"
              className="ai-exit-btn"
              onClick={onClose}
              title="Exit AI Advisor (Esc)"
            >
              <ArrowLeft size={14} />
              <span>Exit</span>
            </button>
          </div>
        </header>

        {/* Custom API Key Drawer */}
        {showKeyConfig && (
          <div className="ai-key-drawer">
            <div className="ai-key-input-row">
              <input
                type="password"
                className="ai-key-input"
                placeholder="Custom Groq API Key (gsk_...)"
                value={tempKeyInput}
                onChange={e => setTempKeyInput(e.target.value)}
              />
              <button
                type="button"
                className="ai-key-save-btn"
                onClick={handleSaveKey}
              >
                <Check size={14} />
                <span>Save Key</span>
              </button>
            </div>
            <div className="ai-key-helper">
              Built-in key is configured. If cloud models expire or rate limit, <strong>Plan B Local Engine</strong> automatically runs without delay.
            </div>
          </div>
        )}

        {/* Collapsible Business Pulse KPI Strip */}
        {showPulse && (
          <div className="ai-top-pulse-strip">
            <div className="ai-pulse-metric-card">
              <span className="ai-pulse-card-label">
                <Zap size={13} color="#10b981" /> Health Score
              </span>
              <span className="ai-pulse-card-val" style={{ color: metrics.healthScore >= 80 ? '#10b981' : '#f59e0b' }}>
                {metrics.healthScore}/100
              </span>
              <span className="ai-pulse-card-sub">
                {metrics.healthScore >= 80 ? 'Strong Operational Health' : 'Growth Opportunities Identified'}
              </span>
            </div>

            <div className="ai-pulse-metric-card">
              <span className="ai-pulse-card-label">
                <TrendingUp size={13} color="#38bdf8" /> Average Order (AOV)
              </span>
              <span className="ai-pulse-card-val">
                {formatCurrency(metrics.aov, currency)}
              </span>
              <span className="ai-pulse-card-sub">
                Target: {formatCurrency(Math.round(metrics.aov * 1.2), currency)} (+20%)
              </span>
            </div>

            <div className="ai-pulse-metric-card">
              <span className="ai-pulse-card-label">
                <Clock size={13} color="#f59e0b" /> Peak Rush Hours
              </span>
              <span className="ai-pulse-card-val">
                {metrics.peakWindow}
              </span>
              <span className="ai-pulse-card-sub">
                Highest order volume window
              </span>
            </div>

            <div className="ai-pulse-metric-card">
              <span className="ai-pulse-card-label">
                <Flame size={13} color="#ec4899" /> Hero Dish
              </span>
              <span className="ai-pulse-card-val" title={metrics.topSellers[0]?.name}>
                {metrics.topSellers[0]?.name || 'N/A'}
              </span>
              <span className="ai-pulse-card-sub">
                {metrics.topSellers[0]?.qty || 0} sold • {formatCurrency(metrics.topSellers[0]?.revenue || 0, currency)}
              </span>
            </div>
          </div>
        )}

        {/* Reading Canvas */}
        <div className="ai-chat-canvas">
          <div className="ai-reading-column">
            {/* High-Impact Hero Screen if chat is empty */}
            {isChatEmpty && (
              <div className="ai-hero-welcome">
                <div className="ai-hero-icon-wrap">
                  <div className="ai-hero-icon">
                    <Sparkles size={28} />
                  </div>
                  <div className="ai-hero-icon-glow" />
                </div>

                <h1 className="ai-hero-title">What would you like to optimize today?</h1>

                {/* Telemetry pill showing real restaurant data */}
                <div className="ai-hero-telemetry-capsule">
                  <span className="ai-live-indicator-dot" />
                  <span>Telemetry active: <strong>{metrics.orderCount} orders</strong> ({formatCurrency(metrics.totalSales, currency)})</span>
                  <span className="ai-telemetry-sep">•</span>
                  <span>Peak: <strong>{metrics.peakWindow}</strong></span>
                  <span className="ai-telemetry-sep">•</span>
                  <span>Health: <strong style={{ color: metrics.healthScore >= 80 ? '#10b981' : '#f59e0b' }}>{metrics.healthScore}/100</strong></span>
                </div>

                <div className="ai-hero-cards-grid">
                  {STRATEGY_TOPICS.map((topic) => {
                    const IconComp = topic.icon;
                    return (
                      <div
                        key={topic.id}
                        className="ai-strategy-card"
                        onClick={() => handleSendQuestion(topic.prompt)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="ai-strategy-card-top">
                          <div 
                            className="ai-strategy-card-icon"
                            style={{ color: topic.color, borderColor: `${topic.color}33`, background: `${topic.color}15` }}
                          >
                            <IconComp size={18} />
                          </div>
                          <ArrowUpRight size={16} className="ai-strategy-card-arrow" />
                        </div>

                        <div className="ai-strategy-card-content">
                          <div className="ai-strategy-card-title">{topic.title}</div>
                          <div className="ai-strategy-card-desc">{topic.subtitle}</div>
                        </div>

                        <div className="ai-strategy-metric-badge">
                          {topic.getBadge(metrics, currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((m, mIdx) => {
              const isUser = m.sender === 'user';
              if (isUser) {
                return (
                  <div key={m.id} className="ai-user-row">
                    <div className="ai-user-bubble">
                      {m.text}
                    </div>
                  </div>
                );
              }

              const isLatestAi = mIdx === messages.length - 1;
              const { cleanText, suggestions } = parseSuggestionsFromText(m.text);

              return (
                <div key={m.id} className="ai-assistant-row">
                  <div className="ai-assistant-avatar">
                    <Sparkles size={17} />
                  </div>
                  <div className="ai-assistant-body">
                    <div className="ai-assistant-meta">
                      <span className="ai-assistant-name">DineOS AI</span>
                    </div>

                    <FormattedAiResponse content={cleanText} />

                    {/* Interactive Follow-Up Chips */}
                    {suggestions.length > 0 && isLatestAi && (
                      <div className="ai-suggestions-chips">
                        {suggestions.map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            className="ai-suggestion-chip-btn"
                            onClick={() => handleSendQuestion(sug)}
                            disabled={isAiLoading}
                          >
                            <span>{sug}</span>
                            <ArrowRight size={12} className="ai-chip-arrow" />
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="ai-assistant-actions">
                      <button
                        type="button"
                        className="ai-copy-btn"
                        onClick={() => handleCopyText(m.id, cleanText)}
                      >
                        {copiedMsgId === m.id ? (
                          <>
                            <CheckCheck size={13} color="#10b981" />
                            <span style={{ color: '#10b981' }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI Typing / Generating Indicator */}
            {isAiLoading && (
              <div className="ai-assistant-row">
                <div className="ai-assistant-avatar">
                  <Sparkles size={18} />
                </div>
                <div className="ai-assistant-body">
                  <div className="ai-typing-container">
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-label">Analyzing restaurant telemetry & calculating optimal strategy...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Bottom Floating Prompt Capsule */}
        <footer className="ai-workspace-input-container">
          <div className="ai-input-center-wrap">
            {/* Quick Follow-up Chips with vibrant styling */}
            <div className="ai-quick-chips-row">
              {QUICK_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="ai-chip-pill"
                  onClick={() => handleSendQuestion(chip)}
                  disabled={isAiLoading}
                >
                  <Lightbulb size={12} className="ai-chip-icon" />
                  <span>{chip}</span>
                </button>
              ))}
            </div>

            {/* Floating Capsule Bar */}
            <div className="ai-floating-capsule">
              <Sparkles size={16} className="ai-input-sparkle-icon" />
              <input
                ref={inputRef}
                type="text"
                className="ai-prompt-input"
                placeholder="Ask anything about sales, dishes, staffing, or margin improvements..."
                value={inputQuestion}
                onChange={e => setInputQuestion(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendQuestion();
                  }
                }}
                disabled={isAiLoading}
                autoComplete="off"
                spellCheck="false"
              />
              <button
                type="button"
                className={`ai-send-circle-btn ${inputQuestion.trim() ? 'active' : ''}`}
                onClick={() => handleSendQuestion()}
                disabled={!inputQuestion.trim() || isAiLoading}
                title="Send Question (Enter)"
                aria-label="Send query"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
