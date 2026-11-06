import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

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
      <div className="modal animate-slide-up" style={{ maxWidth: 520, width: 'min(520px, 94vw)' }}>
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--color-accent-light, rgba(56, 189, 248, 0.15))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={18} color="var(--color-accent)" strokeWidth={2.5} />
            </div>
            <h2 className="modal-title" style={{ fontSize: 18, fontWeight: 800 }}>Add Custom / Open Item</h2>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} type="button" style={{ width: 36, height: 36, borderRadius: 10 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p className="text-secondary text-caption1" style={{ margin: 0 }}>
              Quickly charge for off-menu daily specials, custom merchandise, or variable pricing.
            </p>

            <div className="form-group">
              <label className="form-label">Item / Service Name *</label>
              <input
                autoFocus
                className="form-input"
                placeholder="e.g. Daily Chef Special, Artisan T-Shirt"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label">Price ({currency}) *</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="form-input"
                  placeholder="0.00"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={qty}
                  onChange={e => setQty(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Special Request or Note (Optional)</label>
              <input
                className="form-input"
                placeholder="e.g. Extra spicy, Blue color, Large size"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ padding: '16px 20px', gap: 12 }}>
            <button className="btn btn-secondary" onClick={onClose} type="button" style={{ height: 48, padding: '0 22px', fontSize: 15, fontWeight: 700, borderRadius: 12 }}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" style={{ height: 48, padding: '0 26px', fontSize: 15, fontWeight: 800, borderRadius: 12, flex: 1 }}>
              <Plus size={18} strokeWidth={2.5} /> Add to Cart
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
