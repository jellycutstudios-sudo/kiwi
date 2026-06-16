import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { formatCurrency } from '../utils/formatCurrency';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ShoppingCart, TrendingUp, Globe, Clock, CheckCircle2
} from 'lucide-react';

export default function Dashboard() {
  const { restaurant, staffDoc } = useAuthStore();
  const { activeOrders, unreadOnlineCount } = useOrderStore();
  const [todayStats, setTodayStats] = useState({ sales: 0, orders: 0, avg: 0 });
  const [loading, setLoading] = useState(true);
  const currency = restaurant?.currency ?? 'INR';

  useEffect(() => {
    if (!restaurant?.id) return;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Query today's orders directly. This uses a single-field index and does not require a composite index.
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', today)
    );
    
    getDocs(q).then(snap => {
      const docs = snap.docs.map(d => d.data());
      const todayBilled = docs.filter(d => d.status === 'billed');
      const sales = todayBilled.reduce((s, d) => s + (d.total ?? 0), 0);
      const orders = todayBilled.length;
      setTodayStats({ sales, orders, avg: orders ? sales / orders : 0 });
      setLoading(false);
    }).catch(err => {
      console.error("Dashboard stats query failed:", err);
      setLoading(false);
    });
  }, [restaurant?.id]);

  const hour = new Date().getHours();
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
        <h1 className="text-large-title">{greeting}, {staffDoc?.name?.split(' ')[0] ?? 'Chef'}</h1>
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

      {/* Active orders */}
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
    </div>
  );
}
