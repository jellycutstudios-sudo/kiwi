import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeBusinessData, generateCompactDigest } from '../utils/localBusinessAnalyzer';
import { generatePlanBAdvice } from '../services/localAdvisorEngine';
import { loadStoredAiChat, saveStoredAiChat } from '../utils/aiChatStorage';

describe('AI Advisor Menu & Product Grounding', () => {
  const sampleRestaurant = {
    name: 'Bawarchi Express',
    cuisineType: 'Hyderabadi Biryani & Mughlai',
    currency: 'INR'
  };

  const sampleMenuItems = [
    { name: 'Chicken Dum Biryani', price: 290, category: 'Biryanis' },
    { name: 'Mutton Seekh Kebab', price: 340, category: 'Starters' },
    { name: 'Mirchi Ka Salan', price: 120, category: 'Sides' },
    { name: 'Mango Lassi', price: 90, category: 'Beverages' },
    { name: 'Shahi Tukda', price: 150, category: 'Desserts' }
  ];

  const sampleOrders = [
    {
      id: 'ord-1',
      total: 720,
      status: 'billed',
      items: [
        { name: 'Chicken Dum Biryani', price: 290, qty: 2 },
        { name: 'Mango Lassi', price: 90, qty: 1 }
      ]
    }
  ];

  it('correctly maps real menu items into categorized catalog and compact digest', () => {
    const metrics = analyzeBusinessData(sampleOrders, sampleMenuItems, sampleRestaurant);
    expect(metrics.topSellers[0].name).toBe('Chicken Dum Biryani');
    expect(metrics.menuCatalog.starters.some(s => s.includes('Mutton Seekh Kebab'))).toBe(true);
    expect(metrics.menuCatalog.beverages.some(b => b.includes('Mango Lassi'))).toBe(true);
    expect(metrics.menuCatalog.desserts.some(d => d.includes('Shahi Tukda'))).toBe(true);

    const digest = generateCompactDigest(metrics, sampleRestaurant);
    expect(digest).toContain('Bawarchi Express');
    expect(digest).toContain('Chicken Dum Biryani');
    expect(digest).toContain('Mango Lassi');
    expect(digest).toContain('DO NOT INVENT OTHER DISHES');
  });

  it('grounds waitstaff script strictly in the restaurant real products', () => {
    const metrics = analyzeBusinessData(sampleOrders, sampleMenuItems, sampleRestaurant);
    const advice = generatePlanBAdvice({
      question: 'Waitstaff upselling script',
      metrics,
      restaurant: sampleRestaurant
    });

    // Should mention real products
    expect(advice).toContain('Chicken Dum Biryani');
    expect(advice).toContain('Mango Lassi');
    expect(advice).toContain('Bawarchi Express');
    
    // Should NOT mention hallucinated items
    expect(advice).not.toContain('truffle-infused');
    expect(advice).not.toContain('molten chocolate lava cake');
  });

  it('respects foreign currencies like QAR or USD', () => {
    const qatarRest = { name: 'Luxe Lounge', currency: 'QAR' };
    const qatarMenu = [
      { name: 'Wagyu Slider', price: 65, category: 'Mains' },
      { name: 'Passionfruit Cooler', price: 28, category: 'Beverages' }
    ];
    const metrics = analyzeBusinessData([], qatarMenu, qatarRest);
    const digest = generateCompactDigest(metrics, qatarRest);

    expect(digest).toContain('Official Currency: QAR');
    expect(digest).toContain('Wagyu Slider (QAR 65)');

    const advice = generatePlanBAdvice({
      question: 'waiter scripts',
      metrics,
      restaurant: qatarRest
    });

    expect(advice).toContain('Luxe Lounge');
    expect(advice).toContain('Wagyu Slider');
    expect(advice).toContain('Passionfruit Cooler');
  });
});

describe('AI Chat Local Retention & Zero-Memory-Leak Policy', () => {
  let store = {};
  const mockLocalStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };

  beforeEach(() => {
    globalThis.localStorage = mockLocalStorage;
    localStorage.clear();
  });

  it('saves and reloads recent messages without cloud database usage', () => {
    const msgs = [
      { id: '1', sender: 'user', text: 'Hi', time: new Date() },
      { id: '2', sender: 'ai', text: 'Hello!', time: new Date() }
    ];
    saveStoredAiChat(msgs);
    const loaded = loadStoredAiChat();
    expect(loaded.length).toBe(2);
    expect(loaded[0].text).toBe('Hi');
  });

  it('auto-purges messages older than 6 months (180 days)', () => {
    const eightMonthsAgo = new Date(Date.now() - 240 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const msgs = [
      { id: 'old-1', sender: 'user', text: 'Old query from last year', time: eightMonthsAgo },
      { id: 'recent-1', sender: 'user', text: 'Recent question', time: twoDaysAgo }
    ];
    localStorage.setItem('dineos_ai_chat_history', JSON.stringify(msgs));

    const loaded = loadStoredAiChat();
    expect(loaded.length).toBe(1);
    expect(loaded[0].text).toBe('Recent question');
  });

  it('caps history to max 50 messages to guarantee tiny footprint (<40 KB)', () => {
    const sixtyMsgs = Array.from({ length: 60 }, (_, i) => ({
      id: `msg-${i}`,
      sender: i % 2 === 0 ? 'user' : 'ai',
      text: `Message content number ${i}`,
      time: new Date()
    }));

    saveStoredAiChat(sixtyMsgs);
    const loaded = loadStoredAiChat();
    expect(loaded.length).toBe(50);
    expect(loaded[loaded.length - 1].id).toBe('msg-59');
  });
});
