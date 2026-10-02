// src/utils/localBusinessAnalyzer.js
// 100% Client-Side Local Business Intelligence & Menu Matrix Engine
// Runs with zero network calls, zero tokens, and full offline resilience.

export function analyzeBusinessData(orders = [], _menuItems = [], restaurant = {}) {
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

  // 4. Menu Item Performance & Item Matrix
  const itemMap = {};
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
    });
  });

  const allItemsRanked = Object.values(itemMap).sort((a, b) => b.qty - a.qty);
  const topSellers = allItemsRanked.slice(0, 5);
  const slowMovers = allItemsRanked.filter(i => i.qty > 0).slice(-4).reverse();

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
    healthScore,
    localInsights
  };
}

// Generates a tiny, pre-digested summary string (~200-300 tokens)
// to send to Groq LLM without burning API credits.
export function generateCompactDigest(metrics, restaurant = {}, periodLabel = 'Recent Performance') {
  const currency = restaurant.currency || 'INR';
  const name = restaurant.name || 'Restaurant';

  return `
Restaurant: ${name} (${restaurant.cuisineType || 'Dining'})
Analysis Period: ${periodLabel}
Total Revenue: ${currency} ${metrics.totalSales.toLocaleString()}
Order Count: ${metrics.orderCount}
Average Order Value (AOV): ${currency} ${metrics.aov}
Discounts Burn Rate: ${metrics.discountRate}% of gross
Peak Rush Hours: ${metrics.peakWindow}
Channel Split: Dine-In (${metrics.channelCounts['dine-in']} orders), Takeaway (${metrics.channelCounts['takeaway']} orders), Online (${metrics.channelCounts['online']} orders)
Top 3 Bestsellers: ${metrics.topSellers.slice(0, 3).map(s => `${s.name} (${s.qty} sold, ${currency}${s.revenue})`).join(', ') || 'N/A'}
Slowest Moving Items: ${metrics.slowMovers.slice(0, 3).map(s => `${s.name} (${s.qty} sold)`).join(', ') || 'N/A'}
Business Health Score: ${metrics.healthScore}/100
`.trim();
}
