import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

export default function MenuEditor() {
  const { restaurant } = useAuthStore();
  const { categories } = useMenuStore();
  const [activeCat, setActiveCat] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', emoji: '' });
  const [itemForm, setItemForm] = useState({ name: '', price: '', description: '', emoji: '', available: true, modifierGroups: [], recipe: [], station: 'Kitchen' });
  const [inventory, setInventory] = useState([]);

  // Auto-select first category when loaded
  useEffect(() => {
    if (categories.length) {
      setActiveCat(prev => prev || categories[0].id);
    }
  }, [categories]);

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
    if (activeCat === catId) setActiveCat(null);
    toast.success('Category deleted');
  };

  const saveItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price) return;
    const cat = categories.find(c => c.id === activeCat);
    if (!cat) return;
    const newItem = {
      id: editItem?.id ?? Date.now().toString(),
      name: itemForm.name.trim(),
      price: parseFloat(itemForm.price),
      description: itemForm.description.trim(),
      emoji: itemForm.emoji.trim() || '🍽️',
      available: itemForm.available,
      modifierGroups: itemForm.modifierGroups ?? [],
      recipe: itemForm.recipe ?? [],
      station: itemForm.station ?? 'Kitchen',
    };
    const items = editItem
      ? cat.items.map(i => i.id === editItem.id ? newItem : i)
      : [...(cat.items ?? []), newItem];
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', activeCat), { items });
    setShowItemForm(false);
    setEditItem(null);
    setItemForm({ name:'', price:'', description:'', emoji:'', available: true, modifierGroups: [], recipe: [], station: 'Kitchen' });
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
    const items = cat.items.map(i => i.id === item.id ? { ...i, available: !i.available } : i);
    await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', catId), { items });
  };

  const activeCatData = categories.find(c => c.id === activeCat);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h2 className="text-title2">Menu Editor</h2>
        <button className="btn btn-primary" id="add-category-btn" onClick={() => setShowCatForm(true)}>
          <Plus size={16} /> Add Category
        </button>
      </div>

      <div style={{ display:'flex', gap:'var(--space-4)' }}>
        {/* Categories sidebar */}
        <div className="card" style={{ width:220, flexShrink:0 }}>
          <div className="card-header"><span className="card-title">Categories</span></div>
          <div style={{ padding:'var(--space-2)' }}>
            {categories.map(c => (
              <div
                key={c.id}
                style={{
                  display:'flex', alignItems:'center', gap:'var(--space-2)',
                  padding:'var(--space-2) var(--space-3)',
                  borderRadius:'var(--radius-md)',
                  background: activeCat === c.id ? 'var(--color-accent-light)' : 'transparent',
                  cursor:'pointer',
                  transition:'all var(--duration-fast)',
                }}
                onClick={() => setActiveCat(c.id)}
              >
                <span>{c.emoji}</span>
                <span style={{ flex:1, fontWeight:'var(--weight-medium)', fontSize:'var(--text-subhead)', color: activeCat === c.id ? 'var(--color-accent)' : 'var(--color-label)' }}>
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
        <div className="card" style={{ flex:1 }}>
          <div className="card-header">
            <span className="card-title">{activeCatData?.emoji} {activeCatData?.name ?? 'Select a category'}</span>
            {activeCat && (
              <button className="btn btn-primary btn-sm" id="add-item-btn" onClick={() => { setEditItem(null); setItemForm({ name:'', price:'', description:'', emoji:'', available:true, modifierGroups:[], recipe:[], station:'Kitchen' }); setShowItemForm(true); }}>
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
              <div key={item.id} style={{
                display:'flex', alignItems:'center', gap:'var(--space-4)',
                padding:'var(--space-4) var(--space-5)',
                borderBottom:'1px solid var(--color-separator)',
                opacity: item.available === false ? 0.5 : 1,
              }}>
                <div style={{ fontSize:28 }}>{item.emoji ?? '🍽️'}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:'var(--weight-semibold)' }}>{item.name}</div>
                  {item.description && <div style={{ fontSize:'var(--text-caption1)', color:'var(--color-label-secondary)', marginTop:1 }}>{item.description}</div>}
                </div>
                <div style={{ fontWeight:'var(--weight-bold)', color:'var(--color-accent)', minWidth:80, textAlign:'right' }}>
                  {item.price?.toFixed(2)}
                </div>
                <div style={{ display:'flex', gap:'var(--space-2)', alignItems:'center' }}>
                  <button
                    onClick={() => toggleAvailable(activeCat, item)}
                    className={`badge ${item.available !== false ? 'badge-green' : 'badge-gray'}`}
                    style={{ cursor:'pointer', border:'none', fontFamily:'var(--font-family)' }}
                    title="Toggle availability"
                  >
                    {item.available !== false ? 'Available' : 'Unavailable'}
                  </button>
                  <button className="btn btn-secondary btn-icon btn-sm" onClick={() => { setEditItem(item); setItemForm({ name:item.name, price:item.price, description:item.description??'', emoji:item.emoji??'', available:item.available!==false, modifierGroups:item.modifierGroups ?? [], recipe:item.recipe ?? [], station:item.station ?? 'Kitchen' }); setShowItemForm(true); }} id={`edit-item-${item.id}`}>
                    <Edit2 size={12}/>
                  </button>
                  <button className="btn btn-icon btn-sm" style={{ color:'var(--color-red)' }} onClick={() => deleteItem(activeCat, item.id)} id={`delete-item-${item.id}`}>
                    <Trash2 size={12}/>
                  </button>
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
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">{editItem ? 'Edit Item' : 'Add Item'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowItemForm(false)}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Item Name</label>
                <input id="item-name-input" className="form-input" placeholder="e.g. Grilled Chicken" value={itemForm.name} onChange={e => setItemForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.2fr', gap:'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Price</label>
                  <input id="item-price-input" className="form-input" type="number" min={0} step={0.01} placeholder="0.00" value={itemForm.price} onChange={e => setItemForm(f=>({...f,price:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Emoji</label>
                  <input id="item-emoji-input" className="form-input" placeholder="🍗" value={itemForm.emoji} onChange={e => setItemForm(f=>({...f,emoji:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Kitchen Station</label>
                  <select id="item-station-select" className="form-select" value={itemForm.station ?? 'Kitchen'} onChange={e => setItemForm(f=>({...f,station:e.target.value}))}>
                    <option value="Kitchen">Kitchen</option>
                    <option value="Grill">Grill</option>
                    <option value="Fryer">Fryer</option>
                    <option value="Cold">Cold</option>
                    <option value="Bar">Bar</option>
                    <option value="Bakery">Bakery</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <input id="item-desc-input" className="form-input" placeholder="Short description..." value={itemForm.description} onChange={e => setItemForm(f=>({...f,description:e.target.value}))} />
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', cursor:'pointer', fontSize:'var(--text-subhead)', marginBottom:'var(--space-3)' }}>
                <input type="checkbox" checked={itemForm.available} onChange={e => setItemForm(f=>({...f,available:e.target.checked}))} />
                Item is available
              </label>

              {/* Modifiers & Variants Section */}
              <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>Modifiers & Variants</span>
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
                    style={{ padding: '4px 8px', fontSize: 'var(--text-caption1)' }}
                  >
                    + Add Group
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                  {(itemForm.modifierGroups ?? []).map((group, gIdx) => (
                    <div key={group.id} style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                        <input
                          className="form-input"
                          placeholder="Group Name (e.g. Size, Add-ons)"
                          value={group.name}
                          onChange={e => {
                            const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, name: e.target.value } : g);
                            setItemForm(f => ({ ...f, modifierGroups: updated }));
                          }}
                          style={{ flex: 1, height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-subhead)' }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <input
                            type="checkbox"
                            checked={group.required}
                            onChange={e => {
                              const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: e.target.checked } : g);
                              setItemForm(f => ({ ...f, modifierGroups: updated }));
                            }}
                          />
                          Req.
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-caption2)', whiteSpace: 'nowrap' }}>
                          <span>Max</span>
                          <input
                            type="number"
                            className="form-input"
                            min={1}
                            style={{ width: 45, height: 32, padding: '2px 4px', textAlign: 'center', fontSize: 'var(--text-subhead)' }}
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
                          style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Options */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingLeft: 'var(--space-3)' }}>
                        {group.options.map((opt, oIdx) => (
                          <div key={opt.id} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                            <input
                              className="form-input"
                              placeholder="Option Name (e.g. Large)"
                              value={opt.name}
                              onChange={e => {
                                const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, name: e.target.value } : o);
                                const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                              }}
                              style={{ flex: 1, height: 28, padding: '2px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                            />
                            <input
                              className="form-input"
                              type="number"
                              placeholder="+0.00"
                              style={{ width: 75, height: 28, padding: '2px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                              value={opt.priceAdd === 0 ? '' : opt.priceAdd}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, priceAdd: val } : o);
                                const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const updatedOpts = group.options.filter((_, idx) => idx !== oIdx);
                                const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                            >
                              <X size={12} />
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
                          style={{ alignSelf: 'flex-start', fontSize: 10, padding: '2px 6px', marginTop: 2 }}
                        >
                          + Add Option
                        </button>
                      </div>
                    </div>
                  ))}
                  {(!itemForm.modifierGroups || itemForm.modifierGroups.length === 0) && (
                    <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-tertiary)', textAlign: 'center', padding: 'var(--space-3)' }}>
                      No modifier groups configured for this item.
                    </div>
                  )}
                </div>
              </div>

              {/* Recipe & Stock Management Section */}
              <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                  <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>Recipe & Cost of Goods</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
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
                    style={{ padding: '4px 8px', fontSize: 'var(--text-caption1)' }}
                  >
                    + Add Ingredient
                  </button>
                </div>

                {/* Calculations info */}
                {(() => {
                  const itemPrice = parseFloat(itemForm.price) || 0;
                  const recipeCost = (itemForm.recipe ?? []).reduce((sum, ri) => {
                    const ing = inventory.find(i => i.id === ri.ingredientId);
                    return sum + (ing ? ing.cost * ri.amount : 0);
                  }, 0);
                  const profitVal = itemPrice - recipeCost;
                  const marginPct = itemPrice > 0 ? (profitVal / itemPrice) * 100 : 0;
                  
                  return (
                    <div style={{
                      background: 'var(--color-bg-secondary)',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-caption1)',
                      color: 'var(--color-label-secondary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 'var(--space-3)',
                      border: '1px solid var(--color-separator)'
                    }}>
                      <span>Cost: <strong>{formatCurrency(recipeCost, restaurant?.currency)}</strong></span>
                      <span>Profit: <strong>{formatCurrency(profitVal, restaurant?.currency)}</strong></span>
                      <span style={{ color: marginPct >= 70 ? 'var(--color-green)' : (marginPct >= 50 ? 'var(--color-accent)' : 'var(--color-orange)') }}>
                        Margin: <strong>{marginPct.toFixed(1)}%</strong>
                      </span>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 150, overflowY: 'auto' }}>
                  {(itemForm.recipe ?? []).map((recipeItem, rIdx) => {
                    const matchedIng = inventory.find(i => i.id === recipeItem.ingredientId);
                    
                    return (
                      <div key={rIdx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                        <select
                          className="form-select"
                          value={recipeItem.ingredientId}
                          onChange={e => {
                            const updated = itemForm.recipe.map((ri, idx) => idx === rIdx ? { ...ri, ingredientId: e.target.value } : ri);
                            setItemForm(f => ({ ...f, recipe: updated }));
                          }}
                          style={{ flex: 1.2, height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                        >
                          {inventory.map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                          ))}
                        </select>
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
                          style={{ flex: 0.8, height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                        />
                        <span style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-tertiary)', minWidth: 24 }}>
                          {matchedIng?.unit ?? ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = itemForm.recipe.filter((_, idx) => idx !== rIdx);
                            setItemForm(f => ({ ...f, recipe: updated }));
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                  {(!itemForm.recipe || itemForm.recipe.length === 0) && (
                    <div style={{ fontSize: 'var(--text-footnote)', color: 'var(--color-label-tertiary)', textAlign: 'center', padding: 'var(--space-2)' }}>
                      No recipe configured (stock will not auto-deduct).
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowItemForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-item-btn" onClick={saveItem}>{editItem ? 'Save Changes' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
