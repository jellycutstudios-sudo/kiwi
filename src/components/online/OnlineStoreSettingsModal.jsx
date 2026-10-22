import { useState, useMemo, useEffect } from 'react';
import { doc, updateDoc, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  X, Truck, Palette, Tag, EyeOff, Check, Search,
  Info, ShieldAlert, Sparkles, Store, Flame, Star, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function OnlineStoreSettingsModal({ isOpen, onClose, restaurant, currency = 'INR' }) {
  const updateRestaurantState = useAuthStore(s => s.updateRestaurantState);
  const categories = useMenuStore(s => s.categories);
  const subscribeMenu = useMenuStore(s => s.subscribeMenu);

  // Subscribe to menu if not already populated
  useEffect(() => {
    if (restaurant?.id) {
      subscribeMenu(restaurant.id);
    }
  }, [restaurant?.id, subscribeMenu]);

  // Active tab state: 'delivery' | 'branding' | 'offers' | 'exclusions'
  const [activeTab, setActiveTab] = useState('delivery');
  const [saving, setSaving] = useState(false);

  // Form states initialized from restaurant document
  const [deliveryRadius, setDeliveryRadius] = useState(restaurant?.deliveryRadius ?? 5);
  const [deliveryFee, setDeliveryFee] = useState(restaurant?.deliveryFee ?? 0);
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState(restaurant?.freeDeliveryAbove ?? 0);
  const [minDeliveryOrder, setMinDeliveryOrder] = useState(restaurant?.minDeliveryOrder ?? 0);
  const [estimatedDeliveryTime, setEstimatedDeliveryTime] = useState(restaurant?.estimatedDeliveryTime ?? '25-35 min');
  
  const [onlineLogo, setOnlineLogo] = useState(restaurant?.onlineLogo ?? '');
  const [onlineCover, setOnlineCover] = useState(restaurant?.onlineCover ?? '');
  const [onlineDescription, setOnlineDescription] = useState(restaurant?.onlineDescription ?? '');
  const [onlineOrderingPaused, setOnlineOrderingPaused] = useState(Boolean(restaurant?.onlineOrderingPaused));

  const [onlineOfferText, setOnlineOfferText] = useState(restaurant?.onlineOfferText ?? '');
  const [onlineOfferActive, setOnlineOfferActive] = useState(Boolean(restaurant?.onlineOfferActive ?? restaurant?.onlineOfferText));

  // Excluded items list (IDs of menu items hidden from online ordering)
  const [excludedItemIds, setExcludedItemIds] = useState(() => {
    return Array.isArray(restaurant?.onlineExcludedItemIds) ? [...restaurant.onlineExcludedItemIds] : [];
  });

  // Bestsellers State
  const [autoDetectBestsellers, setAutoDetectBestsellers] = useState(
    Boolean(restaurant?.autoDetectBestsellers ?? true)
  );
  const [autoBestsellerItemIds, setAutoBestsellerItemIds] = useState(() => {
    return Array.isArray(restaurant?.autoBestsellerItemIds) ? [...restaurant.autoBestsellerItemIds] : [];
  });
  const [manualBestsellerItemIds, setManualBestsellerItemIds] = useState(() => {
    return Array.isArray(restaurant?.manualBestsellerItemIds) ? [...restaurant.manualBestsellerItemIds] : [];
  });
  const [analyzingOrders, setAnalyzingOrders] = useState(false);
  const [detectedItemSales, setDetectedItemSales] = useState({});
  const [bestsellerSearch, setBestsellerSearch] = useState('');

  // Filter state for Menu Exclusions tab
  const [exclusionSearch, setExclusionSearch] = useState('');
  const [exclusionCat, setExclusionCat] = useState('all');

  // Flattened all available menu items
  const allMenuItems = useMemo(() => {
    return categories.flatMap(cat => 
      (cat.items || []).map(item => ({
        ...item,
        categoryName: cat.name,
        categoryEmoji: cat.emoji,
        categoryId: cat.id
      }))
    );
  }, [categories]);

  // Filtered items in exclusions tab
  const filteredExclusionItems = useMemo(() => {
    return allMenuItems.filter(item => {
      const matchesCat = exclusionCat === 'all' || item.categoryId === exclusionCat;
      const q = exclusionSearch.toLowerCase().trim();
      const matchesSearch = !q || 
        item.name?.toLowerCase().includes(q) || 
        item.categoryName?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [allMenuItems, exclusionCat, exclusionSearch]);

  const toggleItemExclusion = (itemId) => {
    setExcludedItemIds(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };

  // Toggle admin manual bestseller status
  const toggleManualBestseller = (itemId) => {
    setManualBestsellerItemIds(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId);
      } else {
        return [...prev, itemId];
      }
    });
  };

  // Analyze customer orders to automatically detect bestsellers
  const detectBestsellersFromOrders = async () => {
    if (!restaurant?.id) return;
    setAnalyzingOrders(true);
    try {
      const q = query(
        collection(db, 'restaurants', restaurant.id, 'orders'),
        where('status', 'in', ['billed', 'ready', 'served', 'completed']),
        limit(200)
      );
      const snap = await getDocs(q);
      const counts = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (Array.isArray(data.items)) {
          data.items.forEach(it => {
            const idKey = it.id || it.menuItemId;
            const nameKey = (it.name || '').trim().toLowerCase();
            const qty = it.qty || 1;
            if (idKey) counts[idKey] = (counts[idKey] || 0) + qty;
            if (nameKey) counts[nameKey] = (counts[nameKey] || 0) + qty;
          });
        }
      });
      setDetectedItemSales(counts);

      // Rank all menu items based on counts
      const scoredItems = allMenuItems.map(item => {
        const idSales = counts[item.id] || 0;
        const nameSales = counts[(item.name || '').trim().toLowerCase()] || 0;
        return {
          id: item.id,
          name: item.name,
          sales: Math.max(idSales, nameSales)
        };
      }).filter(i => i.sales > 0);

      scoredItems.sort((a, b) => b.sales - a.sales);
      // Top 5 or all items with sales > 0 if less than 5
      const topIds = scoredItems.slice(0, 5).map(i => i.id);
      
      if (topIds.length > 0) {
        setAutoBestsellerItemIds(topIds);
        toast.success(`Identified ${topIds.length} top-selling dishes from order history!`, { icon: '🔥' });
      } else {
        toast('No completed orders found yet. Dishes will be ranked automatically as orders roll in.', { icon: 'ℹ️' });
      }
    } catch (err) {
      console.error('Error detecting bestsellers:', err);
      toast.error('Could not analyze orders: ' + err.message);
    } finally {
      setAnalyzingOrders(false);
    }
  };

  const handleSave = async () => {
    if (!restaurant?.id) return;
    setSaving(true);

    const payload = {
      deliveryRadius: Math.max(0, parseFloat(deliveryRadius) || 0),
      deliveryFee: Math.max(0, parseFloat(deliveryFee) || 0),
      freeDeliveryAbove: Math.max(0, parseFloat(freeDeliveryAbove) || 0),
      minDeliveryOrder: Math.max(0, parseFloat(minDeliveryOrder) || 0),
      estimatedDeliveryTime: String(estimatedDeliveryTime || '').trim() || '25-35 min',

      onlineLogo: String(onlineLogo || '').trim(),
      onlineCover: String(onlineCover || '').trim(),
      onlineDescription: String(onlineDescription || '').trim(),
      onlineOrderingPaused: Boolean(onlineOrderingPaused),

      onlineOfferText: onlineOfferActive ? String(onlineOfferText || '').trim() : '',
      onlineOfferActive: Boolean(onlineOfferActive && onlineOfferText.trim()),

      onlineExcludedItemIds: excludedItemIds,

      autoDetectBestsellers: Boolean(autoDetectBestsellers),
      autoBestsellerItemIds: autoBestsellerItemIds,
      manualBestsellerItemIds: manualBestsellerItemIds
    };

    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id), payload);
      if (updateRestaurantState) {
        updateRestaurantState(payload);
      }
      toast.success('Online Store settings saved successfully!', { icon: '✨' });
      onClose();
    } catch (err) {
      console.error('Error saving online store settings:', err);
      toast.error('Failed to save settings: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 'var(--z-modal)' }}>
      <div 
        className="modal" 
        onClick={e => e.stopPropagation()} 
        style={{ 
          maxWidth: 680, 
          width: '100%', 
          maxHeight: '90vh', 
          display: 'flex', 
          flexDirection: 'column', 
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-bg-elevated)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(59,130,246,0.18))',
              border: '1px solid rgba(16,185,129,0.3)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Store size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--color-label)' }}>
                Online Store & Delivery Settings
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                Configure delivery radius, delivery fee, offers & online menu exclusions
              </p>
            </div>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary btn-icon btn-sm" 
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          background: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-separator-opaque)',
          padding: '4px 12px',
          gap: 6,
          overflowX: 'auto',
          flexShrink: 0
        }}>
          {[
            { id: 'delivery', label: 'Delivery & Charges', icon: Truck },
            { id: 'branding', label: 'Storefront & Bio', icon: Palette },
            { id: 'offers', label: 'Offers & Promos', icon: Tag },
            { 
              id: 'exclusions', 
              label: 'Menu Exclusions', 
              icon: EyeOff, 
              badge: excludedItemIds.length > 0 ? `${excludedItemIds.length}` : null 
            },
            {
              id: 'bestsellers',
              label: 'Bestsellers & Highlights',
              icon: Flame,
              badge: (manualBestsellerItemIds.length + (autoDetectBestsellers ? autoBestsellerItemIds.length : 0)) > 0 
                ? `${manualBestsellerItemIds.length + (autoDetectBestsellers ? autoBestsellerItemIds.length : 0)}` 
                : null
            }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                  fontSize: '12.5px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent'
                }}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: '10px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body / Tab Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* TAB 1: DELIVERY & CHARGES */}
          {activeTab === 'delivery' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 14px',
                border: '1px solid var(--color-separator-opaque)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start'
              }}>
                <Info size={16} color="var(--color-blue)" style={{ marginTop: 2, flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)', lineHeight: 1.45 }}>
                  These rules apply when customers place delivery orders from your online storefront. Dine-in table orders and takeaway pickups are not charged delivery fees.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
                {/* Base Delivery Fee */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Base Delivery Fee ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className="form-input"
                    value={deliveryFee}
                    onChange={e => setDeliveryFee(e.target.value)}
                    placeholder="e.g. 30"
                  />
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block' }}>
                    Flat fee added to delivery orders at checkout.
                  </span>
                </div>

                {/* Free Delivery Threshold */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Free Delivery on Orders Above ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    className="form-input"
                    value={freeDeliveryAbove}
                    onChange={e => setFreeDeliveryAbove(e.target.value)}
                    placeholder="e.g. 499 (0 to disable)"
                  />
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block' }}>
                    Orders reaching this subtotal get 100% free delivery. Set 0 to disable.
                  </span>
                </div>

                {/* Minimum Order for Delivery */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Minimum Order for Delivery ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    className="form-input"
                    value={minDeliveryOrder}
                    onChange={e => setMinDeliveryOrder(e.target.value)}
                    placeholder="e.g. 150"
                  />
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block' }}>
                    Minimum basket size required to choose delivery.
                  </span>
                </div>

                {/* Max Delivery Radius */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                    Max Delivery Radius (km)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    className="form-input"
                    value={deliveryRadius}
                    onChange={e => setDeliveryRadius(e.target.value)}
                    placeholder="e.g. 5"
                  />
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block' }}>
                    Delivery service area radius (in kilometers).
                  </span>
                </div>
              </div>

              {/* Estimated Delivery Time */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Estimated Delivery Time
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={estimatedDeliveryTime}
                  onChange={e => setEstimatedDeliveryTime(e.target.value)}
                  placeholder="e.g. 25-35 min"
                />
                <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block' }}>
                  Shown prominently in the store header to set customer expectations.
                </span>
              </div>
            </div>
          )}

          {/* TAB 2: STOREFRONT & BRANDING */}
          {activeTab === 'branding' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Online Ordering Pause Switch */}
              <div style={{
                background: onlineOrderingPaused ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                border: onlineOrderingPaused ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-lg)',
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-label)' }}>
                    {onlineOrderingPaused ? '⏸️ Online Ordering is Paused' : '🟢 Accepting Online Orders'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                    {onlineOrderingPaused 
                      ? 'Customers can browse the menu, but placing orders is temporarily disabled.'
                      : 'Your online ordering storefront is live and receiving orders in real time.'}
                  </div>
                </div>
                <button
                  type="button"
                  className={`btn ${onlineOrderingPaused ? 'btn-primary' : 'btn-danger'} btn-sm`}
                  onClick={() => setOnlineOrderingPaused(p => !p)}
                  style={{ minWidth: 120, height: 36, fontWeight: 700 }}
                >
                  {onlineOrderingPaused ? 'Resume Orders' : 'Pause Orders'}
                </button>
              </div>

              {/* Logo URL */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Store Logo URL
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {onlineLogo ? (
                    <img 
                      src={onlineLogo} 
                      alt="Store Logo" 
                      style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '1px solid var(--color-separator-opaque)' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  ) : null}
                  <input
                    type="url"
                    className="form-input"
                    value={onlineLogo}
                    onChange={e => setOnlineLogo(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>

              {/* Cover Banner URL */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Header Banner Cover URL
                </label>
                <input
                  type="url"
                  className="form-input"
                  value={onlineCover}
                  onChange={e => setOnlineCover(e.target.value)}
                  placeholder="https://example.com/cover-banner.jpg"
                />
                <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block' }}>
                  High-resolution photo used as the background scrim behind the storefront header.
                </span>
              </div>

              {/* Store Tagline / Bio */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Store Tagline / Bio Description
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={onlineDescription}
                  onChange={e => setOnlineDescription(e.target.value)}
                  placeholder="e.g. Authentic hand-stretched Neapolitan pizza and specialty coffees."
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          )}

          {/* TAB 3: OFFERS & PROMOS */}
          {activeTab === 'offers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 14px',
                border: '1px solid var(--color-separator-opaque)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start'
              }}>
                <Sparkles size={16} color="var(--color-accent)" style={{ marginTop: 2, flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)', lineHeight: 1.45 }}>
                  Announce promotional discounts, coupon codes, or festive deals. The message appears as an eye-catching banner at the top of the customer menu.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator-opaque)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-label)' }}>Enable Announcement Banner</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>Show active offer ribbon on the customer storefront</div>
                </div>
                <input
                  type="checkbox"
                  checked={onlineOfferActive}
                  onChange={e => setOnlineOfferActive(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                />
              </div>

              <div className="form-group" style={{ margin: 0, opacity: onlineOfferActive ? 1 : 0.5, pointerEvents: onlineOfferActive ? 'auto' : 'none' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Offer / Promo Message
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={onlineOfferText}
                  onChange={e => setOnlineOfferText(e.target.value)}
                  placeholder="e.g. 🎉 Flat 10% OFF on all orders above ₹400! Use code TASTY10"
                />
                <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block' }}>
                  Keep it punchy and clear so customers can easily see the incentive.
                </span>
              </div>

              {/* Live Preview Box */}
              {onlineOfferActive && onlineOfferText && (
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--color-label-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Customer View Preview
                  </div>
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.12))',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--color-accent)',
                    fontSize: '13px',
                    fontWeight: 600
                  }}>
                    <Tag size={15} />
                    <span>{onlineOfferText}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MENU EXCLUSIONS */}
          {activeTab === 'exclusions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 14px',
                border: '1px solid var(--color-separator-opaque)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start'
              }}>
                <ShieldAlert size={16} color="var(--color-orange)" style={{ marginTop: 2, flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)', lineHeight: 1.45 }}>
                  <strong>In-Store Only Items:</strong> Exclude delicate or spill-prone items (such as hot tea, open-cup filter coffee, draught beverages, or souffles) from the customer online ordering page. <em>They remain 100% active for your in-house POS & waitstaff.</em>
                </p>
              </div>

              {/* Search & Category Filter Bar */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)' }} />
                  <input
                    type="text"
                    placeholder="Search dishes to exclude (e.g. Tea, Coffee)..."
                    value={exclusionSearch}
                    onChange={e => setExclusionSearch(e.target.value)}
                    style={{
                      width: '100%',
                      height: 36,
                      paddingLeft: 32,
                      paddingRight: 10,
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-separator-opaque)',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-label)',
                      fontSize: '12.5px'
                    }}
                  />
                </div>

                <select
                  value={exclusionCat}
                  onChange={e => setExclusionCat(e.target.value)}
                  style={{
                    height: 36,
                    padding: '0 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-separator-opaque)',
                    background: 'var(--color-bg-secondary)',
                    color: 'var(--color-label)',
                    fontSize: '12.5px'
                  }}
                >
                  <option value="all">All Categories ({allMenuItems.length})</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                  ))}
                </select>
              </div>

              {/* Status Header & Bulk Helper */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ color: 'var(--color-label-secondary)' }}>
                  Showing {filteredExclusionItems.length} items · <strong>{excludedItemIds.length}</strong> excluded from online store
                </span>
                {excludedItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExcludedItemIds([])}
                    style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600, fontSize: '11.5px' }}
                  >
                    Clear All Exclusions
                  </button>
                )}
              </div>

              {/* Menu Items List */}
              <div style={{
                maxHeight: 340,
                overflowY: 'auto',
                border: '1px solid var(--color-separator-opaque)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-bg-secondary)'
              }}>
                {filteredExclusionItems.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-label-tertiary)', fontSize: '13px' }}>
                    No menu items found matching "{exclusionSearch}".
                  </div>
                ) : (
                  filteredExclusionItems.map(item => {
                    const isExcluded = excludedItemIds.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItemExclusion(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--color-separator-opaque)',
                          cursor: 'pointer',
                          background: isExcluded ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, paddingRight: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: '15px' }}>{item.emoji ?? '🍽️'}</span>
                            <span style={{
                              fontWeight: 600,
                              fontSize: '13.5px',
                              color: isExcluded ? 'var(--color-label-secondary)' : 'var(--color-label)',
                              textDecoration: isExcluded ? 'line-through' : 'none'
                            }}>
                              {item.name}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                            {item.categoryName} • {formatCurrency(item.price, currency)}
                          </div>
                        </div>

                        {/* Status Toggle Badge */}
                        <div style={{ flexShrink: 0 }}>
                          {isExcluded ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(239, 68, 68, 0.15)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              fontSize: '11px',
                              fontWeight: 700
                            }}>
                              <EyeOff size={12} /> In-Store Only
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              fontSize: '11px',
                              fontWeight: 600
                            }}>
                              <Check size={12} /> Visible Online
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 5: BESTSELLERS & HIGHLIGHTS */}
          {activeTab === 'bestsellers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Info Note */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 14px',
                border: '1px solid var(--color-separator-opaque)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start'
              }}>
                <Flame size={18} color="#f59e0b" style={{ marginTop: 2, flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)', lineHeight: 1.45 }}>
                  Bestsellers are displayed with the prominent <strong>⭐ Bestseller</strong> badge and filtered in the <strong>[ ⭐ Bestseller ]</strong> switch on your storefront. You can let DineOS automatically rank them from real orders, manually pin your favorites, or combine both!
                </p>
              </div>

              {/* Section 1: Automated Detection */}
              <div style={{
                background: 'var(--color-bg-elevated)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                border: '1px solid var(--color-separator-opaque)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-label)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🤖 Auto-Detect from Customer Orders</span>
                      <span style={{
                        fontSize: '10.5px',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        background: autoDetectBestsellers ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: autoDetectBestsellers ? '#10b981' : 'var(--color-label-tertiary)',
                        fontWeight: 700
                      }}>
                        {autoDetectBestsellers ? 'ACTIVE' : 'OFF'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 4 }}>
                      Analyzes completed order volumes and dynamically awards the Bestseller badge to top dishes.
                    </div>
                  </div>

                  <label className="switch" style={{ flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={autoDetectBestsellers}
                      onChange={e => setAutoDetectBestsellers(e.target.checked)}
                    />
                    <span className="slider round" />
                  </label>
                </div>

                {autoDetectBestsellers && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--color-separator-opaque)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '12.5px', color: 'var(--color-label-secondary)' }}>
                        {autoBestsellerItemIds.length > 0 ? (
                          <span>Currently detected: <strong>{autoBestsellerItemIds.length} dishes</strong></span>
                        ) : (
                          <span>Click to analyze past customer order receipts</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={detectBestsellersFromOrders}
                        disabled={analyzingOrders}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 700 }}
                      >
                        <RefreshCw size={13} className={analyzingOrders ? 'spinning' : ''} />
                        {analyzingOrders ? 'Analyzing Orders...' : 'Scan Orders & Recalculate'}
                      </button>
                    </div>

                    {/* Detected Items Chips Preview */}
                    {autoBestsellerItemIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                        {autoBestsellerItemIds.map(id => {
                          const item = allMenuItems.find(i => i.id === id);
                          if (!item) return null;
                          const sales = detectedItemSales[item.id] || detectedItemSales[(item.name || '').toLowerCase()] || null;
                          return (
                            <span
                              key={id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 10px',
                                borderRadius: '14px',
                                background: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                color: '#d97706',
                                fontSize: '12px',
                                fontWeight: 600
                              }}
                            >
                              <span>{item.emoji || '🔥'}</span>
                              <span>{item.name}</span>
                              {sales ? (
                                <span style={{ opacity: 0.8, fontSize: '11px' }}>({sales} orders)</span>
                              ) : null}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 2: Admin Manual Pinning */}
              <div style={{
                background: 'var(--color-bg-elevated)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                border: '1px solid var(--color-separator-opaque)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-label)' }}>
                      ⭐ Admin Manual Pinning
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                      Pin any specific item (new special or high-margin dish) as a guaranteed Bestseller.
                    </div>
                  </div>

                  <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)', fontWeight: 600 }}>
                    {manualBestsellerItemIds.length} Pinned
                  </span>
                </div>

                {/* Quick Search */}
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)' }} />
                  <input
                    type="text"
                    placeholder="Search dishes to pin..."
                    value={bestsellerSearch}
                    onChange={e => setBestsellerSearch(e.target.value)}
                    style={{
                      width: '100%',
                      paddingLeft: 30,
                      paddingRight: 10,
                      height: 34,
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-separator-opaque)',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-label)',
                      fontSize: '12.5px',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Dishes List */}
                <div style={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  border: '1px solid var(--color-separator-opaque)',
                  borderRadius: 'var(--radius-md)',
                  padding: 8,
                  background: 'var(--color-bg-secondary)'
                }}>
                  {allMenuItems
                    .filter(item => {
                      if (!bestsellerSearch) return true;
                      const q = bestsellerSearch.toLowerCase();
                      return item.name?.toLowerCase().includes(q) || item.categoryName?.toLowerCase().includes(q);
                    })
                    .map(item => {
                      const isManual = manualBestsellerItemIds.includes(item.id) || item.isBestseller;
                      const isAuto = autoBestsellerItemIds.includes(item.id);

                      return (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            background: isManual ? 'rgba(245, 158, 11, 0.08)' : 'var(--color-bg-elevated)',
                            border: isManual ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--color-separator-opaque)',
                            gap: 10
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '14px' }}>{item.emoji || '🍽️'}</span>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-label)' }}>
                                {item.name}
                              </span>
                              {isAuto && (
                                <span style={{
                                  fontSize: '10px',
                                  padding: '1px 5px',
                                  borderRadius: '6px',
                                  background: 'rgba(59, 130, 246, 0.15)',
                                  color: 'var(--color-blue)',
                                  fontWeight: 700
                                }}>
                                  Auto-Ranked
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                              {item.categoryName} • {formatCurrency(item.price, currency)}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleManualBestseller(item.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: isManual ? '1px solid #d97706' : '1px solid var(--color-separator-opaque)',
                              background: isManual ? '#d97706' : 'var(--color-bg-secondary)',
                              color: isManual ? '#ffffff' : 'var(--color-label-secondary)',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <Star size={12} fill={isManual ? '#ffffff' : 'none'} stroke={isManual ? '#ffffff' : 'currentColor'} />
                            <span>{isManual ? 'Pinned' : 'Pin'}</span>
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 10,
          background: 'var(--color-bg-elevated)',
          flexShrink: 0
        }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
            style={{ minWidth: 120, fontWeight: 700 }}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
