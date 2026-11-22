import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, Trash2, Edit2, Copy, Check, X, Tag, Sparkles, RotateCcw, 
  Search, Layers, ShoppingBag, Globe, Flame, CheckSquare, Square, PauseCircle
} from 'lucide-react';
import { useMenuStore } from '../../stores/menuStore';
import { DEFAULT_OFFERS } from '../../utils/promoEngine';
import { formatCurrency } from '../../utils/formatCurrency';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';

const PRESET_BADGE_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

const PRESETS = [
  {
    label: '🔥 Buy 1 Get 1 Free',
    name: 'Buy 1 Get 1 Free (BOGO)',
    type: 'bogo',
    tag: 'BOGO',
    icon: '🔥',
    badgeColor: '#ef4444',
    targetType: 'category',
    categoryFilter: [],
    targetItemIds: [],
    buyQty: 1,
    getQty: 1,
    discountPercent: 100,
    description: 'Buy 1 qualifying item, get 1 free (cheaper item free)'
  },
  {
    label: '🍕 Buy 2 Get 1 Free',
    name: 'Buy 2 Get 1 Free Deal',
    type: 'bogo',
    tag: 'B2G1',
    icon: '🍕',
    badgeColor: '#f97316',
    targetType: 'category',
    categoryFilter: [],
    targetItemIds: [],
    buyQty: 2,
    getQty: 1,
    discountPercent: 100,
    description: 'Buy any 2 qualifying items and get the 3rd item free'
  },
  {
    label: '🎉 2nd at 50% Off',
    name: 'Buy 1 Get 2nd at 50% Off',
    type: 'bogo',
    tag: 'BOGO50',
    icon: '🎉',
    badgeColor: '#ec4899',
    targetType: 'category',
    categoryFilter: [],
    targetItemIds: [],
    buyQty: 1,
    getQty: 1,
    discountPercent: 50,
    description: 'Buy 1 qualifying item and get the 2nd item at 50% discount'
  },
  {
    label: '💰 Spend & Save ₹100',
    name: 'Flat ₹100 OFF on Orders > ₹800',
    type: 'threshold',
    tag: 'SAVE100',
    icon: '💰',
    badgeColor: '#10b981',
    minSpend: 800,
    discountAmount: 100,
    description: 'Save flat ₹100 when cart subtotal reaches ₹800'
  },
  {
    label: '🍹 Happy Hour 20%',
    name: 'Happy Hour - 20% OFF Drinks',
    type: 'percent_category',
    tag: 'HAPPY20',
    icon: '🍹',
    badgeColor: '#3b82f6',
    targetType: 'category',
    targetCategory: 'beverages',
    targetItemIds: [],
    discountPercent: 20,
    description: '20% off all beverages in this order'
  },
  {
    label: '👑 VIP 10% Off Cart',
    name: 'VIP Guest Special (10% OFF)',
    type: 'percent_cart',
    tag: 'VIP10',
    icon: '👑',
    badgeColor: '#8b5cf6',
    discountPercent: 10,
    description: '10% off entire order for loyalty customers'
  }
];

export default function OffersManagerSettings({ restaurant, currency = 'INR' }) {
  const categories = useMenuStore(s => s.categories || []);
  const [offers, setOffers] = useState(() => {
    return Array.isArray(restaurant?.offers) && restaurant.offers.length > 0
      ? restaurant.offers
      : DEFAULT_OFFERS;
  });
  const [editingOffer, setEditingOffer] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [isMasterEnabled, setIsMasterEnabled] = useState(() => {
    return restaurant?.offersEnabled !== false;
  });

  const handleToggleMasterOffers = async () => {
    if (!restaurant?.id) return;
    const nextState = !isMasterEnabled;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id), {
        offersEnabled: nextState
      });
      setIsMasterEnabled(nextState);
      toast.success(nextState ? 'Promotions engine activated!' : 'Promotions engine paused across restaurant!');
    } catch (err) {
      console.error('Failed to toggle promotions engine:', err);
      toast.error('Failed to update: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isModalOpen]);

  // Flattened menu items for custom product targeting
  const allMenuItems = useMemo(() => {
    return (categories || []).flatMap(c => 
      (c.items || []).map(item => ({
        ...item,
        categoryId: c.id,
        categoryName: c.name
      }))
    );
  }, [categories]);

  // Filtered menu items based on search
  const filteredMenuItems = useMemo(() => {
    if (!productSearch.trim()) return allMenuItems;
    const q = productSearch.toLowerCase().trim();
    return allMenuItems.filter(item => 
      item.name?.toLowerCase().includes(q) ||
      item.categoryName?.toLowerCase().includes(q) ||
      item.sku?.toLowerCase().includes(q)
    );
  }, [allMenuItems, productSearch]);

  const persistOffers = async (newOffers) => {
    if (!restaurant?.id) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'restaurants', restaurant.id), {
        offers: newOffers
      });
      setOffers(newOffers);
      toast.success('Promotions saved successfully!');
    } catch (err) {
      console.error('Failed to save offers:', err);
      toast.error('Failed to update promotions: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOffer = async (offerId) => {
    const updated = offers.map(o => {
      if (o.id === offerId) {
        return { ...o, isActive: o.isActive === false ? true : false };
      }
      return o;
    });
    await persistOffers(updated);
  };

  const handleDeleteOffer = async (offerId) => {
    if (!window.confirm('Are you sure you want to delete this offer?')) return;
    const updated = offers.filter(o => o.id !== offerId);
    await persistOffers(updated);
  };

  const handleDuplicateOffer = async (offer) => {
    const clone = {
      ...offer,
      id: 'offer_' + Date.now().toString(36),
      name: `${offer.name} (Copy)`,
      tag: offer.tag ? `${offer.tag}2` : 'PROMO',
      isActive: true
    };
    const updated = [clone, ...offers];
    await persistOffers(updated);
    toast.success('Offer duplicated!');
  };

  const handleResetDefaults = async () => {
    if (!window.confirm('Reset all offers to Kiwi standard defaults (BOGO Pizza, 20% Happy Hour, Flat ₹100 Off)?')) return;
    await persistOffers(DEFAULT_OFFERS);
  };

  const handleOpenAddModal = () => {
    setProductSearch('');
    setEditingOffer({
      id: 'offer_' + Date.now().toString(36),
      name: '',
      type: 'bogo',
      tag: 'BOGO',
      badgeColor: '#ef4444',
      icon: '🔥',
      description: '',
      targetType: 'category',
      categoryFilter: [],
      targetCategory: '',
      targetItemIds: [],
      buyQty: 1,
      getQty: 1,
      discountPercent: 100,
      minSpend: 500,
      discountAmount: 50,
      isActive: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (offer) => {
    setProductSearch('');
    setEditingOffer({
      ...offer,
      targetType: offer.targetType || (Array.isArray(offer.targetItemIds) && offer.targetItemIds.length > 0 ? 'items' : 'category'),
      targetItemIds: Array.isArray(offer.targetItemIds) ? offer.targetItemIds : [],
      categoryFilter: Array.isArray(offer.categoryFilter) ? offer.categoryFilter : [],
      buyQty: offer.buyQty !== undefined ? Number(offer.buyQty) : 1,
      getQty: offer.getQty !== undefined ? Number(offer.getQty) : 1,
      discountPercent: offer.discountPercent !== undefined ? Number(offer.discountPercent) : 100
    });
    setIsModalOpen(true);
  };

  const handleApplyPreset = (preset) => {
    setEditingOffer(prev => ({
      ...prev,
      name: preset.name,
      type: preset.type,
      tag: preset.tag,
      icon: preset.icon,
      badgeColor: preset.badgeColor,
      targetType: preset.targetType || 'category',
      categoryFilter: preset.categoryFilter || [],
      targetCategory: preset.targetCategory || '',
      targetItemIds: preset.targetItemIds || [],
      buyQty: preset.buyQty || 1,
      getQty: preset.getQty || 1,
      discountPercent: preset.discountPercent !== undefined ? preset.discountPercent : 100,
      minSpend: preset.minSpend || 500,
      discountAmount: preset.discountAmount || 50,
      description: preset.description
    }));
    toast.success(`Loaded "${preset.label}" template`);
  };

  const handleToggleTargetProduct = (itemId) => {
    setEditingOffer(prev => {
      const current = Array.isArray(prev.targetItemIds) ? prev.targetItemIds : [];
      const exists = current.includes(itemId);
      const next = exists ? current.filter(id => id !== itemId) : [...current, itemId];
      return { ...prev, targetItemIds: next };
    });
  };

  const handleSelectAllFilteredProducts = () => {
    setEditingOffer(prev => {
      const current = new Set(prev.targetItemIds || []);
      filteredMenuItems.forEach(item => current.add(item.id));
      return { ...prev, targetItemIds: Array.from(current) };
    });
  };

  const handleClearSelectedProducts = () => {
    setEditingOffer(prev => ({ ...prev, targetItemIds: [] }));
  };

  const handleSaveModalOffer = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingOffer.name.trim()) {
      toast.error('Please enter an offer name');
      return;
    }

    // Default description if empty
    let autoDesc = editingOffer.description;
    if (!autoDesc) {
      if (editingOffer.type === 'bogo') {
        const discountText = editingOffer.discountPercent === 100 ? 'FREE' : `${editingOffer.discountPercent}% OFF`;
        const scopeText = editingOffer.targetType === 'items'
          ? `${editingOffer.targetItemIds?.length || 0} selected dishes`
          : (editingOffer.categoryFilter?.length ? editingOffer.categoryFilter.join(', ') : 'all qualifying items');
        autoDesc = `Buy ${editingOffer.buyQty || 1}, Get ${editingOffer.getQty || 1} at ${discountText} on ${scopeText}`;
      } else if (editingOffer.type === 'threshold') {
        autoDesc = `Flat ${formatCurrency(editingOffer.discountAmount, currency)} OFF on orders above ${formatCurrency(editingOffer.minSpend, currency)}`;
      } else if (editingOffer.type === 'percent_category') {
        autoDesc = `${editingOffer.discountPercent}% OFF on ${editingOffer.targetCategory || 'qualifying items'}`;
      } else if (editingOffer.type === 'percent_cart') {
        autoDesc = `${editingOffer.discountPercent}% OFF on entire order`;
      }
    }

    const payload = {
      ...editingOffer,
      description: autoDesc
    };

    const existingIndex = offers.findIndex(o => o.id === editingOffer.id);
    let updated;
    if (existingIndex >= 0) {
      updated = [...offers];
      updated[existingIndex] = payload;
    } else {
      updated = [payload, ...offers];
    }

    await persistOffers(updated);
    setIsModalOpen(false);
    setEditingOffer(null);
  };

  const activeCount = offers.filter(o => o.isActive !== false).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-separator)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 42, height: 42, borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Flame size={22} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--color-label-primary)' }}>
              Offers, BOGO & Promotions
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--color-label-secondary)', margin: '2px 0 0 0' }}>
              Customizable Buy-X-Get-Y rules, mixed-product cheapest-free pools, and spend thresholds (Toast & Square standard).
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Global Master Switch */}
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: isMasterEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: isMasterEnabled ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(239, 68, 68, 0.35)',
            padding: '6px 12px',
            borderRadius: '8px',
            cursor: 'pointer',
            userSelect: 'none',
            height: '34px',
            boxSizing: 'border-box'
          }}>
            <input
              type="checkbox"
              checked={isMasterEnabled}
              onChange={handleToggleMasterOffers}
              disabled={saving}
              style={{ width: 15, height: 15, accentColor: '#10b981', cursor: 'pointer', margin: 0 }}
            />
            <span style={{ fontSize: '12px', fontWeight: 700, color: isMasterEnabled ? '#10b981' : '#ef4444' }}>
              {isMasterEnabled ? 'System Active' : 'System Paused'}
            </span>
          </label>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResetDefaults}
            disabled={saving}
            title="Reset to Kiwi standard default promotions"
            style={{ height: '34px' }}
          >
            <RotateCcw size={14} /> Defaults
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleOpenAddModal}
            disabled={saving}
            style={{ background: '#ef4444', borderColor: '#ef4444', height: '34px' }}
          >
            <Plus size={14} /> Create Offer
          </button>
        </div>
      </div>

      {/* Global Paused Alert Banner */}
      {!isMasterEnabled && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#f59e0b'
        }}>
          <PauseCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800 }}>Promotions are currently paused restaurant-wide</div>
            <div style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
              No BOGO deals, spend threshold coupons, or automatic discounts will apply on POS or Online orders. Toggle "System Active" above to resume.
            </div>
          </div>
        </div>
      )}

      {/* Summary KPI Chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-separator)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase' }}>
            Active Offers
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
            {activeCount} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-label-tertiary)' }}>of {offers.length}</span>
          </div>
        </div>

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-separator)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase' }}>
            BOGO Rules Active
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#ef4444', marginTop: '4px' }}>
            {offers.filter(o => o.type === 'bogo' && o.isActive !== false).length}
          </div>
        </div>

        <div style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-separator)',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-label-secondary)', textTransform: 'uppercase' }}>
            POS Cart & Storefront
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#3b82f6', marginTop: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} /> Real-time Upsell Engine Active
          </div>
        </div>
      </div>

      {/* Offers List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {offers.length === 0 ? (
          <div style={{
            background: 'var(--color-bg-card)',
            border: '1px dashed var(--color-separator)',
            borderRadius: 'var(--radius-lg)',
            padding: '36px',
            textAlign: 'center',
            color: 'var(--color-label-secondary)'
          }}>
            <Tag size={32} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
            <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: 'var(--color-label-primary)' }}>No promotions configured</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px' }}>Create your first BOGO deal or spend threshold discount to boost average order value.</p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleOpenAddModal}
            >
              <Plus size={14} /> Create Offer
            </button>
          </div>
        ) : (
          offers.map(offer => {
            const isEnabled = offer.isActive !== false;
            
            // Scope badge text
            let scopeBadge = null;
            if (offer.targetType === 'items') {
              const count = offer.targetItemIds?.length || 0;
              scopeBadge = `🍔 ${count} Specific Product${count === 1 ? '' : 's'}`;
            } else if (offer.targetType === 'category') {
              const count = offer.categoryFilter?.length || 0;
              scopeBadge = count > 0 ? `📂 ${count} Categor${count === 1 ? 'y' : 'ies'}` : '📂 All Categories';
            } else if (offer.targetType === 'any') {
              scopeBadge = '🌐 Entire Menu';
            }

            return (
              <div
                key={offer.id}
                style={{
                  background: 'var(--color-bg-card)',
                  border: `1px solid ${isEnabled ? 'var(--color-separator)' : 'var(--color-separator-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px',
                  opacity: isEnabled ? 1 : 0.6,
                  transition: 'opacity 0.2s ease'
                }}
              >
                {/* Left: Icon & Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: `${offer.badgeColor || '#ef4444'}18`,
                    border: `1px solid ${offer.badgeColor || '#ef4444'}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    flexShrink: 0
                  }}>
                    {offer.icon || '🎁'}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-label-primary)' }}>
                        {offer.name}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: `${offer.badgeColor || '#ef4444'}20`,
                        color: offer.badgeColor || '#ef4444',
                        border: `1px solid ${offer.badgeColor || '#ef4444'}40`
                      }}>
                        {offer.tag || offer.type}
                      </span>
                      {scopeBadge && (
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--color-label-secondary)',
                          border: '1px solid var(--color-separator)'
                        }}>
                          {scopeBadge}
                        </span>
                      )}
                      {!isEnabled && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-label-tertiary)' }}>
                          (Disabled)
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {offer.description || (
                        offer.type === 'bogo'
                          ? `Buy ${offer.buyQty || 1} Get ${offer.getQty || 1} Free (${offer.categoryFilter?.join(', ') || 'qualifying items'})`
                          : offer.type === 'threshold'
                          ? `Flat ${formatCurrency(offer.discountAmount, currency)} OFF on orders > ${formatCurrency(offer.minSpend, currency)}`
                          : offer.type === 'percent_category'
                          ? `${offer.discountPercent}% OFF on ${offer.targetCategory}`
                          : `Promo Coupon (${offer.tag})`
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {/* Toggle Switch */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, paddingRight: '4px' }}>
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleToggleOffer(offer.id)}
                      style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#10b981' }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 600, color: isEnabled ? '#10b981' : 'var(--color-label-tertiary)' }}>
                      {isEnabled ? 'Active' : 'Off'}
                    </span>
                  </label>

                  {/* Duplicate */}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => handleDuplicateOffer(offer)}
                    title="Duplicate / Clone offer"
                  >
                    <Copy size={14} />
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => handleOpenEditModal(offer)}
                    title="Edit offer details"
                  >
                    <Edit2 size={14} />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => handleDeleteOffer(offer.id)}
                    style={{ color: 'var(--color-red)' }}
                    title="Delete offer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Create or Edit Offer rendered via Portal for true viewport responsiveness */}
      {isModalOpen && editingOffer && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="promo-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999, // Above settings floating save bar and all parent elements
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'max(12px, env(safe-area-inset-top, 12px)) 16px max(12px, env(safe-area-inset-bottom, 12px))',
            boxSizing: 'border-box'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-card, #1e293b)',
              border: '1px solid var(--color-separator, #334155)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: 'min(92vh, 840px)',
              height: 'auto',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Fixed Header (Always visible at top on every device) */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-separator, #334155)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
              background: 'var(--color-bg-card, #1e293b)'
            }}>
              <div>
                <h3 id="promo-modal-title" style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--color-label-primary)' }}>
                  {offers.some(o => o.id === editingOffer.id) ? 'Edit Promotion' : 'Create Promotion'}
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                  Configure rule logic, discount rates, and target items
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setIsModalOpen(false)}
                title="Close"
                style={{ width: 34, height: 34, borderRadius: 8 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* 2. Scrollable Body (Accommodates all fields comfortably with clean scrolling) */}
            <div style={{
              padding: '16px 20px',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              {/* 1-Tap Presets Bar */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--color-separator, #334155)',
                borderRadius: '10px',
                padding: '10px 12px'
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-label-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ⚡ Quick Templates (1-Tap Fill)
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {PRESETS.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(p)}
                      className="btn btn-xs btn-secondary"
                      style={{
                        fontSize: '11px',
                        padding: '5px 9px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.08)'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Form */}
              <form id="offer-modal-form" onSubmit={handleSaveModalOffer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Promotion Rule Type */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                    Promotion Rule Type
                  </label>
                  <select
                    className="form-select"
                    value={editingOffer.type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const defaults = {
                        bogo: { tag: 'BOGO', icon: '🔥', badgeColor: '#ef4444', targetType: 'category' },
                        threshold: { tag: 'SAVE100', icon: '💰', badgeColor: '#10b981' },
                        percent_category: { tag: 'HAPPY20', icon: '🍹', badgeColor: '#3b82f6', targetType: 'category' },
                        percent_cart: { tag: 'VIP10', icon: '👑', badgeColor: '#8b5cf6' }
                      };
                      setEditingOffer({
                        ...editingOffer,
                        type: newType,
                        ...(defaults[newType] || {})
                      });
                    }}
                    style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  >
                    <option value="bogo">🔥 Buy X Get Y (BOGO / Multi-item Deal)</option>
                    <option value="threshold">💰 Spend Threshold (e.g. Spend ₹800 Get ₹100 Off)</option>
                    <option value="percent_category">🍹 Category or Product Discount (% off)</option>
                    <option value="percent_cart">👑 Cart Percentage (% off Entire Order)</option>
                  </select>
                </div>

                {/* Offer Name */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                    Offer Title
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    placeholder="e.g. BOGO Pizza Special"
                    value={editingOffer.name}
                    onChange={(e) => setEditingOffer({ ...editingOffer, name: e.target.value })}
                    style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  />
                </div>

                {/* Tag / Code & Icon */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                      Badge Tag / Coupon Code
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. BOGO or PIZZA50"
                      value={editingOffer.tag}
                      onChange={(e) => setEditingOffer({ ...editingOffer, tag: e.target.value.toUpperCase() })}
                      style={{ width: '100%', height: '36px', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                      Icon
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingOffer.icon || '🎁'}
                      onChange={(e) => setEditingOffer({ ...editingOffer, icon: e.target.value })}
                      style={{ width: '100%', height: '36px', fontSize: '16px', textAlign: 'center' }}
                    />
                  </div>
                </div>

                {/* BOGO Specific Configuration: Buy X Get Y Steppers & Discount Rate */}
                {editingOffer.type === 'bogo' && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444' }}>
                      Bundle Quantities & Discount Rate
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {/* Buy Quantity */}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                          Buy Quantity (X)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            style={{ width: 32, height: 32, fontSize: 14 }}
                            onClick={() => setEditingOffer({ ...editingOffer, buyQty: Math.max(1, (editingOffer.buyQty || 1) - 1) })}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            className="form-input"
                            value={editingOffer.buyQty || 1}
                            onChange={(e) => setEditingOffer({ ...editingOffer, buyQty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            style={{ width: '100%', height: '32px', textAlign: 'center', fontWeight: 700 }}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            style={{ width: 32, height: 32, fontSize: 14 }}
                            onClick={() => setEditingOffer({ ...editingOffer, buyQty: (editingOffer.buyQty || 1) + 1 })}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Get Quantity */}
                      <div>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                          Get Quantity (Y)
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            style={{ width: 32, height: 32, fontSize: 14 }}
                            onClick={() => setEditingOffer({ ...editingOffer, getQty: Math.max(1, (editingOffer.getQty || 1) - 1) })}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            className="form-input"
                            value={editingOffer.getQty || 1}
                            onChange={(e) => setEditingOffer({ ...editingOffer, getQty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            style={{ width: '100%', height: '32px', textAlign: 'center', fontWeight: 700 }}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            style={{ width: 32, height: 32, fontSize: 14 }}
                            onClick={() => setEditingOffer({ ...editingOffer, getQty: (editingOffer.getQty || 1) + 1 })}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Discount Rate on Get Items */}
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                        Discount Rate on Reward Item (Y)
                      </label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className={`btn btn-xs ${editingOffer.discountPercent === 100 ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, minWidth: '100px', height: '32px' }}
                          onClick={() => setEditingOffer({ ...editingOffer, discountPercent: 100 })}
                        >
                          100% Free
                        </button>
                        <button
                          type="button"
                          className={`btn btn-xs ${editingOffer.discountPercent === 50 ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ flex: 1, minWidth: '100px', height: '32px' }}
                          onClick={() => setEditingOffer({ ...editingOffer, discountPercent: 50 })}
                        >
                          50% Off (Half Price)
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: '100px' }}>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="form-input"
                            placeholder="Custom %"
                            value={![100, 50].includes(editingOffer.discountPercent) ? editingOffer.discountPercent : ''}
                            onChange={(e) => setEditingOffer({ ...editingOffer, discountPercent: Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                            style={{ width: '100%', height: '32px', fontSize: '12px' }}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>%</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', lineHeight: 1.4 }}>
                      💡 <strong>Toast / Square Standard:</strong> If customer orders items with different prices, the discount automatically applies to the lowest-priced qualifying unit.
                    </div>
                  </div>
                )}

                {/* Target Scope Switcher (For BOGO and Percent Category) */}
                {(editingOffer.type === 'bogo' || editingOffer.type === 'percent_category') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                      Target Scope: Where does this promotion apply?
                    </label>
                    
                    {/* Scope Tabs */}
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--color-bg, #0f172a)', padding: '3px', borderRadius: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setEditingOffer({ ...editingOffer, targetType: 'category' })}
                        className="btn btn-xs"
                        style={{
                          flex: 1,
                          background: editingOffer.targetType === 'category' ? 'var(--color-bg-card, #1e293b)' : 'transparent',
                          color: editingOffer.targetType === 'category' ? 'var(--color-label-primary)' : 'var(--color-label-secondary)',
                          border: editingOffer.targetType === 'category' ? '1px solid var(--color-separator)' : 'none',
                          boxShadow: editingOffer.targetType === 'category' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                          padding: '6px 4px'
                        }}
                      >
                        <Layers size={13} style={{ marginRight: 4 }} /> By Category
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingOffer({ ...editingOffer, targetType: 'items' })}
                        className="btn btn-xs"
                        style={{
                          flex: 1,
                          background: editingOffer.targetType === 'items' ? 'var(--color-bg-card, #1e293b)' : 'transparent',
                          color: editingOffer.targetType === 'items' ? 'var(--color-label-primary)' : 'var(--color-label-secondary)',
                          border: editingOffer.targetType === 'items' ? '1px solid var(--color-separator)' : 'none',
                          boxShadow: editingOffer.targetType === 'items' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                          padding: '6px 4px'
                        }}
                      >
                        <ShoppingBag size={13} style={{ marginRight: 4 }} /> Specific Products
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingOffer({ ...editingOffer, targetType: 'any' })}
                        className="btn btn-xs"
                        style={{
                          flex: 1,
                          background: editingOffer.targetType === 'any' ? 'var(--color-bg-card, #1e293b)' : 'transparent',
                          color: editingOffer.targetType === 'any' ? 'var(--color-label-primary)' : 'var(--color-label-secondary)',
                          border: editingOffer.targetType === 'any' ? '1px solid var(--color-separator)' : 'none',
                          boxShadow: editingOffer.targetType === 'any' ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                          padding: '6px 4px'
                        }}
                      >
                        <Globe size={13} style={{ marginRight: 4 }} /> Entire Menu
                      </button>
                    </div>

                    {/* Scope: Category Selection */}
                    {editingOffer.targetType === 'category' && (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                          {categories.map(cat => {
                            const isSelected = (editingOffer.categoryFilter || []).some(cf => cf.toLowerCase() === cat.name.toLowerCase());
                            return (
                              <button
                                key={cat.id}
                                type="button"
                                className={`btn btn-xs ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => {
                                  const cur = editingOffer.categoryFilter || [];
                                  const next = isSelected
                                    ? cur.filter(c => c.toLowerCase() !== cat.name.toLowerCase())
                                    : [...cur, cat.name];
                                  setEditingOffer({ ...editingOffer, categoryFilter: next, targetCategory: next[0] || '' });
                                }}
                                style={{ padding: '5px 10px' }}
                              >
                                {isSelected && <Check size={11} style={{ marginRight: 3 }} />} {cat.name}
                              </button>
                            );
                          })}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                          Select 1 or more categories. If none are selected, all categories qualify.
                        </span>
                      </div>
                    )}

                    {/* Scope: Specific Products Selection */}
                    {editingOffer.targetType === 'items' && (
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--color-separator)',
                        borderRadius: '8px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        {/* Search Bar & Quick Controls */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Search dishes by name or category..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              style={{ width: '100%', height: '34px', fontSize: '12px', paddingLeft: '32px' }}
                            />
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={handleSelectAllFilteredProducts}
                            title="Select all search results"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={handleClearSelectedProducts}
                            title="Clear all selections"
                          >
                            Clear
                          </button>
                        </div>

                        {/* Selected Items Counter Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>
                            ✓ {(editingOffer.targetItemIds || []).length} products selected
                          </span>
                          <span style={{ color: 'var(--color-label-tertiary)' }}>
                            Showing {filteredMenuItems.length} products
                          </span>
                        </div>

                        {/* Selected Tags Preview Chips */}
                        {(editingOffer.targetItemIds || []).length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', maxHeight: '60px', overflowY: 'auto' }}>
                            {(editingOffer.targetItemIds || []).map(id => {
                              const item = allMenuItems.find(i => i.id === id);
                              if (!item) return null;
                              return (
                                <span
                                  key={id}
                                  style={{
                                    fontSize: '10.5px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#ef4444',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                >
                                  {item.name}
                                  <X
                                    size={10}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => handleToggleTargetProduct(id)}
                                  />
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {/* Product Selection List */}
                        <div style={{
                          maxHeight: '160px',
                          overflowY: 'auto',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          borderTop: '1px solid var(--color-separator)',
                          paddingTop: '6px'
                        }}>
                          {filteredMenuItems.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '12px', fontSize: '12px', color: 'var(--color-label-tertiary)' }}>
                              No dishes found matching "{productSearch}"
                            </div>
                          ) : (
                            filteredMenuItems.map(item => {
                              const isSelected = (editingOffer.targetItemIds || []).includes(item.id);
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => handleToggleTargetProduct(item.id)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    background: isSelected ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                                    border: isSelected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s ease'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {isSelected ? (
                                      <CheckSquare size={14} color="#10b981" />
                                    ) : (
                                      <Square size={14} color="var(--color-label-tertiary)" />
                                    )}
                                    <span style={{ fontSize: '12px', fontWeight: isSelected ? 700 : 500, color: 'var(--color-label-primary)' }}>
                                      {item.name}
                                    </span>
                                    <span style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px' }}>
                                      {item.categoryName}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-label-secondary)' }}>
                                    {formatCurrency(item.price, currency)}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* Scope: Entire Menu */}
                    {editingOffer.targetType === 'any' && (
                      <div style={{
                        padding: '10px 12px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: '8px',
                        fontSize: '11.5px',
                        color: '#60a5fa'
                      }}>
                        🌐 <strong>Entire Menu Enabled:</strong> This promotion will automatically qualify all dishes and drinks on your menu.
                      </div>
                    )}
                  </div>
                )}

                {/* Spend Threshold Settings */}
                {editingOffer.type === 'threshold' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                        Min Cart Spend ({currency})
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        value={editingOffer.minSpend}
                        onChange={(e) => setEditingOffer({ ...editingOffer, minSpend: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', height: '36px' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                        Flat Discount ({currency})
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        value={editingOffer.discountAmount}
                        onChange={(e) => setEditingOffer({ ...editingOffer, discountAmount: parseFloat(e.target.value) || 0 })}
                        style={{ width: '100%', height: '36px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Category / Product Percent Settings */}
                {editingOffer.type === 'percent_category' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                      Discount Percentage (%)
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      min={1}
                      max={100}
                      value={editingOffer.discountPercent}
                      onChange={(e) => setEditingOffer({ ...editingOffer, discountPercent: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                )}

                {/* Entire Cart Percent Settings */}
                {editingOffer.type === 'percent_cart' && (
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                      Order Discount % (applied on full cart subtotal)
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      min={1}
                      max={100}
                      value={editingOffer.discountPercent}
                      onChange={(e) => setEditingOffer({ ...editingOffer, discountPercent: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', height: '36px' }}
                    />
                  </div>
                )}

                {/* Description */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                    Description (shown in Offers Drawer & receipts)
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Buy 1 pizza, get 1 free! (Cheapest free)"
                    value={editingOffer.description}
                    onChange={(e) => setEditingOffer({ ...editingOffer, description: e.target.value })}
                    style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  />
                </div>

                {/* Badge Color Palette */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '6px' }}>
                    Badge Color
                  </label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {PRESET_BADGE_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditingOffer({ ...editingOffer, badgeColor: color })}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          background: color,
                          border: editingOffer.badgeColor === color ? '3px solid white' : 'none',
                          cursor: 'pointer',
                          boxShadow: editingOffer.badgeColor === color ? '0 0 0 2px ' + color : 'none'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </form>
            </div>

            {/* 3. Fixed Footer (Always visible at bottom on every device, never obscured) */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--color-separator, #334155)',
              background: 'var(--color-bg-elevated, #182030)',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '10px',
              flexShrink: 0
            }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsModalOpen(false)}
                style={{ height: '38px', padding: '0 16px', fontSize: '13px', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="offer-modal-form"
                className="btn btn-primary"
                disabled={saving}
                style={{
                  height: '38px',
                  padding: '0 20px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: '#10b981',
                  borderColor: '#10b981'
                }}
              >
                {saving ? 'Saving...' : 'Save Promotion'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
