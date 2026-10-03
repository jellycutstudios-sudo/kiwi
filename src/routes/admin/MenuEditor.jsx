import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { useBusinessConfig } from '../../hooks/useBusinessConfig';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X, LayoutGrid, List, Search, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';
import { getKitchenStations } from '../../utils/stations';

// Compress image client-side to a small base64 JPEG for inline storage
const compressImage = (file, maxDim = 400, quality = 0.82) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      } else {
        if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      try { resolve(canvas.toDataURL('image/jpeg', quality)); }
      catch (err) { reject(err); }
    };
    img.onerror = (err) => { URL.revokeObjectURL(objectUrl); reject(err); };
  });
};


// Use cryptographically random IDs — Date.now() is not unique under concurrent saves
const generateId = () => crypto.randomUUID();

export default function MenuEditor() {
  const { restaurant } = useAuthStore();
  const { categories } = useMenuStore();
  const { terms } = useBusinessConfig();
  const [activeCat, setActiveCat] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', emoji: '' });
  const [itemForm, setItemForm] = useState({ name: '', price: '', description: '', emoji: '', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '', highMargin: false, isBestseller: false, barcode: '', unit: 'pcs' });
  const [inventory, setInventory] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list' (default grid for tab/pos)
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [isAddingCustomStation, setIsAddingCustomStation] = useState(false);
  const [newCustomStation, setNewCustomStation] = useState('');

  const availableStations = useMemo(() => {
    const configured = getKitchenStations(restaurant);
    const current = itemForm.station;
    if (current && !configured.some(s => s.toLowerCase() === current.toLowerCase())) {
      return [...configured, current];
    }
    return configured;
  }, [restaurant, itemForm.station]);

  const handleCreateCustomStation = async () => {
    const clean = newCustomStation.trim();
    if (!clean) {
      setIsAddingCustomStation(false);
      return;
    }
    const currentStations = getKitchenStations(restaurant);
    const exists = currentStations.find(s => s.toLowerCase() === clean.toLowerCase());
    const stationName = exists || clean;
    
    setItemForm(f => ({ ...f, station: stationName }));
    setIsAddingCustomStation(false);
    setNewCustomStation('');

    if (!exists && restaurant?.id) {
      const updated = [...currentStations, clean];
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id), {
          'kitchenConfig.stations': updated
        });
        useAuthStore.setState(s => ({
          restaurant: {
            ...s.restaurant,
            kitchenConfig: {
              ...(s.restaurant?.kitchenConfig || {}),
              stations: updated
            }
          }
        }));
        toast.success(`Station "${clean}" added to kitchen stations!`);
      } catch (err) {
        console.warn('Could not save station to restaurant config:', err);
      }
    }
  };

  const openAddItemModal = () => {
    setIsAddingCustomStation(false);
    setNewCustomStation('');
    setEditItem(null);
    setItemForm({
      name: '',
      price: '',
      description: '',
      emoji: '',
      available: true,
      modifierGroups: [],
      recipe: [],
      station: 'Kitchen',
      imageUrl: '',
      highMargin: false,
      isBestseller: false,
      barcode: '',
      unit: 'pcs'
    });
    setShowAdvancedDetails(false);
    setActiveTab('general');
    setShowItemForm(true);
  };

  const openEditItemModal = (item) => {
    setIsAddingCustomStation(false);
    setNewCustomStation('');
    setEditItem(item);
    setItemForm({
      name: item.name,
      price: item.price,
      description: item.description ?? '',
      emoji: item.emoji ?? '',
      available: item.available !== false,
      modifierGroups: item.modifierGroups ?? [],
      recipe: item.recipe ?? [],
      station: item.station ?? 'Kitchen',
      imageUrl: item.imageUrl ?? '',
      highMargin: item.highMargin || false,
      isBestseller: item.isBestseller || item.bestseller || false,
      barcode: item.barcode ?? '',
      unit: item.unit ?? 'pcs'
    });
    setShowAdvancedDetails(Boolean(item.barcode || item.description || (item.unit && item.unit !== 'pcs')));
    setActiveTab('general');
    setShowItemForm(true);
  };

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const areAllGroupsCollapsed = (itemForm.modifierGroups ?? []).length > 0 &&
    (itemForm.modifierGroups ?? []).every(g => !!collapsedGroups[g.id]);

  const toggleCollapseAll = () => {
    if (areAllGroupsCollapsed) {
      setCollapsedGroups({});
    } else {
      const all = {};
      (itemForm.modifierGroups ?? []).forEach(g => { all[g.id] = true; });
      setCollapsedGroups(all);
    }
  };

  const getGroupSummary = (group) => {
    const count = group.options?.length ?? 0;
    if (count === 0) return 'No options';
    const prices = (group.options ?? []).map(o => o.priceAdd || 0);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const priceStr = minP === maxP 
      ? (minP > 0 ? `+${formatCurrency(minP, restaurant?.currency)}` : 'Free')
      : `+${formatCurrency(minP, restaurant?.currency)} to +${formatCurrency(maxP, restaurant?.currency)}`;
    return `${count} ${count === 1 ? 'option' : 'options'} • ${priceStr}`;
  };

  // Quick 1-click preset templates for restaurant owners
  const addModifierPreset = (type) => {
    const timestamp = Date.now();
    let newGroup;
    if (type === 'portions') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Portion / Size',
        required: true,
        maxSelect: 1,
        options: [
          { id: `${timestamp}-opt-qtr`, name: 'Quarter', priceAdd: 0 },
          { id: `${timestamp}-opt-hlf`, name: 'Half', priceAdd: 0 },
          { id: `${timestamp}-opt-ful`, name: 'Full', priceAdd: 0 }
        ]
      };
    } else if (type === 'sizes') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Size',
        required: true,
        maxSelect: 1,
        options: [
          { id: `${timestamp}-opt-sml`, name: 'Small', priceAdd: 0 },
          { id: `${timestamp}-opt-med`, name: 'Medium', priceAdd: 0 },
          { id: `${timestamp}-opt-lrg`, name: 'Large', priceAdd: 0 }
        ]
      };
    } else if (type === 'spice') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Spice Level',
        required: true,
        maxSelect: 1,
        options: [
          { id: `${timestamp}-opt-mild`, name: 'Mild', priceAdd: 0 },
          { id: `${timestamp}-opt-med`, name: 'Medium', priceAdd: 0 },
          { id: `${timestamp}-opt-hot`, name: 'Extra Spicy', priceAdd: 0 }
        ]
      };
    } else if (type === 'addons') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Add-ons & Extras',
        required: false,
        maxSelect: 5,
        options: [
          { id: `${timestamp}-opt-chz`, name: 'Extra Cheese', priceAdd: 0 },
          { id: `${timestamp}-opt-dip`, name: 'Garlic Dip / Mayo', priceAdd: 0 }
        ]
      };
    } else {
      newGroup = {
        id: timestamp.toString(),
        name: '',
        required: false,
        maxSelect: 1,
        options: [{ id: `${timestamp}-opt`, name: '', priceAdd: 0 }]
      };
    }
    setItemForm(f => ({ ...f, modifierGroups: [...(f.modifierGroups ?? []), newGroup] }));
    setCollapsedGroups(prev => ({ ...prev, [newGroup.id]: false }));
  };

  // One-time fetch for inventory (COGS recipe editing)
  useEffect(() => {
    if (!restaurant?.id) return;
    getDocs(collection(db, 'restaurants', restaurant.id, 'inventory'))
      .then(snap => {
        setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(err => console.error('Error fetching inventory:', err));
  }, [restaurant?.id]);

  const openAddCategory = () => {
    setEditingCat(null);
    setCatForm({ name: '', emoji: '' });
    setShowCatForm(true);
  };

  const openEditCategory = (cat) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name || '', emoji: cat.emoji || '🍽️' });
    setShowCatForm(true);
  };

  const saveCategory = async () => {
    if (!catForm.name.trim()) return;
    if (editingCat) {
      await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', editingCat.id), {
        name: catForm.name.trim(),
        emoji: catForm.emoji.trim() || '🍽️',
      });
      toast.success('Category updated!');
    } else {
      await addDoc(collection(db, 'restaurants', restaurant.id, 'menu'), {
        name: catForm.name.trim(),
        emoji: catForm.emoji.trim() || '🍽️',
        items: [],
      });
      toast.success('Category added!');
    }
    setCatForm({ name: '', emoji: '' });
    setEditingCat(null);
    setShowCatForm(false);
  };

  const deleteCategory = async (catId) => {
    if (!confirm('Delete this category and all its items?')) return;
    await deleteDoc(doc(db, 'restaurants', restaurant.id, 'menu', catId));
    if (activeCatId === catId) setActiveCat(null);
    toast.success('Category deleted');
  };

  const saveItem = async () => {
    const parsedPrice = parseFloat(itemForm.price);
    if (!itemForm.name.trim() || itemForm.price === '' || isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error('Please enter a valid item name and price (minimum 0)');
      return;
    }
    const cat = categories.find(c => c.id === activeCatId);
    if (!cat) return;
    const newItem = {
      id: editItem?.id ?? generateId(),
      name: itemForm.name.trim(),
      price: parsedPrice,
      description: itemForm.description.trim(),
      emoji: itemForm.emoji.trim() || '🍽️',
      available: itemForm.available,
      modifierGroups: itemForm.modifierGroups ?? [],
      recipe: itemForm.recipe ?? [],
      station: itemForm.station ?? 'Kitchen',
      imageUrl: itemForm.imageUrl ?? '',
      highMargin: itemForm.highMargin || false,
      isBestseller: itemForm.isBestseller || false,
      barcode: itemForm.barcode?.trim() ?? '',
      unit: itemForm.unit || 'pcs',
    };
    const items = editItem
      ? cat.items.map(i => i.id === editItem.id ? newItem : i)
      : [...(cat.items ?? []), newItem];
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', activeCatId), { items });
    setShowItemForm(false);
    setEditItem(null);
    setItemForm({ name:'', price:'', description:'', emoji:'', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '', highMargin: false, isBestseller: false, barcode: '', unit: 'pcs' });
    toast.success(editItem ? 'Item updated!' : 'Item added!');
  };

  const deleteItem = async (catId, itemId) => {
    const cat = categories.find(c => c.id === catId);
    const items = cat.items.filter(i => i.id !== itemId);
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', catId), { items });
    toast.success('Item removed');
  };

  const toggleAvailable = async (catId, item) => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return;
    const items = cat.items.map(i => i.id === item.id ? { ...i, available: i.available === false } : i);
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', catId), { items });
    toast.success('Availability updated');
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const toastId = toast.loading('Processing image...');
    try {
      // Compress inline — image stored as base64 in Firestore, bypassing Storage CORS
      const dataUrl = await compressImage(file, 400, 0.82);
      setItemForm(f => ({ ...f, imageUrl: dataUrl }));
      toast.success('Image ready! Save the item to apply.', { id: toastId });
    } catch (err) {
      console.error('[Image Error]', err);
      toast.error('Failed to process image: ' + err.message, { id: toastId });
    } finally {
      e.target.value = '';
      setUploadingImage(false);
    }
  };

  const activeCatId = activeCat || categories[0]?.id || null;
  const activeCatData = categories.find(c => c.id === activeCatId);


  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2 className="text-title2" style={{ margin: 0 }}>Menu Editor</h2>
      </div>

      <div className="menu-editor-layout">
        {/* Categories sidebar */}
        <div className={`menu-editor-sidebar card ${activeCat !== null ? 'desktop-only' : ''}`}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)' }}>
            <span className="card-title" style={{ fontSize: '15px' }}>Categories</span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              id="add-category-btn"
              onClick={openAddCategory}
              style={{ padding: '4px 9px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Add Category"
            >
              <Plus size={13} /> Add
            </button>
          </div>
          <div style={{ padding:'var(--space-2)' }}>
            {categories.map(c => (
              <div
                key={c.id}
                className={`menu-editor-cat-item ${activeCatId === c.id ? 'active' : ''}`}
                onClick={() => setActiveCat(c.id)}
              >
                <span>{c.emoji}</span>
                <span style={{ flex:1, fontWeight: activeCatId === c.id ? 700 : 'var(--weight-medium)', fontSize:'var(--text-subhead)', color: activeCatId === c.id ? '#ffffff' : 'var(--color-label)' }}>
                  {c.name}
                </span>
                <span style={{ fontSize:'var(--text-caption2)', color: activeCatId === c.id ? 'rgba(255,255,255,0.7)' : 'var(--color-label-tertiary)' }}>
                  {c.items?.length ?? 0}
                </span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); openEditCategory(c); }}
                  className="cat-edit-btn"
                  title="Edit category"
                  id={`edit-cat-${c.id}`}
                >
                  <Edit2 size={12}/>
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); deleteCategory(c.id); }}
                  style={{ background:'none', border:'none', color:'var(--color-red)', cursor:'pointer', padding:2, opacity:0.6 }}
                  title="Delete category"
                >
                  <Trash2 size={12}/>
                </button>
              </div>
            ))}
            {categories.length === 0 ? (
              <div style={{ padding:'var(--space-4)', color:'var(--color-label-tertiary)', fontSize:'var(--text-footnote)', textAlign:'center' }}>
                No categories yet
              </div>
            ) : null}

            <button
              type="button"
              className="menu-editor-add-cat-btn"
              onClick={openAddCategory}
              title="Add New Category"
            >
              <Plus size={13} />
              <span>Add Category</span>
            </button>
          </div>
        </div>

        {/* Items panel */}
        <div className={`card ${activeCat === null ? 'desktop-only' : ''}`} style={{ flex: 1 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm mobile-only"
                onClick={() => setActiveCat(null)}
                style={{ padding: '6px 12px' }}
              >
                ← Back
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="card-title" style={{ margin: 0 }}>
                  {activeCatData?.emoji} {activeCatData?.name ?? 'Select a category'}
                </span>
                {activeCatData && (
                  <span className="badge badge-gray" style={{ fontSize: '11px', fontWeight: 600 }}>
                    {activeCatData.items?.length ?? 0} {terms.items?.toLowerCase() || 'items'}
                  </span>
                )}
                {activeCatData && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-icon"
                    onClick={() => openEditCategory(activeCatData)}
                    style={{ width: 26, height: 26, padding: 0 }}
                    title={`Edit ${activeCatData.name}`}
                    id="edit-active-cat-btn"
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {activeCatId && (activeCatData?.items ?? []).length > 0 && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input"
                    style={{
                      paddingLeft: 28,
                      paddingRight: searchQuery ? 24 : 10,
                      height: 32,
                      fontSize: '12px',
                      width: 140,
                      borderRadius: 8
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: 6, background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* View Switcher: Card Grid (Tablet & POS optimized) vs List */}
              <div style={{ display: 'inline-flex', background: 'var(--color-bg-secondary)', padding: '2px', borderRadius: '8px', border: '1px solid var(--color-separator)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 8px', height: 28, borderRadius: 6, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setViewMode('grid')}
                  title="Card Grid (Optimized for Tablets & POS screens)"
                >
                  <LayoutGrid size={13} />
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 8px', height: 28, borderRadius: 6, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setViewMode('list')}
                  title="List View"
                >
                  <List size={13} />
                </button>
              </div>

              {activeCatId && (
                <button className="btn btn-primary btn-sm" id="add-item-btn" onClick={openAddItemModal}>
                  <Plus size={14}/> Add {terms.item || 'Item'}
                </button>
              )}
            </div>
          </div>

          <div>
            {(activeCatData?.items ?? []).length === 0 ? (
              <div style={{ padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)' }}>
                <div style={{fontSize:32}}>🍽️</div>
                <div style={{marginTop:'var(--space-2)'}}>No {terms.items?.toLowerCase() || 'items'} in this {terms.category?.toLowerCase() || 'category'}</div>
              </div>
            ) : (() => {
              const filteredItems = (activeCatData?.items ?? []).filter(item => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  item.name?.toLowerCase().includes(q) ||
                  item.description?.toLowerCase().includes(q) ||
                  item.barcode?.toLowerCase().includes(q)
                );
              });

              if (filteredItems.length === 0) {
                return (
                  <div style={{ padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)' }}>
                    <div style={{fontSize:28}}>🔍</div>
                    <div style={{marginTop:'var(--space-2)'}}>No items match "{searchQuery}"</div>
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setSearchQuery('')}>Clear search</button>
                  </div>
                );
              }

              return viewMode === 'grid' ? (
                <div className="menu-editor-grid">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className={`menu-editor-card ${item.available === false ? 'unavailable' : ''}`}
                      onClick={() => openEditItemModal(item)}
                    >
                      {/* Media container */}
                      <div className="menu-editor-card-media">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="menu-editor-card-img" />
                        ) : (
                          <div className="menu-editor-card-emoji-placeholder">
                            <span>{item.emoji ?? '🍽️'}</span>
                          </div>
                        )}

                        {/* Top floating badges */}
                        <div className="menu-editor-card-top-badges">
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {item.highMargin && (
                              <span className="menu-editor-pill-badge star" title="High Margin">⭐ Margin</span>
                            )}
                            {(item.isBestseller || item.bestseller) && (
                              <span className="menu-editor-pill-badge" style={{ background: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' }} title="Bestseller">🔥 Bestseller</span>
                            )}
                            {item.barcode && (
                              <span className="menu-editor-pill-badge">🏷️ {item.barcode}</span>
                            )}
                          </div>

                          <button
                            type="button"
                            className={`badge ${item.available !== false ? 'badge-green' : 'badge-gray'}`}
                            style={{
                              cursor: 'pointer',
                              border: 'none',
                              backdropFilter: 'blur(6px)',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAvailable(activeCatId, item);
                            }}
                            title="Tap to toggle availability"
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.available !== false ? '#10b981' : '#94a3b8' }} />
                            {item.available !== false ? 'Available' : 'Out of stock'}
                          </button>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="menu-editor-card-body">
                        <div className="menu-editor-card-title-row">
                          <h4 className="menu-editor-card-title">{item.name}</h4>
                        </div>

                        {item.description && (
                          <p className="menu-editor-card-desc">{item.description}</p>
                        )}

                        {item.modifierGroups?.length > 0 && (
                          <div className="menu-editor-card-modifiers">
                            <span>⚡ {item.modifierGroups.length} {item.modifierGroups.length === 1 ? 'Portion' : 'Portions'}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer: Price & Actions */}
                      <div className="menu-editor-card-footer" onClick={(e) => e.stopPropagation()}>
                        <div className="menu-editor-card-price">
                          {item.modifierGroups?.length > 0 && parseFloat(item.price) === 0 ? (
                            (() => {
                              const allPrices = item.modifierGroups.flatMap(g => g.options?.map(o => o.priceAdd) || []).filter(p => p > 0);
                              const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
                              return `From ${formatCurrency(minPrice, restaurant?.currency ?? 'INR')}`;
                            })()
                          ) : (
                            formatCurrency(item.price, restaurant?.currency ?? 'INR')
                          )}
                          {item.unit && item.unit !== 'pcs' && (
                            <span style={{ fontSize: '10.5px', color: 'var(--color-label-tertiary)', fontWeight: 'normal' }}> /{item.unit}</span>
                          )}
                        </div>

                        <div className="menu-editor-card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon btn-sm menu-editor-action-btn"
                            onClick={() => openEditItemModal(item)}
                            id={`edit-item-${item.id}`}
                            title="Edit item"
                          >
                            <Edit2 size={13}/>
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon btn-sm menu-editor-action-btn delete"
                            onClick={() => deleteItem(activeCatId, item.id)}
                            id={`delete-item-${item.id}`}
                            title="Delete item"
                          >
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  {filteredItems.map((item) => (
                    <div key={item.id} className="menu-item-row" style={{ opacity: item.available === false ? 0.5 : 1 }}>
                      {item.imageUrl ? (
                        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--color-separator)', flexShrink: 0 }}>
                          <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (
                        <div style={{ fontSize: 28, flexShrink: 0 }}>{item.emoji ?? '🍽️'}</div>
                      )}
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{item.name}</span>
                          {item.highMargin && <span title="High Margin">⭐</span>}
                          {(item.isBestseller || item.bestseller) && <span title="Bestseller">🔥</span>}
                          {item.barcode && <span style={{ fontSize: '10.5px', color: 'var(--color-label-tertiary)', background: 'var(--color-bg-secondary)', padding: '1px 5px', borderRadius: '4px' }}>🏷️ {item.barcode}</span>}
                          {item.modifierGroups?.length > 0 && (
                            <span style={{ fontSize: '10.5px', color: 'var(--color-accent)', background: 'var(--color-accent-light, rgba(0,122,255,0.08))', border: '1px solid var(--color-accent)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              ⚡ {item.modifierGroups.length} {item.modifierGroups.length === 1 ? 'Portion/Size' : 'Portions/Modifiers'}
                            </span>
                          )}
                        </div>
                        {item.description && <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', marginTop: 2 }}>{item.description}</div>}
                      </div>
                      
                      <div className="menu-item-meta-actions">
                        <div style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)', minWidth: 80, textAlign: 'right', fontSize: 'var(--text-subhead)' }}>
                          {item.modifierGroups?.length > 0 && parseFloat(item.price) === 0 ? (
                            (() => {
                              const allPrices = item.modifierGroups.flatMap(g => g.options?.map(o => o.priceAdd) || []).filter(p => p > 0);
                              const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
                              return `From ${formatCurrency(minPrice, restaurant?.currency ?? 'INR')}`;
                            })()
                          ) : (
                            formatCurrency(item.price, restaurant?.currency ?? 'INR')
                          )}
                          {item.unit && item.unit !== 'pcs' && <span style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', fontWeight: 'normal' }}> /{item.unit}</span>}
                        </div>
                        <div className="menu-item-actions">
                          <button
                            onClick={() => toggleAvailable(activeCatId, item)}
                            className={`badge ${item.available !== false ? 'badge-green' : 'badge-gray'}`}
                            style={{ cursor: 'pointer', border: 'none', fontFamily: 'var(--font-family)' }}
                            title="Toggle availability"
                          >
                            {item.available !== false ? 'Available' : 'Unavailable'}
                          </button>
                          <button className="btn btn-secondary btn-icon btn-sm" onClick={() => openEditItemModal(item)} id={`edit-item-${item.id}`}>
                            <Edit2 size={12}/>
                          </button>
                          <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteItem(activeCatId, item.id)} id={`delete-item-${item.id}`}>
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Add / Edit Category Modal */}
      {showCatForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatForm(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingCat ? 'Edit Category' : 'Add Category'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowCatForm(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Category Name</label>
                <input id="cat-name-input" className="form-input" placeholder="e.g. Starters" value={catForm.name} onChange={e => setCatForm(f => ({...f, name:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Emoji</label>
                <input id="cat-emoji-input" className="form-input" placeholder="e.g. 🥗" value={catForm.emoji} onChange={e => setCatForm(f => ({...f, emoji:e.target.value}))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCatForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-category-btn" onClick={saveCategory}>{editingCat ? 'Save Changes' : 'Add Category'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showItemForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowItemForm(false)}>
          <div className="modal modal-unified-editor">
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>{itemForm.emoji || '🍽️'}</span>
                <div>
                  <h2 className="modal-title" style={{ margin: 0, fontSize: '17px' }}>
                    {editItem ? `Edit: ${editItem.name || 'Item'}` : `Add New ${terms.item || 'Item'}`}
                  </h2>
                  <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                    {activeCatData ? `${activeCatData.emoji} ${activeCatData.name}` : 'Menu Item'}
                  </span>
                </div>
              </div>
              <button className="btn btn-secondary btn-icon" id="close-item-modal-btn" onClick={() => setShowItemForm(false)} title="Close"><X size={16}/></button>
            </div>
            
            {/* Segmented Pill Tab Bar */}
            <div className="modal-tabs-segmented-wrapper">
              <div className="modal-tabs-segmented">
                <button
                  type="button"
                  className={`modal-tab-segmented-btn ${activeTab === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  General Info
                </button>
                <button
                  type="button"
                  className={`modal-tab-segmented-btn ${activeTab === 'modifiers' ? 'active' : ''}`}
                  onClick={() => setActiveTab('modifiers')}
                >
                  Portions & Add-ons
                  {(itemForm.modifierGroups?.length ?? 0) > 0 && (
                    <span className="modal-tab-badge">{itemForm.modifierGroups.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`modal-tab-segmented-btn ${activeTab === 'recipe' ? 'active' : ''}`}
                  onClick={() => setActiveTab('recipe')}
                >
                  Recipe & COGS
                  {(itemForm.recipe?.length ?? 0) > 0 && (
                    <span className="modal-tab-badge">{itemForm.recipe.length}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Tab 1: General Info */}
            {activeTab === 'general' && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
                {/* Row 1: Item Name & Sleek Status Pill */}
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>Item Name</label>
                    <button
                      type="button"
                      onClick={() => setItemForm(f => ({ ...f, available: !f.available }))}
                      className={`item-status-toggle-pill ${itemForm.available ? 'is-available' : 'is-sold-out'}`}
                      title="Click to toggle availability"
                    >
                      <span className="status-dot" />
                      <span className="status-text">{itemForm.available ? 'Available' : 'Sold Out'}</span>
                    </button>
                  </div>
                  <input 
                    id="item-name-input" 
                    className="form-input" 
                    placeholder="e.g. Grilled Chicken" 
                    value={itemForm.name} 
                    onChange={e => setItemForm(f=>({...f,name:e.target.value}))} 
                    style={{ height: 42, fontSize: '14px' }}
                  />
                </div>

                {/* Row 2: Price & Kitchen Station */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700 }}>
                      Price ({restaurant?.currency ?? 'INR'})
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: 12, fontSize: '13px', fontWeight: 600, color: 'var(--color-label-tertiary)' }}>
                        {restaurant?.currency === 'INR' ? '₹' : (restaurant?.currency ?? '$')}
                      </span>
                      <input 
                        id="item-price-input" 
                        className="form-input" 
                        type="number" 
                        min={0} 
                        step={0.01} 
                        placeholder="0.00" 
                        value={itemForm.price} 
                        onChange={e => setItemForm(f=>({...f,price:e.target.value}))} 
                        style={{ paddingLeft: 26, height: 40 }}
                      />
                    </div>
                  </div>
                  
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <label className="form-label" style={{ fontWeight: 700, margin: 0 }}>Kitchen Station</label>
                      {!isAddingCustomStation && (
                        <button
                          type="button"
                          onClick={() => setIsAddingCustomStation(true)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-accent)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '0 2px'
                          }}
                        >
                          + Custom
                        </button>
                      )}
                    </div>
                    {isAddingCustomStation ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ height: 40, padding: '0 10px', fontSize: '13px', flex: 1 }}
                          placeholder="e.g. Pizza Oven, Sushi Bar"
                          value={newCustomStation}
                          onChange={e => setNewCustomStation(e.target.value)}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCreateCustomStation();
                            } else if (e.key === 'Escape') {
                              setIsAddingCustomStation(false);
                              setNewCustomStation('');
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ height: 40, padding: '0 12px', flexShrink: 0 }}
                          onClick={handleCreateCustomStation}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ height: 40, padding: '0 8px', flexShrink: 0 }}
                          onClick={() => {
                            setIsAddingCustomStation(false);
                            setNewCustomStation('');
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <select 
                        id="item-station-select" 
                        className="form-select" 
                        value={itemForm.station ?? 'Kitchen'} 
                        onChange={e => {
                          if (e.target.value === '__add_custom__') {
                            setIsAddingCustomStation(true);
                          } else {
                            setItemForm(f => ({ ...f, station: e.target.value }));
                          }
                        }}
                        style={{ height: 40, padding: '0 12px' }}
                      >
                        {availableStations.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                        <option value="__add_custom__">+ Add Custom Station...</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Row 3: Compact Media Strip (Photo + Emoji + Margin chip) */}
                <div className="item-editor-media-card">
                  {/* Photo Uploader */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                    {itemForm.imageUrl ? (
                      <div style={{ position: 'relative', width: 44, height: 44, borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-separator)', flexShrink: 0 }}>
                        <img src={itemForm.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => setItemForm(f => ({ ...f, imageUrl: '' }))}
                          style={{
                            position: 'absolute', top: 1, right: 1,
                            background: 'rgba(239, 68, 68, 0.9)', color: '#fff',
                            border: 'none', borderRadius: '50%',
                            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, cursor: 'pointer', fontWeight: 'bold'
                          }}
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: '8px', border: '1px dashed var(--color-separator)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: 'var(--color-bg)', flexShrink: 0 }}>
                        📷
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
                      <input
                        type="file"
                        accept="image/*"
                        id="item-image-file"
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => document.getElementById('item-image-file').click()}
                        disabled={uploadingImage}
                        style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: '11px', height: 28 }}
                      >
                        {uploadingImage ? 'Optimizing...' : (itemForm.imageUrl ? 'Change Photo' : 'Upload Photo')}
                      </button>
                      <span style={{ fontSize: '9px', color: 'var(--color-label-tertiary)', lineHeight: 1 }}>
                        Auto-compressed
                      </span>
                    </div>
                  </div>

                  <div style={{ width: 1, height: 28, background: 'var(--color-separator)', flexShrink: 0 }} />

                  {/* Emoji input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-label-secondary)' }}>Emoji</span>
                    <input 
                      id="item-emoji-input" 
                      className="form-input" 
                      placeholder="🍽️" 
                      value={itemForm.emoji} 
                      onChange={e => setItemForm(f=>({...f,emoji:e.target.value}))} 
                      style={{ width: 44, height: 32, textAlign: 'center', fontSize: 16, padding: '0 4px' }}
                    />
                  </div>

                  <div style={{ width: 1, height: 28, background: 'var(--color-separator)', flexShrink: 0 }} />

                  {/* High Margin toggle chip */}
                  <button
                    type="button"
                    onClick={() => setItemForm(f => ({ ...f, highMargin: !f.highMargin }))}
                    className={`high-margin-chip ${itemForm.highMargin ? 'is-active' : ''}`}
                    title="Highlight as high margin item"
                  >
                    <span>⭐</span>
                    <span>High Margin</span>
                  </button>

                  {/* Bestseller toggle chip */}
                  <button
                    type="button"
                    id="item-bestseller-toggle"
                    onClick={() => setItemForm(f => ({ ...f, isBestseller: !f.isBestseller }))}
                    className={`bestseller-chip ${itemForm.isBestseller ? 'is-active' : ''}`}
                    title="Mark as signature Bestseller dish"
                  >
                    <span>🔥</span>
                    <span>Bestseller</span>
                  </button>
                </div>

                {/* Section 4: Collapsible Optional Details (SKU, Unit, Description) */}
                <div className="optional-details-wrapper">
                  <button
                    type="button"
                    id="toggle-optional-details-btn"
                    className="optional-details-toggle-btn"
                    onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {showAdvancedDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      <span>{showAdvancedDetails ? 'Hide Optional Details' : 'More Details (SKU, Unit, Description)'}</span>
                    </span>
                    {(itemForm.barcode || itemForm.description || (itemForm.unit && itemForm.unit !== 'pcs')) && (
                      <span className="optional-details-configured-badge">Configured</span>
                    )}
                  </button>

                  {showAdvancedDetails && (
                    <div className="optional-details-content">
                      {/* Barcode & Unit Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', fontWeight: 600 }}>Barcode / SKU</label>
                          <input 
                            id="item-barcode-input" 
                            className="form-input" 
                            placeholder="e.g. SKU-101" 
                            value={itemForm.barcode ?? ''} 
                            onChange={e => setItemForm(f=>({...f, barcode: e.target.value}))} 
                            style={{ height: 36, padding: '0 12px', fontSize: '13px' }}
                          />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', fontWeight: 600 }}>Unit of Measure</label>
                          <select 
                            id="item-unit-select" 
                            className="form-select" 
                            value={itemForm.unit ?? 'pcs'} 
                            onChange={e => setItemForm(f=>({...f, unit: e.target.value}))}
                            style={{ height: 36, padding: '0 12px', fontSize: '13px' }}
                          >
                            <option value="pcs">Pieces (pcs)</option>
                            <option value="kg">Kilogram (kg)</option>
                            <option value="g">Gram (g)</option>
                            <option value="pack">Pack / Box</option>
                            <option value="portion">Portion</option>
                            <option value="hour">Hour / Session</option>
                          </select>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px', fontWeight: 600 }}>Description</label>
                        <textarea 
                          id="item-desc-input" 
                          className="form-input" 
                          placeholder="Describe taste, ingredients, or allergens..." 
                          value={itemForm.description} 
                          onChange={e => setItemForm(f=>({...f,description:e.target.value}))} 
                          rows={2}
                          style={{ resize: 'none', padding: '6px 10px', height: 'auto', fontSize: '12px', fontFamily: 'inherit' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Portions & Add-ons */}
            {activeTab === 'modifiers' && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {/* Header with Title + Expand/Collapse All + Add Group */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '14.5px', color: 'var(--color-label)' }}>
                      Portions, Sizes & Add-ons
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>
                      Configure portion sizes, spice levels, toppings, or sauce choices.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {(itemForm.modifierGroups ?? []).length > 1 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={toggleCollapseAll}
                        style={{ height: 28, padding: '0 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <ChevronsUpDown size={12} />
                        {areAllGroupsCollapsed ? 'Expand All' : 'Collapse All'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => addModifierPreset('custom')}
                      style={{ height: 28, padding: '0 12px', fontSize: '11.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={13} /> Custom Group
                    </button>
                  </div>
                </div>

                {/* Sleek Minimal Quick Template Pills */}
                <div className="modifier-presets-ribbon">
                  <span className="modifier-presets-label">⚡ Templates:</span>
                  <button type="button" className="modifier-preset-pill" onClick={() => addModifierPreset('portions')}>
                    🍗 Quarter / Half / Full
                  </button>
                  <button type="button" className="modifier-preset-pill" onClick={() => addModifierPreset('sizes')}>
                    📏 Small / Med / Large
                  </button>
                  <button type="button" className="modifier-preset-pill" onClick={() => addModifierPreset('spice')}>
                    🌶️ Spice Level
                  </button>
                  <button type="button" className="modifier-preset-pill" onClick={() => addModifierPreset('addons')}>
                    🧀 Extras & Toppings
                  </button>
                </div>

                {/* Collapsible Modifier Groups List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(itemForm.modifierGroups ?? []).map((group, gIdx) => {
                    const isPortionType = group.required && group.maxSelect === 1;
                    const basePriceNum = parseFloat(itemForm.price) || 0;
                    const isCollapsed = !!collapsedGroups[group.id];

                    return (
                      <div
                        key={group.id}
                        className={`modifier-group-accordion-card ${isCollapsed ? 'is-collapsed' : ''}`}
                      >
                        {/* Accordion Header */}
                        <div
                          className="modifier-group-accordion-header"
                          onClick={() => toggleGroupCollapse(group.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <div className="modifier-group-index-badge">
                              {gIdx + 1}
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--color-label)' }}>
                                {group.name?.trim() || `Group #${gIdx + 1}`}
                              </span>
                              
                              <span className={`modifier-type-badge ${isPortionType ? 'portion' : 'addon'}`}>
                                {isPortionType ? '🎯 Portion (Pick 1)' : '➕ Optional Extras'}
                              </span>

                              {isCollapsed && (
                                <span style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>
                                  ({getGroupSummary(group)})
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapse(group.id)}
                              className="modifier-group-action-btn"
                              title={isCollapsed ? 'Expand Group' : 'Collapse Group'}
                            >
                              {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const updated = itemForm.modifierGroups.filter((_, idx) => idx !== gIdx);
                                setItemForm(f => ({ ...f, modifierGroups: updated }));
                              }}
                              className="modifier-group-action-btn btn-delete-group"
                              title="Delete group"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Accordion Body (Only shown when expanded) */}
                        {!isCollapsed && (
                          <div className="modifier-group-accordion-body">
                            {/* Group Name input + Segmented Type Switcher */}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 180 }}>
                                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', marginBottom: 3 }}>
                                  Group Label
                                </label>
                                <input
                                  className="form-input"
                                  placeholder="e.g. Portion / Size or Choice of Dip"
                                  value={group.name}
                                  onChange={e => {
                                    const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, name: e.target.value } : g);
                                    setItemForm(f => ({ ...f, modifierGroups: updated }));
                                  }}
                                  style={{ height: 32, padding: '2px 8px', fontSize: 12.5, fontWeight: 600 }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', marginBottom: 3 }}>
                                  Selection Rule
                                </label>
                                <div className="modifier-rule-segmented">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: true, maxSelect: 1 } : g);
                                      setItemForm(f => ({ ...f, modifierGroups: updated }));
                                    }}
                                    className={`modifier-rule-btn ${isPortionType ? 'active portion' : ''}`}
                                  >
                                    🎯 Portion (Pick 1)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: false, maxSelect: Math.max(g.options?.length || 1, 3) } : g);
                                      setItemForm(f => ({ ...f, modifierGroups: updated }));
                                    }}
                                    className={`modifier-rule-btn ${!isPortionType ? 'active extra' : ''}`}
                                  >
                                    ➕ Optional Extras
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Behavior Info Row */}
                            <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {isPortionType ? (
                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                  ✓ Required: Cashier must select exactly 1 portion before ordering.
                                </span>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>Optional selections allowed. Max items selectable:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={group.maxSelect}
                                    onChange={e => {
                                      const val = parseInt(e.target.value) || 1;
                                      const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, maxSelect: val } : g);
                                      setItemForm(f => ({ ...f, modifierGroups: updated }));
                                    }}
                                    style={{ width: 44, height: 22, textAlign: 'center', fontSize: 11, padding: '0 2px' }}
                                    className="form-input"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Options Table Header */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: basePriceNum > 0 ? '1fr 90px 100px 28px' : '1fr 100px 28px', gap: 8, alignItems: 'center', padding: '0 2px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                                  Option / Size Name
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                                  Price Added
                                </span>
                                {basePriceNum > 0 && (
                                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                                    Total Price
                                  </span>
                                )}
                                <span />
                              </div>

                              {/* Options List */}
                              {group.options.map((opt, oIdx) => {
                                const finalPrice = basePriceNum + (opt.priceAdd || 0);

                                return (
                                  <div key={opt.id} style={{ display: 'grid', gridTemplateColumns: basePriceNum > 0 ? '1fr 90px 100px 28px' : '1fr 100px 28px', gap: 8, alignItems: 'center' }}>
                                    <input
                                      className="form-input"
                                      placeholder="e.g. Regular, Quarter, Extra Cheese"
                                      value={opt.name}
                                      onChange={e => {
                                        const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, name: e.target.value } : o);
                                        const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                        setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                      }}
                                      style={{ height: 32, padding: '2px 8px', fontSize: 12 }}
                                    />
                                    
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                      <span style={{ position: 'absolute', left: 8, fontSize: 11, color: 'var(--color-label-tertiary)' }}>+</span>
                                      <input
                                        className="form-input"
                                        type="number"
                                        placeholder="0"
                                        style={{ width: '100%', height: 32, paddingLeft: 18, fontSize: 12 }}
                                        value={opt.priceAdd === 0 ? '' : opt.priceAdd}
                                        onChange={e => {
                                          const val = parseFloat(e.target.value) || 0;
                                          const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, priceAdd: val } : o);
                                          const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                          setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                        }}
                                      />
                                    </div>

                                    {basePriceNum > 0 && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '2px 8px',
                                        background: 'var(--color-bg)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--color-separator)',
                                        fontSize: 11.5,
                                        fontWeight: 600,
                                        color: 'var(--color-accent)',
                                        height: 32,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {formatCurrency(finalPrice, restaurant?.currency ?? 'INR')}
                                      </div>
                                    )}
                                    
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedOpts = group.options.filter((_, idx) => idx !== oIdx);
                                        const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                        setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                      }}
                                      style={{ background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                                      title="Delete option"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                );
                              })}
                              
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => {
                                  const newOpt = { id: Date.now().toString() + '-opt-' + Math.random(), name: '', priceAdd: 0 };
                                  const updatedOpts = [...group.options, newOpt];
                                  const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                  setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                }}
                                style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', marginTop: 2, border: '1px dashed var(--color-separator)', borderRadius: 'var(--radius-md)' }}
                              >
                                + Add Option / Size
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {(!itemForm.modifierGroups || itemForm.modifierGroups.length === 0) && (
                    <div style={{ 
                      fontSize: 'var(--text-footnote)', 
                      color: 'var(--color-label-tertiary)', 
                      textAlign: 'center', 
                      padding: 'var(--space-6) var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1.5px dashed var(--color-separator)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-2)'
                    }}>
                      <div style={{ fontSize: 28 }}>🍗</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-label)' }}>
                        No Portions or Add-ons Added Yet
                      </div>
                      <span style={{ maxWidth: 340, lineHeight: 1.4, fontSize: 12 }}>
                        Add portion sizes (Quarter, Half, Full) or extra toppings for <strong>{itemForm.name || 'this item'}</strong>.
                      </span>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 4 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => addModifierPreset('portions')}
                        >
                          🍗 Add Quarter / Half / Full
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => addModifierPreset('custom')}
                        >
                          + Custom Group
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Recipe & COGS */}
            {activeTab === 'recipe' && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-2)' }}>
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '14.5px', color: 'var(--color-label)' }}>
                      Recipe & Stock Deductions
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--color-label-secondary)' }}>
                      Connect menu items to inventory ingredients to calculate margins and auto-deduct stock.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (inventory.length === 0) {
                        toast.error('Add ingredients to inventory first');
                        return;
                      }
                      const newRecipeItem = {
                        ingredientId: inventory[0].id,
                        amount: 1
                      };
                      setItemForm(f => ({ ...f, recipe: [...(f.recipe ?? []), newRecipeItem] }));
                    }}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-caption1)' }}
                  >
                    + Add Ingredient
                  </button>
                </div>

                {/* Calculations Card Dashboard */}
                {(() => {
                  const itemPrice = parseFloat(itemForm.price) || 0;
                  const recipeCost = (itemForm.recipe ?? []).reduce((sum, ri) => {
                    const ing = inventory.find(i => i.id === ri.ingredientId);
                    return sum + (ing ? ing.cost * ri.amount : 0);
                  }, 0);
                  const profitVal = itemPrice - recipeCost;
                  const marginPct = itemPrice > 0 ? (profitVal / itemPrice) * 100 : 0;
                  
                  // Margin safety color styling
                  let marginColor = '#ef4444'; // Red for low margin
                  let marginBg = 'rgba(239,68,68,0.1)';
                  if (marginPct >= 70) {
                    marginColor = '#10b981'; // Green for high margin
                    marginBg = 'rgba(16,185,129,0.1)';
                  } else if (marginPct >= 50) {
                    marginColor = '#6366f1'; // Indigo for moderate margin
                    marginBg = 'rgba(99,102,241,0.1)';
                  } else if (marginPct >= 30) {
                    marginColor = '#f59e0b'; // Orange for warning margin
                    marginBg = 'rgba(245,158,11,0.1)';
                  }
                  
                  return (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--color-separator)',
                      overflow: 'hidden'
                    }}>
                      <div style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'center', borderRight: '1px solid var(--color-separator)' }}>
                        <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--color-label-tertiary)', marginBottom: 4 }}>Cost of Goods</div>
                        <div style={{ fontWeight: '800', fontSize: 16, color: 'var(--color-label)' }}>
                          {formatCurrency(recipeCost, restaurant?.currency)}
                        </div>
                      </div>
                      <div style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'center', borderRight: '1px solid var(--color-separator)' }}>
                        <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--color-label-tertiary)', marginBottom: 4 }}>Net Profit</div>
                        <div style={{ fontWeight: '800', fontSize: 16, color: profitVal >= 0 ? 'var(--color-label)' : '#ef4444' }}>
                          {formatCurrency(profitVal, restaurant?.currency)}
                        </div>
                      </div>
                      <div style={{ 
                        padding: 'var(--space-3) var(--space-2)', 
                        textAlign: 'center',
                        background: marginBg,
                        transition: 'all 0.2s ease'
                      }}>
                        <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 'bold', color: marginColor, marginBottom: 4 }}>Margin</div>
                        <div style={{ 
                          fontWeight: '800', 
                          fontSize: 16, 
                          color: marginColor
                        }}>
                          {marginPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Recipe Ingredients Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {(itemForm.recipe ?? []).map((recipeItem, rIdx) => {
                    const matchedIng = inventory.find(i => i.id === recipeItem.ingredientId);
                    
                    return (
                      <div key={rIdx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                        <select
                          className="form-select"
                          value={recipeItem.ingredientId}
                          onChange={e => {
                            const updated = itemForm.recipe.map((ri, idx) => idx === rIdx ? { ...ri, ingredientId: e.target.value } : ri);
                            setItemForm(f => ({ ...f, recipe: updated }));
                          }}
                          style={{ flex: 1.5, height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                        >
                          {inventory.map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                          ))}
                        </select>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flex: 1 }}>
                          <input
                            className="form-input"
                            type="number"
                            min={0.001}
                            step={0.001}
                            placeholder="Amount"
                            value={recipeItem.amount}
                            onChange={e => {
                              const updated = itemForm.recipe.map((ri, idx) => idx === rIdx ? { ...ri, amount: parseFloat(e.target.value) || 0 } : ri);
                              setItemForm(f => ({ ...f, recipe: updated }));
                            }}
                            style={{ width: '100%', height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)', textAlign: 'right' }}
                          />
                          <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', minWidth: 28, paddingLeft: 4, fontWeight: 'var(--weight-semibold)' }}>
                            {matchedIng?.unit ?? ''}
                          </span>
                        </div>
                        
                        <button
                          type="button"
                          onClick={() => {
                            const updated = itemForm.recipe.filter((_, idx) => idx !== rIdx);
                            setItemForm(f => ({ ...f, recipe: updated }));
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}
                  
                  {(!itemForm.recipe || itemForm.recipe.length === 0) && (
                    <div style={{ 
                      fontSize: 'var(--text-footnote)', 
                      color: 'var(--color-label-tertiary)', 
                      textAlign: 'center', 
                      padding: 'var(--space-5) var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1.5px dashed var(--color-separator)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-2)'
                    }}>
                      <div style={{ fontSize: 24 }}>🥦</div>
                      <span style={{ fontWeight: 'var(--weight-semibold)' }}>No recipe ingredients configured</span>
                      <span>Add ingredients from your inventory to track food costs and auto-deduct stock levels.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer (Sticky) */}
            <div className="modal-footer">
              <button className="btn btn-secondary" id="cancel-item-btn" onClick={() => setShowItemForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-item-btn" onClick={saveItem}>{editItem ? 'Save Changes' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
