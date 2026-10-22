// src/services/localAdvisorEngine.js
// 100% Offline Plan B Business Intelligence & Advisory Engine
// Simple, direct, conversational, and easy to read.

import { formatCurrency } from '../utils/formatCurrency';

export function generatePlanBAdvice({ question, metrics, restaurant = {} }) {
  const currency = restaurant.currency || 'INR';
  const q = (question || '').toLowerCase().trim();
  const restName = restaurant.name || 'Your Restaurant';
  const cleanName = (dish) => {
    if (!dish) return '';
    return String(dish).replace(/\s*\([^)]*\)/g, '').trim();
  };

  const rawHero = metrics?.topSellers?.[0]?.name || metrics?.menuCatalog?.mains?.[0] || metrics?.menuCatalog?.allDishes?.[0] || 'Signature Dish';
  const heroDish = cleanName(rawHero);
  const heroSold = metrics?.topSellers?.[0]?.qty || 0;
  const heroRev = metrics?.topSellers?.[0]?.revenue || 0;
  
  const rawSlow = metrics?.slowMovers?.[0]?.name || 'Special Side';
  const slowDish = cleanName(rawSlow);
  const slowSold = metrics?.slowMovers?.[0]?.qty || 0;

  // Real menu items for grounded upsells & waitstaff scripts
  const starterDish = cleanName(metrics?.menuCatalog?.starters?.[0] || 'starter appetizer');
  const beverageDish = cleanName(metrics?.menuCatalog?.beverages?.[0] || 'chilled beverage');
  const dessertDish = cleanName(metrics?.menuCatalog?.desserts?.[0] || 'dessert special');
  const sideDish = cleanName(metrics?.menuCatalog?.starters?.[1] || metrics?.topSellers?.[1]?.name || starterDish);

  const currentAov = metrics?.aov || 0;
  const targetAov = Math.round(currentAov * 1.2);
  const peakWindow = metrics?.peakWindow || '12:00 PM – 3:00 PM';
  const discountRate = metrics?.discountRate || 0;
  const totalSales = metrics?.totalSales || 0;
  const orderCount = metrics?.orderCount || 0;
  const healthScore = metrics?.healthScore || 80;

  // 1. CASUAL GREETING
  if (q === 'hi' || q === 'hello' || q === 'hey' || q.startsWith('who are you') || q === 'sup' || q === 'yo') {
    return `Hey there! 👋 I'm ready.

What would you like to check on today — your sales pulse, top dishes, or rush hour prep?

[SUGGESTIONS: "How are our sales looking today?", "Who is our top selling dish?"]`;
  }

  // 2. JOKES / HUMOR
  if (q.includes('joke') || q.includes('funny') || q.includes('laugh')) {
    return `Why did the chef get arrested?  
*Because he got caught beating the eggs and whipping the cream!* 😄

Your **${heroDish}** is doing serious numbers today (${heroSold} sold). How else can I help?

[SUGGESTIONS: "How are our sales looking today?", "Who is our top selling dish?"]`;
  }

  // 3. SALES / REVENUE / PERFORMANCE
  if (q.includes('sales') || q.includes('revenue') || q.includes('doing good') || q.includes('how much') || q.includes('performance') || q.includes('money')) {
    return `### Sales Snapshot

• **Gross Revenue:** **${formatCurrency(totalSales, currency)}** across **${orderCount} orders**
• **Average Check (AOV):** **${formatCurrency(currentAov, currency)}**
• **Star Dish:** **${heroDish}** (${heroSold} sold • ${formatCurrency(heroRev, currency)})
• **Peak Rush Shift:** **${peakWindow}**
• **Health Rating:** **${healthScore}/100**

💡 **Quick Move:** Pairing **${heroDish}** with **${beverageDish}** or **${starterDish}** can raise average check to **${formatCurrency(targetAov, currency)}** (+20%).

[SUGGESTIONS: "How can I increase AOV?", "Suggest a combo for ${slowDish}"]`;
  }

  // 4. DISHES / BEST SELLER / SLOW MOVER
  if (q.includes('best') || q.includes('top') || q.includes('hero') || q.includes('dish') || q.includes('popular') || q.includes('item')) {
    return `### Menu Performance

• **Top Seller:** **${heroDish}** (${heroSold} orders • ${formatCurrency(heroRev, currency)}). Keep prep stocked!
• **Slowest Item:** **${slowDish}** (${slowSold} orders).

💡 **Quick Move:** Pair **${heroDish}** + **${slowDish}** as a chef's special combo at a 10% discount to clear stock with high margin.

[SUGGESTIONS: "How to increase drink sales?", "How are our sales looking today?"]`;
  }

  // 5. WAITSTAFF SCRIPTS & SERVER DIALOGUE
  if (q.includes('script') || q.includes('waiter') || q.includes('server') || q.includes('training') || (q.includes('upsell') && q.includes('script'))) {
    return `### Natural Waitstaff Upselling Scripts

• **Drink Hook (On Seating):**  
*"Welcome to ${restName}! While you take a look at the menu, can I get our chilled ${beverageDish} started for the table?"*

• **Entree Pairing (Taking Order):**  
*"The ${heroDish} is our most popular order today! It pairs wonderfully with our ${starterDish} — shall I add a portion for the table to share?"*

• **Dessert Close (Finishing Meal):**  
*"Before I bring the check, can I tempt you with our ${dessertDish} or a fresh hot beverage?"*

💡 **Pro-Tip:** Train staff to recommend specific dish names (**${heroDish}**, **${beverageDish}**) rather than asking vague questions like *"Anything else?"*

[SUGGESTIONS: "How to raise our AOV?", "How are our sales looking today?"]`;
  }

  // 6. AOV / UPSELLING
  if (q.includes('aov') || q.includes('order value') || q.includes('basket') || q.includes('upsell') || q.includes('increase')) {
    return `### Boost Average Order Value

Your current AOV is **${formatCurrency(currentAov, currency)}**. Here are 2 fast ways to reach **${formatCurrency(targetAov, currency)}**:

1. **The 90-Second Beverage Hook:** Have servers offer **${beverageDish}** right after seating. High margin (70%+).
2. **Impulse Dish Add-on:** Suggest **${starterDish}** or **${sideDish}** alongside **${heroDish}**.

💡 **Server Script:** *"The ${heroDish} is rich and flavorful! Would you like to pair it with our ${beverageDish} or a portion of ${starterDish} to start?"*

[SUGGESTIONS: "Waitstaff upselling script", "How are our sales looking today?"]`;
  }

  // 7. RUSH HOUR & PREP
  if (q.includes('rush') || q.includes('peak') || q.includes('kitchen') || q.includes('prep') || q.includes('delay') || q.includes('staff')) {
    return `### Peak Rush Staging (${peakWindow})

1. **45-Min Pre-Prep Check:** Ensure all sauces, garnishes, and to-go boxes for **${heroDish}** are 100% pre-portioned before the rush.
2. **Dedicated Expeditor:** Assign one person strictly to check plates and clear the pass within 45 seconds of ringing.

[SUGGESTIONS: "Waitstaff upselling script", "How are our sales looking today?"]`;
  }

  // 8. DISCOUNTS & COSTS
  if (q.includes('discount') || q.includes('margin') || q.includes('cost')) {
    return `### Margin & Discount Audit

• **Discount Rate:** **${discountRate}%** of gross sales.
• **Rule:** Replace cash discounts with high-perceived-value perks (e.g. complimentary chef sampler) to protect margins.
• Use strict portioning tools on high-volume items like **${heroDish}** to avoid ingredient over-portioning.

[SUGGESTIONS: "How are our sales looking today?", "Suggest a combo for ${slowDish}"]`;
  }

  // 9. WITTY OFF-TOPIC HANDLERS
  if (q.includes('weather') || q.includes('rain') || q.includes('forecast') || q.includes('temp') || q.includes('sunny')) {
    return `Inside the kitchen? A sizzling 45°C with a 100% chance of ticket storms during lunch! 🍳

Outside, if it rains, get ready for your delivery orders to surge. What can I help you cook up or analyze today?

[SUGGESTIONS: "How are our sales looking today?", "Who is our top selling dish?"]`;
  }

  if (q.includes('meaning of life') || q.includes('philosophy') || q.includes('purpose of life')) {
    return `Table turns under 40 minutes, zero wasted food, and an 80% gross margin on cold beverages. Everything else is just garnish! 😄

What business goal are we tackling today?

[SUGGESTIONS: "How can I increase AOV?", "How are our sales looking today?"]`;
  }

  if (q.includes('love') || q.includes('dating') || q.includes('crush') || q.includes('girlfriend') || q.includes('boyfriend')) {
    return `My only true love is the commercial convection oven — she heats up in 90 seconds and never leaves tickets behind! 🔥

Need me to design a high-margin romantic dinner combo for two, or check today's sales?

[SUGGESTIONS: "How are our sales looking today?", "Who is our top selling dish?"]`;
  }

  // 10. GENERAL / OTHER
  return `### Quick Business Summary: ${restName}

• **Sales:** **${formatCurrency(totalSales, currency)}** across **${orderCount} orders** (AOV: ${formatCurrency(currentAov, currency)})
• **Top Dish:** **${heroDish}** (${heroSold} sold)
• **Slow Dish:** **${slowDish}** (${slowSold} sold)
• **Rush Hour:** **${peakWindow}**

Ask me anything specific about sales, dishes, staffing, or margin improvements!

[SUGGESTIONS: "How are our sales looking today?", "Who is our top selling dish?"]`;
}
