import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useMenuStore } from '../stores/menuStore';
import { formatCurrency } from '../utils/formatCurrency';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShoppingCart, TrendingUp, Globe, Clock, CheckCircle2,
  Sparkles, Lightbulb, Flame, Snowflake, Percent
} from 'lucide-react';

export default function Dashboard() {
  const { restaurant, staffDoc } = useAuthStore();
  const { activeOrders, unreadOnlineCount } = useOrderStore();
  const { categories } = useMenuStore();
  const [todayStats, setTodayStats] = useState({ sales: 0, orders: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const [analyticsOrders, setAnalyticsOrders] = useState([]);
  const currency = restaurant?.currency ?? 'INR';

  // Fetch completed orders for the last 7 days for Business Insights
  useEffect(() => {
    if (!restaurant?.id) return;
    const start = new Date();
    start.setDate(start.getDate() - 7); // Last 7 days

    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', start)
    );

    getDocs(q).then(snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.status === 'billed');
      setAnalyticsOrders(docs);
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

  const maxHourlyCount = useMemo(() => {
    return Math.max(...peakHours.map(h => h.count), 1);
  }, [peakHours]);

  const topPeakHours = useMemo(() => {
    return [...peakHours].sort((a, b) => b.count - a.count).slice(0, 2);
  }, [peakHours]);

  // Dynamic Growth Insights / Tips
  const growthTips = useMemo(() => {
    const tips = [];
    
    // 1. Staffing Tip based on Peak Hours
    if (topPeakHours.length > 0 && topPeakHours[0].count > 0) {
      tips.push({
        title: "Staffing Optimization",
        description: `Peak customer traffic occurs around **${topPeakHours[0].label}** and **${topPeakHours[1]?.label ?? 'off-peak'}**. Schedule extra kitchen hands 30 minutes before these times to ensure prompt service.`,
        icon: Clock,
        color: 'var(--color-purple)'
      });
    } else {
      tips.push({
        title: "Operational Efficiency",
        description: "Consistency in order prep speed during peak dinner service increases table turn rates and online customer satisfaction.",
        icon: Clock,
        color: 'var(--color-purple)'
      });
    }

    // 2. Menu Bundle / Pairing Tip based on Best Sellers & Slow Movers
    if (bestSellers.length > 0 && slowMovers.length > 0) {
      tips.push({
        title: "Promotional Pairing",
        description: `Consider creating a combo promotion bundling your popular item **"${bestSellers[0].name}"** with a slower-selling item like **"${slowMovers[0].name}"** to clear out raw inventory.`,
        icon: Sparkles,
        color: 'var(--color-accent)'
      });
    } else {
      tips.push({
        title: "Upselling Focus",
        description: "Promote beverage combos or daily desserts alongside entrees to increase the ticket value for online and walk-in sales.",
        icon: Sparkles,
        color: 'var(--color-accent)'
      });
    }

    // 3. Ticket Value Booster
    if (todayStats.avg > 0) {
      tips.push({
        title: "Booster Sales Scripts",
        description: `Your average ticket value is **${formatCurrency(todayStats.avg, currency)}**. Train staff to suggest extra toppings, premium modifiers, or sides on orders currently below this threshold.`,
        icon: Percent,
        color: 'var(--color-green)'
      });
    } else {
      tips.push({
        title: "Average Ticket Focus",
        description: "Implement add-on options (modifiers) like double cheese or extra protein to increase standard average order amounts.",
        icon: Percent,
        color: 'var(--color-green)'
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
    
    // Subscribe to today's orders in real-time
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', today)
    );
    
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => d.data());
      const todayBilled = docs.filter(d => d.status === 'billed');
      const sales = todayBilled.reduce((s, d) => s + (d.total ?? 0), 0);
      const orders = todayBilled.length;
      setTodayStats({ sales, orders, avg: orders ? sales / orders : 0 });
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

  const stats = [
    { label: "Today's Sales", value: formatCurrency(todayStats.sales, currency), icon: TrendingUp, color: 'var(--color-green)', bg: 'var(--color-green-light)' },
    { label: 'Orders Today', value: todayStats.orders, icon: ShoppingCart, color: 'var(--color-accent)', bg: 'var(--color-accent-light)' },
    { label: 'Avg. Order',   value: formatCurrency(todayStats.avg, currency), icon: CheckCircle2, color: 'var(--color-orange)', bg: 'var(--color-orange-light)' },
    { label: 'Active Now',   value: activeOrders.length, icon: Clock, color: 'var(--color-purple)', bg: 'var(--color-purple-light)' },
    { label: 'Online Pending', value: unreadOnlineCount, icon: Globe, color: 'var(--color-teal)', bg: 'var(--color-teal-light)' },
  ];

  const orderStatusColors = {
    pending:   'badge-yellow',
    preparing: 'badge-blue',
    ready:     'badge-teal',
    served:    'badge-green',
    billed:    'badge-gray',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Greeting */}
      <div>
        <h1 className="text-title2">{greeting}, {staffDoc?.name?.split(' ')[0] ?? 'Chef'}</h1>
        <p className="text-secondary text-body" style={{ marginTop: 'var(--space-1)' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        {stats.map((s, i) => (
          <div key={i} className="stat-card animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="stat-card-icon" style={{ background: s.bg }}>
              <s.icon size={20} color={s.color} strokeWidth={2} />
            </div>
            <div className="stat-card-value">
              {loading ? <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 6 }} /> : s.value}
            </div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
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
          <div className="card">
            <div className="card-header">
              <span className="card-title">Active Orders</span>
              <span className="badge badge-blue">{activeOrders.length}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {activeOrders.length === 0 ? (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                  <div style={{ fontSize: 32 }}>✅</div>
                  <div style={{ marginTop: 'var(--space-2)' }}>All caught up — no active orders</div>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      {['Order ID', 'Type', 'Table/Token', 'Items', 'Total', 'Status'].map(h => (
                        <th key={h} style={{
                          padding: 'var(--space-3) var(--space-5)',
                          textAlign: 'left',
                          fontSize: 'var(--text-caption1)',
                          fontWeight: 'var(--weight-semibold)',
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
                        <td style={{ padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-footnote)' }}>
                          {o.tableName ?? (o.token ? `#${o.token}` : '—')}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>
                          {(o.items ?? []).length} item(s)
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)', fontWeight: 'var(--weight-semibold)' }}>
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
          <div className="card card-padded animate-fade-in" style={{ animationDelay: '100ms' }}>
            <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
              🕒 Customer Traffic Peak Hours
            </h3>
            <p style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: -10, marginBottom: 'var(--space-4)' }}>
              Hourly distribution based on sales logs from the last 7 days
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
              {peakHours.map(h => (
                <div key={h.hour} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ width: 50, fontSize: 10, color: 'var(--color-label-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h.label}</span>
                  <div style={{ flex: 1, height: 10, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', border: '1px solid var(--color-separator)' }}>
                    <div
                      style={{
                        width: `${(h.count / maxHourlyCount) * 100}%`,
                        height: '100%',
                        background: 'var(--color-accent)',
                        borderRadius: 'var(--radius-pill)'
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 'var(--weight-bold)', minWidth: 16, textAlign: 'right' }}>{h.count}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column (Insights & Performance Metrics) */}
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          
          {/* Growth Insights Card */}
          <div className="card card-padded animate-fade-in" style={{ background: '#faf5e8', border: '1.5px solid var(--color-separator-opaque)', animationDelay: '150ms' }}>
            <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightbulb size={20} color="var(--color-orange)" strokeWidth={2.5} />
              <span>Business Growth Insights</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {growthTips.map((tip, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'start' }}>
                  <div style={{
                    background: 'rgba(0,0,0,0.05)',
                    padding: 6,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2
                  }}>
                    <tip.icon size={16} color={tip.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: 0, fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>{tip.title}</h4>
                    <p style={{ margin: '2px 0 0 0', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', lineHeight: '1.4' }}>
                      {tip.description.split('**').map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Menu Performance card */}
          <div className="card card-padded animate-fade-in" style={{ animationDelay: '200ms' }}>
            <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
              📊 Menu Performance (Last 7 Days)
            </h3>
            
            {/* Top Sellers */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-green)', marginBottom: 'var(--space-2)', letterSpacing: '0.5px' }}>
                <Flame size={12} /> Bestsellers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {bestSellers.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                    <span style={{ fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)' }}>
                      <span style={{ marginRight: 6 }}>{item.emoji}</span>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 'var(--text-caption1)', fontWeight: 'bold' }}>{item.qty} sold</span>
                  </div>
                ))}
                {bestSellers.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)', paddingLeft: 8 }}>No items sold yet.</span>
                )}
              </div>
            </div>

            {/* Slow Movers */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-red)', marginBottom: 'var(--space-2)', letterSpacing: '0.5px' }}>
                <Snowflake size={12} /> Slow Movers / Zero Sales
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {slowMovers.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                    <span style={{ fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)' }}>
                      <span style={{ marginRight: 6 }}>{item.emoji}</span>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>{item.qty} sold</span>
                  </div>
                ))}
                {slowMovers.length === 0 && (
                  <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)', paddingLeft: 8 }}>All items are active!</span>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
