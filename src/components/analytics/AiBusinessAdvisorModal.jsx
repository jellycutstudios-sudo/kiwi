// src/components/analytics/AiBusinessAdvisorModal.jsx
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles, X, Send, User, Key, Check,
  Lightbulb, RefreshCw, Zap, TrendingUp,
  Clock, Flame, Copy, CheckCheck,
  ChevronDown, ChevronUp, Layers, HelpCircle
} from 'lucide-react';
import { analyzeBusinessData, generateCompactDigest } from '../../utils/localBusinessAnalyzer';
import {
  askGroqAdvisor,
  getEffectiveGroqApiKey,
  saveLocalGroqApiKey,
  GROQ_MODELS
} from '../../services/groqService';
import { formatCurrency } from '../../utils/formatCurrency';
import toast from 'react-hot-toast';
import './AiBusinessAdvisorModal.css';

const QUICK_TOPICS = [
  {
    icon: TrendingUp,
    title: "Boost Order Value (AOV)",
    subtitle: "Identify high-margin pairings & upselling tactics",
    prompt: "How can I increase our Average Order Value (AOV) based on our recent sales?"
  },
  {
    icon: Flame,
    title: "Fix Slow Movers",
    subtitle: "Combo bundling ideas for our lowest selling dishes",
    prompt: "Suggest a combo bundle and promotional plan for our slowest moving items."
  },
  {
    icon: Clock,
    title: "Peak Rush Strategy",
    subtitle: "Staffing & kitchen prep checklist for peak hours",
    prompt: "How should we prep and staff for our peak rush window to eliminate bottlenecks?"
  },
  {
    icon: Lightbulb,
    title: "Weekly Growth Tactics",
    subtitle: "3 high-impact promotional ideas for this week",
    prompt: "Give me 3 high-impact, actionable promotional ideas to drive restaurant sales this week."
  }
];

const FOLLOW_UP_CHIPS = [
  "How can I increase AOV?",
  "Suggest a combo bundle for slow dishes",
  "How to prep for peak rush hours?",
  "3 marketing ideas for this weekend",
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
      parts.push(<strong key={key++} style={{ fontWeight: 700, color: 'inherit' }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code 
          key={key++} 
          style={{ 
            padding: '2px 6px', 
            borderRadius: '4px', 
            backgroundColor: 'var(--color-bg-tertiary, #e2e8f0)', 
            fontSize: '12px',
            fontFamily: 'monospace'
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : text;
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
        <ul key={`ul-${listKey++}`} style={{ margin: '6px 0 10px 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {currentList.map((item, idx) => (
            <li key={idx} style={{ lineHeight: 1.55 }}>
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
    if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
      flushList();
      const headingText = trimmed.replace(/^#{2,3}\s+/, '');
      elements.push(
        <h4 
          key={`h-${idx}`} 
          style={{ 
            fontSize: '15px', 
            fontWeight: 700, 
            margin: '14px 0 6px 0', 
            color: 'var(--color-label, #0f172a)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
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
      elements.push(
        <div 
          key={`num-${idx}`} 
          style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: '8px', 
            margin: '6px 0',
            lineHeight: 1.55 
          }}
        >
          <span 
            style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent, #10b981)',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 700,
              flexShrink: 0,
              marginTop: '2px'
            }}
          >
            {trimmed.match(/^(\d+)\./)[1]}
          </span>
          <div style={{ flex: 1 }}>{parseInlineMarkdown(itemText)}</div>
        </div>
      );
      return;
    }

    // Highlight / Snapshot Card (e.g. 📊 Snapshot or ⚡ Tip)
    if (trimmed.startsWith('📊') || trimmed.startsWith('⚡') || trimmed.startsWith('💡')) {
      flushList();
      elements.push(
        <div 
          key={`card-${idx}`} 
          className="ai-highlight-card"
          style={{
            backgroundColor: 'var(--color-bg-secondary, #f8fafc)',
            borderLeft: '3px solid var(--color-accent, #10b981)',
            padding: '10px 14px',
            borderRadius: '0 10px 10px 0',
            margin: '8px 0',
            fontSize: '13.5px'
          }}
        >
          {parseInlineMarkdown(trimmed)}
        </div>
      );
      return;
    }

    // Normal paragraph
    flushList();
    elements.push(
      <p key={`p-${idx}`} style={{ margin: '0 0 8px 0', lineHeight: 1.6 }}>
        {parseInlineMarkdown(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className="ai-msg-bot-body">{elements}</div>;
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
  const [selectedModel, setSelectedModel] = useState('openai/gpt-oss-20b');
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showPulse, setShowPulse] = useState(true);
  const [tempKeyInput, setTempKeyInput] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState(null);

  // Local analytics engine
  const metrics = useMemo(() => {
    return analyzeBusinessData(orders, menuItems, restaurant);
  }, [orders, menuItems, restaurant]);

  const compactDigest = useMemo(() => {
    return generateCompactDigest(metrics, restaurant, periodLabel);
  }, [metrics, restaurant, periodLabel]);

  // Chat conversation state
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize or reset chat
  const initGreeting = () => {
    const greetingText = `Hello! I'm your **DineOS AI Advisor**. I've analyzed your **${periodLabel}** performance across **${metrics.orderCount} orders** (${formatCurrency(metrics.totalSales, restaurant.currency || 'INR')} revenue).

📊 **Quick Performance Snapshot:**
• **Health Score:** ${metrics.healthScore}/100
• **Average Order Value (AOV):** ${formatCurrency(metrics.aov, restaurant.currency || 'INR')}
• **Peak Rush Window:** ${metrics.peakWindow}
• **Top Hero Dish:** ${metrics.topSellers[0]?.name || 'N/A'} (${metrics.topSellers[0]?.qty || 0} sold)
• **Slowest Mover:** ${metrics.slowMovers[0]?.name || 'N/A'} (${metrics.slowMovers[0]?.qty || 0} sold)

Ask me anything about menu pricing, rush-hour staffing, or promotion strategies!`;

    setMessages([
      { id: 'msg-init', sender: 'ai', text: greetingText, time: new Date() }
    ]);
  };

  useEffect(() => {
    if (!isOpen) return;
    const initialKey = getEffectiveGroqApiKey(restaurant);
    setApiKey(initialKey);
    initGreeting();
  }, [isOpen, compactDigest]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiLoading]);

  if (!isOpen) return null;

  const handleSendQuestion = async (customPrompt) => {
    const queryText = (customPrompt || inputQuestion).trim();
    if (!queryText || isAiLoading) return;

    const userMsgId = 'usr-' + Date.now();
    const newMessages = [...messages, { id: userMsgId, sender: 'user', text: queryText, time: new Date() }];
    setMessages(newMessages);
    setInputQuestion('');
    setIsAiLoading(true);

    const activeKey = getEffectiveGroqApiKey(restaurant);

    // Offline / Local engine fallback if key unavailable
    if (!activeKey) {
      setTimeout(() => {
        let fallbackReply = `### Local Rule-Based Analysis\n\n`;
        const q = queryText.toLowerCase();
        if (q.includes('aov') || q.includes('order value') || q.includes('increase')) {
          fallbackReply += `Your current Average Order Value is **${formatCurrency(metrics.aov, restaurant.currency || 'INR')}**.\n\n• **Upsell High-Margin Add-ons:** Train staff to recommend specialty drinks or appetizers.\n• **Minimum Order Incentives:** Introduce free delivery or chef complimentary side on orders exceeding ${formatCurrency(Math.round(metrics.aov * 1.3), restaurant.currency || 'INR')}.\n• **Item Pairing:** Bundle ${metrics.topSellers[0]?.name || 'popular dishes'} with higher-margin sides.`;
        } else if (q.includes('combo') || q.includes('slow')) {
          fallbackReply += `Your slowest moving item is **${metrics.slowMovers[0]?.name || 'N/A'}** (${metrics.slowMovers[0]?.qty || 0} sold).\n\n• **Power Pairing:** Create a 2-person combo bundling **${metrics.topSellers[0]?.name || 'Hero Dish'}** + **${metrics.slowMovers[0]?.name || 'Slow Item'}** with a 10% promotional bundle discount.\n• **Menu Highlight:** Add a "Chef Recommendation" badge on digital and printed menus.`;
        } else if (q.includes('rush') || q.includes('staff') || q.includes('peak')) {
          fallbackReply += `Your peak order concentration window is **${metrics.peakWindow}**.\n\n• **Pre-Prep Stations:** 45 minutes prior to ${metrics.peakWindow.split('–')[0]?.trim() || 'rush'}, ensure all sauces and garnishes for top 5 dishes are pre-portioned.\n• **Line Scheduling:** Station your fastest cook on the sauté/grill station and assign a dedicated food runner.`;
        } else {
          fallbackReply += `Here are the key operational insights for your question:\n\n• **Total Orders:** ${metrics.orderCount}\n• **Gross Revenue:** ${formatCurrency(metrics.totalSales, restaurant.currency || 'INR')}\n• **Peak Rush:** ${metrics.peakWindow}\n• **Hero Dish:** ${metrics.topSellers[0]?.name || 'N/A'} (${metrics.topSellers[0]?.qty || 0} sold)\n\n*Configure a free Groq Cloud API key above to unlock full natural language intelligence.*`;
        }

        setMessages(prev => [
          ...prev,
          { id: 'ai-' + Date.now(), sender: 'ai', text: fallbackReply, time: new Date(), isLocal: true }
        ]);
        setIsAiLoading(false);
      }, 400);
      return;
    }

    // Call Groq API
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
        { id: 'ai-' + Date.now(), sender: 'ai', text: result.answer, time: new Date(), model: result.modelUsed }
      ]);
    } else {
      setMessages(prev => [
        ...prev,
        { 
          id: 'ai-' + Date.now(), 
          sender: 'ai', 
          text: `⚠️ **AI Notice:** ${result.error}\n\nOperating in local mode. Verify your Groq API key in the top settings.`, 
          time: new Date(), 
          isError: true 
        }
      ]);
      toast.error('AI query notice: ' + (result.error || 'Please check key'));
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
  const currentModelObj = GROQ_MODELS.find(m => m.id === selectedModel) || GROQ_MODELS[0];
  const isFreshConversation = messages.length <= 1;

  return (
    <div 
      className="ai-advisor-overlay"
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="ai-advisor-window">
        {/* Sleek Minimalist Header */}
        <header className="ai-advisor-header">
          <div className="ai-advisor-brand">
            <div className="ai-avatar-badge">
              <Sparkles size={19} />
            </div>
            <div className="ai-title-wrap">
              <div className="ai-title-row">
                <h3 className="ai-title">DineOS Advisor</h3>
                <div style={{ position: 'relative' }}>
                  <button 
                    type="button" 
                    className="ai-model-selector-btn"
                    onClick={() => setShowModelPicker(!showModelPicker)}
                    title="Change AI Model"
                  >
                    <span>{currentModelObj.name.split(' ')[0]}</span>
                    <ChevronDown size={11} />
                  </button>

                  {showModelPicker && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: '6px',
                        width: '220px',
                        backgroundColor: 'var(--color-bg-elevated, #ffffff)',
                        border: '1px solid var(--color-separator, #e2e8f0)',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                        padding: '6px',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      {GROQ_MODELS.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setShowModelPicker(false);
                          }}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: 'none',
                            background: selectedModel === m.id ? 'var(--color-bg-secondary, #f1f5f9)' : 'transparent',
                            color: selectedModel === m.id ? 'var(--color-accent, #10b981)' : 'var(--color-label, #0f172a)',
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{m.name}</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary, #94a3b8)' }}>{m.badge}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <span style={{ fontSize: '11.5px', color: 'var(--color-label-secondary, #64748b)' }}>
                {periodLabel} • {metrics.orderCount} orders analyzed
              </span>
            </div>
          </div>

          <div className="ai-header-actions">
            <button
              type="button"
              className={`ai-pill-btn ${showPulse ? 'active' : ''}`}
              onClick={() => setShowPulse(!showPulse)}
              title="Toggle Live Business Pulse KPI drawer"
            >
              <Zap size={13} />
              <span>Pulse ({metrics.healthScore}/100)</span>
              {showPulse ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            <button
              type="button"
              className="ai-icon-btn"
              onClick={() => {
                setTempKeyInput(apiKey);
                setShowKeyConfig(!showKeyConfig);
              }}
              title="Configure Custom Groq API Key"
            >
              <Key size={15} />
            </button>

            <button
              type="button"
              className="ai-icon-btn"
              onClick={initGreeting}
              title="Reset Conversation"
            >
              <RefreshCw size={14} />
            </button>

            <button
              type="button"
              className="ai-icon-btn"
              onClick={onClose}
              title="Close Advisor"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Custom API Key Drawer */}
        {showKeyConfig && (
          <div 
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--color-bg-secondary, #f8fafc)',
              borderBottom: '1px solid var(--color-separator, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 300px' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Custom Groq API Key (gsk_...)"
                value={tempKeyInput}
                onChange={e => setTempKeyInput(e.target.value)}
                style={{ height: '34px', fontSize: '12.5px', flex: 1, borderRadius: '8px' }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveKey}
                style={{ height: '34px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Check size={14} />
                <span>Save</span>
              </button>
            </div>
            <span style={{ fontSize: '11.5px', color: 'var(--color-label-tertiary, #94a3b8)' }}>
              Built-in key is active. Custom keys override locally.
            </span>
          </div>
        )}

        {/* Collapsible Business Pulse Bar */}
        {showPulse && (
          <div className="ai-pulse-panel">
            <div className="ai-pulse-card">
              <span className="ai-pulse-label">
                <Zap size={12} color="#10b981" /> Health Score
              </span>
              <span className="ai-pulse-val" style={{ color: metrics.healthScore >= 80 ? '#10b981' : '#f59e0b' }}>
                {metrics.healthScore}/100
              </span>
              <span className="ai-pulse-sub">
                {metrics.healthScore >= 80 ? 'Strong Performance' : 'Growth Potential'}
              </span>
            </div>

            <div className="ai-pulse-card">
              <span className="ai-pulse-label">
                <TrendingUp size={12} color="#3b82f6" /> Avg Order Value
              </span>
              <span className="ai-pulse-val">
                {formatCurrency(metrics.aov, currency)}
              </span>
              <span className="ai-pulse-sub">
                Target: {formatCurrency(Math.round(metrics.aov * 1.2), currency)}
              </span>
            </div>

            <div className="ai-pulse-card">
              <span className="ai-pulse-label">
                <Clock size={12} color="#f59e0b" /> Peak Rush Hours
              </span>
              <span className="ai-pulse-val" style={{ fontSize: '14px' }}>
                {metrics.peakWindow}
              </span>
              <span className="ai-pulse-sub">
                Highest order volume
              </span>
            </div>

            <div className="ai-pulse-card">
              <span className="ai-pulse-label">
                <Flame size={12} color="#ec4899" /> Hero Dish
              </span>
              <span 
                className="ai-pulse-val" 
                style={{ fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={metrics.topSellers[0]?.name}
              >
                {metrics.topSellers[0]?.name || 'N/A'}
              </span>
              <span className="ai-pulse-sub">
                {metrics.topSellers[0]?.qty || 0} sold • {formatCurrency(metrics.topSellers[0]?.revenue || 0, currency)}
              </span>
            </div>
          </div>
        )}

        {/* Conversational Canvas */}
        <div className="ai-chat-scroll">
          <div className="ai-chat-thread">
            {/* ChatGPT-style Welcome Hero Screen if starting fresh */}
            {isFreshConversation && (
              <div className="ai-welcome-box">
                <div className="ai-welcome-avatar">
                  <Sparkles size={28} />
                </div>
                <h2 className="ai-welcome-heading">How can I help you grow today?</h2>
                <p className="ai-welcome-desc">
                  I&apos;ve digested your store&apos;s recent {metrics.orderCount} orders and menu dynamics. Pick a strategy topic below or ask your own business question.
                </p>

                <div className="ai-welcome-grid">
                  {QUICK_TOPICS.map((topic, idx) => {
                    const IconComp = topic.icon;
                    return (
                      <div
                        key={idx}
                        className="ai-quick-card"
                        onClick={() => handleSendQuestion(topic.prompt)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="ai-quick-card-icon">
                          <IconComp size={16} />
                        </div>
                        <div>
                          <div className="ai-quick-card-title">{topic.title}</div>
                          <div className="ai-quick-card-sub">{topic.subtitle}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              if (isUser) {
                return (
                  <div key={m.id} className="ai-msg-user-row">
                    <div className="ai-msg-user-bubble">
                      {m.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className="ai-msg-bot-row">
                  <div className="ai-msg-bot-avatar">
                    <Sparkles size={16} />
                  </div>
                  <div className="ai-msg-bot-content">
                    <div className="ai-msg-bot-meta">
                      <span>DineOS AI</span>
                      <span>•</span>
                      <span>{m.model || (m.isLocal ? 'Local Analytics Engine' : 'Groq Fast Tier')}</span>
                    </div>

                    <FormattedAiResponse content={m.text} />

                    <div className="ai-msg-actions">
                      <button
                        type="button"
                        className="ai-msg-copy-btn"
                        onClick={() => handleCopyText(m.id, m.text)}
                      >
                        {copiedMsgId === m.id ? (
                          <>
                            <CheckCheck size={12} color="#10b981" />
                            <span style={{ color: '#10b981' }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy advice</span>
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
              <div className="ai-msg-bot-row">
                <div className="ai-msg-bot-avatar">
                  <Sparkles size={16} />
                </div>
                <div className="ai-msg-bot-content">
                  <div className="ai-typing-indicator">
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-dot" />
                    <span style={{ marginLeft: '4px' }}>Drafting restaurant recommendations...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Footer: Follow-up chips + ChatGPT-style capsule input */}
        <footer className="ai-advisor-footer">
          {/* Quick Prompt Chips */}
          <div className="ai-chips-scroll">
            {FOLLOW_UP_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className="ai-chip-pill"
                onClick={() => handleSendQuestion(chip)}
                disabled={isAiLoading}
              >
                <Lightbulb size={11} color="#f59e0b" />
                <span>{chip}</span>
              </button>
            ))}
          </div>

          {/* Capsule Input */}
          <div className="ai-capsule-box">
            <input
              ref={inputRef}
              className="ai-capsule-input"
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
            />
            <button
              type="button"
              className="ai-send-btn"
              onClick={() => handleSendQuestion()}
              disabled={!inputQuestion.trim() || isAiLoading}
              title="Send question"
            >
              <Send size={15} />
            </button>
          </div>

          <p className="ai-disclaimer">
            DineOS AI Advisor is powered by Groq. Verify operational changes before execution.
          </p>
        </footer>
      </div>
    </div>
  );
}
