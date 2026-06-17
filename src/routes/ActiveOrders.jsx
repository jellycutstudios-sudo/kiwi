import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { formatCurrency } from '../utils/formatCurrency';
import { computeTax } from '../utils/taxUtils';
import { printReceipt } from '../utils/print';
import { 
  ClipboardList, Search, Clock, Printer, Check, ChefHat, 
  Bell, AlertTriangle, User, Eye, X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ActiveOrders() {
  const { t } = useTranslation();
  const { restaurant, staffDoc } = useAuthStore();
  const { activeOrders, updateOrderStatus } = useOrderStore();
  
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'dine-in' | 'takeaway' | 'online'
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'pending' | 'preparing' | 'ready' (for mobile toggle)
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  
  // Crossed items state (for local checklist on cards)
  const [crossedItems, setCrossedItems] = useState({}); // { [orderId-itemIdx]: boolean }

  // Tick state to force re-render for relative times
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 20000);
    return () => clearInterval(interval);
  }, []);

  const getElapsedMinutes = (createdAt) => {
    if (!createdAt) return 0;
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diffMs = new Date() - date;
    return Math.floor(diffMs / 60000);
  };

  const getElapsedTimeText = (createdAt) => {
    const mins = getElapsedMinutes(createdAt);
    if (mins < 1) return t('loading') === 'جاري التحميل...' ? 'الآن' : 'Just now';
    return t('loading') === 'جاري التحميل...' ? `منذ ${mins} د` : `${mins}m ago`;
  };

  const toggleCrossItem = (orderId, idx) => {
    const key = `${orderId}-${idx}`;
    setCrossedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStatusChange = async (orderId, nextStatus, successMsg) => {
    try {
      await updateOrderStatus(restaurant.id, orderId, nextStatus);
      toast.success(successMsg || `Order status updated to ${nextStatus}!`);
    } catch (err) {
      toast.error('Failed to update status: ' + err.message);
    }
  };

  const handlePrint = (order) => {
    const discountAmount = order.discountAmount ?? 0;
    const taxableAmount = Math.max(0, order.subtotal - discountAmount - (order.pointsDiscount ?? 0));
    const taxInfo = computeTax(taxableAmount, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
    printReceipt({
      restaurant,
      order,
      items: order.items,
      taxInfo,
      staffName: staffDoc?.name || 'Cashier'
    });
    toast.success('Print command sent!');
  };

  // Filter orders
  const filteredOrders = activeOrders.filter(order => {
    // 1. Search filter (Customer Name, Phone, ID, Table, Token)
    const queryStr = search.toLowerCase().trim();
    const matchesSearch = !queryStr || 
      (order.customerName && order.customerName.toLowerCase().includes(queryStr)) ||
      (order.customerPhone && order.customerPhone.includes(queryStr)) ||
      (order.tableName && order.tableName.toLowerCase().includes(queryStr)) ||
      (order.token && String(order.token).includes(queryStr)) ||
      order.id.toLowerCase().includes(queryStr);

    // 2. Type filter
    const matchesType = typeFilter === 'all' || order.type === typeFilter;

    return matchesSearch && matchesType;
  });

  // Group by status
  const pendingOrders = filteredOrders.filter(o => o.status === 'pending');
  const preparingOrders = filteredOrders.filter(o => o.status === 'preparing');
  const readyOrders = filteredOrders.filter(o => o.status === 'ready');

  // Render order card helper
  const renderOrderCard = (order) => {
    const elapsedMins = getElapsedMinutes(order.createdAt);
    const isLate = elapsedMins >= 15;
    
    return (
      <div 
        key={order.id} 
        className={`card active-order-card ${isLate ? 'border-late' : ''}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderLeft: isLate ? '4px solid var(--color-red)' : '4px solid var(--color-accent)',
          background: 'var(--color-bg-elevated)',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
        }}
      >
        {/* Card Header */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-separator-opaque)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-body)', color: 'var(--color-label)' }}>
                {order.type === 'dine-in' ? `🍽️ ${order.tableName || 'Table'}` : order.type === 'takeaway' ? `🛍️ Token #${order.token ?? '—'}` : `🌐 Online`}
              </span>
              <span style={{
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 'var(--weight-bold)',
                background: order.type === 'dine-in' ? 'var(--color-blue-light)' : order.type === 'takeaway' ? 'var(--color-orange-light)' : 'var(--color-purple-light)',
                color: order.type === 'dine-in' ? 'var(--color-blue)' : order.type === 'takeaway' ? 'var(--color-orange)' : 'var(--color-purple)',
                textTransform: 'uppercase'
              }}>
                {order.type}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', fontFamily: 'var(--font-mono)' }}>
              #{order.id.slice(-6).toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: isLate ? 'var(--color-red)' : 'var(--color-label-secondary)', fontSize: 'var(--text-caption1)', fontWeight: isLate ? 'var(--weight-bold)' : 'var(--weight-medium)' }}>
            <Clock size={12} />
            <span>{getElapsedTimeText(order.createdAt)}</span>
            {isLate && <AlertTriangle size={12} color="var(--color-red)" />}
          </div>
        </div>

        {/* Card Body */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.customerName && (
            <div style={{ fontSize: '13px', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={12} />
              <span>{order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}</span>
            </div>
          )}

          {/* Items Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {order.items?.map((item, idx) => {
              const isCrossed = !!crossedItems[`${order.id}-${idx}`];
              return (
                <label 
                  key={idx} 
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 'var(--text-subhead)',
                    color: isCrossed ? 'var(--color-label-tertiary)' : 'var(--color-label)',
                    textDecoration: isCrossed ? 'line-through' : 'none',
                    padding: '2px 0'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleCrossItem(order.id, idx);
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={isCrossed} 
                    onChange={() => {}} 
                    style={{ marginTop: 3, cursor: 'pointer' }} 
                  />
                  <div>
                    <span style={{ fontWeight: 'var(--weight-bold)', marginRight: 4 }}>×{item.qty}</span>
                    <span>{item.name}</span>
                    {item.course && (
                      <span style={{ fontSize: '9px', marginLeft: 6, padding: '1px 4px', borderRadius: 4, background: 'var(--color-bg-secondary)', color: 'var(--color-label-secondary)' }}>
                        {item.course}
                      </span>
                    )}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', textDecoration: 'none', display: 'block' }}>
                        + {item.selectedModifiers.map(m => m.name).join(', ')}
                      </div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {order.note && (
            <div style={{ fontSize: '12px', padding: '6px 10px', background: 'var(--color-brand-ochre-light)', color: 'var(--color-label)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-brand-ochre)', marginTop: 4 }}>
              📝 {order.note}
            </div>
          )}
        </div>

        {/* Card Footer Actions */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-separator-opaque)', display: 'flex', gap: 6, background: 'var(--color-bg-secondary)' }}>
          <button 
            className="btn btn-secondary btn-icon btn-sm"
            onClick={() => setSelectedOrderDetails(order)}
            title="View Details"
            style={{ width: 32, height: 32, padding: 0 }}
          >
            <Eye size={14} />
          </button>
          
          <button 
            className="btn btn-secondary btn-icon btn-sm"
            onClick={() => handlePrint(order)}
            title="Print Receipt"
            style={{ width: 32, height: 32, padding: 0 }}
          >
            <Printer size={14} />
          </button>

          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {order.status === 'pending' && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => handleStatusChange(order.id, 'preparing', 'Sent to preparation')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', padding: '0 10px', height: 32 }}
              >
                <ChefHat size={12} />
                <span>Cook</span>
              </button>
            )}

            {order.status === 'preparing' && (
              <button 
                className="btn btn-primary btn-sm"
                onClick={() => handleStatusChange(order.id, 'ready', 'Marked as Ready!')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', padding: '0 10px', height: 32, background: 'var(--color-teal)', borderColor: 'var(--color-teal)' }}
              >
                <Bell size={12} />
                <span>Ready</span>
              </button>
            )}

            {order.status === 'ready' && (
              <button 
                className="btn btn-success btn-sm"
                onClick={() => handleStatusChange(order.id, order.type === 'dine-in' ? 'served' : 'billed', 'Order completed!')}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', padding: '0 10px', height: 32, background: 'var(--color-green)', borderColor: 'var(--color-green)' }}
              >
                <Check size={12} />
                <span>{order.type === 'dine-in' ? 'Serve' : 'Complete'}</span>
              </button>
            )}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', height: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClipboardList size={24} color="var(--color-accent)" />
            <span>{t('activeOrders')}</span>
          </h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Manage and track active orders across dine-in, takeaway, and online platforms
          </p>
        </div>

        {/* Counter Summary badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div className="badge badge-yellow" style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⏳ Pending:</span>
            <strong>{pendingOrders.length}</strong>
          </div>
          <div className="badge badge-blue" style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🍳 Preparing:</span>
            <strong>{preparingOrders.length}</strong>
          </div>
          <div className="badge badge-teal" style={{ fontSize: '12px', padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🔔 Ready:</span>
            <strong>{readyOrders.length}</strong>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="card card-padded" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap', padding: '12px var(--space-4)' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-secondary)' }} />
          <input 
            className="form-input"
            type="text"
            placeholder="Search by table, customer, token or order ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36, height: 38 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'All Types' },
            { id: 'dine-in', label: '🍽️ Dine-in' },
            { id: 'takeaway', label: '🛍️ Takeaway' },
            { id: 'online', label: '🌐 Online' }
          ].map(filter => (
            <button
              key={filter.id}
              onClick={() => setTypeFilter(filter.id)}
              className={`btn btn-sm ${typeFilter === filter.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ height: 38, borderRadius: 8, fontSize: '12px', fontWeight: 'var(--weight-semibold)', padding: '0 var(--space-3)' }}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Tab Selector (only visible on small screens / toggled in CSS) */}
      <div className="mobile-tabs-container" style={{ display: 'none', background: 'var(--color-bg-secondary)', borderRadius: 10, padding: 3 }}>
        {[
          { id: 'all', label: `All (${filteredOrders.length})` },
          { id: 'pending', label: `Pending (${pendingOrders.length})` },
          { id: 'preparing', label: `Prep (${preparingOrders.length})` },
          { id: 'ready', label: `Ready (${readyOrders.length})` }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="mobile-tab-btn"
            style={{
              flex: 1,
              border: 'none',
              background: activeTab === t.id ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === t.id ? 'var(--color-label)' : 'var(--color-label-secondary)',
              fontWeight: 'var(--weight-bold)',
              padding: '8px 4px',
              fontSize: '12px',
              borderRadius: 8,
              boxShadow: activeTab === t.id ? 'var(--shadow-xs)' : 'none',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Kanban Board Grid */}
      <div className="kanban-grid-container" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', overflow: 'hidden' }}>
        
        {/* Column 1: Pending */}
        <div className="kanban-column column-pending" style={{ display: activeTab === 'all' || activeTab === 'pending' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)', background: '#fafaf9', borderRadius: 16, padding: 'var(--space-4)', border: '1px solid var(--color-separator-opaque)', maxHeight: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #fef08a', paddingBottom: 8 }}>
            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-headline)', color: '#a16207' }}>
              ⏳ Pending ({pendingOrders.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {pendingOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--color-label-tertiary)', fontSize: '13px' }}>
                No pending orders
              </div>
            ) : pendingOrders.map(renderOrderCard)}
          </div>
        </div>

        {/* Column 2: Preparing */}
        <div className="kanban-column column-preparing" style={{ display: activeTab === 'all' || activeTab === 'preparing' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)', background: '#f5f7ff', borderRadius: 16, padding: 'var(--space-4)', border: '1px solid var(--color-separator-opaque)', maxHeight: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #bfdbfe', paddingBottom: 8 }}>
            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-headline)', color: '#1e40af' }}>
              🍳 Preparing ({preparingOrders.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {preparingOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--color-label-tertiary)', fontSize: '13px' }}>
                No preparing orders
              </div>
            ) : preparingOrders.map(renderOrderCard)}
          </div>
        </div>

        {/* Column 3: Ready */}
        <div className="kanban-column column-ready" style={{ display: activeTab === 'all' || activeTab === 'ready' ? 'flex' : 'none', flexDirection: 'column', gap: 'var(--space-3)', background: '#f0fdf4', borderRadius: 16, padding: 'var(--space-4)', border: '1px solid var(--color-separator-opaque)', maxHeight: '100%', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #bbf7d0', paddingBottom: 8 }}>
            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-headline)', color: '#166534' }}>
              🔔 Ready ({readyOrders.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {readyOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--color-label-tertiary)', fontSize: '13px' }}>
                No ready orders
              </div>
            ) : readyOrders.map(renderOrderCard)}
          </div>
        </div>

      </div>

      {/* CSS Styles injection (to handle responsive styling for Kanban grid vs tabs) */}
      <style>{`
        @media (max-width: 900px) {
          .kanban-grid-container {
            grid-template-columns: 1fr !important;
            overflow-y: auto !important;
          }
          .kanban-column {
            max-height: none !important;
            overflow-y: visible !important;
          }
          .mobile-tabs-container {
            display: flex !important;
          }
        }
        .active-order-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.04) !important;
        }
        .border-late {
          animation: border-pulse 2s infinite ease-in-out;
        }
        @keyframes border-pulse {
          0%, 100% { border-color: var(--color-red); }
          50% { border-color: rgba(239, 68, 68, 0.3); }
        }
      `}</style>

      {/* Details Modal */}
      {selectedOrderDetails && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedOrderDetails(null)}>
          <div className="modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                Order Details (#{selectedOrderDetails.id.slice(-8).toUpperCase()})
              </h2>
              <button 
                className="btn btn-secondary btn-icon" 
                onClick={() => setSelectedOrderDetails(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* Type and info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>
                  Type: {selectedOrderDetails.type.toUpperCase()}
                </span>
                <span className={`badge ${
                  selectedOrderDetails.status === 'pending' ? 'badge-yellow' : 
                  selectedOrderDetails.status === 'preparing' ? 'badge-blue' : 'badge-teal'
                }`}>
                  {selectedOrderDetails.status.toUpperCase()}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--color-bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                {selectedOrderDetails.tableName && <div><strong>Table:</strong> {selectedOrderDetails.tableName}</div>}
                {selectedOrderDetails.token && <div><strong>Token:</strong> #{selectedOrderDetails.token}</div>}
                {selectedOrderDetails.customerName && <div><strong>Customer:</strong> {selectedOrderDetails.customerName}</div>}
                {selectedOrderDetails.customerPhone && <div><strong>Phone:</strong> {selectedOrderDetails.customerPhone}</div>}
                <div><strong>Ordered:</strong> {new Date(selectedOrderDetails.createdAt?.toDate ? selectedOrderDetails.createdAt.toDate() : selectedOrderDetails.createdAt).toLocaleTimeString()}</div>
              </div>

              {/* Items List */}
              <div>
                <h4 style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', marginBottom: 8 }}>
                  Items List
                </h4>
                <table style={{ width: '100%', fontSize: 'var(--text-subhead)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <th style={{ textAlign: 'left', paddingBottom: 6 }}>Item</th>
                      <th style={{ textAlign: 'right', paddingBottom: 6 }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrderDetails.items?.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-separator-opaque)' }}>
                        <td style={{ padding: '6px 0' }}>
                          <strong>×{item.qty}</strong> {item.name}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', paddingLeft: 12 }}>
                              + {item.selectedModifiers.map(m => m.name).join(', ')}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-label-secondary)' }}>
                          {formatCurrency(item.price * item.qty, restaurant?.currency || 'INR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Order total */}
              <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrderDetails.subtotal, restaurant?.currency || 'INR')}</span>
                </div>
                {selectedOrderDetails.discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-red)' }}>
                    <span>Discount</span>
                    <span>-{formatCurrency(selectedOrderDetails.discountAmount, restaurant?.currency || 'INR')}</span>
                  </div>
                )}
                {selectedOrderDetails.serviceChargeAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Service Charge</span>
                    <span>{formatCurrency(selectedOrderDetails.serviceChargeAmount, restaurant?.currency || 'INR')}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'var(--weight-bold)', fontSize: '15px', borderTop: '1px dashed var(--color-separator)', paddingTop: 8 }}>
                  <span>Total</span>
                  <span>{formatCurrency(selectedOrderDetails.total, restaurant?.currency || 'INR')}</span>
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setSelectedOrderDetails(null)}
              >
                Close
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  handlePrint(selectedOrderDetails);
                  setSelectedOrderDetails(null);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Printer size={14} />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
