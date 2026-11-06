import { useState } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import { hapticTap } from '../../utils/soundNotifications';

export default function OpenItemModal({ isOpen, onClose, onAdd, currency = 'INR' }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);
  const category = 'Custom Items';
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const numPrice = parseFloat(price);
    if (!name.trim()) {
      toast.error('Please enter an item name');
      return;
    }
    if (isNaN(numPrice) || numPrice < 0) {
      toast.error('Please enter a valid price');
      return;
    }

    const customItem = {
      id: 'open-' + crypto.randomUUID(),
      name: name.trim(),
      price: numPrice,
      qty: Math.max(1, parseInt(qty, 10) || 1),
      category: category || 'Custom',
      isOpenItem: true,
      note: note.trim(),
      selectedModifiers: [],
      courseStage: 'Mains',
      emoji: '✨'
    };

    onAdd(customItem);
    toast.success(`Added "${name}" to cart!`);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-slide-up" style={{ maxWidth: 620, width: 'min(620px, 95vw)', borderRadius: 20 }}>
        <div className="modal-header" style={{ padding: '18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--color-accent-light, rgba(56, 189, 248, 0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} color="var(--color-accent)" strokeWidth={2.8} />
            </div>
            <div>
              <h2 className="modal-title" style={{ fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>Add Custom / Open Item</h2>
              <div style={{ fontSize: 13, color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                Charge for off-menu specials, merchandise, or variable items
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} type="button" style={{ width: 38, height: 38, borderRadius: 10 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Item / Service Name *
              </label>
              <input
                autoFocus
                className="form-input"
                placeholder="e.g. Daily Chef Special, Artisan T-Shirt"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ height: 52, fontSize: 16, borderRadius: 12, padding: '0 16px' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              {/* Price Field */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Price ({currency}) *
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: 18,
                    fontWeight: 700,
                    color: 'var(--color-label-tertiary)',
                    pointerEvents: 'none'
                  }}>
                    {currency === 'INR' ? '₹' : (currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency)}
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="form-input"
                    placeholder="0.00"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    style={{
                      height: 52,
                      paddingLeft: 38,
                      paddingRight: 16,
                      fontSize: 18,
                      fontWeight: 800,
                      borderRadius: 12,
                      fontVariantNumeric: 'tabular-nums'
                    }}
                    required
                  />
                </div>
              </div>

              {/* Quantity Stepper & Quick Chips */}
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Quantity
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setQty(q => Math.max(1, q - 1));
                      hapticTap('light');
                    }}
                    disabled={qty <= 1}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      background: 'var(--color-bg-secondary, rgba(255, 255, 255, 0.06))',
                      border: '1.5px solid var(--color-separator)',
                      color: 'var(--color-label)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: qty <= 1 ? 'not-allowed' : 'pointer',
                      opacity: qty <= 1 ? 0.4 : 1,
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                    title="Decrease quantity"
                  >
                    <Minus size={20} strokeWidth={2.5} />
                  </button>

                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      height: 52,
                      textAlign: 'center',
                      fontSize: 20,
                      fontWeight: 800,
                      borderRadius: 12,
                      fontVariantNumeric: 'tabular-nums',
                      flex: 1
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setQty(q => q + 1);
                      hapticTap('light');
                    }}
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      background: 'var(--color-bg-secondary, rgba(255, 255, 255, 0.06))',
                      border: '1.5px solid var(--color-separator)',
                      color: 'var(--color-label)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                    title="Increase quantity"
                  >
                    <Plus size={20} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick 1-Tap Quantity Presets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-label-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Quick Quantity Presets
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 4, 5, 10].map(n => {
                  const isSelected = qty === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setQty(n);
                        hapticTap('light');
                      }}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 10,
                        border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                        background: isSelected ? 'var(--color-accent-light, rgba(56, 189, 248, 0.18))' : 'var(--color-bg-elevated)',
                        color: isSelected ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                        fontSize: 15,
                        fontWeight: 800,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="form-label" style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Special Request or Note (Optional)
              </label>
              <input
                className="form-input"
                placeholder="e.g. Extra spicy, Blue color, Large size"
                value={note}
                onChange={e => setNote(e.target.value)}
                style={{ height: 50, fontSize: 15, borderRadius: 12, padding: '0 16px' }}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '18px 24px', gap: 12 }}>
            <button className="btn btn-secondary" onClick={onClose} type="button" style={{ height: 52, padding: '0 24px', fontSize: 15, fontWeight: 700, borderRadius: 12 }}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" style={{ height: 52, padding: '0 28px', fontSize: 16, fontWeight: 800, borderRadius: 12, flex: 1 }}>
              <Plus size={18} strokeWidth={2.5} /> Add to Cart
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
