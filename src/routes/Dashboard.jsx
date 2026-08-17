import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useMenuStore } from '../stores/menuStore';
import { formatCurrency } from '../utils/formatCurrency';
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShoppingCart, TrendingUp, Globe, Clock, CheckCircle2,
  Sparkles, Lightbulb, Flame, Snowflake, Percent, Calendar, AlertCircle
} from 'lucide-react';
import InfoTooltip from '../components/shared/InfoTooltip';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

export default function Dashboard() {
  const { restaurant, staffDoc } = useAuthStore();
  const { activeOrders, unreadOnlineCount } = useOrderStore();
  const { categories } = useMenuStore();
  const [todayStats, setTodayStats] = useState({ sales: 0, orders: 0, avg: 0, avgCookTime: 0, tableTurnover: 0, topItem: null, paymentSplit: { cash: 0, card: 0, upi: 0, split: 0 } });
  const [loading, setLoading] = useState(true);
  const [analyticsOrders, setAnalyticsOrders] = useState([]);
  const [tablesCount, setTablesCount] = useState(0);
  const currency = restaurant?.currency ?? 'INR';

  // Fetch completed orders for the last 7 days for Business Insights
  useEffect(() => {
    if (!restaurant?.id) return;
    const start = new Date();
    start.setDate(start.getDate() - 7);

    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', start),
      limit(200)  // Cap analytics lookback — enough for insight calculations
    );

    getDocs(q).then(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const salesDocs = docs.filter(d => (d.status === 'billed' || (d.paymentMethod && d.paymentMethod !== 'unpaid')) && d.status !== 'cancelled');
      setAnalyticsOrders(salesDocs);
    }).catch(err => {
      console.error("Dashboard analytics query failed:", err);
    });
  }, [restaurant?.id]);

  // Unpack menu items from categories
  const menuItems = useMemo(() => {
    const allItems = [];
    categories.forEach(cat => {
      if (Array.isArray(cat.items)) {
        allItems.push(...cat.items);
      }
    });
    return allItems;
  }, [categories]);

  // Aggregate Best Sellers (last 7 days)
  const bestSellers = useMemo(() => {
    const counts = {};
    analyticsOrders.forEach(order => {
      if (!Array.isArray(order.items)) return;
      order.items.forEach(item => {
        const key = item.name;
        if (!counts[key]) {
          counts[key] = { name: item.name, qty: 0, revenue: 0, emoji: item.emoji ?? '🍽️' };
        }
        counts[key].qty += item.qty ?? 0;
        counts[key].revenue += (item.price ?? 0) * (item.qty ?? 0);
      });
    });
    return Object.values(counts).sort((a, b) => b.qty - a.qty).slice(0, 3);
  }, [analyticsOrders]);

  // Total items sold in best sellers for percentage calculations
  const totalBestsellerQty = useMemo(() => {
    return bestSellers.reduce((acc, curr) => acc + curr.qty, 0);
  }, [bestSellers]);

  // Aggregate Slow Movers (menu items with lowest sales in last 7 days)
  const slowMovers = useMemo(() => {
    const counts = {};
    // Seed all menu items with 0 sales
    menuItems.forEach(item => {
      counts[item.name] = { name: item.name, qty: 0, price: item.price, emoji: item.emoji ?? '🍽️' };
    });
    // Add sales counts
    analyticsOrders.forEach(order => {
      if (!Array.isArray(order.items)) return;
      order.items.forEach(item => {
        if (counts[item.name]) {
          counts[item.name].qty += item.qty ?? 0;
        }
      });
    });
    return Object.values(counts)
      .sort((a, b) => a.qty - b.qty)
      .slice(0, 3);
  }, [analyticsOrders, menuItems]);

  // Aggregate Peak Traffic Hours
  const peakHours = useMemo(() => {
    const hourlyCounts = Array.from({ length: 24 }).fill(0);
    analyticsOrders.forEach(order => {
      if (!order.createdAt) return;
      const date = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt);
      hourlyCounts[date.getHours()]++;
    });

    const activeHours = [];
    for (let h = 9; h <= 22; h++) { // focus on standard operational hours 9 AM - 10 PM
      const label = `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;
      activeHours.push({ hour: h, label, count: hourlyCounts[h] });
    }
    return activeHours;
  }, [analyticsOrders]);

  const topPeakHours = useMemo(() => {
    return [...peakHours].sort((a, b) => b.count - a.count).slice(0, 2);
  }, [peakHours]);

  // Dynamic Growth Insights / Tips
  const growthTips = useMemo(() => {
    const tips = [];
    const hasSales = bestSellers.length > 0 && bestSellers[0].qty > 0;

    if (!hasSales) {
      tips.push({
        title: "Welcome to your Dashboard!",
        description: "Once your first order is billed, you will see staffing recommendations and smart menu combos here.",
        icon: Sparkles,
        color: '#8b5cf6'
      });
      tips.push({
        title: "Staffing Optimization",
        description: "Schedule suggestions will automatically update based on your peak order times once billing logs are populated.",
        icon: Clock,
        color: '#3b82f6'
      });
      tips.push({
        title: "Promotional Pairing",
        description: "Our algorithm will identify slow-moving inventory items to bundle with your popular dishes to maximize revenue.",
        icon: Lightbulb,
        color: '#f59e0b'
      });
      return tips;
    }

    // 1. Staffing Tip based on Peak Hours
    if (topPeakHours.length > 0 && topPeakHours[0].count > 0) {
      tips.push({
        title: "Staffing Optimization",
        description: `Peak customer traffic occurs around **${topPeakHours[0].label}** and **${topPeakHours[1]?.label ?? 'off-peak'}**. Schedule extra kitchen hands 30 minutes before these times to ensure prompt service.`,
        icon: Clock,
        color: '#8b5cf6'
      });
    } else {
      tips.push({
        title: "Operational Efficiency",
        description: "Consistency in order prep speed during peak dinner service increases table turn rates and online customer satisfaction.",
        icon: Clock,
        color: '#8b5cf6'
      });
    }

    // 2. Menu Bundle / Pairing Tip based on Best Sellers & Slow Movers
    const realBestSeller = bestSellers[0];
    const realSlowMover = slowMovers.find(m => m.name !== realBestSeller.name) || slowMovers[0];

    if (realBestSeller && realSlowMover) {
      tips.push({
        title: "Promotional Pairing",
        description: `Consider creating a combo promotion bundling your popular item **"${realBestSeller.name}"** with a slower-selling item like **"${realSlowMover.name}"** to clear out raw inventory.`,
        icon: Sparkles,
        color: '#f59e0b'
      });
    } else {
      tips.push({
        title: "Upselling Focus",
        description: "Promote beverage combos or daily desserts alongside entrees to increase the ticket value for online and walk-in sales.",
        icon: Sparkles,
        color: '#f59e0b'
      });
    }

    // 3. Ticket Value Booster
    if (todayStats.avg > 0) {
      tips.push({
        title: "Booster Sales Scripts",
        description: `Your average ticket value is **${formatCurrency(todayStats.avg, currency)}**. Train staff to suggest extra toppings, premium modifiers, or sides on orders currently below this threshold.`,
        icon: Percent,
        color: '#10b981'
      });
    } else {
      tips.push({
        title: "Average Ticket Focus",
        description: "Implement add-on options (modifiers) like double cheese or extra protein to increase standard average order amounts.",
        icon: Percent,
        color: '#10b981'
      });
    }

    return tips;
  }, [topPeakHours, bestSellers, slowMovers, todayStats.avg, currency]);

  const [currentDateStr, setCurrentDateStr] = useState(new Date().toDateString());

  // Check periodically if calendar day rolled over to trigger boundary updates
  useEffect(() => {
    const timer = setInterval(() => {
      const todayStr = new Date().toDateString();
      if (todayStr !== currentDateStr) {
        setCurrentDateStr(todayStr);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [currentDateStr]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Subscribe to today's orders in real-time, capped to prevent OOM on busy restaurants
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', today),
      limit(500)
    );
    
    // Also get total tables count for turnover calculation
    getDocs(collection(db, 'restaurants', restaurant.id, 'tables')).then(snap => {
      setTablesCount(snap.size || 0);
    }).catch(e => console.error(e));

    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => d.data());
      const todayBilled = docs.filter(d => (d.status === 'billed' || (d.paymentMethod && d.paymentMethod !== 'unpaid')) && d.status !== 'cancelled');
      const sales = todayBilled.reduce((s, d) => s + (d.total ?? 0), 0);
      const orders = todayBilled.length;
      
      // Calculate Avg Cook Time
      const ordersWithPrep = todayBilled.filter(d => d.prepDuration > 0);
      const avgCookTime = ordersWithPrep.length 
        ? Math.round(ordersWithPrep.reduce((s, d) => s + d.prepDuration, 0) / ordersWithPrep.length / 60) 
        : 0;

      // Calculate Payment Split
      const paymentSplit = { cash: 0, card: 0, upi: 0, split: 0 };
      todayBilled.forEach(d => {
        if (d.paymentMethod) {
          paymentSplit[d.paymentMethod] = (paymentSplit[d.paymentMethod] || 0) + 1;
        }
      });

      // Top Item Today
      const itemCounts = {};
      todayBilled.forEach(o => {
        (o.items || []).forEach(i => {
          if (!itemCounts[i.name]) itemCounts[i.name] = { name: i.name, qty: 0, emoji: i.emoji || '🍽️' };
          itemCounts[i.name].qty += (i.qty || 1);
        });
      });
      const topItem = Object.values(itemCounts).sort((a,b) => b.qty - a.qty)[0] || null;

      // Table Turnover (Orders per table today)
      // Note: we'll use tablesCount from state inside the render or effect, 
      // but we calculate it dynamically below.
      
      setTodayStats({ 
        sales, 
        orders, 
        avg: orders ? sales / orders : 0,
        avgCookTime,
        paymentSplit,
        topItem,
        tableTurnover: 0 // Will be computed in render using tablesCount
      });
      setLoading(false);
    }, err => {
      console.error("Dashboard stats subscription failed:", err);
      setLoading(false);
    });

    return unsub;
  }, [restaurant?.id, currentDateStr]);

  const [hour, setHour] = useState(() => new Date().getHours());

  // Keep greeting in sync with client's local clock, updating every minute
  useEffect(() => {
    const tick = () => setHour(new Date().getHours());
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const greeting = hour < 12 ? '☀️ Good Morning' : hour < 17 ? '🌤️ Good Afternoon' : '🌙 Good Evening';
  const displayGreetingName = useMemo(() => {
    if (!staffDoc?.name) return 'Chef';
    if (staffDoc.name.toLowerCase() === 'super admin') return 'Administrator';
    return staffDoc.name;
  }, [staffDoc?.name]);

  const stats = [
    { label: "Today's Sales", value: formatCurrency(todayStats.sales, currency), icon: TrendingUp, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', desc: 'Gross revenue today', highlight: true },
    { label: 'Orders Today', value: todayStats.orders, icon: ShoppingCart, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', desc: 'Completed orders' },
    { label: 'Avg. Bill Size',   value: formatCurrency(todayStats.avg, currency), icon: CheckCircle2, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', desc: 'Order ticket average', tooltip: 'The typical amount a customer spends per order' },
    { label: 'Orders Cooking',   value: activeOrders.length, icon: Clock, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', desc: 'POS orders in progress', tooltip: 'Orders currently being prepared in the kitchen' },
    { label: 'Waiting Online Orders', value: unreadOnlineCount, icon: Globe, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)', desc: 'Unread online orders', tooltip: 'Orders from Zomato/Swiggy waiting to be accepted' },
  ];

  const orderStatusColors = {
    pending:   'badge-yellow',
    preparing: 'badge-blue',
    ready:     'badge-teal',
    served:    'badge-green',
    billed:    'badge-gray',
  };

  const CustomChartTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-separator)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>{payload[0].payload.label}</p>
          <p style={{ margin: '4px 0 0 0', color: 'var(--color-accent)', fontWeight: 700, fontSize: '12px' }}>
            {payload[0].value} Order{payload[0].value !== 1 ? 's' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Greeting Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 className="text-title2" style={{ fontWeight: 800, letterSpacing: '-0.5px' }}>
            {greeting}, {displayGreetingName}
          </h1>
          <p className="text-secondary text-body" style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={15} style={{ color: 'var(--color-label-tertiary)' }} />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Modern Stat Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--space-4)'
      }}>
        {stats.map((s, i) => (
          <div 
            key={i} 
            className="animate-fade-in" 
            style={{ 
              animationDelay: `${i * 60}ms`,
              background: s.highlight 
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                : 'var(--color-bg-elevated)',
              color: s.highlight ? '#fff' : 'inherit',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5) var(--space-6)',
              boxShadow: s.highlight 
                ? '0 10px 20px -5px rgba(5, 150, 105, 0.25)' 
                : 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              position: 'relative',
              overflow: 'hidden',
              transition: 'transform var(--duration-fast), box-shadow var(--duration-fast)',
              cursor: 'pointer',
              border: s.highlight ? 'none' : '1px solid var(--color-separator)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = s.highlight 
                ? '0 15px 25px -5px rgba(5, 150, 105, 0.35)' 
                : 'var(--shadow-lg)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = s.highlight 
                ? '0 10px 20px -5px rgba(5, 150, 105, 0.25)' 
                : 'var(--shadow-md)';
            }}
          >
            {/* Background design circle */}
            <div style={{
              position: 'absolute',
              right: '-10px',
              top: '-10px',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: s.highlight ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.02)',
              pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ 
                fontSize: '11px', 
                fontWeight: 700, 
                textTransform: 'uppercase', 
                letterSpacing: '0.5px',
                color: s.highlight ? 'rgba(255,255,255,0.8)' : 'var(--color-label-secondary)',
                display: 'flex',
                alignItems: 'center'
              }}>
                {s.label}
                {s.tooltip && <InfoTooltip text={s.tooltip} size={12} />}
              </span>
              <div style={{ 
                background: s.highlight ? 'rgba(255,255,255,0.2)' : s.bg, 
                padding: '6px', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <s.icon size={16} color={s.highlight ? '#fff' : s.color} strokeWidth={2.5} />
              </div>
            </div>

            <div style={{ 
              fontSize: '28px', 
              fontWeight: 800, 
              lineHeight: 1.1,
              marginTop: '4px'
            }}>
              {loading ? <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 6, background: s.highlight ? 'rgba(255,255,255,0.2)' : undefined }} /> : s.value}
            </div>

            <span style={{ 
              fontSize: '11px', 
              color: s.highlight ? 'rgba(255,255,255,0.7)' : 'var(--color-label-tertiary)',
              marginTop: 'auto'
            }}>
              {s.desc}
            </span>
          </div>
        ))}
      </div>

      {/* Today's 3 Action Items */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', border: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-label)' }}>
          <Lightbulb size={16} color="var(--color-orange)" /> Today's Action Items
          <InfoTooltip text="Smart tips based on your live restaurant data today." />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {todayStats.avgCookTime > 20 && (
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-red)' }}>
              <AlertCircle size={16} color="var(--color-red)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div><strong>Kitchen is slow:</strong> Average kitchen time is {todayStats.avgCookTime} mins. Your target should be under 20 mins. Check if any station is backed up.</div>
            </div>
          )}
          {todayStats.paymentSplit.upi > (todayStats.orders * 0.5) && (
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-green)' }}>
              <Sparkles size={16} color="var(--color-green)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div><strong>UPI is popular today:</strong> Over half your orders are paid via UPI. Consider putting a QR code stand right on the tables to speed up checkout.</div>
            </div>
          )}
          {todayStats.tableTurnover < 2 && tablesCount > 0 && todayStats.orders > 5 && (
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-orange)' }}>
              <Clock size={16} color="var(--color-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div><strong>Tables are turning slowly:</strong> Customers are staying longer. Ask staff to clear empty plates faster to free up tables for new walk-ins.</div>
            </div>
          )}
          {(!todayStats.avgCookTime || todayStats.avgCookTime <= 20) && (!todayStats.paymentSplit.upi || todayStats.paymentSplit.upi <= (todayStats.orders * 0.5)) && (todayStats.tableTurnover >= 2 || tablesCount === 0 || todayStats.orders <= 5) && (
            <div style={{ fontSize: '13px', color: 'var(--color-label-secondary)', fontStyle: 'italic', padding: '4px' }}>
              Everything looks good so far today! Keep it up.
            </div>
          )}
        </div>
      </div>

      {/* Restaurant Performance Section */}
      <div>
        <h3 className="text-title3" style={{ marginBottom: 'var(--space-3)', fontWeight: 700, color: 'var(--color-label)' }}>
          Restaurant Performance
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-4)'
        }}>
          {/* Avg Kitchen Time */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <Clock size={14} /> Avg Kitchen Time
              <InfoTooltip text="How long it takes the kitchen to prepare an order on average today" />
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>
              {todayStats.avgCookTime > 0 ? `${todayStats.avgCookTime} mins` : 'N/A'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Based on today's kitchen workflow</div>
          </div>

          {/* Times per Table */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <TrendingUp size={14} /> Times per Table
              <InfoTooltip text="How many groups of customers sat at each table today on average" />
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800 }}>
              {tablesCount > 0 ? (todayStats.orders / tablesCount).toFixed(1) : '0'} 
              <span style={{ fontSize: '14px', color: 'var(--color-label-secondary)', fontWeight: 600, marginLeft: 4 }}>orders/table</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Average turns per table today</div>
          </div>

          {/* How Customers Paid */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <Percent size={14} /> How Customers Paid
              <InfoTooltip text="Percentage breakdown of payment methods used today" />
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              {(() => {
                const total = todayStats.orders || 1;
                const p = todayStats.paymentSplit || { cash: 0, card: 0, upi: 0 };
                return (
                  <>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>{Math.round((p.cash / total) * 100)}%</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-label-secondary)' }}>CASH</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563eb' }}>{Math.round((p.card / total) * 100)}%</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-label-secondary)' }}>CARD</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#7c3aed' }}>{Math.round((p.upi / total) * 100)}%</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-label-secondary)' }}>UPI</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Top Item Today */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <Flame size={14} color="#d97706" /> Top Item Today
            </div>
            {todayStats.topItem ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '2px' }}>
                <div style={{ fontSize: '28px' }}>{todayStats.topItem.emoji}</div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800 }}>{todayStats.topItem.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>{todayStats.topItem.qty} orders today</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '14px', color: 'var(--color-label-tertiary)', marginTop: '8px' }}>No items sold yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Main Ops vs Insights */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-5)',
        alignItems: 'start'
      }}>
        
        {/* Left Column (Main POS details: Active Orders + Peak Hours) */}
        <div style={{ flex: '1 1 480px', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          
          {/* Active Orders Card */}
          <div className="card" style={{ border: '1px solid var(--color-separator)', boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-xl)' }}>
            <div className="card-header" style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-separator)' }}>
              <span className="card-title" style={{ fontSize: 'var(--text-title3)', fontWeight: 700 }}>Active Orders</span>
              <span className="badge badge-blue" style={{ fontSize: '11px', fontWeight: 700 }}>{activeOrders.length}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {activeOrders.length === 0 ? (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                  <div style={{ fontSize: 32, marginBottom: 'var(--space-2)' }}>🎉</div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>All caught up!</div>
                  <div style={{ fontSize: '12px', marginTop: '2px', color: 'var(--color-label-tertiary)' }}>No active orders in progress right now.</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}>
                      {['Order ID', 'Type', 'Table/Token', 'Items', 'Total', 'Status'].map(h => (
                        <th key={h} style={{
                          padding: 'var(--space-3) var(--space-5)',
                          textAlign: 'left',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          color: 'var(--color-label-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.slice(0, 15).map((o) => (
                      <tr key={o.id} style={{
                        borderBottom: '1px solid var(--color-separator)',
                        transition: 'background var(--duration-fast)',
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: 'var(--space-3) var(--space-5)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>
                          #{o.id.slice(-6).toUpperCase()}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)' }}>
                          <span className={`badge ${o.type === 'online' ? 'badge-purple' : o.type === 'dine-in' ? 'badge-blue' : 'badge-orange'}`}>
                            {o.type}
                          </span>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-footnote)', fontWeight: 600 }}>
                          {o.tableName ?? (o.token ? `#${o.token}` : '—')}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>
                          {(o.items ?? []).length} item(s)
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)', fontWeight: 700 }}>
                          {formatCurrency(o.total ?? 0, o.currency ?? currency)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)' }}>
                          <span className={`badge ${orderStatusColors[o.status] ?? 'badge-gray'}`}>
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Hourly Traffic Peaks Chart Card */}
          <div className="card card-padded" style={{ border: '1px solid var(--color-separator)', boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-xl)' }}>
            <h3 className="text-title3" style={{ marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              🕒 Customer Traffic Peak Hours
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-label-tertiary)', marginBottom: 'var(--space-5)' }}>
              Hourly distribution based on sales logs from the last 7 days
            </p>

            <div style={{ width: '100%', height: 260, position: 'relative' }}>
              {analyticsOrders.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-label-tertiary)', gap: '8px' }}>
                  <Clock size={36} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>No order traffic logs available for the last 7 days.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={peakHours} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-separator)" />
                    <XAxis 
                      dataKey="label" 
                      tickLine={false} 
                      axisLine={false} 
                      tick={{ fill: 'var(--color-label-tertiary)', fontSize: 10, fontWeight: 600 }}
                    />
                    <YAxis 
                      tickLine={false} 
                      axisLine={false} 
                      allowDecimals={false}
                      tick={{ fill: 'var(--color-label-tertiary)', fontSize: 10, fontWeight: 600 }}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="count" 
                      stroke="var(--color-accent)" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorCount)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </div>

        {/* Right Column (Insights & Performance Metrics) */}
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          
          {/* Growth Insights Card */}
          <div 
            className="card card-padded" 
            style={{ 
              background: 'linear-gradient(135deg, #fffcf5 0%, #fff7e6 100%)', 
              border: '1px solid #ffe8cc', 
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 4px 12px rgba(255, 232, 204, 0.1)'
            }}
          >
            <h3 className="text-title3" style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#d97706' }}>
              <Lightbulb size={20} color="#d97706" strokeWidth={2.5} />
              <span>Business Growth Insights</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {growthTips.map((tip, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
                  <div style={{
                    background: 'rgba(217, 119, 6, 0.08)',
                    padding: 8,
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2
                  }}>
                    <tip.icon size={16} color={tip.color} strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#92400e' }}>{tip.title}</h4>
                    <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#78350f', lineHeight: '1.45', fontWeight: 500 }}>
                      {tip.description.split('**').map((part, i) => i % 2 === 1 ? <strong key={i} style={{ color: '#000', fontWeight: 700 }}>{part}</strong> : part)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Menu Performance card */}
          <div className="card card-padded" style={{ border: '1px solid var(--color-separator)', boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-xl)' }}>
            <h3 className="text-title3" style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              📊 Menu Performance (Last 7 Days)
            </h3>
            
            {/* Top Sellers */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#16a34a', marginBottom: 'var(--space-3)', letterSpacing: '0.8px' }}>
                <Flame size={13} fill="#16a34a" /> Bestsellers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {bestSellers.map((item, idx) => {
                  const maxQty = bestSellers[0]?.qty || 1;
                  const pct = (item.qty / maxQty) * 100;
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '15px' }}>{item.emoji}</span>
                          {item.name}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{item.qty} sold</span>
                      </div>
                      {/* Visual progress bar */}
                      <div style={{ width: '100%', height: '6px', background: 'var(--color-bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#10b981', borderRadius: '3px' }} />
                      </div>
                    </div>
                  );
                })}
                {bestSellers.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)', fontStyle: 'italic', paddingLeft: 4 }}>No items sold yet.</span>
                )}
              </div>
            </div>

            {/* Slow Movers */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#dc2626', marginBottom: 'var(--space-3)', letterSpacing: '0.8px' }}>
                <Snowflake size={13} /> Slow Movers / Zero Sales
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {slowMovers.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '15px' }}>{item.emoji}</span>
                      {item.name}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-tertiary)' }}>{item.qty} sold</span>
                  </div>
                ))}
                {slowMovers.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)', fontStyle: 'italic', paddingLeft: 4 }}>All items have active sales!</span>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
