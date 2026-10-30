import { useEffect, useState, useMemo, memo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useMenuStore } from '../stores/menuStore';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { getOrderTimestampMs } from '../utils/timezoneUtils';
import { formatCurrency } from '../utils/formatCurrency';
import { collection, query, where, orderBy, onSnapshot, getDocs, limit, writeBatch, serverTimestamp, doc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShoppingCart, TrendingUp, Clock, CheckCircle2,
  Sparkles, Lightbulb, Flame, Snowflake, Percent, Calendar, AlertCircle,
  Zap, X, Check, ArrowUp, ArrowDown, CalendarClock, XCircle, Bot,
  Wallet
} from 'lucide-react';
import toast from 'react-hot-toast';
import InfoTooltip from '../components/shared/InfoTooltip';
import AiBusinessAdvisorModal from '../components/analytics/AiBusinessAdvisorModal';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Tooltip
} from 'recharts';

const LiveDateTime = memo(function LiveDateTime() {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14.5px', fontWeight: 600, color: 'var(--color-label-secondary)' }}>
        <Calendar size={15} style={{ color: 'var(--color-label-tertiary)' }} />
        {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </span>
      <span style={{ color: 'var(--color-separator-opaque, rgba(255,255,255,0.25))', fontSize: '13px' }}>•</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14.5px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-label)' }}>
        <Clock size={15} style={{ color: 'var(--color-accent, #3b82f6)' }} />
        {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
      </span>
    </div>
  );
});

export default function Dashboard() {
  const restaurant = useAuthStore(s => s.restaurant);
  const staffDoc = useAuthStore(s => s.staffDoc);
  const user = useAuthStore(s => s.user);

  // Role access control: Only admin/super_admin and explicitly permitted cashiers may access turnover analytics
  const staffRole = staffDoc?.role ?? (user ? 'admin' : 'cashier');
  const canAccessDashboard = ['admin', 'super_admin', 'manager'].includes(staffRole) || 
    (staffRole === 'cashier' && Boolean(restaurant?.allowCashierDashboard));

  const activeOrders = useOrderStore(s => s.activeOrders);

  // Auto-filter out completed orders: an order is done if it is billed OR (paid AND food is ready)
  const displayedActiveOrders = useMemo(() => {
    return activeOrders.filter(o => {
      if (['billed', 'cancelled', 'completed'].includes(o.status)) return false;
      const isPaid = o.paid === true || (o.paymentMethod && o.paymentMethod !== 'unpaid');
      const allItemsReady = (o.items || []).length > 0 && o.items.every(i => i.status === 'ready');
      if (isPaid && (o.status === 'ready' || allItemsReady)) return false;
      return true;
    });
  }, [activeOrders]);

  // Synchronize live open dining figures directly with displayed active orders
  const liveOpenSales = useMemo(() => {
    return Math.round(displayedActiveOrders.reduce((s, o) => s + (Number(o.total) || 0), 0) * 100) / 100;
  }, [displayedActiveOrders]);
  const liveOpenOrders = displayedActiveOrders.length;

  // Detect unclosed tabs from prior shifts (created before 12:00 AM today)
  const priorShiftOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfTodayMs = today.getTime();
    return displayedActiveOrders.filter(o => {
      const ts = getOrderTimestampMs(o);
      return ts && ts < startOfTodayMs;
    });
  }, [displayedActiveOrders]);

  const [archivingPriorShift, setArchivingPriorShift] = useState(false);
  const handleArchivePriorShiftOrders = async () => {
    if (!priorShiftOrders.length || !restaurant?.id) return;
    try {
      setArchivingPriorShift(true);
      const batch = writeBatch(db);
      priorShiftOrders.forEach(o => {
        const oRef = doc(db, 'restaurants', restaurant.id, 'orders', o.id);
        batch.update(oRef, {
          status: 'completed',
          autoArchived: true,
          archivedReason: 'prior_shift_dashboard_cleanup',
          archivedAt: serverTimestamp()
        });
        if (o.tableId) {
          const tRef = doc(db, 'restaurants', restaurant.id, 'tables', o.tableId);
          batch.update(tRef, {
            status: 'free',
            currentOrderId: null,
            activeOrderId: null
          });
        }
      });
      await batch.commit();
      toast.success(`Archived ${priorShiftOrders.length} prior-shift tab(s) and freed tables!`, { icon: '🧹' });
    } catch (err) {
      toast.error('Failed to archive prior-shift tabs: ' + err.message);
    } finally {
      setArchivingPriorShift(false);
    }
  };

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
    dineInOrders: 0,
    takeawayOrders: 0,
    onlineOrders: 0,
    avg: 0, 
    avgCookTime: 0, 
    tableTurnover: 0, 
    topItem: null, 
    paymentSplit: { cash: 0, card: 0, upi: 0, split: 0 },
    paymentAmountSplit: { cash: 0, card: 0, upi: 0 }
  });
  const [salesViewMode, setSalesViewMode] = useState('settled'); // 'settled' | 'pipeline'
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
      // Close modal immediately for instant, zero-delay UX
      setSettleOrderModal(null);
      const label = order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : `#${order.id.slice(-6).toUpperCase()}`);
      toast.success(`${label} settled for ${formatCurrency(order.total, currency)} via ${method.toUpperCase()}!`, { icon: '💰' });
      await settleOrder(restaurant.id, order.id, method, order.total);
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
        cat.items.forEach(item => {
          allItems.push({ ...item, category: item.category || cat.name });
        });
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
      const dayRevenue = i === 0
        ? (salesViewMode === 'open' ? todayStats.openSales : (salesViewMode === 'pipeline' ? todayStats.totalSales : todayStats.settledSales))
        : analyticsOrders
            .filter(o => {
              const date = typeof o.createdAt?.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
              return date >= d && date < nextD;
            })
            .reduce((s, o) => s + (o.total ?? 0), 0);
      days.push({ label, rev: dayRevenue, isToday: i === 0 });
    }
    return days;
  }, [analyticsOrders, salesViewMode, todayStats.totalSales, todayStats.settledSales, todayStats.openSales]);


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
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    // Look back to start of yesterday to include any orders created yesterday before midnight but settled today (e.g. late night tables)
    const queryStart = new Date(today);
    queryStart.setDate(queryStart.getDate() - 1);
    
    // Subscribe to recent orders in real-time, ordered by most recent first
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', queryStart),
      orderBy('createdAt', 'desc'),
      limit(500)
    );
    
    // Also get total tables count for turnover calculation
    getDocs(collection(db, 'restaurants', restaurant.id, 'tables')).then(snap => {
      setTablesCount(snap.size || 0);
    }).catch(e => console.error(e));

    const computeTodayStats = (rawDocs) => {
      // Merge local offline orders & active orders so local-only mode and offline sales are fully reflected
      const offlineOrders = (useOfflineQueueStore.getState().queue || []).filter(o => {
        const orderTime = getOrderTimestampMs(o);
        const matchesRest = o.restaurantId === restaurant.id || !o.restaurantId;
        return matchesRest && (!orderTime || (orderTime >= today.getTime() && orderTime <= endOfToday.getTime()));
      });
      // All active in-memory orders currently open in dining/kitchen are live orders regardless of midnight date boundaries
      const activeMemOrders = (useOrderStore.getState().activeOrders || []).filter(o => {
        const matchesRest = o.restaurantId === restaurant.id || !o.restaurantId;
        return matchesRest && o.status !== 'cancelled' && o.status !== 'void';
      });

      const existingIds = new Set(rawDocs.map(d => d.id));
      const combined = [
        ...rawDocs,
        ...offlineOrders.filter(o => !existingIds.has(o.id)),
        ...activeMemOrders.filter(o => !existingIds.has(o.id))
      ];

      // Settle timestamp check: order counts as today's sale if paidAt/updatedAt/createdAt is within today
      const todayBilled = combined.filter(d => {
        if (d.status === 'cancelled' || d.status === 'void') return false;
        const isBilled = d.status === 'billed' || (d.paymentMethod && d.paymentMethod !== 'unpaid') || d.paid === true;
        if (!isBilled) return false;
        const settleTime = getOrderTimestampMs(d.paidAt) || getOrderTimestampMs(d.updatedAt) || getOrderTimestampMs(d.createdAt);
        return settleTime && settleTime >= today.getTime() && settleTime <= endOfToday.getTime();
      });

      // Open dining/kitchen orders: active in restaurant right now (unpaid and not cancelled/void)
      const todayOpen = combined.filter(d => {
        if (d.status === 'cancelled' || d.status === 'void' || d.status === 'billed') return false;
        if (d.paid === true || (d.paymentMethod && d.paymentMethod !== 'unpaid')) return false;
        const orderTime = getOrderTimestampMs(d);
        // Count if created today or currently in active in-memory orders
        return !orderTime || (orderTime >= today.getTime() && orderTime <= endOfToday.getTime()) || activeMemOrders.some(m => m.id === d.id);
      });

      const billedSales = Math.round(todayBilled.reduce((s, d) => s + (Number(d.total) || 0), 0) * 100) / 100;
      const billedOrders = todayBilled.length;
      const openSales = Math.round(todayOpen.reduce((s, d) => s + (Number(d.total) || 0), 0) * 100) / 100;
      const totalSales = Math.round((billedSales + openSales) * 100) / 100;

      const openOrders = todayOpen.length;
      const totalOrders = billedOrders + openOrders;
      
      // Calculate Avg Cook Time
      const ordersWithPrep = todayBilled.filter(d => d.prepDuration > 0);
      const avgCookTime = ordersWithPrep.length 
        ? Math.round(ordersWithPrep.reduce((s, d) => s + d.prepDuration, 0) / ordersWithPrep.length / 60) 
        : 0;

      // Calculate Channel Breakdown
      let dineInOrders = 0;
      let takeawayOrders = 0;
      let onlineOrders = 0;
      todayBilled.forEach(d => {
        if (d.type === 'dine-in' || d.tableName) dineInOrders++;
        else if (d.type === 'online') onlineOrders++;
        else takeawayOrders++;
      });

      // Calculate Payment Split & Amounts directly from today's billed orders without double-counting
      const paymentSplit = { cash: 0, card: 0, upi: 0, split: 0 };
      const paymentAmountSplit = { cash: 0, card: 0, upi: 0 };
      todayBilled.forEach(d => {
        const orderTotal = Number(d.total) || 0;
        if (d.paymentMethod === 'split' && Array.isArray(d.splitPayments)) {
          paymentSplit.split = (paymentSplit.split || 0) + 1;
          d.splitPayments.forEach(p => {
            const m = (p.method === 'terminal') ? 'card' : (p.method || 'cash');
            const amt = Number(p.amount) || 0;
            paymentSplit[m] = (paymentSplit[m] || 0) + 1;
            if (paymentAmountSplit[m] !== undefined) paymentAmountSplit[m] += amt;
            else paymentAmountSplit.cash += amt;
          });
        } else if (d.paymentMethod) {
          const methodKey = d.paymentMethod === 'terminal' ? 'card' : d.paymentMethod;
          paymentSplit[methodKey] = (paymentSplit[methodKey] || 0) + 1;
          if (paymentAmountSplit[methodKey] !== undefined) paymentAmountSplit[methodKey] += orderTotal;
          else paymentAmountSplit.cash += orderTotal;
        } else {
          paymentSplit.cash = (paymentSplit.cash || 0) + 1;
          paymentAmountSplit.cash += orderTotal;
        }
      });

      // Top Item Today (across all orders today, billed and open)
      const itemCounts = {};
      combined.filter(d => d.status !== 'cancelled' && d.status !== 'void').forEach(o => {
        (o.items || []).forEach(i => {
          if (!itemCounts[i.name]) itemCounts[i.name] = { name: i.name, qty: 0, emoji: i.emoji || '🍽️' };
          itemCounts[i.name].qty += (Number(i.qty) || 1);
        });
      });
      const topItem = Object.values(itemCounts).sort((a,b) => b.qty - a.qty)[0] || null;

      // Track today's cancellations
      setCancellations(combined.filter(d => d.status === 'cancelled' || d.status === 'void').length);

      setTodayStats({ 
        settledSales: billedSales,
        openSales,
        totalSales,
        sales: billedSales,
        orders: billedOrders,
        settledOrders: billedOrders,
        openOrders,
        totalOrders,
        dineInOrders,
        takeawayOrders,
        onlineOrders,
        avg: billedOrders ? billedSales / billedOrders : (totalOrders ? totalSales / totalOrders : 0),
        avgCookTime,
        paymentSplit,
        paymentAmountSplit,
        topItem,
        tableTurnover: tablesCount > 0 ? Number((billedOrders / tablesCount).toFixed(1)) : 0
      });
    };

    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      computeTodayStats(docs);
      setLoading(false);
    }, err => {
      console.warn("Dashboard real-time stream deferred, computing from local memory:", err);
      computeTodayStats([]);
      setLoading(false);
    });

    return unsub;
  }, [restaurant?.id, currentDateStr, tablesCount]);

  const effectiveOpenSales = liveOpenSales;
  const effectiveOpenOrders = liveOpenOrders;
  const effectiveTotalSales = Math.round((todayStats.settledSales + effectiveOpenSales) * 100) / 100;
  const effectiveTotalOrders = todayStats.settledOrders + effectiveOpenOrders;

  const displayedSales = salesViewMode === 'open'
    ? effectiveOpenSales
    : (salesViewMode === 'pipeline' ? effectiveTotalSales : todayStats.settledSales);
  const displayedOrders = salesViewMode === 'open'
    ? effectiveOpenOrders
    : (salesViewMode === 'pipeline' ? effectiveTotalOrders : todayStats.settledOrders);
  const displayedAvg = displayedOrders > 0 ? displayedSales / displayedOrders : 0;

  // Yesterday comparison delta (positive = growth, negative = decline)
  const salesDelta = yesterdayStats.sales > 0
    ? Number(((displayedSales - yesterdayStats.sales) / yesterdayStats.sales * 100).toFixed(1))
    : null;

  // Dynamic Sales Assistant Executive Summary
  const salesAssistantSummary = useMemo(() => {
    const ordersCount = salesViewMode === 'open'
      ? effectiveOpenOrders
      : (salesViewMode === 'pipeline' ? effectiveTotalOrders : todayStats.settledOrders);
    const salesTotal = salesViewMode === 'open'
      ? effectiveOpenSales
      : (salesViewMode === 'pipeline' ? effectiveTotalSales : todayStats.settledSales);

    if (todayStats.settledOrders === 0 && effectiveOpenOrders === 0) {
      return {
        headline: "Ready for Service",
        message: "No orders placed or settled yet today (Shift: 12:00 AM – Present). Revenue, live table metrics, and kitchen efficiency will appear here as soon as orders are punched."
      };
    }

    if (salesViewMode === 'settled' && todayStats.settledOrders === 0 && effectiveOpenOrders > 0) {
      const topItemSnippet = todayStats.topItem ? ` Top item ordered so far is ${todayStats.topItem.name} (${todayStats.topItem.qty} items).` : '';
      return {
        headline: "Service in Progress",
        message: `No customer checks have been settled yet today. Currently, ${effectiveOpenOrders} dining table${effectiveOpenOrders > 1 ? 's are' : ' is'} active with ${formatCurrency(effectiveOpenSales, currency)} unbilled in service.${topItemSnippet}`
      };
    }

    const deltaText = salesDelta !== null && salesViewMode === 'settled'
      ? (salesDelta >= 0 ? ` (+${salesDelta}% vs yesterday)` : ` (${salesDelta}% vs yesterday)`)
      : '';

    const topItemText = todayStats.topItem
      ? ` Top item is ${todayStats.topItem.name} (${todayStats.topItem.qty} ordered).`
      : '';

    const activeDiningText = effectiveOpenOrders > 0
      ? ` ${effectiveOpenOrders} dining table${effectiveOpenOrders > 1 ? 's' : ''} currently active (${formatCurrency(effectiveOpenSales, currency)} unbilled in service).`
      : ' All active dining tables are settled and closed.';

    const modeLabel = salesViewMode === 'open'
      ? 'Live active tabs stand at'
      : (salesViewMode === 'pipeline' ? 'Total shift pipeline stands at' : 'Settled revenue stands at');

    return {
      headline: "Today's Pulse",
      message: `${modeLabel} ${formatCurrency(salesTotal, currency)} across ${ordersCount} order${ordersCount !== 1 ? 's' : ''}${deltaText}.${topItemText}${activeDiningText}`
    };
  }, [salesViewMode, todayStats, effectiveOpenOrders, effectiveOpenSales, effectiveTotalOrders, effectiveTotalSales, salesDelta, currency]);

  // Payment Reconciliation Percentages & Totals
  const paymentReconciliation = useMemo(() => {
    const amt = todayStats.paymentAmountSplit || { cash: 0, card: 0, upi: 0 };
    const totalAmt = (amt.cash + amt.card + amt.upi) || 1;
    const upiPct = Math.round((amt.upi / totalAmt) * 100);
    const cashPct = Math.round((amt.cash / totalAmt) * 100);
    const cardPct = Math.max(0, 100 - upiPct - cashPct);

    return {
      amt,
      upiPct: amt.upi > 0 ? upiPct : 0,
      cashPct: amt.cash > 0 ? cashPct : 0,
      cardPct: amt.card > 0 ? cardPct : 0,
      totalAmt: todayStats.settledSales
    };
  }, [todayStats.paymentAmountSplit, todayStats.settledSales]);

  const orderStatusColors = {
    pending:   'badge-yellow',
    preparing: 'badge-blue',
    ready:     'badge-teal',
    served:    'badge-green',
    billed:    'badge-gray',
  };

  const orderStatusLabels = {
    pending:   'In Kitchen',
    preparing: 'Cooking',
    ready:     'Ready',
    served:    'Served',
    billed:    'Completed',
  };

  if (!canAccessDashboard) {
    const targetRoute = staffRole === 'kitchen' ? '/kds' : (['waiter', 'server'].includes(staffRole) ? '/tables' : '/pos');
    return <Navigate to={targetRoute} replace />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Date & Time Header with Shift Scope Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h1 className="sr-only">Dashboard</h1>
          <LiveDateTime />
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator)',
              borderRadius: '999px',
              padding: '3px 10px',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--color-label-secondary)'
            }}
            title="Dashboard metrics reflect today's service shift (12:00 AM to present)"
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            <span>Shift: Today (12:00 AM – Present)</span>
          </div>
        </div>
      </div>

      {/* Prior Shift Stale Tabs Notice Banner */}
      {priorShiftOrders.length > 0 && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={20} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#ef4444' }}>
                {priorShiftOrders.length} Unclosed Tab{priorShiftOrders.length > 1 ? 's' : ''} from Previous Shift ({formatCurrency(priorShiftOrders.reduce((s, o) => s + (Number(o.total) || 0), 0), currency)})
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                These guest checks were created before today's shift (12:00 AM) and are still occupying tables or holding tickets.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleArchivePriorShiftOrders}
            disabled={archivingPriorShift}
            className="btn btn-sm"
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '12px',
              padding: '6px 14px',
              cursor: 'pointer'
            }}
          >
            {archivingPriorShift ? 'Archiving...' : 'Archive Prior Shift Tabs'}
          </button>
        </div>
      )}

      {/* 1. Executive Sales Assistant Hero Briefing */}
      <div className="sales-assistant-hero animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 360px', minWidth: 0 }}>
          <div className="sales-assistant-avatar-wrap">
            <Bot size={22} />
            <div className="sales-assistant-pulse-dot" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#10b981' }}>
                Sales Assistant
              </span>
              <span className="badge badge-teal" style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px' }}>
                {salesAssistantSummary.headline}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.45', color: 'var(--color-label)', fontWeight: 500 }}>
              {salesAssistantSummary.message}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowAiAdvisor(true)}
            className="btn btn-primary btn-sm"
            style={{
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Sparkles size={13} fill="#fff" /> Ask Assistant
          </button>
        </div>
      </div>

      {/* Sales Scope Segmented Controller */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div
          role="group"
          aria-label="Sales Scope"
          style={{
            display: 'inline-flex',
            background: 'var(--color-bg-secondary)',
            padding: '3px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-separator)',
            gap: '3px',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            onClick={() => setSalesViewMode('settled')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              fontWeight: salesViewMode === 'settled' ? 700 : 500,
              background: salesViewMode === 'settled' ? 'var(--color-bg-elevated)' : 'transparent',
              color: salesViewMode === 'settled' ? 'var(--color-label)' : 'var(--color-label-secondary)',
              border: salesViewMode === 'settled' ? '1px solid var(--color-separator)' : 'none',
              boxShadow: salesViewMode === 'settled' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
            <span>💰 Settled Revenue</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: salesViewMode === 'settled' ? '#10b981' : 'var(--color-label-tertiary)' }}>
              ({formatCurrency(todayStats.settledSales, currency)})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSalesViewMode('open')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              fontWeight: salesViewMode === 'open' ? 700 : 500,
              background: salesViewMode === 'open' ? 'var(--color-bg-elevated)' : 'transparent',
              color: salesViewMode === 'open' ? 'var(--color-label)' : 'var(--color-label-secondary)',
              border: salesViewMode === 'open' ? '1px solid var(--color-separator)' : 'none',
              boxShadow: salesViewMode === 'open' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
            <span>⚡ Live Open Tabs</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: salesViewMode === 'open' ? '#f59e0b' : 'var(--color-label-tertiary)' }}>
              ({formatCurrency(effectiveOpenSales, currency)})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSalesViewMode('pipeline')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '12px',
              fontWeight: salesViewMode === 'pipeline' ? 700 : 500,
              background: salesViewMode === 'pipeline' ? 'var(--color-bg-elevated)' : 'transparent',
              color: salesViewMode === 'pipeline' ? 'var(--color-label)' : 'var(--color-label-secondary)',
              border: salesViewMode === 'pipeline' ? '1px solid var(--color-separator)' : 'none',
              boxShadow: salesViewMode === 'pipeline' ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
            <span>📊 Gross Shift Total</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: salesViewMode === 'pipeline' ? '#3b82f6' : 'var(--color-label-tertiary)' }}>
              ({formatCurrency(effectiveTotalSales, currency)})
            </span>
          </button>
        </div>

        <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
          {salesViewMode === 'settled' && 'Viewing finalized, paid revenue collected today.'}
          {salesViewMode === 'open' && 'Viewing active, unbilled tables currently in service.'}
          {salesViewMode === 'pipeline' && 'Viewing full shift potential (settled sales + live open tabs).'}
        </span>
      </div>

      {/* 2. Core 4 Sales Vitals Grid: Crystal Separation of Settled Revenue & Live Tabs */}
      <div className="sales-vitals-grid">
        {/* Vital 1: Settled Revenue (Finalized) */}
        <div
          className={`sales-vital-card animate-fade-in ${salesViewMode === 'settled' ? 'sales-vital-active' : ''}`}
          style={{
            animationDelay: '0ms',
            border: salesViewMode === 'settled' ? '2px solid #10b981' : '1px solid var(--color-separator)',
            cursor: 'pointer'
          }}
          onClick={() => setSalesViewMode('settled')}
          role="button"
          tabIndex={0}
          title="Click to focus on Settled Revenue"
        >
          <div className="sales-vital-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="sales-vital-label">
                Settled Revenue
                <InfoTooltip text="Finalized revenue from customer bills closed and paid for today." size={11} />
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: '#059669'
              }}>
                Paid &amp; Closed Today
              </span>
            </div>
            <div className="sales-vital-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
              <TrendingUp size={16} strokeWidth={2.5} />
            </div>
          </div>
          <div className="sales-vital-value" style={{ color: '#10b981' }}>
            {loading ? <div className="skeleton" style={{ height: 26, width: 90, borderRadius: 6 }} /> : formatCurrency(todayStats.settledSales, currency)}
          </div>
          <div className="sales-vital-sub">
            {salesDelta !== null ? (
              <span style={{ color: salesDelta >= 0 ? '#10b981' : '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                {salesDelta >= 0 ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />}
                {salesDelta >= 0 ? '+' : ''}{salesDelta}% vs yday · {todayStats.settledOrders} paid check{todayStats.settledOrders !== 1 ? 's' : ''}
              </span>
            ) : (
              <span style={{ color: 'var(--color-label-secondary)' }}>
                {todayStats.settledOrders} paid check{todayStats.settledOrders !== 1 ? 's' : ''} finalized today
              </span>
            )}
          </div>
        </div>

        {/* Vital 2: Live Dining Tabs (In Service) */}
        <div
          className={`sales-vital-card animate-fade-in ${salesViewMode === 'open' ? 'sales-vital-active' : ''}`}
          style={{
            animationDelay: '50ms',
            border: salesViewMode === 'open' ? '2px solid #f59e0b' : '1px solid var(--color-separator)',
            cursor: 'pointer'
          }}
          onClick={() => setSalesViewMode('open')}
          role="button"
          tabIndex={0}
          title="Click to focus on Live Open Tabs"
        >
          <div className="sales-vital-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="sales-vital-label">
                Live Open Tabs
                <InfoTooltip text="Total unbilled food & drinks currently ordered across active dining tables." size={11} />
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: '#d97706'
              }}>
                Active in Dining Room
              </span>
            </div>
            <div className="sales-vital-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
              <ShoppingCart size={16} strokeWidth={2.5} />
            </div>
          </div>
          <div className="sales-vital-value" style={{ color: '#d97706' }}>
            {loading ? <div className="skeleton" style={{ height: 26, width: 80, borderRadius: 6 }} /> : formatCurrency(effectiveOpenSales, currency)}
          </div>
          <div className="sales-vital-sub">
            <span style={{ color: 'var(--color-label-secondary)' }}>
              {effectiveOpenOrders} active dining table{effectiveOpenOrders !== 1 ? 's' : ''} in service
            </span>
          </div>
        </div>

        {/* Vital 3: Gross Shift Total */}
        <div
          className={`sales-vital-card animate-fade-in ${salesViewMode === 'pipeline' ? 'sales-vital-active' : ''}`}
          style={{
            animationDelay: '100ms',
            border: salesViewMode === 'pipeline' ? '2px solid #3b82f6' : '1px solid var(--color-separator)',
            cursor: 'pointer'
          }}
          onClick={() => setSalesViewMode('pipeline')}
          role="button"
          tabIndex={0}
          title="Click to focus on Combined Gross Shift"
        >
          <div className="sales-vital-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="sales-vital-label">
                Gross Shift Total
                <InfoTooltip text="Combined gross potential: today's settled checks plus currently active dining tabs." size={11} />
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: '#2563eb'
              }}>
                Settled + Open Tabs
              </span>
            </div>
            <div className="sales-vital-icon" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
              <CheckCircle2 size={16} strokeWidth={2.5} />
            </div>
          </div>
          <div className="sales-vital-value">
            {loading ? <div className="skeleton" style={{ height: 26, width: 90, borderRadius: 6 }} /> : formatCurrency(effectiveTotalSales, currency)}
          </div>
          <div className="sales-vital-sub">
            <span style={{ color: 'var(--color-label-secondary)' }}>
              {effectiveTotalOrders} total check{effectiveTotalOrders !== 1 ? 's' : ''} across shift
            </span>
          </div>
        </div>

        {/* Vital 4: Payment Reconciliation */}
        <div className="sales-vital-card animate-fade-in" style={{ animationDelay: '150ms' }}>
          <div className="sales-vital-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span className="sales-vital-label">
                Settled Funds
                <InfoTooltip text="Realized payment method breakdown of settled sales today." size={11} />
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: '#8b5cf6' }}>
                Reconciliation
              </span>
            </div>
            <div className="sales-vital-icon" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
              <Wallet size={16} strokeWidth={2.5} />
            </div>
          </div>
          <div className="sales-vital-value">
            {loading ? <div className="skeleton" style={{ height: 26, width: 90, borderRadius: 6 }} /> : formatCurrency(todayStats.settledSales, currency)}
          </div>
          {/* Segmented Reconciliation Bar */}
          <div className="sales-reconciliation-bar">
            {paymentReconciliation.upiPct > 0 && (
              <div className="sales-rec-segment" style={{ width: `${paymentReconciliation.upiPct}%`, background: '#8b5cf6' }} title={`UPI: ${formatCurrency(paymentReconciliation.amt.upi, currency)} (${paymentReconciliation.upiPct}%)`} />
            )}
            {paymentReconciliation.cashPct > 0 && (
              <div className="sales-rec-segment" style={{ width: `${paymentReconciliation.cashPct}%`, background: '#10b981' }} title={`Cash: ${formatCurrency(paymentReconciliation.amt.cash, currency)} (${paymentReconciliation.cashPct}%)`} />
            )}
            {paymentReconciliation.cardPct > 0 && (
              <div className="sales-rec-segment" style={{ width: `${paymentReconciliation.cardPct}%`, background: '#38bdf8' }} title={`Card: ${formatCurrency(paymentReconciliation.amt.card, currency)} (${paymentReconciliation.cardPct}%)`} />
            )}
          </div>
          <div className="sales-rec-legend">
            <span><span className="sales-rec-dot" style={{ background: '#8b5cf6' }} />UPI {paymentReconciliation.upiPct}%</span>
            <span><span className="sales-rec-dot" style={{ background: '#10b981' }} />Cash {paymentReconciliation.cashPct}%</span>
            <span><span className="sales-rec-dot" style={{ background: '#38bdf8' }} />Card {paymentReconciliation.cardPct}%</span>
          </div>
        </div>
      </div>

      {/* 3. Live Active Dining Orders (ONLY renders when orders are active) */}
      {displayedActiveOrders.length > 0 && (
        <div className="card" style={{ border: '1px solid var(--color-separator)', boxShadow: 'var(--shadow-sm)', borderRadius: '16px', overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-separator)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="card-title" style={{ fontSize: '15px', fontWeight: 800 }}>Live Active Dining</span>
              <span className="badge badge-blue" style={{ fontSize: '11px', fontWeight: 700 }}>{displayedActiveOrders.length}</span>
            </div>
            <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>
              Live Open Tabs: {formatCurrency(effectiveOpenSales, currency)} ({liveOpenOrders} active)
            </span>
          </div>

          {/* Desktop Table View */}
          <div className="desktop-only" style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}>
                  {['Order ID', 'Type', 'Table / Token', 'Items', 'Total', 'Status', 'Action'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px',
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
                {displayedActiveOrders.slice(0, 10).map((o) => (
                  <tr key={o.id} style={{
                    borderBottom: '1px solid var(--color-separator)',
                    transition: 'background var(--duration-fast)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                      #{o.id.slice(-6).toUpperCase()}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className={`badge ${o.type === 'online' ? 'badge-purple' : o.type === 'dine-in' ? 'badge-blue' : 'badge-orange'}`}>
                        {o.type}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600 }}>
                      {o.tableName ?? (o.token ? `#${o.token}` : '—')}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                      {(o.items ?? []).length} item(s)
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: '13px' }}>
                      {formatCurrency(o.total ?? 0, o.currency ?? currency)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span className={`badge ${orderStatusColors[o.status] ?? 'badge-gray'}`}>
                        {orderStatusLabels[o.status] ?? o.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
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
                        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Check size={12} color="#10b981" /> Paid
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="mobile-only" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayedActiveOrders.slice(0, 10).map(o => (
              <div 
                key={o.id}
                style={{
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-separator)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700 }}>
                      #{o.id.slice(-6).toUpperCase()}
                    </span>
                    <span className={`badge ${o.type === 'online' ? 'badge-purple' : o.type === 'dine-in' ? 'badge-blue' : 'badge-orange'}`} style={{ fontSize: '10px' }}>
                      {o.type}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>
                      {o.tableName ?? (o.token ? `#${o.token}` : '—')}
                    </span>
                  </div>
                  <span className={`badge ${orderStatusColors[o.status] ?? 'badge-gray'}`} style={{ fontSize: '10px' }}>
                    {orderStatusLabels[o.status] ?? o.status}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800 }}>{formatCurrency(o.total ?? 0, o.currency ?? currency)}</span>
                  {o.status !== 'billed' && (!o.paymentMethod || o.paymentMethod === 'unpaid') ? (
                    <button
                      onClick={() => setSettleOrderModal(o)}
                      className="btn btn-sm"
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        height: 32,
                        padding: '0 12px',
                        background: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      <Zap size={11} fill="#fff" /> Settle
                    </button>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>✓ Paid</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Two Column Layout: Executive Recommendations & Menu Velocity */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
        gap: 'var(--space-5)',
        alignItems: 'start'
      }}>
        {/* Left Column: Actionable Recommendations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="card card-padded dashboard-insights-card">
            <h3 className="text-title3 dashboard-insights-title" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Lightbulb size={18} strokeWidth={2.5} />
              <span>Sales &amp; Operational Recommendations</span>
              <span className="badge badge-purple" style={{ fontSize: '10px', fontWeight: 700 }}>AI Advisor</span>
            </h3>
            <p style={{ margin: '0 0 var(--space-4) 0', fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>
              Operational guidance derived from 7-day volume patterns and live dining pace.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
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

              {/* Kitchen Turnaround alert */}
              {todayStats.avgCookTime > 20 && (
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
                  <div className="dashboard-insights-icon-box" style={{ padding: 8, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, background: 'rgba(239, 68, 68, 0.1)' }}>
                    <AlertCircle size={16} color="#ef4444" strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>Kitchen Bottleneck Alert</h4>
                    <p style={{ margin: '3px 0 0 0', fontSize: '12px', lineHeight: '1.45' }}>
                      Average prep duration is <strong>{todayStats.avgCookTime} mins</strong> today (target is under 20 mins). Check for order backlogs.
                    </p>
                  </div>
                </div>
              )}

              {/* Cancellations warning */}
              {cancellations > 1 && (
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
                  <div className="dashboard-insights-icon-box" style={{ padding: 8, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, background: 'rgba(239, 68, 68, 0.1)' }}>
                    <XCircle size={16} color="#ef4444" strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{cancellations} Cancellations Logged</h4>
                    <p style={{ margin: '3px 0 0 0', fontSize: '12px', lineHeight: '1.45' }}>
                      Review void logs to verify if kitchen delays or item stockouts caused cancellations.
                    </p>
                  </div>
                </div>
              )}

              {/* Reservations Advisory */}
              {reservationsToday.count > 0 && (
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
                  <div className="dashboard-insights-icon-box" style={{ padding: 8, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, background: 'rgba(56, 189, 248, 0.12)' }}>
                    <CalendarClock size={16} color="#0284c7" strokeWidth={2.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 className="dashboard-insights-tip-title" style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#0369a1' }}>
                      {reservationsToday.count} Reservation{reservationsToday.count > 1 ? 's' : ''} Today
                    </h4>
                    <p className="dashboard-insights-tip-desc" style={{ margin: '3px 0 0 0', fontSize: '12px', lineHeight: '1.45' }}>
                      {reservationsToday.next ? (
                        <>Next seating: <strong>{reservationsToday.next.customerName || reservationsToday.next.name || 'Guest'}</strong> ({reservationsToday.next.guests || 2} guests){reservationsToday.next.time ? ` at ${reservationsToday.next.time}` : ''}.</>
                      ) : (
                        'Ensure reserved tables are tagged and prepared.'
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Menu Velocity & 7-Day Sparkline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Menu Velocity Card */}
          <div className="card card-padded" style={{ border: '1px solid var(--color-separator)', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 className="text-title3" style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <Flame size={18} color="#f59e0b" /> Menu Velocity
              <span className="badge badge-gray" style={{ fontSize: '10px', fontWeight: 700 }}>Past 7 Days</span>
            </h3>
            <p style={{ margin: '0 0 var(--space-4) 0', fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>
              Cumulative dish sales from the last 7 calendar days to highlight top sellers and bundling opportunities.
            </p>

            {/* Bestsellers */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#10b981', marginBottom: '8px', letterSpacing: '0.6px' }}>
                <Flame size={12} fill="#10b981" /> Top Movers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {bestSellers.map((item, idx) => {
                  const maxQty = bestSellers[0]?.qty || 1;
                  const pct = Math.round((item.qty / maxQty) * 100);
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px' }}>{item.emoji}</span>
                          {item.name}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>{item.qty} sold</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--color-bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #059669)', borderRadius: '3px' }} />
                      </div>
                    </div>
                  );
                })}
                {bestSellers.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)', fontStyle: 'italic' }}>No sales data recorded yet.</span>
                )}
              </div>
            </div>

            {/* Slow Movers */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#ef4444', marginBottom: '8px', letterSpacing: '0.6px' }}>
                <Snowflake size={12} /> Underperforming Items to Bundle
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {slowMovers.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px' }}>{item.emoji}</span>
                      {item.name}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-label-tertiary)' }}>{item.qty} sold</span>
                  </div>
                ))}
                {slowMovers.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-label-tertiary)', fontStyle: 'italic' }}>All items have active sales!</span>
                )}
              </div>
            </div>
          </div>

          {/* 7-Day Revenue Trend Bar Chart */}
          {weeklySparkline.some(d => d.rev > 0) && (
            <div className="card card-padded" style={{ border: '1px solid var(--color-separator)', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: 4 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  7-Day Revenue Trajectory
                </div>
                <span style={{ fontSize: '10px', color: 'var(--color-label-tertiary)' }}>Settled revenue (past 7 days)</span>
              </div>
              <ResponsiveContainer width="100%" height={48}>
                <BarChart data={weeklySparkline} barSize={14} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                {weeklySparkline.map((d, i) => (
                  <span key={i} style={{ fontSize: '10px', color: d.isToday ? '#10b981' : 'var(--color-label-tertiary)', fontWeight: d.isToday ? 700 : 500 }}>{d.label}</span>
                ))}
              </div>
            </div>
          )}
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
