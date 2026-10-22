// src/utils/localBusinessAnalyzer.js
// 100% Client-Side Local Business Intelligence & Menu Matrix Engine
// Runs with zero network calls, zero tokens, and full offline resilience.

export function analyzeBusinessData(orders = [], menuItems = [], restaurant = {}) {
  const validOrders = (orders || []).filter(o => 
    (o.status === 'billed' || (o.paid && o.status !== 'cancelled') || (o.paymentMethod && o.paymentMethod !== 'unpaid')) &&
    o.status !== 'cancelled'
  );

  const totalSales = validOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const orderCount = validOrders.length;
  const aov = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;
  
  const totalDiscounts = validOrders.reduce((sum, o) => sum + (Number(o.discountAmount) || 0), 0);
  const discountRate = totalSales > 0 ? Math.round((totalDiscounts / (totalSales + totalDiscounts)) * 100) : 0;

  // 1. Channel Split (Dine-in, Takeaway, Online)
  const channelCounts = { 'dine-in': 0, 'takeaway': 0, 'online': 0 };
  const channelRevenue = { 'dine-in': 0, 'takeaway': 0, 'online': 0 };

  validOrders.forEach(o => {
    const type = o.type || o.orderType || 'dine-in';
    const normType = type === 'delivery' ? 'online' : (channelCounts[type] !== undefined ? type : 'dine-in');
    channelCounts[normType] = (channelCounts[normType] || 0) + 1;
    channelRevenue[normType] = (channelRevenue[normType] || 0) + (Number(o.total) || 0);
  });

  // 2. Payment Method Split
  const paymentSplit = {};
  validOrders.forEach(o => {
    const method = (o.paymentMethod || 'cash').toLowerCase();
    paymentSplit[method] = (paymentSplit[method] || 0) + 1;
  });

  // 3. Hourly Rush Windows
  const hourlyCounts = Array(24).fill(0);
  const hourlyRevenue = Array(24).fill(0);

  validOrders.forEach(o => {
    let date = null;
    if (o.createdAt?.toDate) {
      date = o.createdAt.toDate();
    } else if (o.createdAt?.seconds) {
      date = new Date(o.createdAt.seconds * 1000);
    } else if (o.createdAt) {
      date = new Date(o.createdAt);
    }
    if (date && !isNaN(date.getTime())) {
      const h = date.getHours();
      hourlyCounts[h]++;
      hourlyRevenue[h] += (Number(o.total) || 0);
    }
  });

  // Find peak rush hour
  let peakHour = 13;
  let maxHourlyOrders = 0;
  hourlyCounts.forEach((count, h) => {
    if (count > maxHourlyOrders) {
      maxHourlyOrders = count;
      peakHour = h;
    }
  });

  const formatHour = (h) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:00 ${ampm}`;
  };

  const peakWindow = `${formatHour(peakHour)} – ${formatHour((peakHour + 2) % 24)}`;

  // 4. Menu Item Performance & Item Matrix (Grounded in real items)
  const itemMap = {};

  // Seed from catalog menu items
  (menuItems || []).forEach(it => {
    if (it && it.name) {
      itemMap[it.name] = {
        name: it.name,
        qty: 0,
        revenue: 0,
        price: Number(it.price) || 0,
        category: it.category || it.categoryName || 'General'
      };
    }
  });

  // Accumulate order sales telemetry
  validOrders.forEach(o => {
    const items = o.items || [];
    items.forEach(it => {
      const name = it.name || 'Unknown Item';
      if (!itemMap[name]) {
        itemMap[name] = {
          name,
          qty: 0,
          revenue: 0,
          price: Number(it.price) || 0,
          category: it.category || 'General'
        };
      }
      const q = Number(it.qty) || 1;
      itemMap[name].qty += q;
      itemMap[name].revenue += (Number(it.price) || 0) * q;
      if (it.category && itemMap[name].category === 'General') {
        itemMap[name].category = it.category;
      }
    });
  });

  const allItems = Object.values(itemMap);
  const allItemsRanked = [...allItems].sort((a, b) => b.qty - a.qty);
  const topSellers = allItemsRanked.filter(i => i.qty > 0).slice(0, 5);
  const slowMovers = allItemsRanked.slice(-5).reverse();

  // Categorize actual dishes for accurate, non-hallucinated upsell pairing
  const isBeverage = (name, cat) => /drink|beverage|tea|chai|coffee|shake|juice|soda|water|cooler|beer|wine|mojito|mocktail|lassi|smoothie|frappe|espresso|latte|cappuccino/i.test(`${name} ${cat}`);
  const isStarter = (name, cat) => /starter|side|appetizer|soup|salad|bread|garlic|roti|naan|snack|fries|wing|dip|roll|samosa|tikka|bruschetta|nachos|chaat/i.test(`${name} ${cat}`);
  const isDessert = (name, cat) => /dessert|sweet|cake|ice cream|pastry|pudding|jamun|halwa|brownie|kulfi|tiramisu|pie|sundae|cheesecake|baklava|falooda/i.test(`${name} ${cat}`);

  const formatDishNameWithPrice = (item) => {
    if (!item) return '';
    const curr = restaurant.currency || '₹';
    const space = curr.length > 1 ? ' ' : '';
    const priceStr = item.price ? ` (${curr}${space}${item.price})` : '';
    return `${item.name}${priceStr}`;
  };

  const startersRaw = allItems.filter(i => isStarter(i.name, i.category));
  const beveragesRaw = allItems.filter(i => isBeverage(i.name, i.category));
  const dessertsRaw = allItems.filter(i => isDessert(i.name, i.category));
  const mainsRaw = allItems.filter(i => !isBeverage(i.name, i.category) && !isStarter(i.name, i.category) && !isDessert(i.name, i.category));

  // Fallbacks: If specific categories are empty, fallback to available products so AI has real items to suggest
  const remainingDishes = allItems.map(i => i.name);
  const starters = startersRaw.length > 0 
    ? startersRaw.map(formatDishNameWithPrice).slice(0, 8) 
    : remainingDishes.slice(0, 3).map(name => formatDishNameWithPrice(itemMap[name]));
  const beverages = beveragesRaw.length > 0 
    ? beveragesRaw.map(formatDishNameWithPrice).slice(0, 8) 
    : (remainingDishes[3] ? [formatDishNameWithPrice(itemMap[remainingDishes[3]])] : []);
  const desserts = dessertsRaw.length > 0 
    ? dessertsRaw.map(formatDishNameWithPrice).slice(0, 8) 
    : (remainingDishes[4] ? [formatDishNameWithPrice(itemMap[remainingDishes[4]])] : []);
  const mains = mainsRaw.length > 0 
    ? mainsRaw.map(formatDishNameWithPrice).slice(0, 8) 
    : (topSellers.length > 0 ? topSellers.map(formatDishNameWithPrice) : remainingDishes.slice(0, 5).map(name => formatDishNameWithPrice(itemMap[name])));

  const menuCatalog = {
    starters,
    beverages,
    desserts,
    mains,
    allDishes: allItems.map(formatDishNameWithPrice).slice(0, 25)
  };

  // 5. Health Score Calculation (0 - 100)
  let healthScore = 65;
  if (orderCount >= 10) healthScore += 10;
  if (aov > 300) healthScore += 10;
  if (discountRate <= 8) healthScore += 8;
  else if (discountRate > 20) healthScore -= 10;
  if (channelCounts['dine-in'] > 0 && channelCounts['takeaway'] > 0) healthScore += 7;
  healthScore = Math.min(100, Math.max(25, healthScore));

  // 6. Local Rule-Based Insights (Offline fallback)
  const localInsights = [];

  if (topSellers.length > 0) {
    const topItem = topSellers[0];
    const topShare = totalSales > 0 ? Math.round((topItem.revenue / totalSales) * 100) : 0;
    localInsights.push({
      type: 'star',
      title: `Hero Dish: ${topItem.name}`,
      description: `Generates ${topShare}% of food sales with ${topItem.qty} orders. Ensure ingredients never go out of stock.`
    });
  }

  if (slowMovers.length > 0 && slowMovers[0].name !== topSellers[0]?.name) {
    localInsights.push({
      type: 'warning',
      title: `Underperforming: ${slowMovers[0].name}`,
      description: `Only ${slowMovers[0].qty} sold. Consider bundling with ${topSellers[0]?.name || 'a top seller'} or testing a combo discount.`
    });
  }

  if (aov > 0) {
    const targetAov = Math.round(aov * 1.2);
    localInsights.push({
      type: 'growth',
      title: `Upsell Target: Reach ${restaurant.currency || '₹'}${targetAov} AOV`,
      description: `Current average order is ${restaurant.currency || '₹'}${aov}. Train staff to suggest high-margin beverages or appetizers.`
    });
  }

  if (maxHourlyOrders > 0) {
    localInsights.push({
      type: 'rush',
      title: `Peak Rush Window: ${peakWindow}`,
      description: `Highest order concentration occurs around ${formatHour(peakHour)}. Ensure full kitchen line and runner coverage during this shift.`
    });
  }

  return {
    totalSales,
    orderCount,
    aov,
    totalDiscounts,
    discountRate,
    channelCounts,
    channelRevenue,
    paymentSplit,
    peakHour,
    peakWindow,
    topSellers,
    slowMovers,
    menuCatalog,
    healthScore,
    localInsights
  };
}

// Generates a compact digest strictly grounded in real restaurant products
export function generateCompactDigest(metrics, restaurant = {}, periodLabel = 'Recent Performance') {
  const currency = restaurant.currency || 'INR';
  const name = restaurant.name || 'Restaurant';
  const cat = metrics.menuCatalog || {};
  const cuisine = restaurant.cuisineType || restaurant.cuisine || 'Restaurant / Cafe';

  const formatDishList = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return 'None listed';
    return arr.join(', ');
  };

  return `
Restaurant Name: ${name}
Cuisine / Business Concept: ${cuisine}
Official Currency: ${currency}
Analysis Period: ${periodLabel}
Total Revenue: ${currency} ${metrics.totalSales.toLocaleString()}
Total Orders: ${metrics.orderCount}
Average Order Value (AOV): ${currency} ${metrics.aov}
Discounts Burn Rate: ${metrics.discountRate}% of gross
Peak Rush Hours: ${metrics.peakWindow}

=== REAL MENU ITEMS & PRODUCTS SOLD HERE (DO NOT INVENT OTHER DISHES) ===
• Top Bestsellers: ${metrics.topSellers.map(s => `${s.name} (${currency}${currency.length > 1 ? ' ' : ''}${s.price || ''})`).join(', ') || 'None recorded'}
• Slow Moving Items: ${metrics.slowMovers.map(s => `${s.name} (${currency}${currency.length > 1 ? ' ' : ''}${s.price || ''})`).join(', ') || 'None recorded'}
• Starters & Sides on Menu: ${formatDishList(cat.starters)}
• Main Courses on Menu: ${formatDishList(cat.mains)}
• Beverages & Drinks on Menu: ${formatDishList(cat.beverages)}
• Desserts & Sweets on Menu: ${formatDishList(cat.desserts)}
• All Active Dishes in Catalog: ${formatDishList(cat.allDishes)}
========================================================================
`.trim();
}
