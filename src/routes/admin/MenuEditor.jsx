import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

const compressImage = (file, maxDim = 200, quality = 0.7) => {
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
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
  });
};


// Use cryptographically random IDs — Date.now() is not unique under concurrent saves
const generateId = () => crypto.randomUUID();

export default function MenuEditor() {
  const { restaurant } = useAuthStore();
  const { categories } = useMenuStore();
  const [activeCat, setActiveCat] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', emoji: '' });
  const [itemForm, setItemForm] = useState({ name: '', price: '', description: '', emoji: '', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '' });
  const [inventory, setInventory] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState('general');




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
    if (!itemForm.name.trim() || !itemForm.price) return;
    const cat = categories.find(c => c.id === activeCatId);
    if (!cat) return;
    const newItem = {
      id: editItem?.id ?? generateId(),
      name: itemForm.name.trim(),
      price: parseFloat(itemForm.price),
      description: itemForm.description.trim(),
      emoji: itemForm.emoji.trim() || '🍽️',
      available: itemForm.available,
      modifierGroups: itemForm.modifierGroups ?? [],
      recipe: itemForm.recipe ?? [],
      station: itemForm.station ?? 'Kitchen',
      imageUrl: itemForm.imageUrl ?? '',
    };
    const items = editItem
      ? cat.items.map(i => i.id === editItem.id ? newItem : i)
      : [...(cat.items ?? []), newItem];
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', activeCatId), { items });
    setShowItemForm(false);
    setEditItem(null);
    setItemForm({ name:'', price:'', description:'', emoji:'', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '' });
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
    const toastId = toast.loading('Compressing and uploading image...');
    try {
      // Compress client side to a lightweight base64 JPEG
      const base64Data = await compressImage(file, 400, 0.8); // Slightly better quality now that it's in storage
      
      if (!storage) {
         throw new Error("Firebase Storage is not configured.");
      }
      
      const fileName = `menuImages/${restaurant.id}/${Date.now()}.jpg`;
      const storageRef = ref(storage, fileName);
      
      await uploadString(storageRef, base64Data, 'data_url');
      const downloadUrl = await getDownloadURL(storageRef);
      
      setItemForm(f => ({ ...f, imageUrl: downloadUrl }));
      toast.success('Image uploaded!', { id: toastId });
    } catch (err) {
      console.error('[Image Upload Error]', err);
      toast.error('Failed to upload image: ' + err.message, { id: toastId });
    } finally {
      e.target.value = ''; // Reset input to allow selecting same file again
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
                style={{
                  display:'flex', alignItems:'center', gap:'var(--space-2)',
                  padding:'var(--space-2) var(--space-3)',
                  borderRadius:'var(--radius-md)',
                  background: activeCatId === c.id ? 'var(--color-accent-light)' : 'transparent',
                  cursor:'pointer',
                  transition:'all var(--duration-fast)',
                }}
                onClick={() => setActiveCat(c.id)}
              >
                <span>{c.emoji}</span>
                <span style={{ flex:1, fontWeight:'var(--weight-medium)', fontSize:'var(--text-subhead)', color: activeCatId === c.id ? 'var(--color-accent)' : 'var(--color-label)' }}>
                  {c.name}
                </span>
                <span style={{ fontSize:'var(--text-caption2)', color:'var(--color-label-tertiary)' }}>
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
              <button className="btn btn-primary btn-sm" id="add-item-btn" onClick={() => { setEditItem(null); setItemForm({ name:'', price:'', description:'', emoji:'', available:true, modifierGroups:[], recipe:[], station:'Kitchen', imageUrl:'' }); setActiveTab('general'); setShowItemForm(true); }}>
                <Plus size={14}/> Add Item
              </button>
            )}
          </div>
          <div>
            {(activeCatData?.items ?? []).length === 0 ? (
              <div style={{ padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)' }}>
                <div style={{fontSize:32}}>🍽️</div>
                <div style={{marginTop:'var(--space-2)'}}>No items in this category</div>
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
                  <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>{item.name}</div>
                  {item.description && <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', marginTop: 2 }}>{item.description}</div>}
                </div>
                
                <div className="menu-item-meta-actions">
                  <div style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)', minWidth: 80, textAlign: 'right', fontSize: 'var(--text-subhead)' }}>
                    {formatCurrency(item.price, restaurant?.currency ?? 'INR')}
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
                    <button className="btn btn-secondary btn-icon btn-sm" onClick={() => { setEditItem(item); setItemForm({ name:item.name, price:item.price, description:item.description??'', emoji:item.emoji??'', available:item.available!==false, modifierGroups:item.modifierGroups ?? [], recipe:item.recipe ?? [], station:item.station ?? 'Kitchen', imageUrl:item.imageUrl ?? '' }); setActiveTab('general'); setShowItemForm(true); }} id={`edit-item-${item.id}`}>
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
                Modifiers & Variants ({itemForm.modifierGroups?.length ?? 0})
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
                  
                  {/* Compact Availability Switch */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: '8px var(--space-4)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1.5px solid var(--color-separator-opaque)',
                    height: 40,
                    marginBottom: 2
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

            {/* Tab 2: Modifiers & Variants */}
            {activeTab === 'modifiers' && (
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1.5px solid var(--color-separator-opaque)', paddingBottom: 'var(--space-2)' }}>
                  <div>
                    <span style={{ fontWeight: '800', fontSize: 'var(--text-subhead)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Modifier Groups
                    </span>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--color-label-tertiary)' }}>
                      Set up mandatory choices or add-ons (e.g. Size, Toppings)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      const newGroup = {
                        id: Date.now().toString(),
                        name: '',
                        required: false,
                        maxSelect: 1,
                        options: [{ id: Date.now().toString() + '-opt', name: '', priceAdd: 0 }]
                      };
                      setItemForm(f => ({ ...f, modifierGroups: [...(f.modifierGroups ?? []), newGroup] }));
                    }}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-caption1)' }}
                  >
                    + Add Group
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {(itemForm.modifierGroups ?? []).map((group, gIdx) => (
                    <div key={group.id} style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--color-separator-opaque)' }}>
                      
                      {/* Modifier Group Header */}
                      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <input
                            className="form-input"
                            placeholder="Group Name (e.g. Size, Add-ons)"
                            value={group.name}
                            onChange={e => {
                              const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, name: e.target.value } : g);
                              setItemForm(f => ({ ...f, modifierGroups: updated }));
                            }}
                            style={{ height: 36, padding: '4px var(--space-2)', fontSize: 'var(--text-subhead)' }}
                          />
                        </div>
                        
                        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption1)', cursor: 'pointer', fontWeight: 'var(--weight-semibold)' }}>
                            <input
                              type="checkbox"
                              checked={group.required}
                              onChange={e => {
                                const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: e.target.checked } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updated }));
                              }}
                              style={{ width: 15, height: 15 }}
                            />
                            Required
                          </label>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)' }}>
                            <span>Max Select</span>
                            <input
                              type="number"
                              className="form-input"
                              min={1}
                              style={{ width: 50, height: 32, padding: '2px 4px', textAlign: 'center', fontSize: 'var(--text-subhead)' }}
                              value={group.maxSelect}
                              onChange={e => {
                                const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, maxSelect: parseInt(e.target.value) || 1 } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updated }));
                              }}
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = itemForm.modifierGroups.filter((_, idx) => idx !== gIdx);
                              setItemForm(f => ({ ...f, modifierGroups: updated }));
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                            title="Delete Group"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Options List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', borderLeft: '2px solid var(--color-separator-opaque)', paddingLeft: 'var(--space-3)', marginLeft: 'var(--space-2)' }}>
                        <span style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.5px' }}>Options & Price Customization</span>
                        {group.options.map((opt, oIdx) => (
                          <div key={opt.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                            <input
                              className="form-input"
                              placeholder="Option Name (e.g. Large, Extra Cheese)"
                              value={opt.name}
                              onChange={e => {
                                const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, name: e.target.value } : o);
                                const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                              }}
                              style={{ flex: 1, height: 32, padding: '2px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                            />
                            
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: 90 }}>
                              <span style={{ position: 'absolute', left: 8, fontSize: 10, color: 'var(--color-label-tertiary)' }}>+</span>
                              <input
                                className="form-input"
                                type="number"
                                placeholder="0.00"
                                style={{ width: '100%', height: 32, paddingLeft: 18, fontSize: 'var(--text-footnote)' }}
                                value={opt.priceAdd === 0 ? '' : opt.priceAdd}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, priceAdd: val } : o);
                                  const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                  setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                }}
                              />
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => {
                                const updatedOpts = group.options.filter((_, idx) => idx !== oIdx);
                                const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            const newOpt = { id: Date.now().toString() + '-opt-' + Math.random(), name: '', priceAdd: 0 };
                            const updatedOpts = [...group.options, newOpt];
                            const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                            setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                          }}
                          style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 8px', marginTop: 4, border: '1px dashed var(--color-separator-opaque)' }}
                        >
                          + Add Option
                        </button>
                      </div>
                    </div>
                  ))}
                  
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
                      <div style={{ fontSize: 24 }}>⚙️</div>
                      <span style={{ fontWeight: 'var(--weight-semibold)' }}>No modifier groups configured</span>
                      <span>Add modifier groups to customize item sizing or extras.</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const newGroup = {
                            id: Date.now().toString(),
                            name: '',
                            required: false,
                            maxSelect: 1,
                            options: [{ id: Date.now().toString() + '-opt', name: '', priceAdd: 0 }]
                          };
                          setItemForm(f => ({ ...f, modifierGroups: [...(f.modifierGroups ?? []), newGroup] }));
                        }}
                        style={{ marginTop: 'var(--space-2)' }}
                      >
                        Create First Group
                      </button>
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
