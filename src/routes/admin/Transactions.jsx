import { useState, useEffect, useMemo, Fragment } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useStaffStore } from '../../stores/staffStore';
import { collection, query, where, getDocs, orderBy, limit, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatCurrency';
import { Search, Download, ChevronDown, ChevronUp, Receipt, Clock, Tag, User, Flag } from 'lucide-react';
import InfoTooltip from '../../components/shared/InfoTooltip';
import toast from 'react-hot-toast';

export default function Transactions() {
  const { restaurant } = useAuthStore();
  const { staff } = useStaffStore();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  
  // Filters
  const [dateRange, setDateRange] = useState('today'); // today, week, month, all
  const [paymentFilter, setPaymentFilter] = useState('all'); // all, cash, card, upi, split
  const [typeFilter, setTypeFilter] = useState('all'); // all, dine-in, takeaway, online
  const [staffFilter, setStaffFilter] = useState('all'); // all or staff ID
  const [searchQuery, setSearchQuery] = useState('');
  
  // UI state
  const [expandedRows, setExpandedRows] = useState(new Set());
  
  const currency = restaurant?.currency ?? 'INR';

  const staffMap = useMemo(() => {
    return staff.reduce((acc, s) => {
      acc[s.id] = s.name;
      return acc;
    }, {});
  }, [staff]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const start = new Date();
        if (dateRange === 'today') start.setHours(0, 0, 0, 0);
        else if (dateRange === 'week') start.setDate(start.getDate() - 7);
        else if (dateRange === 'month') start.setDate(start.getDate() - 30);
        else start.setFullYear(2000); // effectively 'all'

        // Limit to 1000 orders to prevent heavy reads on client
        const q = query(
          collection(db, 'restaurants', restaurant.id, 'orders'),
          where('createdAt', '>=', start),
          orderBy('createdAt', 'desc'),
          limit(1000)
        );

        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter out unpaid/cancelled orders if desired, or show them with clear badges
        // For a transaction ledger, we usually want to see completed/billed orders
        const completedOrders = docs.filter(d => 
          (d.status === 'billed' || (d.paymentMethod && d.paymentMethod !== 'unpaid')) && 
          d.status !== 'cancelled'
        );
        
        setOrders(completedOrders);
      } catch (error) {
        console.error("Error fetching transactions:", error);
        toast.error("Failed to load transactions");
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [restaurant?.id, dateRange]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (paymentFilter !== 'all' && order.paymentMethod !== paymentFilter) return false;
      if (typeFilter !== 'all' && order.type !== typeFilter) return false;
      if (staffFilter !== 'all' && order.staffId !== staffFilter) return false;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const idMatch = order.id.toLowerCase().includes(query);
        const tableMatch = (order.tableName || '').toLowerCase().includes(query);
        const customerMatch = (order.customerName || '').toLowerCase().includes(query);
        const tokenMatch = (order.token || '').toString().toLowerCase().includes(query);
        if (!idMatch && !tableMatch && !customerMatch && !tokenMatch) return false;
      }
      
      return true;
    });
  }, [orders, paymentFilter, typeFilter, staffFilter, searchQuery]);

  const stats = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const avgTicket = filteredOrders.length ? totalRevenue / filteredOrders.length : 0;
    return { count: filteredOrders.length, totalRevenue, avgTicket };
  }, [filteredOrders]);

  const toggleRow = (id) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFlag = async (e, orderId, currentFlagState) => {
    e.stopPropagation();
    try {
      const orderRef = doc(db, 'restaurants', restaurant.id, 'orders', orderId);
      await updateDoc(orderRef, { flagged: !currentFlagState });
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, flagged: !currentFlagState } : o));
      toast.success(currentFlagState ? 'Flag removed.' : 'Transaction flagged for review.');
    } catch (error) {
      console.error('Error flagging transaction:', error);
      toast.error('Failed to update flag status');
    }
  };

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Order ID', 'Date', 'Type', 'Table/Token', 'Customer', 'Staff', 'Payment Method', 'Subtotal', 'Discount', 'Tip', 'Total'];
    const rows = filteredOrders.map(o => {
      const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : new Date(o.createdAt).toLocaleString();
      const staffName = staffMap[o.staffId] || (o.staffId ? `Staff (${o.staffId.slice(-4)})` : 'Self-ordered');
      const tableToken = o.tableName ? `Table ${o.tableName}` : (o.token ? `Token ${o.token}` : 'N/A');
      return [
        o.id,
        `"${date}"`,
        o.type,
        `"${tableToken}"`,
        `"${o.customerName || 'N/A'}"`,
        `"${staffName}"`,
        o.paymentMethod || 'N/A',
        o.subtotal || 0,
        o.discountAmount || 0,
        o.tipAmount || 0,
        o.total || 0
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Receipt size={24} /> Transactions Ledger
          </h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            View and search all completed orders and payment details.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handleExportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      {/* Filters and Search */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div style={{ flex: '1 1 200px' }}>
            <div className="search-bar" style={{ width: '100%' }}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Search ID, table, or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          
          <select className="form-input" style={{ width: '150px' }} value={dateRange} onChange={e => setDateRange(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="all">All Time (Max 1000)</option>
          </select>
          
          <select className="form-input" style={{ width: '150px' }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All Types</option>
            <option value="dine-in">Dine-in</option>
            <option value="takeaway">Takeaway</option>
            <option value="online">Online</option>
          </select>
          
          <select className="form-input" style={{ width: '150px' }} value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
            <option value="all">All Payments</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="upi">UPI</option>
            <option value="split">Split</option>
          </select>
          
          <select className="form-input" style={{ width: '150px' }} value={staffFilter} onChange={e => setStaffFilter(e.target.value)}>
            <option value="all">All Staff</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        
        {/* Summary Bar */}
        <div style={{ 
          display: 'flex', 
          gap: 'var(--space-6)', 
          padding: 'var(--space-3)', 
          background: 'var(--color-bg-secondary)', 
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-separator)'
        }}>
          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)', fontWeight: 600 }}>Total Orders</span>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>{stats.count}</div>
          </div>
          <div>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)', fontWeight: 600 }}>Total Revenue</span>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-green)' }}>{formatCurrency(stats.totalRevenue, currency)}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)', fontWeight: 600 }}>Avg Bill Size</span>
            <InfoTooltip text="The typical amount per order in the current filtered view" size={12} />
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-orange)' }}>{formatCurrency(stats.avgTicket, currency)}</div>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-6)', display: 'flex', justifyContent: 'center' }}>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
            <Receipt size={40} style={{ opacity: 0.2, margin: '0 auto var(--space-3)' }} />
            <div style={{ fontWeight: 600 }}>No transactions found</div>
            <div style={{ fontSize: '13px' }}>Try adjusting your filters</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>Order ID</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>Date</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>Type / Table</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>Staff</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>Payment <InfoTooltip text="Method used by customer" size={12} /></th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)' }}>Total</th>
                  <th style={{ padding: '12px 16px', width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const isExpanded = expandedRows.has(order.id);
                  const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                  const staffName = staffMap[order.staffId] || (order.staffId ? `Staff` : 'Self');
                  
                  let paymentColor = '#059669';
                  let paymentBg = '#ecfdf5';
                  if (order.paymentMethod === 'card') { paymentColor = '#2563eb'; paymentBg = '#eff6ff'; }
                  if (order.paymentMethod === 'upi') { paymentColor = '#7c3aed'; paymentBg = '#f5f3ff'; }
                  if (order.paymentMethod === 'split') { paymentColor = '#d97706'; paymentBg = '#fffbeb'; }

                  return (
                    <Fragment key={order.id}>
                      <tr 
                        style={{ borderBottom: '1px solid var(--color-separator)', cursor: 'pointer' }}
                        onClick={() => toggleRow(order.id)}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-secondary)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
                          #{order.id.slice(-6).toUpperCase()}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                          <div>{date.toLocaleDateString()}</div>
                          <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>{date.toLocaleTimeString()}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`badge ${order.type === 'online' ? 'badge-purple' : order.type === 'dine-in' ? 'badge-blue' : 'badge-orange'}`} style={{ fontSize: '10px' }}>
                              {order.type}
                            </span>
                            {order.tableName && <span style={{ fontSize: '13px', fontWeight: 600 }}>{order.tableName}</span>}
                            {order.token && <span style={{ fontSize: '13px', fontWeight: 600 }}>T-{order.token}</span>}
                            {order.flagged && <Flag size={14} color="var(--color-red)" fill="var(--color-red)" style={{ marginLeft: 4 }} title="Flagged for review" />}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <User size={12} color="var(--color-label-secondary)" /> {staffName}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ 
                            padding: '2px 8px', 
                            borderRadius: '12px', 
                            fontSize: '10px', 
                            fontWeight: 700, 
                            textTransform: 'uppercase',
                            color: paymentColor,
                            background: paymentBg,
                            border: `1px solid ${paymentColor}30`
                          }}>
                            {order.paymentMethod === 'cash' ? '💵 Cash' : order.paymentMethod === 'card' ? '💳 Card' : order.paymentMethod === 'upi' ? '📱 UPI' : order.paymentMethod || 'N/A'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          {formatCurrency(order.total || 0, currency)}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--color-label-tertiary)' }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>
                      
                      {/* Expanded Drilldown */}
                      {isExpanded && (
                        <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}>
                          <td colSpan={7} style={{ padding: '16px 24px' }}>
                            <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
                              
                              {/* Order Items List */}
                              <div style={{ flex: '1 1 300px' }}>
                                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)', marginBottom: '8px', fontWeight: 700 }}>Order Items</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {(order.items || []).map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                                      <div style={{ display: 'flex', gap: 8 }}>
                                        <span style={{ fontWeight: 600, color: 'var(--color-label-secondary)' }}>{item.qty}x</span>
                                        <div>
                                          <div style={{ fontWeight: 500 }}>{item.name}</div>
                                          {item.modifiers && item.modifiers.length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                                              + {item.modifiers.map(m => m.name).join(', ')}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ fontWeight: 600 }}>{formatCurrency((item.price * item.qty) + (item.modifiers?.reduce((s,m)=>s+m.price,0) || 0)*item.qty, currency)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Summary Breakdown */}
                              <div style={{ flex: '0 0 250px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)', marginBottom: '0px', fontWeight: 700 }}>Summary</h4>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Subtotal</span>
                                  <span>{formatCurrency(order.subtotal || 0, currency)}</span>
                                </div>
                                {order.discountAmount > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-red)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Tag size={12}/> Discount</span>
                                    <span>-{formatCurrency(order.discountAmount, currency)}</span>
                                  </div>
                                )}
                                {order.tipAmount > 0 && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Tip</span>
                                    <span>{formatCurrency(order.tipAmount, currency)}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: 4, paddingTop: 8, borderTop: '1px dashed var(--color-separator)' }}>
                                  <span>Total</span>
                                  <span>{formatCurrency(order.total || 0, currency)}</span>
                                </div>
                              </div>
                              
                              {/* Metadata */}
                              <div style={{ flex: '0 0 200px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                                <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-label-secondary)', marginBottom: '0px', fontWeight: 700 }}>Info</h4>
                                {order.customerName && (
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Customer</span>
                                    <span>{order.customerName}</span>
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Status</span>
                                  <span style={{ textTransform: 'capitalize', fontWeight: 'var(--weight-bold)', color: order.status === 'billed' ? 'var(--color-green)' : 'inherit' }}>
                                    {order.status === 'billed' ? 'Paid ✅' : order.status}
                                  </span>
                                </div>
                                {order.prepDuration > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10}/> Avg Kitchen Time</span>
                                    <span>{Math.round(order.prepDuration / 60)} mins</span>
                                  </div>
                                )}
                                <button 
                                  className={`btn btn-sm ${order.flagged ? 'btn-danger' : 'btn-secondary'}`}
                                  onClick={(e) => handleFlag(e, order.id, order.flagged)} 
                                  style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                                >
                                  <Flag size={14} fill={order.flagged ? 'currentColor' : 'none'} /> 
                                  {order.flagged ? 'Remove Flag' : 'Flag for Review'}
                                </button>
                              </div>
                              
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
