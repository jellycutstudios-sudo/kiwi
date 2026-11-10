import { useState, useMemo, useEffect } from 'react';
import { X, Search, LayoutGrid, Check, Plus } from 'lucide-react';
import { hapticTap } from '../../utils/soundNotifications';

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
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(10px)',
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
          width: '940px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          overflow: 'hidden',
          background: '#0d101a',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 32px 100px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Modal Header */}
        <div
          className="pos-cat-grid-header"
          style={{
            padding: '20px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            gap: '16px',
            flexWrap: 'wrap',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '11px',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <LayoutGrid size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '19px',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                  }}
                >
                  All Menu Categories
                </h3>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 750,
                    padding: '2px 9px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                  }}
                >
                  {categories.length} Categories
                </span>
              </div>
              <p
                style={{
                  margin: '3px 0 0 0',
                  fontSize: '13px',
                  color: '#94a3b8',
                }}
              >
                Tap any category to filter items · 1-tap instant switch
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Quick search input */}
            {categories.length > 5 && (
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Search
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Find category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    height: '36px',
                    width: '190px',
                    padding: '0 30px 0 34px',
                    fontSize: '13px',
                    borderRadius: '9px',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    background: 'rgba(0, 0, 0, 0.35)',
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: 2,
                    }}
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary btn-icon"
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
              }}
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body: High-Contrast Premium Tiles Grid */}
        <div
          className="pos-cat-grid-body"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '22px 28px',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
              gap: '14px',
            }}
          >
            {/* 1. All Items Master Card */}
            <button
              type="button"
              className={`pos-cat-touch-tile ${activeCat === 'all' ? 'active' : ''}`}
              onClick={() => handleSelect('all')}
              style={{
                minHeight: '96px',
                padding: '16px 18px',
                borderRadius: '14px',
                border: activeCat === 'all'
                  ? '1.5px solid #10b981'
                  : '1px solid rgba(16, 185, 129, 0.35)',
                background: activeCat === 'all'
                  ? '#1a2736'
                  : '#151825',
                color: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: activeCat === 'all'
                  ? '0 0 24px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                  : '0 2px 8px rgba(0, 0, 0, 0.25)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '17px',
                    fontWeight: 800,
                    color: '#ffffff',
                    lineHeight: 1.25,
                  }}
                >
                  All Items
                </span>
                {activeCat === 'all' && (
                  <span
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
                    }}
                  >
                    <Check size={13} strokeWidth={3.5} />
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 750,
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: activeCat === 'all' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                    color: activeCat === 'all' ? '#6ee7b7' : '#cbd5e1',
                  }}
                >
                  {totalItemsCount} items
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Entire Menu</span>
              </div>
            </button>

            {/* Category Cards - High Contrast Obsidian Luxury */}
            {filteredCategories.map((c) => {
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
                    minHeight: '96px',
                    padding: '16px 18px',
                    borderRadius: '14px',
                    border: isActive
                      ? '1.5px solid #10b981'
                      : '1px solid rgba(255, 255, 255, 0.11)',
                    background: isActive
                      ? '#1a2736'
                      : '#151825',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isActive
                      ? '0 0 24px rgba(16, 185, 129, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)'
                      : '0 2px 8px rgba(0, 0, 0, 0.25)',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '17px',
                        fontWeight: 750,
                        color: '#ffffff',
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
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: '#10b981',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
                        }}
                      >
                        <Check size={13} strokeWidth={3.5} />
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '14px' }}>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 750,
                        padding: '3px 10px',
                        borderRadius: '999px',
                        background: isActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                        color: isActive ? '#6ee7b7' : '#cbd5e1',
                      }}
                    >
                      {itemCount} item{itemCount !== 1 ? 's' : ''}
                    </span>
                    {isActive && (
                      <span
                        style={{
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: '#10b981',
                        }}
                      >
                        Active
                      </span>
                    )}
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
                  minHeight: '96px',
                  padding: '16px 18px',
                  borderRadius: '14px',
                  border: '1.5px dashed rgba(255, 255, 255, 0.22)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  color: '#f1f5f9',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={18} strokeWidth={2.5} style={{ color: '#38bdf8' }} />
                  <span style={{ fontSize: '17px', fontWeight: 750, color: '#ffffff' }}>
                    Custom Item
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Punch off-menu special
                </span>
              </button>
            )}
          </div>

          {filteredCategories.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8' }}>
              <p style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>No categories found matching "{search}"</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSearch('')}
                style={{ marginTop: '12px', borderRadius: '8px' }}
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
            padding: '14px 28px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <span style={{ fontSize: '12.5px', color: '#64748b' }}>
            Tip: Tap any category to jump directly · Press Esc to dismiss
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            style={{ borderRadius: '8px', padding: '0 20px', height: '34px', fontSize: '13px' }}
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
