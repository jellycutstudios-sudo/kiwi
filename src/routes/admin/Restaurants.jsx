import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { collection, onSnapshot, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, ExternalLink, Building2, BarChart3, TrendingUp, ShoppingCart, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY_OPTIONS, formatCurrency } from '../../utils/formatCurrency';

export default function Restaurants() {
  const { staffDoc } = useAuthStore();
  const [restaurants, setRestaurants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', address:'', phone:'', currency:'INR' });
  const [saving, setSaving] = useState(false);

  // Tabs layout
  const [activeTab, setActiveTab] = useState('outlets'); // 'outlets' | 'analytics'
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState({
    outletsData: [],
    totalRevenue: 0,
    totalOrders: 0,
    totalLowStock: 0,
    totalStaff: 0,
    lowStockList: []
  });

  useEffect(() => {
    // Super admin can see all restaurants linked to their uid
    const q = collection(db, 'restaurants');
    return onSnapshot(q, snap => {
      setRestaurants(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const fetchConsolidatedData = useCallback(async () => {
    if (restaurants.length === 0) return;
    setLoadingAnalytics(true);
    try {
      const results = await Promise.all(
        restaurants.map(async (r) => {
          // Parallel fetch of orders, inventory, and staff for each branch
          const [ordersSnap, inventorySnap, staffSnap] = await Promise.all([
            getDocs(query(collection(db, 'restaurants', r.id, 'orders'), where('status', '==', 'billed'))),
            getDocs(collection(db, 'restaurants', r.id, 'inventory')),
            getDocs(collection(db, 'restaurants', r.id, 'staff'))
          ]);

          const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const inventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const staff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          const revenue = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
          const lowStockIngredients = inventory.filter(ing => ing.qty <= ing.minQty);
          const lowStockCount = lowStockIngredients.length;

          return {
            id: r.id,
            name: r.name,
            currency: r.currency || 'INR',
            revenue,
            ordersCount: orders.length,
            lowStockCount,
            staffCount: staff.length,
            lowStockIngredients: lowStockIngredients.map(ing => ({
              id: ing.id,
              name: ing.name,
              qty: ing.qty,
              minQty: ing.minQty,
              unit: ing.unit,
              cost: ing.cost,
              restaurantName: r.name,
              restaurantId: r.id
            }))
          };
        })
      );

      const totalRevenue = results.reduce((sum, res) => sum + res.revenue, 0);
      const totalOrders = results.reduce((sum, res) => sum + res.ordersCount, 0);
      const totalLowStock = results.reduce((sum, res) => sum + res.lowStockCount, 0);
      const totalStaff = results.reduce((sum, res) => sum + res.staffCount, 0);
      const lowStockList = results.flatMap(res => res.lowStockIngredients);

      setAnalyticsData({
        outletsData: results,
        totalRevenue,
        totalOrders,
        totalLowStock,
        totalStaff,
        lowStockList
      });
    } catch (err) {
      console.error("Error loading consolidated analytics:", err);
      toast.error("Failed to load consolidated analytics");
    } finally {
      setLoadingAnalytics(false);
    }
  }, [restaurants]);

  useEffect(() => {
    if (activeTab === 'analytics' && restaurants.length > 0) {
      Promise.resolve().then(() => {
        fetchConsolidatedData();
      });
    }
  }, [activeTab, restaurants.length, fetchConsolidatedData]);

  const createRestaurant = async () => {
    if (!form.name.trim()) { toast.error('Enter restaurant name'); return; }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'restaurants'), {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        currency: form.currency,
        modes: ['pos'],
        taxConfig: { type: 'none' },
        createdAt: serverTimestamp(),
        ownerUid: staffDoc?.uid,
        status: 'approved', // Manual creation by super admin is pre-approved
      });
      toast.success(`Restaurant created! ID: ${ref.id}`);
      setShowForm(false);
      setSaving(false);
      setForm({ name:'', address:'', phone:'', currency:'INR' });
    } catch (e) {
      toast.error('Error creating restaurant: ' + e.message);
      setSaving(false);
    }
  };

  const updateRestaurantStatus = async (restaurantId, newStatus) => {
    try {
      const docRef = doc(db, 'restaurants', restaurantId);
      await updateDoc(docRef, { status: newStatus });
      toast.success(`Restaurant ${newStatus === 'approved' ? 'approved' : 'suspended'} successfully!`);
    } catch (e) {
      toast.error('Failed to update status: ' + e.message);
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-anim {
          animation: spin 1s linear infinite;
        }
      `}</style>

      {/* Header Section */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h2 className="text-title2">Restaurants</h2>
          <p className="text-secondary text-subhead" style={{marginTop:2}}>Manage all your restaurant branches</p>
        </div>
        {activeTab === 'outlets' ? (
          <button className="btn btn-primary" id="add-restaurant-btn" onClick={() => setShowForm(true)}>
            <Plus size={16}/> New Restaurant
          </button>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={fetchConsolidatedData}
            disabled={loadingAnalytics}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            id="sync-analytics-btn"
          >
            <RefreshCw size={14} className={loadingAnalytics ? 'spin-anim' : ''} />
            {loadingAnalytics ? 'Syncing...' : 'Sync Analytics'}
          </button>
        )}
      </div>

      {/* Tabs Selector Navigation */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--color-separator)', marginBottom: '-1px' }}>
        {[
          { key: 'outlets', label: 'Outlets Directory', icon: Building2 },
          { key: 'analytics', label: 'Consolidated Analytics', icon: BarChart3 }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: `2.5px solid ${activeTab === tab.key ? 'var(--color-accent)' : 'transparent'}`,
              color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-label-secondary)',
              fontWeight: activeTab === tab.key ? 'var(--weight-bold)' : 'var(--weight-semibold)',
              fontSize: 'var(--text-subhead)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast)',
              fontFamily: 'var(--font-family)',
              marginBottom: '-2px'
            }}
            id={`tab-btn-${tab.key}`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content: Outlets Directory ────────────── */}
      {activeTab === 'outlets' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'var(--space-4)' }}>
          {restaurants.map(r => (
            <div key={r.id} className="card card-padded" style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)', border: r.status !== 'approved' ? '1.5px solid var(--color-orange)' : '1px solid var(--color-separator)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:'var(--space-3)' }}>
                <div style={{ width:44, height:44, borderRadius:'var(--radius-lg)', background: r.status !== 'approved' ? 'var(--color-orange-light)' : 'var(--color-accent-light)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
                  🍽️
                </div>
                <div style={{flex:1}}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                    <div style={{ fontWeight:'var(--weight-bold)', fontSize:'var(--text-headline)' }}>{r.name}</div>
                    <span className={`badge ${r.status === 'approved' ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: 10 }}>
                      {r.status === 'approved' ? 'Approved' : 'Pending'}
                    </span>
                  </div>
                  {r.address && <div style={{ fontSize:'var(--text-caption1)', color:'var(--color-label-secondary)', marginTop:1 }}>📍 {r.address}</div>}
                </div>
              </div>
              <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap' }}>
                {(r.modes??[]).map(m => <span key={m} className="badge badge-blue">{m}</span>)}
              </div>
              <div style={{ display:'flex', gap:'var(--space-2)', alignItems:'center' }}>
                <code style={{ fontSize:'var(--text-caption2)', fontFamily:'var(--font-mono)', background:'var(--color-bg-secondary)', padding:'2px 6px', borderRadius:'var(--radius-xs)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {r.id}
                </code>
                <a href={`/order/${r.id}`} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-icon btn-sm" title="View order page">
                  <ExternalLink size={12}/>
                </a>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: '4px' }}>
                {r.status !== 'approved' ? (
                  <button
                    className="btn btn-success btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => updateRestaurantStatus(r.id, 'approved')}
                  >
                    Approve & Mark Paid
                  </button>
                ) : (
                  <button
                    className="btn btn-danger btn-sm"
                    style={{ flex: 1, background: 'transparent', color: 'var(--color-red)', borderColor: 'var(--color-red)' }}
                    onClick={() => updateRestaurantStatus(r.id, 'suspended')}
                  >
                    Suspend Outlet
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab Content: Consolidated Analytics ────────── */}
      {activeTab === 'analytics' && loadingAnalytics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="stat-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div className="skeleton" style={{ height: 40, width: 40, borderRadius: 8 }} />
                <div className="skeleton" style={{ height: 28, width: 100, borderRadius: 6, marginTop: 8 }} />
                <div className="skeleton" style={{ height: 16, width: 80, borderRadius: 4, marginTop: 4 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div className="card card-padded" style={{ flex: 1, height: 250 }}>
              <div className="skeleton" style={{ height: '100%', borderRadius: 8 }} />
            </div>
            <div className="card card-padded" style={{ flex: 1.2, height: 250 }}>
              <div className="skeleton" style={{ height: '100%', borderRadius: 8 }} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && !loadingAnalytics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* KPI Summary Cards Grid */}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: 'var(--color-accent-light)' }}>
                <Building2 size={20} color="var(--color-accent)" />
              </div>
              <div className="stat-card-value">{restaurants.length}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Total Outlets</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(52, 199, 89, 0.15)' }}>
                <TrendingUp size={20} color="#34C759" />
              </div>
              <div className="stat-card-value">{formatCurrency(analyticsData.totalRevenue, 'INR')}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Group Sales Revenue</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(0, 122, 255, 0.15)' }}>
                <ShoppingCart size={20} color="#007AFF" />
              </div>
              <div className="stat-card-value">{analyticsData.totalOrders}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Group Orders</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: analyticsData.totalLowStock > 0 ? 'rgba(255, 149, 0, 0.15)' : 'var(--color-bg-secondary)' }}>
                <AlertTriangle size={20} color={analyticsData.totalLowStock > 0 ? '#FF9500' : 'var(--color-label-secondary)'} />
              </div>
              <div className="stat-card-value">{analyticsData.totalLowStock}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Global Stock Alerts</div>
            </div>
          </div>

          {/* Sales Leaderboard and Outlets Overview Tables */}
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {/* Sales Share Leaderboard SVG chart */}
            <div className="card card-padded" style={{ flex: 1, minWidth: 350, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>Sales Leaderboard</h3>
                <span className="badge badge-blue">Comparison Shares</span>
              </div>
              {analyticsData.outletsData.length === 0 ? (
                <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>No data available</div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox={`0 0 600 ${Math.max(120, analyticsData.outletsData.length * 45 + 20)}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
                    {analyticsData.outletsData.map((res, idx) => {
                      const maxRevenue = Math.max(...analyticsData.outletsData.map(o => o.revenue), 1);
                      const sharePercent = analyticsData.totalRevenue > 0 ? (res.revenue / analyticsData.totalRevenue) * 100 : 0;
                      const barWidth = maxRevenue > 0 ? (res.revenue / maxRevenue) * 360 : 0;
                      const y = idx * 45 + 10;
                      return (
                        <g key={res.id}>
                          <text
                            x={140}
                            y={y + 15}
                            textAnchor="end"
                            style={{
                              fill: 'var(--color-label)',
                              fontSize: 12,
                              fontWeight: 'var(--weight-bold)',
                              fontFamily: 'var(--font-family)'
                            }}
                          >
                            {res.name}
                          </text>
                          <rect
                            x={150}
                            y={y + 3}
                            width={360}
                            height={16}
                            rx={8}
                            fill="var(--color-bg-secondary)"
                          />
                          <rect
                            x={150}
                            y={y + 3}
                            width={Math.max(barWidth, 6)}
                            height={16}
                            rx={8}
                            fill="var(--color-accent)"
                          />
                          <text
                            x={150 + Math.max(barWidth, 6) + 8}
                            y={y + 15}
                            style={{
                              fill: 'var(--color-label-secondary)',
                              fontSize: 11,
                              fontWeight: 'var(--weight-semibold)',
                              fontFamily: 'var(--font-family)'
                            }}
                          >
                            {formatCurrency(res.revenue, res.currency)} ({sharePercent.toFixed(0)}%)
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            {/* Outlets comparison table */}
            <div className="card card-padded" style={{ flex: 1.2, minWidth: 350 }}>
              <h3 style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-4)' }}>Outlets Overview</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      {['Restaurant Branch', 'Net Sales', 'Orders', 'Low Stock', 'Active Staff'].map(h => (
                        <th key={h} style={{
                          padding: 'var(--space-3) var(--space-4)',
                          textAlign: h === 'Restaurant Branch' ? 'left' : 'right',
                          fontSize: 'var(--text-caption1)',
                          fontWeight: 'var(--weight-semibold)',
                          color: 'var(--color-label-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.outletsData.map(res => (
                      <tr key={res.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>
                          <div>{res.name}</div>
                          <code style={{ fontSize: 10, color: 'var(--color-label-tertiary)', fontFamily: 'var(--font-mono)' }}>{res.id}</code>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--weight-semibold)' }}>
                          {formatCurrency(res.revenue, res.currency)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                          {res.ordersCount}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                          <span className={`badge ${res.lowStockCount > 0 ? 'badge-red' : 'badge-green'}`}>
                            {res.lowStockCount} alerts
                          </span>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                          {res.staffCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Consolidated Low Stock Ledger */}
          <div className="card card-padded">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <AlertTriangle size={18} color="#FF9500" />
              <h3 style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>Consolidated Low Stock Ledger</h3>
            </div>
            {analyticsData.lowStockList.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-label-secondary)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
                🎉 All outlets are fully stocked! No low stock warnings.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      {['Outlet Branch', 'Ingredient', 'Stock Quantity', 'Safety Level', 'Unit Cost', 'Status'].map(h => (
                        <th key={h} style={{
                          padding: 'var(--space-3) var(--space-4)',
                          textAlign: h === 'Outlet Branch' || h === 'Ingredient' ? 'left' : (h === 'Status' ? 'center' : 'right'),
                          fontSize: 'var(--text-caption1)',
                          fontWeight: 'var(--weight-semibold)',
                          color: 'var(--color-label-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analyticsData.lowStockList.map((ing, idx) => (
                      <tr key={`${ing.restaurantId}-${ing.id}-${idx}`} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                          {ing.restaurantName}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)' }}>
                          {ing.name}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--weight-semibold)', color: 'var(--color-red)' }}>
                          {ing.qty} {ing.unit}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', color: 'var(--color-label-secondary)' }}>
                          {ing.minQty} {ing.unit}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                          {formatCurrency(ing.cost, 'INR')}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                          <span className="badge badge-red">Low Stock</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">New Restaurant</h2>
              <button className="btn btn-secondary btn-icon" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Restaurant Name</label>
                <input id="new-rest-name" className="form-input" placeholder="My Restaurant" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input id="new-rest-address" className="form-input" placeholder="Street, City" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input id="new-rest-phone" className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select id="new-rest-currency" className="form-select" value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
                    {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="create-restaurant-btn" onClick={createRestaurant} disabled={saving}>
                {saving?'Creating...':'Create Restaurant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
