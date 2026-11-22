import { useState } from 'react';
import { 
  Plus, Trash2, Edit2, Check, X, Tag, Sparkles, RotateCcw
} from 'lucide-react';
import { useMenuStore } from '../../stores/menuStore';
import { DEFAULT_OFFERS } from '../../utils/promoEngine';
import { formatCurrency } from '../../utils/formatCurrency';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';

const PRESET_BADGE_COLORS = [
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

export default function OffersManagerSettings({ restaurant, currency = 'INR' }) {
  const categories = useMenuStore(s => s.categories || []);
  const [offers, setOffers] = useState(() => {
    return Array.isArray(restaurant?.offers) && restaurant.offers.length > 0
      ? restaurant.offers
      : DEFAULT_OFFERS;
  });
  const [editingOffer, setEditingOffer] = useState(null); // null or offer object
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
        const nextActive = o.isActive === false ? true : false;
        return { ...o, isActive: nextActive };
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

  const handleResetDefaults = async () => {
    if (!window.confirm('Reset all offers to Kiwi standard defaults (BOGO Pizza, 20% Happy Hour, Flat ₹100 Off)?')) return;
    await persistOffers(DEFAULT_OFFERS);
  };

  const handleOpenAddModal = () => {
    setEditingOffer({
      id: 'offer_' + Date.now().toString(36),
      name: '',
      type: 'bogo',
      tag: 'BOGO',
      badgeColor: '#ef4444',
      icon: '🔥',
      description: '',
      categoryFilter: [],
      targetCategory: '',
      discountPercent: 100,
      minSpend: 500,
      discountAmount: 50,
      isActive: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (offer) => {
    setEditingOffer({ ...offer });
    setIsModalOpen(true);
  };

  const handleSaveModalOffer = async (e) => {
    e.preventDefault();
    if (!editingOffer.name.trim()) {
      toast.error('Please enter an offer name');
      return;
    }

    const existingIndex = offers.findIndex(o => o.id === editingOffer.id);
    let updated;
    if (existingIndex >= 0) {
      updated = [...offers];
      updated[existingIndex] = editingOffer;
    } else {
      updated = [editingOffer, ...offers];
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Tag size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--color-label-primary)' }}>
                Offers, BOGO & Promotions
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--color-label-secondary)', margin: '2px 0 0 0' }}>
                Auto-evaluate Buy-1-Get-1, tiered spend rewards, happy hours and promo coupons at POS checkout.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleResetDefaults}
            disabled={saving}
            title="Reset to Kiwi standard default promotions"
          >
            <RotateCcw size={14} /> Defaults
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleOpenAddModal}
            disabled={saving}
            style={{ background: '#ef4444', borderColor: '#ef4444' }}
          >
            <Plus size={14} /> Create Offer
          </button>
        </div>
      </div>

      {/* Summary Chips */}
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
            POS Cart Drawer
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    background: `${offer.badgeColor || '#ef4444'}18`,
                    border: `1px solid ${offer.badgeColor || '#ef4444'}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    {offer.icon || '🎁'}
                  </div>

                  <div>
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
                      {!isEnabled && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-label-tertiary)' }}>
                          (Disabled)
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '4px' }}>
                      {offer.description || (
                        offer.type === 'bogo'
                          ? `Buy 1 Get 1 Free on ${offer.categoryFilter?.join(', ') || 'qualifying items'}`
                          : offer.type === 'threshold'
                          ? `Flat ${formatCurrency(offer.discountAmount, currency)} OFF on orders > ${formatCurrency(offer.minSpend, currency)}`
                          : offer.type === 'percent_category'
                          ? `${offer.discountPercent}% OFF on category: ${offer.targetCategory}`
                          : `Promo Coupon (${offer.tag})`
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Toggle Switch */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0 }}>
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

      {/* Modal: Create or Edit Offer */}
      {isModalOpen && editingOffer && (
        <div
          className="modal-backdrop"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            className="modal-box"
            style={{
              backgroundColor: 'var(--color-bg-card, #1e293b)',
              border: '1px solid var(--color-separator, #334155)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '540px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              padding: '24px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0, color: 'var(--color-label-primary)' }}>
                {offers.some(o => o.id === editingOffer.id) ? 'Edit Promotion' : 'Create Promotion'}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveModalOffer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Offer Type */}
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
                      bogo: { tag: 'BOGO', icon: '🔥', badgeColor: '#ef4444' },
                      threshold: { tag: 'Spend & Save', icon: '💰', badgeColor: '#10b981' },
                      percent_category: { tag: 'Happy Hour', icon: '🍹', badgeColor: '#f59e0b' },
                      percent_cart: { tag: 'VIP Guest', icon: '👑', badgeColor: '#8b5cf6' }
                    };
                    setEditingOffer({
                      ...editingOffer,
                      type: newType,
                      ...(defaults[newType] || {})
                    });
                  }}
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                >
                  <option value="bogo">🔥 BOGO (Buy 1 Get 1 Free on Category/Items)</option>
                  <option value="threshold">💰 Spend Threshold (e.g. Spend ₹800 Get ₹100 Off)</option>
                  <option value="percent_category">🍹 Category Happy Hour (% off Drinks/Mains)</option>
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

              {/* Type-Specific Settings */}
              {editingOffer.type === 'bogo' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                    Qualifying Menu Categories
                  </label>
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
                            setEditingOffer({ ...editingOffer, categoryFilter: next });
                          }}
                        >
                          {isSelected && <Check size={10} style={{ marginRight: 2 }} />} {cat.name}
                        </button>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                    Customers ordering 2 items from these categories will get the 2nd one 100% free.
                  </span>
                </div>
              )}

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

              {editingOffer.type === 'percent_category' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                      Target Category
                    </label>
                    <select
                      className="form-select"
                      value={editingOffer.targetCategory}
                      onChange={(e) => setEditingOffer({ ...editingOffer, targetCategory: e.target.value })}
                      style={{ width: '100%', height: '36px' }}
                    >
                      <option value="">Select Category...</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.name.toLowerCase()}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                      Discount %
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
                </div>
              )}

              {editingOffer.type === 'percent_cart' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '4px' }}>
                    Order Discount %
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
                  Description (shown in Offers Drawer)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Buy any 2 pizzas, get 1 free!"
                  value={editingOffer.description}
                  onChange={(e) => setEditingOffer({ ...editingOffer, description: e.target.value })}
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                />
              </div>

              {/* Color Theme */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-label-secondary)', display: 'block', marginBottom: '6px' }}>
                  Badge Color
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {PRESET_BADGE_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setEditingOffer({ ...editingOffer, badgeColor: color })}
                      style={{
                        width: 28,
                        height: 28,
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

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                  style={{ background: '#ef4444', borderColor: '#ef4444' }}
                >
                  {saving ? 'Saving...' : 'Save Promotion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
