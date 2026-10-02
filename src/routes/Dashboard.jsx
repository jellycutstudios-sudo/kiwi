import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useMenuStore } from '../stores/menuStore';
import { formatCurrency } from '../utils/formatCurrency';
import { collection, query, where, onSnapshot, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShoppingCart, TrendingUp, Globe, Clock, CheckCircle2,
  Sparkles, Lightbulb, Flame, Snowflake, Percent, Calendar, AlertCircle,
  Zap, X, Check, ArrowUp, ArrowDown, CalendarClock, XCircle, Bot
} from 'lucide-react';
import toast from 'react-hot-toast';
import InfoTooltip from '../components/shared/InfoTooltip';
import AiBusinessAdvisorModal from '../components/analytics/AiBusinessAdvisorModal';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

export default function Dashboard() {
  const restaurant = useAuthStore(s => s.restaurant);
  const staffDoc = useAuthStore(s => s.staffDoc);
  const activeOrders = useOrderStore(s => s.activeOrders);
  const unreadOnlineCount = useOrderStore(s => s.unreadOnlineCount);
  const categories = useMenuStore(s => s.categories);
  const settleOrder = useOrderStore(s => s.settleOrder);
  const [todayStats, setTodayStats] = useState({ 
    sales: 0, 
    orders: 0, 
    settledSales: 0, 
    openSales: 0, 
    totalSales: 0, 
    settledOrders: 0, 
    openOrders: 0, 
    totalOrders: 0, 
    avg: 0, 
    avgCookTime: 0, 
    tableTurnover: 0, 
    topItem: null, 
    paymentSplit: { cash: 0, card: 0, upi: 0, split: 0 } 
  });
  const [salesViewMode, setSalesViewMode] = useState('pipeline'); // 'pipeline' | 'settled'
  const [settleOrderModal, setSettleOrderModal] = useState(null);
  const [settling, setSettling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyticsOrders, setAnalyticsOrders] = useState([]);
  const [tablesCount, setTablesCount] = useState(0);
  const currency = restaurant?.currency ?? 'INR';
  // ── Owner Intelligence State ──
  const [yesterdayStats, setYesterdayStats] = useState({ sales: 0, orders: 0 });
  const [cancellations, setCancellations] = useState(0);
  const [reservationsToday, setReservationsToday] = useState({ count: 0, next: null });
  const [showAiAdvisor, setShowAiAdvisor] = useState(false);

  const handleQuickSettle = async (order, method = 'cash') => {
    if (!order?.id || !restaurant?.id) return;
    try {
      setSettling(true);
      await settleOrder(restaurant.id, order.id, method, order.total);
      const label = order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : `#${order.id.slice(-6).toUpperCase()}`);
      toast.success(`${label} settled for ${formatCurrency(order.total, currency)} via ${method.toUpperCase()}!`, { icon: '💰' });
      setSettleOrderModal(null);
    } catch (err) {
      toast.error('Failed to settle order: ' + err.message);
    } finally {
      setSettling(false);
    }
  };

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

  // Fetch yesterday's sales for delta comparison
  useEffect(() => {
    if (!restaurant?.id) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);
    getDocs(query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', yesterday),
      where('createdAt', '<=', yesterdayEnd),
      limit(500)
    )).then(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const billed = docs.filter(d =>
        (d.status === 'billed' || (d.paymentMethod && d.paymentMethod !== 'unpaid')) &&
        d.status !== 'cancelled'
      );
      setYesterdayStats({ sales: billed.reduce((s, d) => s + (d.total ?? 0), 0), orders: billed.length });
    }).catch(err => console.error('Yesterday stats failed:', err));
  }, [restaurant?.id]);

  // Fetch today's reservations count
  useEffect(() => {
    if (!restaurant?.id) return;
    getDocs(query(
      collection(db, 'restaurants', restaurant.id, 'reservations'),
      where('date', '==', new Date().toISOString().split('T')[0]),
      limit(20)
    )).then(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const sorted = [...docs].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      setReservationsToday({ count: docs.length, next: sorted[0] || null });
    }).catch(() => setReservationsToday({ count: 0, next: null }));
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

  // 7-day revenue sparkline (reuses already-fetched analyticsOrders — no extra query)
  const weeklySparkline = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const label = i === 0 ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' });
      const dayRevenue = analyticsOrders
        .filter(o => {
          const date = typeof o.createdAt?.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
          return date >= d && date < nextD;
        })
        .reduce((s, o) => s + (o.total ?? 0), 0);
      days.push({ label, rev: dayRevenue, isToday: i === 0 });
    }
    return days;
  }, [analyticsOrders]);

  // End-of-day revenue projection based on current hourly pace
  const eodProjection = useMemo(() => {
    const now = new Date();
    const hoursElapsed = Math.max(0.5, now.getHours() - 9 + now.getMinutes() / 60);
    if (todayStats.totalSales === 0 || hoursElapsed >= 14) return null;
    return Math.round((todayStats.totalSales / hoursElapsed) * 14);
  }, [todayStats.totalSales]);

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
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const todayBilled = docs.filter(d => (d.status === 'billed' || (d.paymentMethod && d.paymentMethod !== 'unpaid')) && d.status !== 'cancelled');
      const todayOpen = docs.filter(d => d.status !== 'billed' && (!d.paymentMethod || d.paymentMethod === 'unpaid') && d.status !== 'cancelled');

      const billedSales = todayBilled.reduce((s, d) => s + (d.total ?? 0), 0);
      const openSales = todayOpen.reduce((s, d) => s + (d.total ?? 0), 0);
      const totalSales = billedSales + openSales;

      const billedOrders = todayBilled.length;
      const openOrders = todayOpen.length;
      const totalOrders = billedOrders + openOrders;
      
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

      // Top Item Today (across all orders today, billed and open)
      const itemCounts = {};
      docs.filter(d => d.status !== 'cancelled').forEach(o => {
        (o.items || []).forEach(i => {
          if (!itemCounts[i.name]) itemCounts[i.name] = { name: i.name, qty: 0, emoji: i.emoji || '🍽️' };
          itemCounts[i.name].qty += (i.qty || 1);
        });
      });
      const topItem = Object.values(itemCounts).sort((a,b) => b.qty - a.qty)[0] || null;

      // Track today's cancellations
      setCancellations(docs.filter(d => d.status === 'cancelled').length);

      setTodayStats({ 
        settledSales: billedSales,
        openSales,
        totalSales,
        sales: billedSales,
        orders: billedOrders,
        settledOrders: billedOrders,
        openOrders,
        totalOrders,
        avg: totalOrders ? totalSales / totalOrders : 0,
        avgCookTime,
        paymentSplit,
        topItem,
        tableTurnover: 0
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

  const displayedSales = salesViewMode === 'pipeline' ? todayStats.totalSales : todayStats.settledSales;
  const displayedOrders = salesViewMode === 'pipeline' ? todayStats.totalOrders : todayStats.settledOrders;
  const displayedAvg = displayedOrders ? displayedSales / displayedOrders : 0;

  // Yesterday comparison delta (positive = growth, negative = decline)
  const salesDelta = yesterdayStats.sales > 0
    ? Number(((displayedSales - yesterdayStats.sales) / yesterdayStats.sales * 100).toFixed(1))
    : null;

  const stats = [
    { 
      label: "Today's Sales", 
      value: formatCurrency(displayedSales, currency), 
      icon: TrendingUp, 
      color: '#10b981', 
      bg: 'rgba(16, 185, 129, 0.1)', 
      desc: todayStats.openSales > 0
        ? (salesViewMode === 'pipeline'
            ? `₹${todayStats.settledSales.toFixed(0)} billed · ₹${todayStats.openSales.toFixed(0)} live dining`
            : `+ ₹${todayStats.openSales.toFixed(0)} open in kitchen`)
        : 'Gross revenue today', 
      highlight: true,
      hasToggle: todayStats.openSales > 0
    },
    { 
      label: 'Orders Today', 
      value: displayedOrders, 
      icon: ShoppingCart, 
      color: '#3b82f6', 
      bg: 'rgba(59, 130, 246, 0.1)', 
      desc: todayStats.openOrders > 0 
        ? `${todayStats.settledOrders} completed · ${todayStats.openOrders} dining`
        : 'Completed orders' 
    },
    { 
      label: 'Avg. Bill Size',   
      value: formatCurrency(displayedAvg, currency), 
      icon: CheckCircle2, 
      color: '#f59e0b', 
      bg: 'rgba(245, 158, 11, 0.1)', 
      desc: 'Order ticket average', 
      tooltip: 'The typical amount a customer spends per order' 
    },
    { 
      label: 'Orders Cooking',   
      value: activeOrders.length, 
      icon: Clock, 
      color: '#8b5cf6', 
      bg: 'rgba(139, 92, 246, 0.1)', 
      desc: 'POS orders in progress', 
      tooltip: 'Orders currently being prepared in the kitchen' 
    },
    { 
      label: 'Waiting Online Orders', 
      value: unreadOnlineCount, 
      icon: Globe, 
      color: '#06b6d4', 
      bg: 'rgba(6, 182, 212, 0.1)', 
      desc: 'Unread online orders', 
      tooltip: 'Orders from Zomato/Swiggy waiting to be accepted' 
    },
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

        <button
          type="button"
          className="advisor-trigger-btn"
          onClick={() => setShowAiAdvisor(true)}
          title="Open Business Advisor"
        >
          <span className="advisor-btn-icon">
            <Bot size={14} />
          </span>
          <span>Advisor</span>
          <span className="advisor-btn-badge">AI</span>
        </button>
      </div>

      {/* Stat Cards — 2-column compact grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '10px'
      }}>
        {stats.map((s, i) => (
          <div
            key={i}
            className="animate-fade-in"
            style={{
              animationDelay: `${i * 50}ms`,
              gridColumn: i === 0 ? '1 / -1' : 'auto',
              background: s.highlight
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'var(--color-bg-elevated)',
              color: s.highlight ? '#fff' : 'inherit',
              borderRadius: '14px',
              padding: i === 0 ? '16px 18px' : '13px 14px',
              boxShadow: s.highlight
                ? '0 8px 20px -4px rgba(5, 150, 105, 0.32)'
                : '0 1px 3px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease',
              cursor: 'default',
              border: s.highlight ? 'none' : '1px solid var(--color-separator)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = s.highlight
                ? '0 12px 24px -4px rgba(5, 150, 105, 0.42)'
                : '0 4px 12px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = s.highlight
                ? '0 8px 20px -4px rgba(5, 150, 105, 0.32)'
                : '0 1px 3px rgba(0,0,0,0.06)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: s.highlight ? 'rgba(255,255,255,0.75)' : 'var(--color-label-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {s.label}
                {s.tooltip && <InfoTooltip text={s.tooltip} size={11} />}
              </span>
              <div style={{
                background: s.highlight ? 'rgba(255,255,255,0.18)' : s.bg,
                padding: '5px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <s.icon size={14} color={s.highlight ? '#fff' : s.color} strokeWidth={2.5} />
              </div>
            </div>

            <div style={{
              fontSize: i === 0 ? '26px' : '20px',
              fontWeight: 800,
              lineHeight: 1.1,
              marginTop: '2px',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '6px'
            }}>
              <span>{loading ? <div className="skeleton" style={{ height: i === 0 ? 26 : 20, width: 72, borderRadius: 5, background: s.highlight ? 'rgba(255,255,255,0.2)' : undefined }} /> : s.value}</span>
              {s.hasToggle && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSalesViewMode(v => v === 'pipeline' ? 'settled' : 'pipeline');
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.35)',
                    borderRadius: '999px',
                    padding: '2px 7px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <Zap size={10} fill="#fff" />
                  {salesViewMode === 'pipeline' ? 'Live' : 'Settled'}
                </button>
              )}
            </div>

            <span style={{
              fontSize: '10px',
              color: s.highlight ? 'rgba(255,255,255,0.8)' : 'var(--color-label-tertiary)',
              marginTop: '1px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {s.desc}
            </span>
          </div>
        ))}
      </div>

      {/* ── Owner Intelligence Row ── */}
      {(salesDelta !== null || eodProjection !== null || cancellations > 0 || reservationsToday.count > 0 || weeklySparkline.some(d => d.rev > 0)) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>

          {/* Yesterday delta */}
          {salesDelta !== null && (
            <div style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-separator)',
              borderRadius: '12px',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {salesDelta >= 0 ? <ArrowUp size={11} color="#10b981" /> : <ArrowDown size={11} color="#ef4444" />}
                vs Yesterday
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: salesDelta >= 0 ? '#10b981' : '#ef4444', lineHeight: 1.2, marginTop: '4px' }}>
                {salesDelta >= 0 ? '+' : ''}{salesDelta}%
              </div>
              <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', marginTop: '2px' }}>{formatCurrency(yesterdayStats.sales, currency)}</div>
            </div>
          )}

          {/* EOD projection */}
          {eodProjection !== null && (
            <div style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-separator)',
              borderRadius: '12px',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <TrendingUp size={11} color="#8b5cf6" /> Projected
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#8b5cf6', lineHeight: 1.2, marginTop: '4px' }}>{formatCurrency(eodProjection, currency)}</div>
              <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', marginTop: '2px' }}>at current pace</div>
            </div>
          )}

          {/* Cancellations */}
          {cancellations > 0 && (
            <div style={{
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: '12px',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <XCircle size={11} color="#ef4444" /> Cancelled
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444', lineHeight: 1.2, marginTop: '4px' }}>{cancellations}</div>
              <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', marginTop: '2px' }}>today</div>
            </div>
          )}

          {/* Reservations */}
          {reservationsToday.count > 0 && (
            <div style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-separator)',
              borderRadius: '12px',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CalendarClock size={11} color="#3b82f6" /> Reservations
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#3b82f6', lineHeight: 1.2, marginTop: '4px' }}>{reservationsToday.count}</div>
              {reservationsToday.next && (
                <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {reservationsToday.next.customerName || reservationsToday.next.name || 'Guest'}{reservationsToday.next.time ? ` @ ${reservationsToday.next.time}` : ''}
                </div>
              )}
            </div>
          )}

          {/* 7-day sparkline */}
          {weeklySparkline.some(d => d.rev > 0) && (
            <div style={{
              gridColumn: 'span 2',
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-separator)',
              borderRadius: '12px',
              padding: '12px 14px'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>7-Day Revenue</div>
              <ResponsiveContainer width="100%" height={36}>
                <BarChart data={weeklySparkline} barSize={12} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Bar dataKey="rev" radius={[3, 3, 0, 0]}>
                    {weeklySparkline.map((entry, index) => (
                      <Cell key={index} fill={entry.isToday ? '#10b981' : 'var(--color-fill-secondary)'} />
                    ))}
                  </Bar>
                  <Tooltip
                    cursor={false}
                    content={({ active, payload }) => {
                      if (active && payload?.[0]) {
                        return (
                          <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-separator)', padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>
                            {payload[0].payload.label}: {formatCurrency(payload[0].value, currency)}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                {weeklySparkline.map((d, i) => (
                  <span key={i} style={{ fontSize: '9px', color: d.isToday ? '#10b981' : 'var(--color-label-tertiary)', fontWeight: d.isToday ? 700 : 400 }}>{d.label}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's 3 Action Items */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', border: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-label)' }}>
          <Lightbulb size={16} color="var(--color-orange)" /> Today's Action Items
          <InfoTooltip text="Smart tips based on your live restaurant data today." />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {todayStats.openOrders > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '13px', padding: '10px 12px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #f59e0b', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <Zap size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                <div>
                  <strong>{todayStats.openOrders} dining orders active ({formatCurrency(todayStats.openSales, currency)}):</strong> 
                  {' '}Kitchen in progress. Quick Settle is available when guests request the bill.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const firstOpen = activeOrders.find(o => o.status !== 'billed' && (!o.paymentMethod || o.paymentMethod === 'unpaid'));
                  if (firstOpen) setSettleOrderModal(firstOpen);
                  else window.location.href = '/orders';
                }}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}
              >
                <Zap size={12} /> Settle Order
              </button>
            </div>
          )}
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
          {cancellations > 1 && (
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid #dc2626' }}>
              <XCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
              <div><strong>{cancellations} cancellations today ({Math.round(cancellations / Math.max(1, todayStats.totalOrders + cancellations) * 100)}%):</strong> Review if wait times, out-of-stock items, or payment issues are causing drops.</div>
            </div>
          )}
          {todayStats.tableTurnover < 2 && tablesCount > 0 && todayStats.orders > 5 && (
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '10px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-orange)' }}>
              <Clock size={16} color="var(--color-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div><strong>Tables are turning slowly:</strong> Customers are staying longer. Ask staff to clear empty plates faster to free up tables for new walk-ins.</div>
            </div>
          )}
          {todayStats.openOrders === 0 && cancellations <= 1 && (!todayStats.avgCookTime || todayStats.avgCookTime <= 20) && (!todayStats.paymentSplit.upi || todayStats.paymentSplit.upi <= (todayStats.orders * 0.5)) && (todayStats.tableTurnover >= 2 || tablesCount === 0 || todayStats.orders <= 5) && (
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: '10px'
        }}>
          {/* Avg Kitchen Time */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)', color: 'var(--color-label)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <Clock size={13} /> Avg Kitchen Time
              <InfoTooltip text="How long it takes the kitchen to prepare an order on average today" />
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-label)' }}>
              {todayStats.avgCookTime > 0 ? `${todayStats.avgCookTime} mins` : 'N/A'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)' }}>Based on today's kitchen workflow</div>
          </div>

          {/* Times per Table */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)', color: 'var(--color-label)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <TrendingUp size={13} /> Times per Table
              <InfoTooltip text="How many groups of customers sat at each table today on average" />
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--color-label)' }}>
              {tablesCount > 0 ? (todayStats.orders / tablesCount).toFixed(1) : '0'} 
              <span style={{ fontSize: '13px', color: 'var(--color-label-secondary)', fontWeight: 600, marginLeft: 4 }}>orders/table</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)' }}>Average turns per table today</div>
          </div>

          {/* How Customers Paid */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)', color: 'var(--color-label)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <Percent size={13} /> How Customers Paid
              <InfoTooltip text="Percentage breakdown of payment methods used today" />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              {(() => {
                const total = todayStats.orders || 1;
                const p = todayStats.paymentSplit || { cash: 0, card: 0, upi: 0 };
                return (
                  <>
                    <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-bg-secondary)', padding: '6px 4px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>{Math.round((p.cash / total) * 100)}%</div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-label-secondary)', marginTop: '2px' }}>CASH</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-bg-secondary)', padding: '6px 4px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8' }}>{Math.round((p.card / total) * 100)}%</div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-label-secondary)', marginTop: '2px' }}>CARD</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', background: 'var(--color-bg-secondary)', padding: '6px 4px', borderRadius: '8px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#a855f7' }}>{Math.round((p.upi / total) * 100)}%</div>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-label-secondary)', marginTop: '2px' }}>UPI</div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Top Item Today */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)', color: 'var(--color-label)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
              <Flame size={13} color="#f59e0b" /> Top Item Today
            </div>
            {todayStats.topItem ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                <div style={{ fontSize: '24px' }}>{todayStats.topItem.emoji}</div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-label)' }}>{todayStats.topItem.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>{todayStats.topItem.qty} orders today</div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--color-label-tertiary)', marginTop: '6px' }}>No items sold yet</div>
            )}
          </div>

          {/* Today's Reservations — surfaces data from Reservations module */}
          {reservationsToday.count > 0 && (
            <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-separator)', color: 'var(--color-label)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>
                <CalendarClock size={13} color="#38bdf8" /> Reservations Today
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#38bdf8' }}>{reservationsToday.count}</div>
              {reservationsToday.next ? (
                <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                  Next: <strong>{reservationsToday.next.customerName || reservationsToday.next.name || 'Guest'}</strong>
                  {reservationsToday.next.guests && ` · ${reservationsToday.next.guests} guests`}
                  {reservationsToday.next.time && ` @ ${reservationsToday.next.time}`}
                </div>
              ) : (
                <div style={{ fontSize: '10px', color: 'var(--color-label-tertiary)' }}>All reservations for today</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Main Ops vs Insights */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--space-5)',
        alignItems: 'start',
        minWidth: 0,
        width: '100%'
      }}>
        
        {/* Left Column (Main POS details: Active Orders + Peak Hours) */}
        <div style={{ flex: '1 1 360px', minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          
          {/* Active Orders Card */}
          <div className="card" style={{ border: '1px solid var(--color-separator)', boxShadow: 'var(--shadow-md)', borderRadius: 'var(--radius-xl)', minWidth: 0 }}>
            <div className="card-header" style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-separator)' }}>
              <span className="card-title" style={{ fontSize: 'var(--text-title3)', fontWeight: 700 }}>Active Orders</span>
              <span className="badge badge-blue" style={{ fontSize: '11px', fontWeight: 700 }}>{activeOrders.length}</span>
            </div>
            <div style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
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
                      {['Order ID', 'Type', 'Table/Token', 'Items', 'Total', 'Status', 'Action'].map(h => (
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
                        <td style={{ padding: 'var(--space-3) var(--space-5)' }}>
                          {o.status !== 'billed' && (!o.paymentMethod || o.paymentMethod === 'unpaid') ? (
                            <button
                              onClick={() => setSettleOrderModal(o)}
                              className="btn btn-sm"
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '4px 10px',
                                background: '#10b981',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(16,185,129,0.3)'
                              }}
                            >
                              <Zap size={11} fill="#fff" /> Settle
                            </button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <Check size={12} color="#10b981" /> Paid
                            </span>
                          )}
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
            className="card card-padded dashboard-insights-card"
          >
            <h3 className="text-title3 dashboard-insights-title" style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Lightbulb size={20} strokeWidth={2.5} />
              <span>Business Growth Insights</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {growthTips.map((tip, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
                  <div className="dashboard-insights-icon-box" style={{
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
                    <h4 className="dashboard-insights-tip-title" style={{ margin: 0, fontSize: '13px', fontWeight: 700 }}>{tip.title}</h4>
                    <p className="dashboard-insights-tip-desc" style={{ margin: '3px 0 0 0', fontSize: '12px', lineHeight: '1.45', fontWeight: 500 }}>
                      {tip.description.split('**').map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
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

      {/* Quick Settle Modal */}
      {settleOrderModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !settling && setSettleOrderModal(null)}>
          <div className="modal" style={{ maxWidth: '420px', borderRadius: 'var(--radius-xl)' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} color="#10b981" />
                </div>
                <div>
                  <h2 className="modal-title" style={{ fontSize: '16px', fontWeight: 800 }}>
                    Quick Settle Order
                  </h2>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                    {settleOrderModal.tableName ? `Table ${settleOrderModal.tableName}` : (settleOrderModal.token ? `Token #${settleOrderModal.token}` : `#${settleOrderModal.id.slice(-6).toUpperCase()}`)}
                  </p>
                </div>
              </div>
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={() => !settling && setSettleOrderModal(null)}
                disabled={settling}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                textAlign: 'center',
                border: '1px solid var(--color-separator)'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                  Total Bill Amount
                </div>
                <div style={{ fontSize: '32px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                  {formatCurrency(settleOrderModal.total, settleOrderModal.currency || currency)}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-label-tertiary)', marginTop: '4px' }}>
                  {(settleOrderModal.items || []).length} items · {settleOrderModal.type || 'dine-in'}
                </div>
              </div>

              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Select Payment Method
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <button
                  type="button"
                  disabled={settling}
                  onClick={() => handleQuickSettle(settleOrderModal, 'cash')}
                  className="btn"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '14px 8px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-separator)',
                    background: 'var(--color-bg-elevated)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#10b981'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-separator)'}
                >
                  <span style={{ fontSize: '20px' }}>💵</span>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>Cash</span>
                </button>

                <button
                  type="button"
                  disabled={settling}
                  onClick={() => handleQuickSettle(settleOrderModal, 'upi')}
                  className="btn"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '14px 8px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-separator)',
                    background: 'var(--color-bg-elevated)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#8b5cf6'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-separator)'}
                >
                  <span style={{ fontSize: '20px' }}>📱</span>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>UPI / QR</span>
                </button>

                <button
                  type="button"
                  disabled={settling}
                  onClick={() => handleQuickSettle(settleOrderModal, 'card')}
                  className="btn"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '14px 8px',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-separator)',
                    background: 'var(--color-bg-elevated)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-separator)'}
                >
                  <span style={{ fontSize: '20px' }}>💳</span>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>Card</span>
                </button>
              </div>

              {settling && (
                <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                  Settling order & releasing table...
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setSettleOrderModal(null)}
                disabled={settling}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Business Advisor Modal */}
      <AiBusinessAdvisorModal
        isOpen={showAiAdvisor}
        onClose={() => setShowAiAdvisor(false)}
        orders={analyticsOrders}
        menuItems={menuItems}
        restaurant={restaurant}
        periodLabel="Last 7 Days"
      />
    </div>
  );
}
