import { useState, useMemo, useEffect } from 'react';
import { X, Search, LayoutGrid, Check, Plus } from 'lucide-react';
import { hapticTap } from '../../utils/soundNotifications';

const THEME_ACCENTS = [
  { border: 'rgba(56, 189, 248, 0.35)', bg: 'rgba(56, 189, 248, 0.08)', text: '#7dd3fc', badge: 'rgba(56, 189, 248, 0.18)' },
  { border: 'rgba(168, 85, 247, 0.35)', bg: 'rgba(168, 85, 247, 0.08)', text: '#d8b4fe', badge: 'rgba(168, 85, 247, 0.18)' },
  { border: 'rgba(245, 158, 11, 0.35)', bg: 'rgba(245, 158, 11, 0.08)', text: '#fcd34d', badge: 'rgba(245, 158, 11, 0.18)' },
  { border: 'rgba(239, 68, 68, 0.35)', bg: 'rgba(239, 68, 68, 0.08)', text: '#fca5a5', badge: 'rgba(239, 68, 68, 0.18)' },
  { border: 'rgba(16, 185, 129, 0.35)', bg: 'rgba(16, 185, 129, 0.08)', text: '#6ee7b7', badge: 'rgba(16, 185, 129, 0.18)' },
  { border: 'rgba(236, 72, 153, 0.35)', bg: 'rgba(236, 72, 153, 0.08)', text: '#f472b6', badge: 'rgba(236, 72, 153, 0.18)' },
  { border: 'rgba(99, 102, 241, 0.35)', bg: 'rgba(99, 102, 241, 0.08)', text: '#a5b4fc', badge: 'rgba(99, 102, 241, 0.18)' },
  { border: 'rgba(20, 184, 166, 0.35)', bg: 'rgba(20, 184, 166, 0.08)', text: '#5eead4', badge: 'rgba(20, 184, 166, 0.18)' },
  { border: 'rgba(249, 115, 22, 0.35)', bg: 'rgba(249, 115, 22, 0.08)', text: '#fdba74', badge: 'rgba(249, 115, 22, 0.18)' },
  { border: 'rgba(132, 204, 22, 0.35)', bg: 'rgba(132, 204, 22, 0.08)', text: '#bef264', badge: 'rgba(132, 204, 22, 0.18)' },
];

export default function CategoryGridModal({
  isOpen,
  onClose,
  categories = [],
  activeCat = 'all',
  onSelectCategory,
  onOpenCustomItem,
}) {
  const [search, setSearch] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const totalItemsCount = useMemo(() => {
    return categories.reduce((sum, c) => sum + (c.items?.length || 0), 0);
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(c => c.name?.toLowerCase().includes(q));
  }, [categories, search]);

  if (!isOpen) return null;

  const handleSelect = (catId) => {
    hapticTap('light');
    if (onSelectCategory) {
      onSelectCategory(catId);
    }
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="All Menu Categories"
    >
      <div
        className="modal pos-cat-grid-modal animate-scale-up"
        style={{
          width: '740px',
          maxWidth: '96vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          background: 'var(--color-bg-elevated, #131622)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Modal Header */}
        <div
          className="pos-cat-grid-header"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-separator, rgba(255, 255, 255, 0.1))',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '9px',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <LayoutGrid size={18} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 750,
                    color: 'var(--color-label, #ffffff)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  All Menu Categories
                </h3>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '1.5px 7px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: 'var(--color-label-secondary, #94a3b8)',
                  }}
                >
                  {categories.length}
                </span>
              </div>
              <p
                style={{
                  margin: '2px 0 0 0',
                  fontSize: '12px',
                  color: 'var(--color-label-tertiary, #64748b)',
                }}
              >
                1-tap jump to any category · Never scroll horizontally
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Quick search if multiple categories */}
            {categories.length > 5 && (
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    color: 'var(--color-label-tertiary, #64748b)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Find category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    height: '32px',
                    width: '160px',
                    padding: '0 28px 0 30px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-separator, rgba(255, 255, 255, 0.14))',
                    background: 'rgba(0, 0, 0, 0.25)',
                    color: 'var(--color-label, #ffffff)',
                    outline: 'none',
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-label-tertiary, #64748b)',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-icon"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body: Touch-Friendly Tiles Grid */}
        <div
          className="pos-cat-grid-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: '12px',
            }}
          >
            {/* 1. All Items Tile */}
            <button
              type="button"
              className={`pos-cat-touch-tile ${activeCat === 'all' ? 'active' : ''}`}
              onClick={() => handleSelect('all')}
              style={{
                minHeight: '82px',
                padding: '14px 16px',
                borderRadius: '12px',
                border: activeCat === 'all'
                  ? '1.5px solid #10b981'
                  : '1px solid rgba(16, 185, 129, 0.35)',
                background: activeCat === 'all'
                  ? 'rgba(16, 185, 129, 0.22)'
                  : 'rgba(16, 185, 129, 0.08)',
                color: activeCat === 'all' ? '#ffffff' : '#6ee7b7',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: activeCat === 'all'
                  ? '0 0 16px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  : 'none',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: 750,
                    color: 'inherit',
                    lineHeight: 1.25,
                  }}
                >
                  All Items
                </span>
                {activeCat === 'all' && (
                  <span
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.16)',
                    color: '#ffffff',
                  }}
                >
                  {totalItemsCount} items
                </span>
                <span style={{ fontSize: '11px', opacity: 0.7 }}>Whole Menu</span>
              </div>
            </button>

            {/* Category Tiles */}
            {filteredCategories.map((c, idx) => {
              const theme = THEME_ACCENTS[idx % THEME_ACCENTS.length];
              const isActive = activeCat === c.id;
              const itemCount = c.items?.length || 0;

              return (
                <button
                  key={c.id}
                  id={`cat-modal-tile-${c.id}`}
                  type="button"
                  className={`pos-cat-touch-tile ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelect(c.id)}
                  style={{
                    minHeight: '82px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: isActive
                      ? '1.5px solid #ffffff'
                      : `1px solid ${theme.border}`,
                    background: isActive
                      ? '#252a3d'
                      : theme.bg,
                    color: isActive ? '#ffffff' : theme.text,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isActive
                      ? '0 4px 16px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                      : '0 2px 6px rgba(0, 0, 0, 0.15)',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '15px',
                        fontWeight: 750,
                        color: isActive ? '#ffffff' : 'var(--color-label, #ffffff)',
                        lineHeight: 1.25,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {c.name}
                    </span>
                    {isActive && (
                      <span
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: '#10b981',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: isActive ? 'rgba(255, 255, 255, 0.22)' : theme.badge,
                        color: isActive ? '#ffffff' : theme.text,
                      }}
                    >
                      {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-label-tertiary, #64748b)',
                      }}
                    >
                      {isActive ? 'Active' : 'Tap to open'}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* Custom Item Tile */}
            {onOpenCustomItem && (
              <button
                type="button"
                className="pos-cat-touch-tile pos-cat-touch-tile--custom"
                onClick={() => {
                  hapticTap('light');
                  onClose();
                  onOpenCustomItem();
                }}
                style={{
                  minHeight: '82px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1.5px dashed rgba(245, 158, 11, 0.45)',
                  background: 'rgba(245, 158, 11, 0.08)',
                  color: '#fcd34d',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plus size={16} strokeWidth={2.5} />
                  <span style={{ fontSize: '15px', fontWeight: 750 }}>
                    Custom Item
                  </span>
                </div>
                <span style={{ fontSize: '11.5px', color: '#fef08a' }}>
                  Punch off-menu special
                </span>
              </button>
            )}
          </div>

          {filteredCategories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-label-tertiary, #64748b)' }}>
              <p style={{ margin: 0, fontWeight: 600 }}>No categories found matching "{search}"</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSearch('')}
                style={{ marginTop: '10px' }}
              >
                Clear Search
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className="pos-cat-grid-footer"
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--color-separator, rgba(255, 255, 255, 0.1))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.15)',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--color-label-tertiary, #64748b)' }}>
            Tip: Tapping any category card selects it and closes this view automatically.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ borderRadius: '8px', padding: '0 16px', height: '32px' }}
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
