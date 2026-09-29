import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { useBusinessConfig } from '../../hooks/useBusinessConfig';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X, Sparkles, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

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
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', emoji: '' });
  const [itemForm, setItemForm] = useState({ name: '', price: '', description: '', emoji: '', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '', highMargin: false, barcode: '', unit: 'pcs' });
  const [inventory, setInventory] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

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

  const addCategory = async () => {
    if (!catForm.name.trim()) return;
    await addDoc(collection(db, 'restaurants', restaurant.id, 'menu'), {
      name: catForm.name.trim(),
      emoji: catForm.emoji.trim() || '🍽️',
      items: [],
    });
    setCatForm({ name:'', emoji:'' });
    setShowCatForm(false);
    toast.success('Category added!');
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
      barcode: itemForm.barcode?.trim() ?? '',
      unit: itemForm.unit || 'pcs',
    };
    const items = editItem
      ? cat.items.map(i => i.id === editItem.id ? newItem : i)
      : [...(cat.items ?? []), newItem];
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', activeCatId), { items });
    setShowItemForm(false);
    setEditItem(null);
    setItemForm({ name:'', price:'', description:'', emoji:'', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '', highMargin: false, barcode: '', unit: 'pcs' });
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
        <h2 className="text-title2">Menu Editor</h2>
        <button className="btn btn-primary" id="add-category-btn" onClick={() => setShowCatForm(true)}>
          <Plus size={16} /> Add Category
        </button>
      </div>

      <div className="menu-editor-layout">
        {/* Categories sidebar */}
        <div className={`menu-editor-sidebar card ${activeCat !== null ? 'desktop-only' : ''}`}>
          <div className="card-header"><span className="card-title">Categories</span></div>
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
                  onClick={e => { e.stopPropagation(); deleteCategory(c.id); }}
                  style={{ background:'none', border:'none', color:'var(--color-red)', cursor:'pointer', padding:2, opacity:0.6 }}
                  title="Delete category"
                >
                  <Trash2 size={12}/>
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <div style={{ padding:'var(--space-4)', color:'var(--color-label-tertiary)', fontSize:'var(--text-footnote)', textAlign:'center' }}>
                No categories yet
              </div>
            )}
          </div>
        </div>

        {/* Items panel */}
        <div className={`card ${activeCat === null ? 'desktop-only' : ''}`} style={{ flex: 1 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm mobile-only"
                onClick={() => setActiveCat(null)}
                style={{ padding: '6px 12px' }}
              >
                ← Back
              </button>
              <span className="card-title">{activeCatData?.emoji} {activeCatData?.name ?? 'Select a category'}</span>
            </div>
            {activeCatId && (
              <button className="btn btn-primary btn-sm" id="add-item-btn" onClick={() => { setEditItem(null); setItemForm({ name:'', price:'', description:'', emoji:'', available:true, modifierGroups:[], recipe:[], station:'Kitchen', imageUrl:'', highMargin: false, barcode: '', unit: 'pcs' }); setActiveTab('general'); setShowItemForm(true); }}>
                <Plus size={14}/> Add {terms.item || 'Item'}
              </button>
            )}
          </div>
          <div>
            {(activeCatData?.items ?? []).length === 0 ? (
              <div style={{ padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)' }}>
                <div style={{fontSize:32}}>🍽️</div>
                <div style={{marginTop:'var(--space-2)'}}>No {terms.items?.toLowerCase() || 'items'} in this {terms.category?.toLowerCase() || 'category'}</div>
              </div>
            ) : (activeCatData?.items ?? []).map((item) => (
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
                    <button className="btn btn-secondary btn-icon btn-sm" onClick={() => { setEditItem(item); setItemForm({ name:item.name, price:item.price, description:item.description??'', emoji:item.emoji??'', available:item.available!==false, modifierGroups:item.modifierGroups ?? [], recipe:item.recipe ?? [], station:item.station ?? 'Kitchen', imageUrl:item.imageUrl ?? '', highMargin: item.highMargin || false, barcode: item.barcode ?? '', unit: item.unit ?? 'pcs' }); setActiveTab('general'); setShowItemForm(true); }} id={`edit-item-${item.id}`}>
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
        </div>
      </div>

      {/* Add Category Modal */}
      {showCatForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Add Category</h2>
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
              <button className="btn btn-primary" id="save-category-btn" onClick={addCategory}>Add Category</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showItemForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowItemForm(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editItem ? 'Edit Item' : 'Add Item'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowItemForm(false)}><X size={16}/></button>
            </div>
            
            {/* Tab Bar */}
            <div style={{
              display: 'flex',
              gap: 'var(--space-1)',
              borderBottom: '1.5px solid var(--color-separator-opaque)',
              padding: 'var(--space-3) var(--space-6) 0 var(--space-6)',
              background: 'var(--color-bg-secondary)',
            }}>
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                  border: '1.5px solid var(--color-separator-opaque)',
                  borderBottom: activeTab === 'general' ? '1.5px solid var(--color-bg)' : 'none',
                  background: activeTab === 'general' ? 'var(--color-bg)' : 'transparent',
                  color: activeTab === 'general' ? 'var(--color-label)' : 'var(--color-label-tertiary)',
                  fontWeight: activeTab === 'general' ? 'var(--weight-bold)' : 'var(--weight-medium)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-subhead)',
                  marginBottom: '-1.5px',
                  transition: 'all 0.15s ease'
                }}
              >
                General Info
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('modifiers')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                  border: '1.5px solid var(--color-separator-opaque)',
                  borderBottom: activeTab === 'modifiers' ? '1.5px solid var(--color-bg)' : 'none',
                  background: activeTab === 'modifiers' ? 'var(--color-bg)' : 'transparent',
                  color: activeTab === 'modifiers' ? 'var(--color-label)' : 'var(--color-label-tertiary)',
                  fontWeight: activeTab === 'modifiers' ? 'var(--weight-bold)' : 'var(--weight-medium)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-subhead)',
                  marginBottom: '-1.5px',
                  transition: 'all 0.15s ease'
                }}
              >
                Portions & Add-ons ({itemForm.modifierGroups?.length ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('recipe')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                  border: '1.5px solid var(--color-separator-opaque)',
                  borderBottom: activeTab === 'recipe' ? '1.5px solid var(--color-bg)' : 'none',
                  background: activeTab === 'recipe' ? 'var(--color-bg)' : 'transparent',
                  color: activeTab === 'recipe' ? 'var(--color-label)' : 'var(--color-label-tertiary)',
                  fontWeight: activeTab === 'recipe' ? 'var(--weight-bold)' : 'var(--weight-medium)',
                  cursor: 'pointer',
                  fontSize: 'var(--text-subhead)',
                  marginBottom: '-1.5px',
                  transition: 'all 0.15s ease'
                }}
              >
                Recipe & COGS ({itemForm.recipe?.length ?? 0})
              </button>
            </div>

            {/* Tab 1: General Info */}
            {activeTab === 'general' && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-6)' }}>
                {/* Name & Availability Switch in one row */}
                <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
                    <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Item Name</label>
                    <input 
                      id="item-name-input" 
                      className="form-input" 
                      placeholder="e.g. Grilled Chicken" 
                      value={itemForm.name} 
                      onChange={e => setItemForm(f=>({...f,name:e.target.value}))} 
                      style={{ height: 40 }}
                    />
                  </div>
                  
                  {/* Compact Availability & Highlight Switches */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: '8px var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1.5px solid var(--color-separator-opaque)',
                      height: 40,
                    }}>
                      <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', color: 'var(--color-label)', whiteSpace: 'nowrap' }}>
                        Available
                      </span>
                      
                      <label style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: 44,
                        height: 22,
                        cursor: 'pointer'
                      }}>
                        <input
                          type="checkbox"
                          checked={itemForm.available}
                          onChange={e => setItemForm(f => ({ ...f, available: e.target.checked }))}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0, left: 0, right: 0, bottom: 0,
                          backgroundColor: itemForm.available ? 'var(--color-separator-opaque)' : '#ccc',
                          transition: '0.2s',
                          borderRadius: 22,
                          border: '1.5px solid var(--color-separator-opaque)'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '""',
                            height: 12, width: 12,
                            left: itemForm.available ? 24 : 4,
                            bottom: 2,
                            backgroundColor: 'white',
                            transition: '0.2s',
                            borderRadius: '50%',
                            border: '1px solid var(--color-separator-opaque)'
                          }} />
                        </span>
                      </label>
                    </div>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-bold)', paddingLeft: 'var(--space-1)' }}>
                      <input
                        type="checkbox"
                        checked={itemForm.highMargin}
                        onChange={(e) => setItemForm({ ...itemForm, highMargin: e.target.checked })}
                      />
                      ⭐ Mark as High Margin
                    </label>
                  </div>
                </div>

                {/* Price, Kitchen Station & Emoji Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Price ({restaurant?.currency ?? 'INR'})</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: 12, fontSize: 'var(--text-subhead)', color: 'var(--color-label-tertiary)' }}>
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
                        style={{ paddingLeft: 24, height: 40 }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: 4, display: 'block', lineHeight: 1.3 }}>
                      💡 If selling portions (Quarter, Half, Full), you can set Base Price to <strong>0</strong> and define exact prices under <strong>Portions & Add-ons</strong>.
                    </span>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Kitchen Station</label>
                    <select 
                      id="item-station-select" 
                      className="form-select" 
                      value={itemForm.station ?? 'Kitchen'} 
                      onChange={e => setItemForm(f=>({...f,station:e.target.value}))}
                      style={{ height: 40 }}
                    >
                      <option value="Kitchen">Kitchen</option>
                      <option value="Grill">Grill</option>
                      <option value="Fryer">Fryer</option>
                      <option value="Cold">Cold</option>
                      <option value="Bar">Bar</option>
                      <option value="Bakery">Bakery</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Emoji Icon</label>
                    <input 
                      id="item-emoji-input" 
                      className="form-input" 
                      placeholder="🍗" 
                      value={itemForm.emoji} 
                      onChange={e => setItemForm(f=>({...f,emoji:e.target.value}))} 
                      style={{ textAlign: 'center', height: 40, fontSize: 18 }}
                    />
                  </div>
                </div>

                {/* Barcode & Unit Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Barcode / SKU (Optional)</label>
                    <input 
                      id="item-barcode-input" 
                      className="form-input" 
                      placeholder="e.g. 890123456789 or SKU-101" 
                      value={itemForm.barcode ?? ''} 
                      onChange={e => setItemForm(f=>({...f, barcode: e.target.value}))} 
                      style={{ height: 40 }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Unit of Measure</label>
                    <select 
                      id="item-unit-select" 
                      className="form-select" 
                      value={itemForm.unit ?? 'pcs'} 
                      onChange={e => setItemForm(f=>({...f, unit: e.target.value}))}
                      style={{ height: 40 }}
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
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Description (Optional)</label>
                  <textarea 
                    id="item-desc-input" 
                    className="form-input" 
                    placeholder="Describe taste, ingredients, or allergens..." 
                    value={itemForm.description} 
                    onChange={e => setItemForm(f=>({...f,description:e.target.value}))} 
                    rows={2}
                    style={{ resize: 'none', padding: '8px 12px', height: 'auto', fontFamily: 'inherit' }}
                  />
                </div>

                {/* Horizontal Image Area */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 'var(--weight-bold)' }}>Item Image</label>
                  <div 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-4)',
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1.5px dashed var(--color-separator-opaque)'
                    }}
                  >
                    {itemForm.imageUrl ? (
                      <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--color-separator-opaque)', flexShrink: 0 }}>
                        <img src={itemForm.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => setItemForm(f => ({ ...f, imageUrl: '' }))}
                          style={{
                            position: 'absolute', top: 2, right: 2,
                            background: 'var(--color-red)', color: '#fff',
                            border: '1.5px solid var(--color-separator-opaque)', borderRadius: '50%',
                            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, cursor: 'pointer', fontWeight: 'bold'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', border: '1.5px dashed var(--color-separator-opaque)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, background: 'var(--color-bg)', flexShrink: 0 }}>
                        📷
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <input
                        type="file"
                        accept="image/*"
                        id="item-image-file"
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => document.getElementById('item-image-file').click()}
                        disabled={uploadingImage}
                        style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 'var(--text-caption1)' }}
                      >
                        {uploadingImage ? 'Optimizing...' : (itemForm.imageUrl ? 'Change Photo' : 'Upload Photo')}
                      </button>
                      <span style={{ fontSize: 9, color: 'var(--color-label-tertiary)', lineHeight: '1.2' }}>
                        Auto-compressed client-side.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Portions & Add-ons */}
            {activeTab === 'modifiers' && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-5)' }}>
                {/* Clean Header & Quick Presets */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <div>
                      <span style={{ fontWeight: '700', fontSize: 'var(--text-subhead)', letterSpacing: '-0.2px' }}>
                        Portions, Sizes & Add-ons
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--color-label-tertiary)' }}>
                        for {itemForm.name ? <strong>{itemForm.name}</strong> : 'this item'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => addModifierPreset('custom')}
                      style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)' }}
                    >
                      + Custom Group
                    </button>
                  </div>

                  {/* Sleek 1-Click Preset Pills */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    background: 'var(--color-bg-secondary)',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-separator-opaque)'
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-label-tertiary)', marginRight: 2 }}>
                      ⚡ Quick Templates:
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => addModifierPreset('portions')}
                      style={{ fontSize: 11, padding: '3px 8px', height: 26, background: 'var(--color-bg)', border: '1px solid var(--color-separator-opaque)', color: 'var(--color-label)' }}
                    >
                      🍗 Quarter / Half / Full
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => addModifierPreset('sizes')}
                      style={{ fontSize: 11, padding: '3px 8px', height: 26, background: 'var(--color-bg)', border: '1px solid var(--color-separator-opaque)', color: 'var(--color-label)' }}
                    >
                      📏 Small / Medium / Large
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => addModifierPreset('spice')}
                      style={{ fontSize: 11, padding: '3px 8px', height: 26, background: 'var(--color-bg)', border: '1px solid var(--color-separator-opaque)', color: 'var(--color-label)' }}
                    >
                      🌶️ Spice Level
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => addModifierPreset('addons')}
                      style={{ fontSize: 11, padding: '3px 8px', height: 26, background: 'var(--color-bg)', border: '1px solid var(--color-separator-opaque)', color: 'var(--color-label)' }}
                    >
                      🧀 Extras & Add-ons
                    </button>
                  </div>

                  {/* Clean Minimal Tip */}
                  <div style={{
                    background: 'rgba(0,122,255,0.05)',
                    border: '1px solid rgba(0,122,255,0.15)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 12px',
                    fontSize: 11.5,
                    color: 'var(--color-label-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span style={{ fontSize: 13 }}>💡</span>
                    <span>For portion-priced items (e.g. Half ₹300, Full ₹600), set <strong>Base Price to ₹0</strong> in General Info.</span>
                  </div>

                  {/* Smart Style Matrix Auto-Detection Indicator */}
                  {(() => {
                    const mandatoryGroups = (itemForm.modifierGroups ?? []).filter(g => g.required && g.maxSelect === 1);
                    if (mandatoryGroups.length < 2) return null;
                    return (
                      <div style={{
                        background: 'rgba(16,185,129,0.06)',
                        border: '1px solid rgba(16,185,129,0.25)',
                        borderRadius: 'var(--radius-md)',
                        padding: '8px 12px',
                        fontSize: 12,
                        color: 'var(--color-label)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}>
                        <span style={{ fontSize: 15 }}>✨</span>
                        <div>
                          <strong style={{ color: '#10b981' }}>Smart Style Matrix Active:</strong> Cashiers on POS will pick <strong>1 Style</strong> ({mandatoryGroups.map(g => g.name || 'Group').join(' / ')}) → then <strong>1 Portion Size</strong>.
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Groups List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 4 }}>
                  {(itemForm.modifierGroups ?? []).map((group, gIdx) => {
                    const isPortionType = group.required && group.maxSelect === 1;
                    const basePriceNum = parseFloat(itemForm.price) || 0;

                    return (
                      <div key={group.id} style={{
                        background: 'var(--color-bg-secondary)',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-separator-opaque)'
                      }}>
                        {/* Group Header: Name + Segmented Control + Delete */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 180 }}>
                            <input
                              className="form-input"
                              placeholder="Group Name (e.g. Portion / Size)"
                              value={group.name}
                              onChange={e => {
                                const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, name: e.target.value } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updated }));
                              }}
                              style={{ height: 32, padding: '2px 8px', fontSize: 13, fontWeight: 600 }}
                            />
                          </div>

                          {/* Segmented Type Toggle */}
                          <div style={{ display: 'flex', background: 'var(--color-bg)', padding: 2, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator-opaque)' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: true, maxSelect: 1 } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updated }));
                              }}
                              style={{
                                border: 'none',
                                background: isPortionType ? 'var(--color-label)' : 'transparent',
                                color: isPortionType ? 'var(--color-bg)' : 'var(--color-label-secondary)',
                                padding: '4px 12px',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 11.5,
                                fontWeight: isPortionType ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              🎯 Portion (Pick 1)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: false, maxSelect: Math.max(g.options?.length || 1, 3) } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updated }));
                              }}
                              style={{
                                border: 'none',
                                background: !isPortionType ? 'var(--color-label)' : 'transparent',
                                color: !isPortionType ? 'var(--color-bg)' : 'var(--color-label-secondary)',
                                padding: '4px 12px',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 11.5,
                                fontWeight: !isPortionType ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              ➕ Optional Extras
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = itemForm.modifierGroups.filter((_, idx) => idx !== gIdx);
                              setItemForm(f => ({ ...f, modifierGroups: updated }));
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', opacity: 0.8 }}
                            title="Delete group"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* Behavior note */}
                        <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isPortionType ? (
                            <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>
                              ✓ Mandatory: Customer must choose 1 portion before adding to order.
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>Optional add-on selection. Max items:</span>
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

                        {/* Options Grid */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: basePriceNum > 0 ? '1fr 100px 110px 28px' : '1fr 110px 28px', gap: 8, alignItems: 'center', padding: '0 2px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                              Option / Size Name
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                              Price Added
                            </span>
                            {basePriceNum > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                                Customer Total
                              </span>
                            )}
                            <span />
                          </div>

                          {group.options.map((opt, oIdx) => {
                            const finalPrice = basePriceNum + (opt.priceAdd || 0);

                            return (
                              <div key={opt.id} style={{ display: 'grid', gridTemplateColumns: basePriceNum > 0 ? '1fr 100px 110px 28px' : '1fr 110px 28px', gap: 8, alignItems: 'center' }}>
                                <input
                                  className="form-input"
                                  placeholder="e.g. Quarter, Half, Full"
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
                                    border: '1px solid var(--color-separator-opaque)',
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
                            style={{ alignSelf: 'flex-start', fontSize: 11, padding: '3px 8px', marginTop: 2, border: '1px dashed var(--color-separator-opaque)', borderRadius: 'var(--radius-md)' }}
                          >
                            + Add Option / Size
                          </button>
                        </div>
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
                      border: '1.5px dashed var(--color-separator-opaque)',
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
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1.5px solid var(--color-separator-opaque)', paddingBottom: 'var(--space-2)' }}>
                  <div>
                    <span style={{ fontWeight: '800', fontSize: 'var(--text-subhead)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Recipe & Stock Deductions
                    </span>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--color-label-tertiary)' }}>
                      Connect menu items to inventory ingredients to calculate margins.
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
                      border: '1.5px solid var(--color-separator-opaque)',
                      overflow: 'hidden',
                      marginBottom: 'var(--space-2)'
                    }}>
                      <div style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'center', borderRight: '1.5px solid var(--color-separator-opaque)' }}>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--color-label-tertiary)', marginBottom: 4 }}>Cost of Goods</div>
                        <div style={{ fontWeight: '800', fontSize: 15, color: 'var(--color-label)' }}>
                          {formatCurrency(recipeCost, restaurant?.currency)}
                        </div>
                      </div>
                      <div style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'center', borderRight: '1.5px solid var(--color-separator-opaque)' }}>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--color-label-tertiary)', marginBottom: 4 }}>Net Profit</div>
                        <div style={{ fontWeight: '800', fontSize: 15, color: profitVal >= 0 ? 'var(--color-label)' : '#ef4444' }}>
                          {formatCurrency(profitVal, restaurant?.currency)}
                        </div>
                      </div>
                      <div style={{ 
                        padding: 'var(--space-3) var(--space-2)', 
                        textAlign: 'center',
                        background: marginBg,
                        transition: 'all 0.2s ease'
                      }}>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', fontWeight: 'bold', color: marginColor, marginBottom: 4 }}>Margin</div>
                        <div style={{ 
                          fontWeight: '800', 
                          fontSize: 15, 
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
                      <div key={rIdx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--color-separator-opaque)' }}>
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
                      border: '1.5px dashed var(--color-separator-opaque)',
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

            <div className="modal-footer" style={{ borderTop: '1.5px solid var(--color-separator-opaque)' }}>
              <button className="btn btn-secondary" onClick={() => setShowItemForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-item-btn" onClick={saveItem}>{editItem ? 'Save Changes' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
