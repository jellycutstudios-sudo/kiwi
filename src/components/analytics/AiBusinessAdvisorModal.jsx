// src/components/analytics/AiBusinessAdvisorModal.jsx
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Sparkles, X, Send, Bot, User, Key, Check,
  Lightbulb, RefreshCw, Zap, ExternalLink, HelpCircle
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

const QUICK_PROMPTS = [
  "How can I increase our Average Order Value (AOV)?",
  "Suggest a combo bundle for our slowest selling dishes",
  "How should we staff and prep for our peak rush window?",
  "Give me 3 high-impact promotional ideas for this week"
];

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
  const [tempKeyInput, setTempKeyInput] = useState('');

  // Local analytics
  const metrics = useMemo(() => {
    return analyzeBusinessData(orders, menuItems, restaurant);
  }, [orders, menuItems, restaurant]);

  const compactDigest = useMemo(() => {
    return generateCompactDigest(metrics, restaurant, periodLabel);
  }, [metrics, restaurant, periodLabel]);

  // Chat conversation
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const chatEndRef = useRef(null);

  // Initialize messages with welcome executive summary
  useEffect(() => {
    if (!isOpen) return;
    const initialKey = getEffectiveGroqApiKey(restaurant);
    setApiKey(initialKey);

    // Initial greeting based on local metrics
    const greetingText = `Hello! I'm your **DineOS AI Business Advisor**. I've analyzed your **${periodLabel}** performance across **${metrics.orderCount} orders** (${formatCurrency(metrics.totalSales, restaurant.currency || 'INR')} revenue).

📊 **Quick Executive Snapshot:**
• **Health Score:** ${metrics.healthScore}/100
• **Average Order Value (AOV):** ${formatCurrency(metrics.aov, restaurant.currency || 'INR')}
• **Peak Rush Window:** ${metrics.peakWindow}
• **Top Hero Dish:** ${metrics.topSellers[0]?.name || 'N/A'} (${metrics.topSellers[0]?.qty || 0} sold)
• **Slowest Mover:** ${metrics.slowMovers[0]?.name || 'N/A'} (${metrics.slowMovers[0]?.qty || 0} sold)

Ask me anything about improving profit margins, menu engineering, or marketing tactics!`;

    setMessages([
      { id: 'msg-0', sender: 'ai', text: greetingText, time: new Date() }
    ]);
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

    // If no Groq Key, fallback to local rule-based engine response
    if (!activeKey) {
      setTimeout(() => {
        let fallbackReply = `**[Local Rule-Based Analysis]**\n\n`;
        if (queryText.toLowerCase().includes('aov') || queryText.toLowerCase().includes('order value')) {
          fallbackReply += `Your current AOV is **${formatCurrency(metrics.aov, restaurant.currency || 'INR')}**.\n• Recommend staff upsell beverages or sides.\n• Introduce minimum order thresholds for delivery/combos.\n• Bundle dessert or mocktails with ${metrics.topSellers[0]?.name || 'mains'}.`;
        } else if (queryText.toLowerCase().includes('combo') || queryText.toLowerCase().includes('slow')) {
          fallbackReply += `Your slowest moving dish is **${metrics.slowMovers[0]?.name || 'N/A'}** (${metrics.slowMovers[0]?.qty || 0} sold).\n• Pair it with top seller **${metrics.topSellers[0]?.name || 'N/A'}** in a 2-item combo at a 10% promotional bundle discount.\n• Feature it at the top of the menu with a chef recommendation tag.`;
        } else if (queryText.toLowerCase().includes('rush') || queryText.toLowerCase().includes('staff') || queryText.toLowerCase().includes('peak')) {
          fallbackReply += `Your busiest volume window is **${metrics.peakWindow}**.\n• Schedule senior prep cooks and 2 runners 30 minutes before this window.\n• Pre-batch sauces and popular sides for **${metrics.topSellers[0]?.name || 'top items'}**.`;
        } else {
          fallbackReply += `Here are the key metrics for your query:\n• Total Orders: ${metrics.orderCount}\n• Gross Sales: ${formatCurrency(metrics.totalSales, restaurant.currency || 'INR')}\n• Peak Window: ${metrics.peakWindow}\n\n*To enable deep generative reasoning with natural language, add your free Groq API key above.*`;
        }

        setMessages(prev => [
          ...prev,
          { id: 'ai-' + Date.now(), sender: 'ai', text: fallbackReply, time: new Date(), isLocal: true }
        ]);
        setIsAiLoading(false);
      }, 450);
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
          text: `⚠️ **AI Service Notice:** ${result.error}\n\nFalling back to local metrics. You can verify your key in settings above.`, 
          time: new Date(), 
          isError: true 
        }
      ]);
      toast.error('AI response error: ' + (result.error || 'Please check API key'));
    }

    setIsAiLoading(false);
  };

  const handleSaveKey = () => {
    saveLocalGroqApiKey(tempKeyInput);
    setApiKey(tempKeyInput.trim());
    setShowKeyConfig(false);
    toast.success(tempKeyInput ? 'Groq API Key saved!' : 'Local key cleared');
  };

  const currency = restaurant.currency || 'INR';

  return (
    <div 
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="ai-advisor-container"
        style={{
          width: '100%',
          maxWidth: '920px',
          height: '90vh',
          maxHeight: '840px',
          backgroundColor: 'var(--color-bg, #0f121d)',
          borderRadius: '20px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--color-label, #f8fafc)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, rgba(217, 70, 239, 0.08) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
            }}>
              <Sparkles size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                  DineOS AI Business Advisor
                </h2>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: apiKey ? 'rgba(34, 197, 94, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                  color: apiKey ? '#4ade80' : '#fbbf24',
                  border: `1px solid ${apiKey ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {apiKey ? <Zap size={11} /> : <HelpCircle size={11} />}
                  {apiKey ? '⚡ AI Advisor Active (Groq Cloud)' : 'Local Engine Mode'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary, #94a3b8)' }}>
                Hybrid Intelligence Engine • Pre-calculated local metrics &amp; zero credit waste
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setTempKeyInput(apiKey);
                setShowKeyConfig(!showKeyConfig);
              }}
              title="Configure Custom Groq API Key & Model"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', height: '32px' }}
            >
              <Key size={14} />
              <span>Custom API Key</span>
            </button>
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              onClick={onClose}
              style={{ width: '32px', height: '32px', padding: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* API Key Drawer (Expandable) */}
        {showKeyConfig && (
          <div style={{
            padding: '14px 20px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            alignItems: 'center'
          }}>
            <div style={{ flex: '1 1 280px', display: 'flex', gap: '8px' }}>
              <input
                type="password"
                className="form-input"
                placeholder="Paste free Groq API key (gsk_...)"
                value={tempKeyInput}
                onChange={e => setTempKeyInput(e.target.value)}
                style={{ fontSize: '13px', height: '34px', flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSaveKey}
                style={{ height: '34px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <Check size={14} />
                Save
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <select
                className="form-input"
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                style={{ height: '34px', fontSize: '12px', padding: '0 8px' }}
              >
                {GROQ_MODELS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.badge})
                  </option>
                ))}
              </select>

              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: '12px',
                  color: '#818cf8',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                Get free key <ExternalLink size={12} />
              </a>
            </div>
          </div>
        )}

        {/* Local KPI Strip */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-label-secondary, #94a3b8)', display: 'block' }}>Health Score</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: metrics.healthScore >= 75 ? '#4ade80' : '#fbbf24' }}>
              {metrics.healthScore}/100
            </span>
          </div>

          <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-label-secondary, #94a3b8)', display: 'block' }}>Average Order (AOV)</span>
            <span style={{ fontSize: '16px', fontWeight: 800 }}>
              {formatCurrency(metrics.aov, currency)}
            </span>
          </div>

          <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-label-secondary, #94a3b8)', display: 'block' }}>Peak Rush</span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b' }}>
              {metrics.peakWindow}
            </span>
          </div>

          <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-label-secondary, #94a3b8)', display: 'block' }}>Top Hero Dish</span>
            <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={metrics.topSellers[0]?.name}>
              ⭐ {metrics.topSellers[0]?.name || 'N/A'}
            </span>
          </div>

          <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-label-secondary, #94a3b8)', display: 'block' }}>Slowest Mover</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f87171', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={metrics.slowMovers[0]?.name}>
              💤 {metrics.slowMovers[0]?.name || 'N/A'}
            </span>
          </div>
        </div>

        {/* Conversation Thread */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          {messages.map((m) => {
            const isUser = m.sender === 'user';
            return (
              <div 
                key={m.id}
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%'
                }}
              >
                {!isUser && (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: m.isLocal ? '#3b82f6' : (m.isError ? '#ef4444' : '#6366f1'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Bot size={17} color="#ffffff" />
                  </div>
                )}

                <div style={{
                  padding: '12px 16px',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  backgroundColor: isUser ? '#4f46e5' : 'rgba(255, 255, 255, 0.05)',
                  border: isUser ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isUser ? '#ffffff' : 'inherit',
                  fontSize: '13.5px',
                  lineHeight: '1.55',
                  boxShadow: isUser ? '0 4px 14px rgba(79, 70, 229, 0.3)' : 'none',
                  whiteSpace: 'pre-wrap'
                }}>
                  {m.text}
                </div>

                {isUser && (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <User size={16} />
                  </div>
                )}
              </div>
            );
          })}

          {isAiLoading && (
            <div style={{ display: 'flex', gap: '10px', alignSelf: 'flex-start' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Bot size={17} color="#ffffff" />
              </div>
              <div style={{
                padding: '12px 16px',
                borderRadius: '16px 16px 16px 4px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '13px',
                color: 'var(--color-label-secondary, #94a3b8)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <RefreshCw size={14} className="animate-spin" />
                Analyzing data &amp; drafting recommendations...
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          whiteSpace: 'nowrap'
        }}>
          {QUICK_PROMPTS.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendQuestion(prompt)}
              disabled={isAiLoading}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--color-label-secondary, #cbd5e1)',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                flexShrink: 0,
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
            >
              <Lightbulb size={12} color="#fbbf24" />
              <span>{prompt}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div style={{
          padding: '12px 20px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          gap: '10px'
        }}>
          <input
            className="form-input"
            placeholder="Ask anything about your business (e.g., 'How to increase Tuesday sales?')..."
            value={inputQuestion}
            onChange={e => setInputQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendQuestion();
              }
            }}
            disabled={isAiLoading}
            style={{
              height: '42px',
              fontSize: '13.5px',
              flex: 1,
              borderRadius: '12px'
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSendQuestion()}
            disabled={!inputQuestion.trim() || isAiLoading}
            style={{
              height: '42px',
              padding: '0 18px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600
            }}
          >
            <span>Ask</span>
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
