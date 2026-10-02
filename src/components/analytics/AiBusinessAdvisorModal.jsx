// src/components/analytics/AiBusinessAdvisorModal.jsx
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles, Send, Key, Check,
  Lightbulb, TrendingUp, Clock, Flame, Copy, CheckCheck,
  ChevronDown, ChevronUp, PanelLeftClose, PanelLeft, Plus,
  ArrowLeft, UtensilsCrossed, Users, Percent, Zap
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

const STRATEGY_TOPICS = [
  {
    icon: TrendingUp,
    title: "Boost Order Value (AOV)",
    subtitle: "Identify high-margin pairings & upselling tactics",
    prompt: "How can I increase our Average Order Value (AOV) based on our recent sales? Give me 3 concrete strategies."
  },
  {
    icon: Flame,
    title: "Fix Slow Movers",
    subtitle: "Combo bundling ideas for our lowest selling dishes",
    prompt: "Suggest a profitable combo bundle and menu promotion for our slowest moving items to clear inventory."
  },
  {
    icon: Clock,
    title: "Peak Rush Strategy",
    subtitle: "Staffing & kitchen prep checklist for peak hours",
    prompt: "How should we prep, batch, and staff for our peak rush window to eliminate ticket delays?"
  },
  {
    icon: Lightbulb,
    title: "Weekly Growth Tactics",
    subtitle: "3 high-impact promotional ideas for this week",
    prompt: "Give me 3 high-impact, actionable promotional ideas to drive restaurant sales and repeat footfall this week."
  }
];

const SIDEBAR_TOPICS = [
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
  "How can I increase AOV?",
  "Suggest a combo bundle for slow dishes",
  "Waitstaff upselling script",
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
      parts.push(<strong key={key++} style={{ fontWeight: 700, color: 'inherit' }}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code 
          key={key++} 
          style={{ 
            padding: '2px 6px', 
            borderRadius: '4px', 
            backgroundColor: 'var(--color-bg-tertiary, #e2e8f0)', 
            fontSize: '12.5px',
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
        <ul key={`ul-${listKey++}`} style={{ margin: '8px 0 12px 0', paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {currentList.map((item, idx) => (
            <li key={idx} style={{ lineHeight: 1.6 }}>
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
            fontSize: '16px', 
            fontWeight: 700, 
            margin: '18px 0 8px 0', 
            color: 'var(--color-label, #0f172a)'
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
            gap: '10px', 
            margin: '8px 0',
            lineHeight: 1.6 
          }}
        >
          <span 
            style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
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

    // Callout Box (Script, Snapshot, or Pro-Tip)
    if (trimmed.startsWith('📊') || trimmed.startsWith('⚡') || trimmed.startsWith('💡') || trimmed.toLowerCase().includes('script:')) {
      flushList();
      elements.push(
        <div 
          key={`card-${idx}`} 
          className="ai-callout-box"
        >
          {parseInlineMarkdown(trimmed)}
        </div>
      );
      return;
    }

    // Normal paragraph
    flushList();
    elements.push(
      <p key={`p-${idx}`} style={{ margin: '0 0 10px 0', lineHeight: 1.68 }}>
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
  const [selectedModel, setSelectedModel] = useState('openai/gpt-oss-20b');
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showPulse, setShowPulse] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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

  // Synchronize API key when opened
  useEffect(() => {
    if (!isOpen) return;
    const initialKey = getEffectiveGroqApiKey(restaurant);
    setApiKey(initialKey);
    // Focus prompt input
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen]);

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

  const handleStartNewChat = () => {
    setMessages([]);
    setInputQuestion('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSendQuestion = async (customPrompt) => {
    const queryText = (customPrompt || inputQuestion).trim();
    if (!queryText || isAiLoading) return;

    const userMsgId = 'usr-' + Date.now();
    const newMessages = [...messages, { id: userMsgId, sender: 'user', text: queryText, time: new Date() }];
    setMessages(newMessages);
    setInputQuestion('');
    setIsAiLoading(true);

    const activeKey = getEffectiveGroqApiKey(restaurant);

    // Offline / Local Engine fallback if key unavailable
    if (!activeKey) {
      setTimeout(() => {
        let fallbackReply = `### Local Rule-Based Analysis\n\n`;
        const q = queryText.toLowerCase();
        if (q.includes('aov') || q.includes('order value') || q.includes('increase')) {
          fallbackReply += `Your current Average Order Value is **${formatCurrency(metrics.aov, restaurant.currency || 'INR')}**.\n\n• **Upsell High-Margin Add-ons:** Train staff to recommend specialty drinks or appetizers.\n• **Minimum Order Incentives:** Introduce free delivery or complimentary chef side on orders exceeding ${formatCurrency(Math.round(metrics.aov * 1.3), restaurant.currency || 'INR')}.\n• **Item Pairing:** Bundle ${metrics.topSellers[0]?.name || 'popular dishes'} with higher-margin sides.`;
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
  const isChatEmpty = messages.length === 0;

  return (
    <div 
      className="ai-fullscreen-workspace"
      role="dialog"
      aria-modal="true"
    >
      {/* Collapsible Left Sidebar (Claude / ChatGPT style) */}
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
          <span className="ai-sidebar-section-title">Strategic Deep-Dives</span>
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
              <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary, #94a3b8)', fontWeight: 600 }}>
                Health Score
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981' }}>
                {metrics.healthScore}/100
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary, #94a3b8)', fontWeight: 600 }}>
                Avg Order (AOV)
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>
                {formatCurrency(metrics.aov, currency)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-label-tertiary, #94a3b8)', padding: '0 4px' }}>
            <span>{restaurant.name || 'DineOS POS'}</span>
            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
              <h2 className="ai-nav-brand-title">DineOS Advisor</h2>
              
              <div style={{ position: 'relative' }}>
                <button 
                  type="button" 
                  className="ai-model-pill"
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  title="Switch Groq AI Model"
                >
                  <Sparkles size={12} color="#10b981" />
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
                      width: '230px',
                      backgroundColor: 'var(--color-bg-elevated, #ffffff)',
                      border: '1px solid var(--color-separator, #e2e8f0)',
                      borderRadius: '12px',
                      boxShadow: '0 12px 30px rgba(0, 0, 0, 0.15)',
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
          </div>

          <div className="ai-nav-right">
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
              title="Configure Groq Key"
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
          <div 
            style={{
              padding: '12px 24px',
              backgroundColor: 'var(--color-bg-secondary, #f8fafc)',
              borderBottom: '1px solid var(--color-separator, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 320px' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Custom Groq API Key (gsk_...)"
                value={tempKeyInput}
                onChange={e => setTempKeyInput(e.target.value)}
                style={{ height: '36px', fontSize: '13px', flex: 1, borderRadius: '8px' }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveKey}
                style={{ height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Check size={14} />
                <span>Save</span>
              </button>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-label-tertiary, #94a3b8)' }}>
              Built-in key is automatically configured for all DineOS terminals.
            </span>
          </div>
        )}

        {/* Collapsible Business Pulse KPI Strip */}
        {showPulse && (
          <div className="ai-top-pulse-strip">
            <div className="ai-pulse-metric-card">
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-label-tertiary, #94a3b8)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Zap size={12} color="#10b981" /> Health Score
              </span>
              <span style={{ fontSize: '17px', fontWeight: 700, color: metrics.healthScore >= 80 ? '#10b981' : '#f59e0b' }}>
                {metrics.healthScore}/100
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-label-secondary, #64748b)' }}>
                {metrics.healthScore >= 80 ? 'Strong Operational Health' : 'Growth Opportunities Identified'}
              </span>
            </div>

            <div className="ai-pulse-metric-card">
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-label-tertiary, #94a3b8)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <TrendingUp size={12} color="#3b82f6" /> Average Order (AOV)
              </span>
              <span style={{ fontSize: '17px', fontWeight: 700 }}>
                {formatCurrency(metrics.aov, currency)}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-label-secondary, #64748b)' }}>
                Upsell Target: {formatCurrency(Math.round(metrics.aov * 1.2), currency)}
              </span>
            </div>

            <div className="ai-pulse-metric-card">
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-label-tertiary, #94a3b8)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={12} color="#f59e0b" /> Peak Rush Hours
              </span>
              <span style={{ fontSize: '15px', fontWeight: 700 }}>
                {metrics.peakWindow}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-label-secondary, #64748b)' }}>
                Highest order volume window
              </span>
            </div>

            <div className="ai-pulse-metric-card">
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-label-tertiary, #94a3b8)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Flame size={12} color="#ec4899" /> Hero Dish
              </span>
              <span 
                style={{ fontSize: '15px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={metrics.topSellers[0]?.name}
              >
                {metrics.topSellers[0]?.name || 'N/A'}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--color-label-secondary, #64748b)' }}>
                {metrics.topSellers[0]?.qty || 0} sold • {formatCurrency(metrics.topSellers[0]?.revenue || 0, currency)}
              </span>
            </div>
          </div>
        )}

        {/* Reading Canvas (Claude & ChatGPT Style Centered Stream) */}
        <div className="ai-chat-canvas">
          <div className="ai-reading-column">
            {/* Claude-style Welcome Hero Screen if starting fresh */}
            {isChatEmpty && (
              <div className="ai-hero-welcome">
                <div className="ai-hero-icon">
                  <Sparkles size={30} />
                </div>
                <h1 className="ai-hero-title">What would you like to optimize today?</h1>
                <p className="ai-hero-sub">
                  DineOS AI has digested your recent {metrics.orderCount} orders totaling {formatCurrency(metrics.totalSales, currency)}. Select an operational strategy or ask any business question.
                </p>

                <div className="ai-hero-cards-grid">
                  {STRATEGY_TOPICS.map((topic, idx) => {
                    const IconComp = topic.icon;
                    return (
                      <div
                        key={idx}
                        className="ai-strategy-card"
                        onClick={() => handleSendQuestion(topic.prompt)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="ai-strategy-card-icon">
                          <IconComp size={18} />
                        </div>
                        <div>
                          <div className="ai-strategy-card-title">{topic.title}</div>
                          <div className="ai-strategy-card-desc">{topic.subtitle}</div>
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
                  <div key={m.id} className="ai-user-row">
                    <div className="ai-user-bubble">
                      {m.text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className="ai-assistant-row">
                  <div className="ai-assistant-avatar">
                    <Sparkles size={17} />
                  </div>
                  <div className="ai-assistant-body">
                    <div className="ai-assistant-meta">
                      <span>DineOS AI</span>
                      <span>•</span>
                      <span>{m.model || (m.isLocal ? 'Local Analytics Engine' : 'Groq Fast Tier')}</span>
                    </div>

                    <FormattedAiResponse content={m.text} />

                    <div className="ai-assistant-actions">
                      <button
                        type="button"
                        className="ai-copy-btn"
                        onClick={() => handleCopyText(m.id, m.text)}
                      >
                        {copiedMsgId === m.id ? (
                          <>
                            <CheckCheck size={13} color="#10b981" />
                            <span style={{ color: '#10b981' }}>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
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
              <div className="ai-assistant-row">
                <div className="ai-assistant-avatar">
                  <Sparkles size={17} />
                </div>
                <div className="ai-assistant-body">
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 18px',
                    borderRadius: '16px',
                    backgroundColor: 'var(--color-bg-secondary, #f8fafc)',
                    border: '1px solid var(--color-separator, #e2e8f0)',
                    fontSize: '13.5px',
                    color: 'var(--color-label-secondary, #64748b)'
                  }}>
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-dot" />
                    <span className="ai-typing-dot" />
                    <span style={{ marginLeft: '4px' }}>Drafting restaurant growth strategy...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Bottom Floating Prompt Capsule (Claude / ChatGPT style) */}
        <footer className="ai-workspace-input-container">
          <div className="ai-input-center-wrap">
            {/* Quick Follow-up Chips */}
            <div className="ai-quick-chips-row">
              {QUICK_CHIPS.map((chip, idx) => (
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

            {/* Capsule Bar */}
            <div className="ai-floating-capsule">
              <input
                ref={inputRef}
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
              />
              <button
                type="button"
                className="ai-send-circle-btn"
                onClick={() => handleSendQuestion()}
                disabled={!inputQuestion.trim() || isAiLoading}
                title="Send Question (Enter)"
              >
                <Send size={16} />
              </button>
            </div>

            <p className="ai-foot-disclaimer">
              DineOS AI Advisor is powered by Groq. Verify financial calculations before executing operational changes.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
