import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useMenuStore } from '../stores/menuStore';
import { useStaffStore } from '../stores/staffStore';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/formatCurrency';
import { BarChart3, TrendingUp, ShoppingCart, CreditCard, Download, Users, Award, Activity, PieChart, Clock, History, ShieldAlert, X, HeartHandshake } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Reports() {
  const { restaurant } = useAuthStore();
  const [period, setPeriod] = useState('today');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'menu' | 'staff'
  const [data, setData] = useState([]);
  const { categories } = useMenuStore();
  const { staff } = useStaffStore();
  const [loading, setLoading] = useState(true);

  // Compute menuItems from categories
  const menuItems = useMemo(() => {
    const allItems = [];
    categories.forEach(cat => {
      if (Array.isArray(cat.items)) {
        allItems.push(...cat.items);
      }
    });
    return allItems;
  }, [categories]);

  // Shifts and void audits states
  const [shifts, setShifts] = useState([]);
  const [voidLogs, setVoidLogs] = useState([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [loadingVoids, setLoadingVoids] = useState(false);
  const [selectedShiftForZReport, setSelectedShiftForZReport] = useState(null);
  const currency = restaurant?.currency ?? 'INR';

  const [prevRestIdAndPeriod, setPrevRestIdAndPeriod] = useState({ restId: restaurant?.id, period });
  if (restaurant?.id !== prevRestIdAndPeriod.restId || period !== prevRestIdAndPeriod.period) {
    setPrevRestIdAndPeriod({ restId: restaurant?.id, period });
    setLoading(true);
  }

  const [prevRestIdAndTab, setPrevRestIdAndTab] = useState({ restId: restaurant?.id, activeTab });
  if (restaurant?.id !== prevRestIdAndTab.restId || activeTab !== prevRestIdAndTab.activeTab) {
    setPrevRestIdAndTab({ restId: restaurant?.id, activeTab });
    if (activeTab === 'till_shifts') {
      setLoadingShifts(true);
    }
    if (activeTab === 'void_audits') {
      setLoadingVoids(true);
    }
  }

  // 1. Fetch completed orders for the selected period
  useEffect(() => {
    if (!restaurant?.id) return;
    const now = new Date();
    const start = new Date();
    if (period === 'today')  start.setHours(0,0,0,0);
    if (period === 'week')   start.setDate(now.getDate()-7);
    if (period === 'month')  start.setDate(now.getDate()-30);

    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', start)
    );
    getDocs(q).then(snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.status === 'billed');
      
      // Sort in-memory descending by createdAt
      docs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : 0);
        return dateB - dateA;
      });

      setData(docs);
      setLoading(false);
    }).catch(err => {
      console.error("Reports stats query failed:", err);
      setData([]);
      setLoading(false);
    });
  }, [restaurant?.id, period]);

  // 4. Fetch shifts
  useEffect(() => {
    if (!restaurant?.id || activeTab !== 'till_shifts') return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'shifts'),
      orderBy('openedAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingShifts(false);
    }, () => setLoadingShifts(false));
    return unsub;
  }, [restaurant?.id, activeTab]);

  // 5. Fetch void logs
  useEffect(() => {
    if (!restaurant?.id || activeTab !== 'void_audits') return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'void_logs'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setVoidLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingVoids(false);
    }, () => setLoadingVoids(false));
    return unsub;
  }, [restaurant?.id, activeTab]);

  const staffMap = useMemo(() => {
    return staff.reduce((acc, s) => {
      acc[s.id] = s.name;
      return acc;
    }, {});
  }, [staff]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const totalSales   = data.reduce((s, d) => s + (d.total ?? 0), 0);
    const totalOrders  = data.length;
    const avgOrder     = totalOrders ? totalSales / totalOrders : 0;

    const ordersWithPrepTime = data.filter(d => d.prepDuration !== undefined && d.prepDuration !== null);
    const totalPrepDuration = ordersWithPrepTime.reduce((sum, d) => sum + d.prepDuration, 0);
    const avgPrepTime = ordersWithPrepTime.length 
      ? Math.round((totalPrepDuration / ordersWithPrepTime.length) / 60 * 10) / 10 
      : 0;

    // Unpack split payments for correct method breakdown
    const byPayment = data.reduce((acc, d) => {
      if (d.paymentMethod === 'split' && Array.isArray(d.splitPayments)) {
        d.splitPayments.forEach(p => {
          const method = p.method ?? 'cash';
          acc[method] = (acc[method] ?? 0) + (p.amount ?? 0);
        });
      } else {
        const method = d.paymentMethod ?? 'cash';
        acc[method] = (acc[method] ?? 0) + (d.total ?? 0);
      }
      return acc;
    }, {});

    const byType = data.reduce((acc, d) => {
      acc[d.type ?? 'pos'] = (acc[d.type ?? 'pos'] ?? 0) + 1;
      return acc;
    }, {});

    return { totalSales, totalOrders, avgOrder, avgPrepTime, byPayment, byType };
  }, [data]);

  const { totalSales, totalOrders, avgOrder, avgPrepTime, byPayment, byType } = kpis;

  // Chart Aggregation Helper (Sales Trend)
  const trendDataInfo = useMemo(() => {
    const getTodayTrend = () => {
      const hours = Array.from({ length: 24 }).map((_, i) => ({ label: `${i}:00`, sales: 0 }));
      data.forEach(order => {
        if (!order.createdAt) return;
        const date = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt);
        const hour = date.getHours();
        hours[hour].sales += order.total ?? 0;
      });
      return hours;
    };

    const getWeekTrend = () => {
      const days = [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ dateStr: d.toDateString(), label: dayNames[d.getDay()], sales: 0 });
      }
      data.forEach(order => {
        if (!order.createdAt) return;
        const date = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt);
        const dateStr = date.toDateString();
        const found = days.find(day => day.dateStr === dateStr);
        if (found) {
          found.sales += order.total ?? 0;
        }
      });
      return days;
    };

    const getMonthTrend = () => {
      const days = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        days.push({ dateStr: d.toDateString(), label, sales: 0 });
      }
      data.forEach(order => {
        if (!order.createdAt) return;
        const date = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt);
        const dateStr = date.toDateString();
        const found = days.find(day => day.dateStr === dateStr);
        if (found) {
          found.sales += order.total ?? 0;
        }
      });
      return days;
    };

    const trend = period === 'today' ? getTodayTrend() : period === 'week' ? getWeekTrend() : getMonthTrend();
    const maxSales = Math.max(...trend.map(d => d.sales), 100);

    // SVG Chart Plotting Points
    const chartWidth = 540;
    const chartHeight = 160;
    const paddingLeft = 45;
    const paddingTop = 20;

    const pts = trend.map((d, i) => {
      const x = paddingLeft + i * (chartWidth / (trend.length - 1 || 1));
      const y = paddingTop + chartHeight - (d.sales / maxSales) * chartHeight;
      return { x, y, label: d.label, sales: d.sales };
    });

    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const area = pts.length > 0
      ? `${path} L ${pts[pts.length - 1].x} ${paddingTop + chartHeight} L ${pts[0].x} ${paddingTop + chartHeight} Z`
      : '';

    return { trendData: trend, maxSales, points: pts, pathD: path, areaD: area, chartWidth, chartHeight, paddingLeft, paddingTop };
  }, [data, period]);

  const { trendData, maxSales, points, pathD, areaD, chartWidth, chartHeight, paddingLeft, paddingTop } = trendDataInfo;

  // Hourly Heatmap (Aggregated Order Counts)
  const heatmapInfo = useMemo(() => {
    const hourlyCounts = Array.from({ length: 24 }).fill(0);
    data.forEach(order => {
      if (!order.createdAt) return;
      const date = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt);
      hourlyCounts[date.getHours()]++;
    });
    const activeHours = [];
    for (let h = 9; h <= 22; h++) {
      const label = `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}`;
      activeHours.push({ hour: h, label, count: hourlyCounts[h] });
    }
    const maxCount = Math.max(...activeHours.map(h => h.count), 1);
    return { hourlyData: activeHours, maxHourlyCount: maxCount };
  }, [data]);

  const { hourlyData, maxHourlyCount } = heatmapInfo;

  // Menu Aggregators (Best Sellers)
  const bestSellers = useMemo(() => {
    const counts = {};
    data.forEach(order => {
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
    return Object.values(counts).sort((a, b) => b.qty - a.qty);
  }, [data]);

  // Menu Aggregators (Slow Movers)
  const slowMovers = useMemo(() => {
    const soldNames = new Set(bestSellers.map(b => b.name));
    return menuItems
      .filter(item => !soldNames.has(item.name))
      .map(item => ({ name: item.name, emoji: item.emoji ?? '🍽️', price: item.price }));
  }, [menuItems, bestSellers]);

  // Staff Leaderboard Aggregator
  const staffLeaderboard = useMemo(() => {
    const staffStats = {};
    data.forEach(order => {
      const sId = order.staffId ?? 'unknown';
      if (!staffStats[sId]) {
        staffStats[sId] = { id: sId, name: staffMap[sId] || (sId === 'unknown' ? 'Self-ordered' : 'Staff ' + sId.slice(-4)), role: '', revenue: 0, count: 0 };
      }
      staffStats[sId].revenue += order.total ?? 0;
      staffStats[sId].count++;
    });
    Object.keys(staffStats).forEach(id => {
      const match = staff.find(s => s.id === id);
      if (match) {
        staffStats[id].role = match.role;
        staffStats[id].name = match.name;
      }
    });
    return Object.values(staffStats).sort((a, b) => b.revenue - a.revenue);
  }, [data, staff, staffMap]);

  // Tips & Gratuity Aggregators
  const tipInfo = useMemo(() => {
    const tipsOrders = data.filter(d => (d.tipAmount ?? 0) > 0);
    const totalTips = data.reduce((s, d) => s + (d.tipAmount ?? 0), 0);
    const avgTip = tipsOrders.length ? totalTips / tipsOrders.length : 0;
    const tipRate = totalOrders ? (tipsOrders.length / totalOrders) * 100 : 0;

    const tipStats = {};
    data.forEach(order => {
      if (!order.tipAmount || order.tipAmount <= 0) return;
      const sId = order.staffId ?? 'unknown';
      if (!tipStats[sId]) {
        tipStats[sId] = { id: sId, name: staffMap[sId] || (sId === 'unknown' ? 'Self-ordered' : 'Staff ' + sId.slice(-4)), tipTotal: 0, tipCount: 0 };
      }
      tipStats[sId].tipTotal += order.tipAmount;
      tipStats[sId].tipCount++;
    });
    Object.keys(tipStats).forEach(id => {
      const match = staff.find(s => s.id === id);
      if (match) tipStats[id].name = match.name;
    });
    const tipLeaderboard = Object.values(tipStats).sort((a, b) => b.tipTotal - a.tipTotal);

    return { tipsOrders, totalTips, avgTip, tipRate, tipLeaderboard };
  }, [data, staff, staffMap, totalOrders]);

  const { tipsOrders, totalTips, avgTip, tipRate, tipLeaderboard } = tipInfo;

  // PDF / Document Export Handler
  const handleExportPDF = () => {
    if (!restaurant) return;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) { toast.error('Please allow popups to export reports.'); return; }

    const bestRows = bestSellers.slice(0, 10).map((b, idx) => `
      <tr>
        <td>#${idx + 1}</td>
        <td>${b.emoji} ${b.name}</td>
        <td style="text-align: center;">${b.qty}</td>
        <td style="text-align: right;">${formatCurrency(b.revenue, currency)}</td>
      </tr>
    `).join('');

    const staffRows = staffLeaderboard.map((s, idx) => `
      <tr>
        <td>#${idx + 1}</td>
        <td>${s.name} ${s.role ? `(${s.role})` : ''}</td>
        <td style="text-align: center;">${s.count}</td>
        <td style="text-align: right;">${formatCurrency(s.revenue, currency)}</td>
      </tr>
    `).join('');

    const tipLeaderboardRows = tipLeaderboard.map((s, idx) => `
      <tr>
        <td>#${idx + 1}</td>
        <td>${s.name}</td>
        <td style="text-align: center;">${s.tipCount}</td>
        <td style="text-align: right;">${formatCurrency(s.tipTotal, currency)}</td>
      </tr>
    `).join('');

    win.document.write(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>POS Sales Report - ${restaurant.name}</title>
<style>
  body { font-family: monospace; font-size: 13px; color: #000; padding: 25px; line-height: 1.4; }
  .header { text-align: center; margin-bottom: 25px; }
  .title { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
  .subtitle { font-size: 12px; color: #555; }
  .divider { border-top: 1px dashed #000; margin: 15px 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .card { border: 1px solid #000; padding: 15px; border-radius: 4px; }
  .card-title { font-weight: bold; font-size: 14px; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 5px; }
  th { text-align: left; font-weight: bold; border-bottom: 1px solid #000; padding: 4px 0; }
  td { padding: 4px 0; vertical-align: top; }
  .stat-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="header">
    <div class="title">${restaurant.name.toUpperCase()} SALES REPORT</div>
    <div class="subtitle">Period: ${period.toUpperCase()} | Generated: ${new Date().toLocaleString()}</div>
  </div>
  
  <div class="divider"></div>
  
  <div class="grid">
    <div class="card">
      <div class="card-title">Key Performance Indicators</div>
      <div class="stat-row"><span>Total Revenue:</span> <strong>${formatCurrency(totalSales, currency)}</strong></div>
      <div class="stat-row"><span>Total Orders:</span> <strong>${totalOrders}</strong></div>
      <div class="stat-row"><span>Average Ticket:</span> <strong>${formatCurrency(avgOrder, currency)}</strong></div>
      <div class="stat-row"><span>Average Prep Time:</span> <strong>${avgPrepTime > 0 ? `${avgPrepTime} mins` : 'N/A'}</strong></div>
    </div>
    
    <div class="card">
      <div class="card-title">Revenue by Method</div>
      ${Object.entries(byPayment).map(([method, amt]) => `
        <div class="stat-row"><span style="text-transform: capitalize;">${method}:</span> <span>${formatCurrency(amt, currency)}</span></div>
      `).join('')}
    </div>
  </div>

  <div class="grid" style="margin-bottom: 20px;">
    <div class="card">
      <div class="card-title">Tips & Gratuity Overview</div>
      <div class="stat-row"><span>Total Tips Collected:</span> <strong>${formatCurrency(totalTips, currency)}</strong></div>
      <div class="stat-row"><span>Orders With Tips:</span> <strong>${tipsOrders.length} / ${totalOrders}</strong></div>
      <div class="stat-row"><span>Average Tip Amount:</span> <strong>${avgTip > 0 ? formatCurrency(avgTip, currency) : 'N/A'}</strong></div>
      <div class="stat-row"><span>Tip Attachment Rate:</span> <strong>${tipRate.toFixed(1)}%</strong></div>
    </div>
    <div class="card" style="display: flex; flex-direction: column; justify-content: flex-start;">
      <div class="card-title">Staff Tip Share</div>
      <table style="font-size: 11px;">
        <thead>
          <tr>
            <th style="width: 40px;">Rank</th>
            <th>Staff Name</th>
            <th style="text-align: center; width: 60px;">Tipped</th>
            <th style="text-align: right; width: 90px;">Total Tips</th>
          </tr>
        </thead>
        <tbody>
          ${tipLeaderboardRows || '<tr><td colspan="4" style="text-align:center;">No tips recorded</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card" style="margin-bottom: 20px;">
    <div class="card-title">Top 10 Best Selling Items</div>
    <table>
      <thead>
        <tr>
          <th style="width: 50px;">Rank</th>
          <th>Item Name</th>
          <th style="text-align: center; width: 80px;">Qty Sold</th>
          <th style="text-align: right; width: 120px;">Revenue</th>
        </tr>
      </thead>
      <tbody>
        ${bestRows || '<tr><td colspan="4" style="text-align:center;">No data available</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="card">
    <div class="card-title">Staff Sales Leaderboard</div>
    <table>
      <thead>
        <tr>
          <th style="width: 50px;">Rank</th>
          <th>Staff Name</th>
          <th style="text-align: center; width: 80px;">Orders</th>
          <th style="text-align: right; width: 120px;">Revenue Sales</th>
        </tr>
      </thead>
      <tbody>
        ${staffRows || '<tr><td colspan="4" style="text-align:center;">No data available</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="divider" style="margin-top: 30px;"></div>
  <div style="text-align: center; font-size: 10px; color: #555;">End of report. Generated via RestaurantOS.</div>
</body>
</html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  const stats = [
    { label: 'Total Sales',   value: formatCurrency(totalSales, currency), icon: TrendingUp, color: 'var(--color-green)', bg: 'var(--color-green-light)' },
    { label: 'Total Orders',  value: totalOrders,                           icon: ShoppingCart, color: 'var(--color-accent)', bg: 'var(--color-accent-light)' },
    { label: 'Avg. Order',    value: formatCurrency(avgOrder, currency),    icon: BarChart3, color: 'var(--color-orange)', bg: 'var(--color-orange-light)' },
    { label: 'Avg. Prep Time', value: avgPrepTime > 0 ? `${avgPrepTime}m` : 'N/A', icon: Clock, color: 'var(--color-purple)', bg: 'var(--color-purple-light)' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
      {/* Page Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'var(--space-3)' }}>
        <div>
          <h2 className="text-title2">Reports & Analytics</h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Real-time business insights, best-selling menus, heatmaps, and staff leaderboards.
          </p>
        </div>
        <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExportPDF} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export Report
          </button>
          {['today','week','month'].map(p => (
            <button key={p} id={`report-period-${p}`} className={`btn btn-sm ${period===p?'btn-primary':'btn-secondary'}`} onClick={()=>setPeriod(p)}>
              {p.charAt(0).toUpperCase()+p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stat-grid">
        {stats.map((s,i) => (
          <div key={i} className="stat-card">
            <div className="stat-card-icon" style={{ background: s.bg }}>
              <s.icon size={20} color={s.color} />
            </div>
            <div className="stat-card-value">
              {loading ? <div className="skeleton" style={{height:28,width:80,borderRadius:6}}/> : s.value}
            </div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Dashboard Sub-navigation Tabs */}
      <div className="reports-tabs">
        {[
          { key: 'overview', label: 'Sales Overview', icon: Activity },
          { key: 'menu', label: 'Menu Performance', icon: PieChart },
          { key: 'staff', label: 'Staff Leaderboard', icon: Users },
          { key: 'tips', label: 'Tips & Gratuities', icon: HeartHandshake },
          { key: 'till_shifts', label: 'Till Shifts', icon: History },
          { key: 'void_audits', label: 'Void Audit Ledger', icon: ShieldAlert }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`reports-tab-btn ${activeTab === t.key ? 'active' : ''}`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENTS */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* SVG Trend Chart */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h3 className="text-title3" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              📈 Revenue Trend
            </h3>
            <div style={{ height: 220, position: 'relative', width: '100%', marginTop: 'var(--space-3)' }}>
              {loading ? (
                <div className="skeleton" style={{ height: '100%', borderRadius: 'var(--radius-lg)' }} />
              ) : trendData.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-label-tertiary)' }}>
                  No data available for trend
                </div>
              ) : (
                <svg viewBox="0 0 600 220" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.00" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const yVal = paddingTop + idx * (chartHeight / 4);
                    const labelVal = maxSales - (idx * maxSales) / 4;
                    return (
                      <g key={idx}>
                        <line x1={paddingLeft} y1={yVal} x2={paddingLeft + chartWidth} y2={yVal} stroke="var(--color-separator)" strokeDasharray="3 3" />
                        <text x={paddingLeft - 8} y={yVal + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--color-label-secondary)', fontFamily: 'var(--font-family)', fontWeight: 'var(--weight-semibold)' }}>
                          {Math.round(labelVal)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Gradient Area Fill */}
                  {areaD && <path d={areaD} fill="url(#chart-gradient)" />}

                  {/* Smooth Line Curve */}
                  {pathD && <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

                  {/* Nodes & Tooltips */}
                  {points.map((p, idx) => {
                    const showLabel = period === 'today' ? (idx % 3 === 0) : period === 'week' ? true : (idx % 5 === 0 || idx === points.length - 1);
                    return (
                      <g key={idx}>
                        <circle cx={p.x} cy={p.y} r="3.5" fill="var(--color-bg-elevated)" stroke="var(--color-accent)" strokeWidth="1.8" />
                        {showLabel && (
                          <text x={p.x} y={paddingTop + chartHeight + 16} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--color-label-secondary)', fontFamily: 'var(--font-family)' }}>
                            {p.label}
                          </text>
                        )}
                        <circle cx={p.x} cy={p.y} r="8" fill="transparent" style={{ cursor: 'pointer' }}>
                          <title>{p.label}: {formatCurrency(p.sales, currency)}</title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          </div>

          {/* Breakdown cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))', gap:'var(--space-4)' }}>
            {/* By Payment Method */}
            <div className="card card-padded">
              <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CreditCard size={18} /> By Payment Method
              </h3>
              {Object.entries(byPayment).map(([method, amt]) => (
                <div key={method} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'var(--space-3) 0', borderBottom:'1px solid var(--color-separator)' }}>
                  <span style={{ textTransform:'capitalize', fontSize:'var(--text-subhead)', fontWeight: 'var(--weight-medium)' }}>
                    {method === 'cash' ? '💵 Cash' : method === 'card' ? '💳 Card' : method === 'upi' ? '📱 UPI' : '🔄 Split'}
                  </span>
                  <span style={{ fontWeight:'var(--weight-bold)', color: 'var(--color-label)' }}>{formatCurrency(amt, currency)}</span>
                </div>
              ))}
              {Object.keys(byPayment).length === 0 && !loading && (
                <div style={{ textAlign:'center', color:'var(--color-label-tertiary)', fontSize:'var(--text-footnote)', padding:'var(--space-4)' }}>No transactions found</div>
              )}
            </div>

            {/* By Order Type */}
            <div className="card card-padded">
              <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <PieChart size={18} /> By Order Type
              </h3>
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'var(--space-3) 0', borderBottom:'1px solid var(--color-separator)' }}>
                  <span style={{ textTransform:'capitalize', fontSize:'var(--text-subhead)', fontWeight: 'var(--weight-medium)' }}>
                    {type === 'dine-in' ? '🍽️ Dine In' : type === 'online' ? '📱 Online Order' : '🛍️ Takeaway'}
                  </span>
                  <span style={{ fontWeight:'var(--weight-bold)', color: 'var(--color-label)' }}>{count} orders</span>
                </div>
              ))}
              {Object.keys(byType).length === 0 && !loading && (
                <div style={{ textAlign:'center', color:'var(--color-label-tertiary)', fontSize:'var(--text-footnote)', padding:'var(--space-4)' }}>No orders found</div>
              )}
            </div>
          </div>

          {/* Orders list */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Completed Orders</span>
              <span className="badge badge-gray">{data.length}</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--color-separator)' }}>
                    {['Time','Type','Customer/Table','Items','Payment','Total'].map(h => (
                      <th key={h} style={{ padding:'var(--space-3) var(--space-4)', textAlign:'left', fontSize:'var(--text-caption1)', fontWeight:'var(--weight-semibold)', color:'var(--color-label-secondary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 50).map(o => (
                    <tr key={o.id} style={{ borderBottom:'1px solid var(--color-separator)' }}>
                      <td style={{ padding:'var(--space-3) var(--space-4)', fontSize:'var(--text-caption1)', color:'var(--color-label-secondary)', whiteSpace:'nowrap' }}>
                        {o.createdAt?.toDate?.()?.toLocaleTimeString() ?? '—'}
                      </td>
                      <td style={{ padding:'var(--space-3) var(--space-4)' }}>
                        <span className={`badge ${o.type==='online'?'badge-purple':o.type==='dine-in'?'badge-blue':'badge-orange'}`}>{o.type}</span>
                      </td>
                      <td style={{ padding:'var(--space-3) var(--space-4)', fontSize:'var(--text-footnote)' }}>
                        {o.customerName || o.tableName || (o.token ? `#${o.token}` : '—')}
                      </td>
                      <td style={{ padding:'var(--space-3) var(--space-4)', fontSize:'var(--text-footnote)', color:'var(--color-label-secondary)' }}>
                        {(o.items??[]).length}
                      </td>
                      <td style={{ padding:'var(--space-3) var(--space-4)' }}>
                        <span className="badge badge-gray" style={{ textTransform:'uppercase' }}>{o.paymentMethod}</span>
                      </td>
                      <td style={{ padding:'var(--space-3) var(--space-4)', fontWeight:'var(--weight-semibold)' }}>
                        {formatCurrency(o.total??0, o.currency??currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 && !loading && (
                <div style={{ padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)' }}>
                  No completed orders for this period
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MENU PERFORMANCE */}
      {activeTab === 'menu' && (
        <div className="reports-menu-grid">
          
          {/* Best Sellers */}
          <div className="card card-padded">
            <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔥 Best Sellers (by Quantity)
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'left' }}>Rank</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'left' }}>Item</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'center' }}>Qty Sold</th>
                    <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {bestSellers.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--weight-bold)', color: idx < 3 ? 'var(--color-accent)' : 'var(--color-label-tertiary)', textAlign: 'left' }}>
                        #{idx + 1}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--weight-semibold)', textAlign: 'left' }}>
                        <span style={{ marginRight: 6 }}>{item.emoji}</span>
                        {item.name}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 'var(--weight-semibold)' }}>
                        {item.qty}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)' }}>
                        {formatCurrency(item.revenue, currency)}
                      </td>
                    </tr>
                  ))}
                  {bestSellers.length === 0 && (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-tertiary)' }}>
                        No items sold in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Side panel: Slow movers + Heatmap */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            
            {/* Hourly heatmap */}
            <div className="card card-padded">
              <h3 className="text-title3" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                🕒 Hourly Peak Times
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {hourlyData.map(h => (
                  <div key={h.hour} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ width: 55, fontSize: 10, color: 'var(--color-label-secondary)', fontWeight: 600 }}>{h.label}</span>
                    <div style={{ flex: 1, height: 12, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${(h.count / maxHourlyCount) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-indigo) 100%)',
                          borderRadius: 'var(--radius-full)'
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 'var(--weight-bold)', minWidth: 20, textAlign: 'right' }}>{h.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Slow Movers */}
            <div className="card card-padded">
              <h3 className="text-title3" style={{ marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-red)' }}>
                ❄️ Slow Movers (0 Sales)
              </h3>
              <p style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginBottom: 'var(--space-3)' }}>
                Items currently in the menu with zero sales in the selected period.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 200, overflowY: 'auto' }}>
                {slowMovers.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-separator)' }}>
                    <span style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-medium)' }}>
                      <span style={{ marginRight: 6 }}>{item.emoji}</span>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>
                      {formatCurrency(item.price, currency)}
                    </span>
                  </div>
                ))}
                {slowMovers.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--color-label-tertiary)', fontSize: 'var(--text-footnote)', padding: 'var(--space-4)' }}>
                    Awesome! Every menu item has been sold.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* TAB 3: STAFF LEADERBOARD */}
      {activeTab === 'staff' && (
        <div className="card card-padded">
          <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Award size={18} color="var(--color-accent)" /> Staff Performance Leaderboard
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'left' }}>Rank</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'left' }}>Staff Member</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'left' }}>Role</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'center' }}>Orders Taken</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', textAlign: 'right' }}>Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {staffLeaderboard.map((staffMember, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 'var(--weight-bold)', color: idx === 0 ? 'var(--color-orange)' : 'var(--color-label-tertiary)', textAlign: 'left' }}>
                      {idx === 0 ? '👑 #1' : `#${idx + 1}`}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: idx === 0 ? 'var(--color-orange-light)' : 'var(--color-fill-tertiary)',
                          color: idx === 0 ? 'var(--color-orange)' : 'var(--color-label-secondary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 'var(--weight-bold)'
                        }}>
                          {staffMember.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 'var(--weight-semibold)' }}>{staffMember.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textTransform: 'capitalize', color: 'var(--color-label-secondary)', fontSize: 'var(--text-footnote)', textAlign: 'left' }}>
                      {staffMember.role || 'System / Web'}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', fontWeight: 'var(--weight-semibold)' }}>
                      {staffMember.count}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--weight-bold)', color: 'var(--color-green)' }}>
                      {formatCurrency(staffMember.revenue, currency)}
                    </td>
                  </tr>
                ))}
                {staffLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-tertiary)' }}>
                      No staff sales recorded
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TILL SHIFTS */}
      {activeTab === 'till_shifts' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="card-title">Cash Till Shifts History</span>
              <p style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                Audit opened and closed till drawers, expected vs actual cash balances, and variance records.
              </p>
            </div>
            {loadingShifts && <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 4 }} />}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['Opened At', 'Closed At', 'Cashier', 'Status', 'Start Cash', 'Expected Cash', 'Actual Cash', 'Variance', 'Actions'].map(h => (
                    <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shifts.map(s => {
                  const openedDate = s.openedAt ? new Date(s.openedAt.seconds ? s.openedAt.seconds * 1000 : s.openedAt).toLocaleString() : '—';
                  const closedDate = s.closedAt ? new Date(s.closedAt.seconds ? s.closedAt.seconds * 1000 : s.closedAt).toLocaleString() : '—';
                  const variance = s.variance ?? 0;
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', whiteSpace: 'nowrap' }}>{openedDate}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', whiteSpace: 'nowrap' }}>{closedDate}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)' }}>{s.openedBy}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <span className={`badge ${s.status === 'open' ? 'badge-green' : 'badge-gray'}`} style={{ textTransform: 'uppercase' }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)' }}>{formatCurrency(s.startCash || 0, currency)}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)' }}>{formatCurrency(s.expectedCash || 0, currency)}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)' }}>
                        {s.status === 'closed' ? formatCurrency(s.actualCash || 0, currency) : '—'}
                      </td>
                      <td style={{ 
                        padding: 'var(--space-3) var(--space-4)', 
                        fontSize: 'var(--text-footnote)',
                        fontWeight: 'var(--weight-bold)',
                        color: s.status !== 'closed' ? 'inherit' : variance === 0 ? 'var(--color-green)' : 'var(--color-red)'
                      }}>
                        {s.status === 'closed' ? formatCurrency(variance, currency) : '—'}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setSelectedShiftForZReport(s)}
                        >
                          Z-Report
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {shifts.length === 0 && !loadingShifts && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-tertiary)' }}>
                      No shifts recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: VOID AUDITS */}
      {activeTab === 'void_audits' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="card-title">Void Audit Ledger</span>
              <p style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                Chronological register of manager-authorized voids, cancellations, and spillage write-offs.
              </p>
            </div>
            {loadingVoids && <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 4 }} />}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['Time', 'Order Ref', 'Table', 'Item Name', 'Price', 'Qty', 'Void Value', 'Cashier', 'Authorized By', 'Reason'].map(h => (
                    <th key={h} style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {voidLogs.map(l => {
                  const timeStr = l.timestamp ? new Date(l.timestamp.seconds ? l.timestamp.seconds * 1000 : l.timestamp).toLocaleString() : '—';
                  const voidVal = l.value ?? ((l.itemPrice ?? 0) * (l.reducedQty ?? 0));
                  return (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', whiteSpace: 'nowrap' }}>{timeStr}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>
                        #{l.orderId?.substring(0, 8) || 'N/A'}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)' }}>{l.tableName || 'N/A'}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)' }}>{l.itemName}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)' }}>{formatCurrency(l.itemPrice || 0, currency)}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', textAlign: 'center' }}>{l.reducedQty}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-bold)', color: 'var(--color-red)' }}>
                        {formatCurrency(voidVal, currency)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)' }}>{l.cashierName}</td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-semibold)' }}>
                        🔑 {l.managerName}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <span className={`badge ${
                          l.reason === 'Burnt/Kitchen Error' ? 'badge-red' :
                          l.reason === 'Customer Rejected' ? 'badge-orange' :
                          l.reason === 'Promotion Comp' ? 'badge-green' :
                          l.reason === 'Spillage' ? 'badge-purple' : 'badge-gray'
                        }`} style={{ fontSize: 9, padding: '2px 6px', textTransform: 'uppercase' }}>
                          {l.reason}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {voidLogs.length === 0 && !loadingVoids && (
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-tertiary)' }}>
                      No void logs recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historic Z-Report Details Modal */}
      {selectedShiftForZReport && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div className="modal-content" style={{ maxWidth: '400px', width: '100%', padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', borderBottom: '1px solid var(--color-separator)', paddingBottom: '8px' }}>
              <h3 style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>⎙ Historic Z-Report</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedShiftForZReport(null)}>
                <X size={16} />
              </button>
            </div>
            
            <div style={{
              background: 'var(--color-bg-tertiary)',
              color: 'var(--color-label)',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '11px',
              whiteSpace: 'pre',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator)',
              maxHeight: '400px',
              overflowY: 'auto',
              marginBottom: '16px'
            }}>
              {(() => {
                const z = selectedShiftForZReport;
                const openedDate = z.openedAt ? new Date(z.openedAt.seconds ? z.openedAt.seconds * 1000 : z.openedAt).toLocaleString() : '';
                const closedDate = z.closedAt ? new Date(z.closedAt.seconds ? z.closedAt.seconds * 1000 : z.closedAt).toLocaleString() : 'Open Shift';
                const formatMonospace = (label, value) => {
                  const paddingLen = 38 - label.length - value.length;
                  const pad = paddingLen > 0 ? '.'.repeat(paddingLen) : ' ';
                  return `${label}${pad}${value}\n`;
                };
                
                let report = `======================================\n`;
                report += `          ${restaurant?.name?.toUpperCase() || 'POS RESTAURANT'}\n`;
                report += `          HISTORIC Z-REPORT           \n`;
                report += `======================================\n`;
                report += `Shift ID: ${z.id?.substring(0, 8) || 'N/A'}\n`;
                report += `Status: ${z.status?.toUpperCase() || 'N/A'}\n`;
                report += `Opened By: ${z.openedBy || 'N/A'}\n`;
                report += `Opened At: ${openedDate}\n`;
                if (z.status === 'closed') {
                  report += `Closed By: ${z.closedBy || 'N/A'}\n`;
                  report += `Closed At: ${closedDate}\n`;
                }
                report += `--------------------------------------\n`;
                report += formatMonospace('STARTING FLOAT', formatCurrency(z.startCash || 0, currency));
                report += `--------------------------------------\n`;
                report += formatMonospace(`CASH SALES (${z.cashSalesCount || 0})`, formatCurrency(z.cashSalesAmount || 0, currency));
                report += formatMonospace(`CARD SALES (${z.cardSalesCount || 0})`, formatCurrency(z.cardSalesAmount || 0, currency));
                report += formatMonospace(`UPI SALES (${z.upiSalesCount || 0})`, formatCurrency(z.upiSalesAmount || 0, currency));
                report += `--------------------------------------\n`;
                report += formatMonospace('TOTAL SALES', formatCurrency(z.totalSalesAmount || 0, currency));
                report += `--------------------------------------\n`;
                const dropsAmt = (z.cashDrops ?? []).reduce((sum, d) => sum + d.amount, 0);
                const paidOutsAmt = (z.paidOuts ?? []).reduce((sum, p) => sum + p.amount, 0);
                report += formatMonospace('TOTAL CASH DROPS', `-${formatCurrency(dropsAmt, currency)}`);
                report += formatMonospace('TOTAL PAID-OUTS', `-${formatCurrency(paidOutsAmt, currency)}`);
                report += `--------------------------------------\n`;
                report += formatMonospace('EXPECTED CASH', formatCurrency(z.expectedCash || 0, currency));
                if (z.status === 'closed') {
                  report += formatMonospace('COUNTED CASH', formatCurrency(z.actualCash || 0, currency));
                  report += formatMonospace('DRAWER VARIANCE', formatCurrency(z.variance || 0, currency));
                } else {
                  report += `DRAWER CURRENT EXPECTED: ${formatCurrency(z.expectedCash || 0, currency)}\n`;
                }
                report += `======================================\n\n`;
                return report;
              })()}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  const printWin = window.open('', '_blank', 'width=600,height=600');
                  const z = selectedShiftForZReport;
                  const openedDate = z.openedAt ? new Date(z.openedAt.seconds ? z.openedAt.seconds * 1000 : z.openedAt).toLocaleString() : '';
                  const closedDate = z.closedAt ? new Date(z.closedAt.seconds ? z.closedAt.seconds * 1000 : z.closedAt).toLocaleString() : 'Open Shift';
                  const formatMonospace = (label, value) => {
                    const paddingLen = 38 - label.length - value.length;
                    const pad = paddingLen > 0 ? '.'.repeat(paddingLen) : ' ';
                    return `${label}${pad}${value}\n`;
                  };
                  
                  let report = `======================================\n`;
                  report += `          ${restaurant?.name?.toUpperCase() || 'POS RESTAURANT'}\n`;
                  report += `          HISTORIC Z-REPORT           \n`;
                  report += `======================================\n`;
                  report += `Shift ID: ${z.id?.substring(0, 8) || 'N/A'}\n`;
                  report += `Status: ${z.status?.toUpperCase() || 'N/A'}\n`;
                  report += `Opened By: ${z.openedBy || 'N/A'}\n`;
                  report += `Opened At: ${openedDate}\n`;
                  if (z.status === 'closed') {
                    report += `Closed By: ${z.closedBy || 'N/A'}\n`;
                    report += `Closed At: ${closedDate}\n`;
                  }
                  report += `--------------------------------------\n`;
                  report += formatMonospace('STARTING FLOAT', formatCurrency(z.startCash || 0, currency));
                  report += `--------------------------------------\n`;
                  report += formatMonospace(`CASH SALES (${z.cashSalesCount || 0})`, formatCurrency(z.cashSalesAmount || 0, currency));
                  report += formatMonospace(`CARD SALES (${z.cardSalesCount || 0})`, formatCurrency(z.cardSalesAmount || 0, currency));
                  report += formatMonospace(`UPI SALES (${z.upiSalesCount || 0})`, formatCurrency(z.upiSalesAmount || 0, currency));
                  report += `--------------------------------------\n`;
                  report += formatMonospace('TOTAL SALES', formatCurrency(z.totalSalesAmount || 0, currency));
                  report += `--------------------------------------\n`;
                  const dropsAmt = (z.cashDrops ?? []).reduce((sum, d) => sum + d.amount, 0);
                  const paidOutsAmt = (z.paidOuts ?? []).reduce((sum, p) => sum + p.amount, 0);
                  report += formatMonospace('TOTAL CASH DROPS', `-${formatCurrency(dropsAmt, currency)}`);
                  report += formatMonospace('TOTAL PAID-OUTS', `-${formatCurrency(paidOutsAmt, currency)}`);
                  report += `--------------------------------------\n`;
                  report += formatMonospace('EXPECTED CASH', formatCurrency(z.expectedCash || 0, currency));
                  if (z.status === 'closed') {
                    report += formatMonospace('COUNTED CASH', formatCurrency(z.actualCash || 0, currency));
                    report += formatMonospace('DRAWER VARIANCE', formatCurrency(z.variance || 0, currency));
                  }
                  report += `======================================\n\n`;

                  printWin.document.write(`<html><head><title>Z-Report</title><style>body{font-family:monospace;white-space:pre;padding:20px;color:#18181b;}</style></head><body>${report}</body></html>`);
                  printWin.document.close();
                  printWin.focus();
                  printWin.print();
                  printWin.close();
                }}
              >
                🖨️ Print Receipt
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => setSelectedShiftForZReport(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* TAB: TIPS & GRATUITIES */}
      {activeTab === 'tips' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

          {/* KPI Summary Cards */}
          <div className="stat-grid">
            {[
              { label: 'Total Tips Collected', value: formatCurrency(totalTips, currency), color: 'var(--color-orange)', bg: 'var(--color-orange-light)', icon: HeartHandshake },
              { label: 'Orders With Tips', value: `${tipsOrders.length} / ${totalOrders}`, color: 'var(--color-green)', bg: 'var(--color-green-light)', icon: ShoppingCart },
              { label: 'Average Tip Amount', value: avgTip > 0 ? formatCurrency(avgTip, currency) : 'N/A', color: 'var(--color-accent)', bg: 'var(--color-accent-light)', icon: BarChart3 },
              { label: 'Tip Attachment Rate', value: `${tipRate.toFixed(1)}%`, color: 'var(--color-purple)', bg: 'var(--color-purple-light)', icon: TrendingUp },
            ].map((kpi, i) => (
              <div key={i} className="stat-card">
                <div className="stat-card-icon" style={{ background: kpi.bg }}>
                  <kpi.icon size={20} color={kpi.color} />
                </div>
                <div className="stat-card-value">{loading ? <div className="skeleton" style={{height:28,width:80,borderRadius:6}}/> : kpi.value}</div>
                <div className="stat-card-label">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* Staff Tip Leaderboard */}
          <div className="card card-padded">
            <h3 className="text-title3" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
              <HeartHandshake size={18} color="var(--color-orange)" /> Staff Tip Leaderboard
            </h3>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 48, borderRadius: 8 }} />)}
              </div>
            ) : tipLeaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-label-tertiary)', padding: 'var(--space-6)' }}>
                No tips recorded in this period.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {tipLeaderboard.map((s, idx) => (
                  <div key={s.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: idx === 0 ? 'rgba(255,149,0,0.08)' : 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: `1.5px solid ${idx === 0 ? 'rgba(255,149,0,0.3)' : 'var(--color-separator)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: idx === 0 ? 'var(--color-orange)' : 'var(--color-bg-tertiary)',
                        color: idx === 0 ? 'var(--color-on-dark)' : 'var(--color-label-secondary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 'var(--weight-heavy)', fontSize: 12, flexShrink: 0
                      }}>
                        {idx === 0 ? '🏆' : `#${idx + 1}`}
                      </span>
                      <div>
                        <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>{s.tipCount} tipped orders</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-orange)', fontSize: 'var(--text-subhead)' }}>
                        {formatCurrency(s.tipTotal, currency)}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                        avg {formatCurrency(s.tipTotal / s.tipCount, currency)}/order
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detailed Tip Log */}
          <div className="card card-padded">
            <h3 className="text-title3" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
              📋 Tip Transaction Log
            </h3>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 40, borderRadius: 8 }} />)}
              </div>
            ) : tipsOrders.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--color-label-tertiary)', padding: 'var(--space-6)' }}>
                No tipped orders for this period.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-footnote)' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-separator)' }}>
                      {['Date & Time', 'Order #', 'Staff', 'Order Total', 'Tip Amount', 'Tip %'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--color-label-secondary)', fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tipsOrders.slice(0, 100).map((order, idx) => {
                      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                      const tipPct = order.subtotal > 0 ? (order.tipAmount / order.subtotal) * 100 : 0;
                      const staffName = order.staffId ? (staffMap[order.staffId] || 'Staff ' + order.staffId.slice(-4)) : '—';
                      return (
                        <tr key={order.id} style={{ borderBottom: '1px solid var(--color-separator)', background: idx % 2 === 0 ? 'transparent' : 'var(--color-bg-secondary)' }}>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--color-label-secondary)' }}>
                            {orderDate.toLocaleString()}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 'var(--weight-semibold)' }}>
                            #{order.id?.slice(-6).toUpperCase()}
                          </td>
                          <td style={{ padding: '8px 12px' }}>{staffName}</td>
                          <td style={{ padding: '8px 12px' }}>{formatCurrency(order.total ?? 0, currency)}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 'var(--weight-bold)', color: 'var(--color-orange)' }}>
                            +{formatCurrency(order.tipAmount, currency)}
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--color-label-secondary)' }}>
                            {tipPct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
