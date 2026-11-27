import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, increment, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  Plus, Edit2, Trash2, X, AlertTriangle, Boxes, 
  DollarSign, Truck, FileText, Eye, SlidersHorizontal, History, Search 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml'];

export default function Inventory() {
  const { restaurant, staffDoc, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'suppliers' | 'pos' | 'logs'
  
  // Core states
  const [ingredients, setIngredients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [inventoryLogs, setInventoryLogs] = useState([]);
  
  // Stock Adjustment / Wastage modal state
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustType, setAdjustType] = useState('wastage'); // 'wastage' | 'deduct' | 'restock' | 'count'
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('Spoiled / Expired');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(200);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all'); // 'all' | 'low'

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Modals / Forms visibility
  const [showForm, setShowForm] = useState(false); // Ingredient form
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showPoForm, setShowPoForm] = useState(false);
  const [viewPo, setViewPo] = useState(null); // PO detailed viewer

  // Edit references
  const [editId, setEditId] = useState(null);
  const [editSupplierId, setEditSupplierId] = useState(null);

  // Form states
  const [form, setForm] = useState({
    name: '',
    unit: 'pcs',
    qty: '',
    minQty: '',
    cost: ''
  });

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
    status: 'active'
  });

  const [poSupplierId, setPoSupplierId] = useState('');
  const [poItems, setPoItems] = useState([]); // Array of { ingredientId, name, qtyOrdered, unitCost, unit }
  const [tempItem, setTempItem] = useState({
    ingredientId: '',
    qtyOrdered: '',
    unitCost: ''
  });

  const currency = restaurant?.currency ?? 'INR';

  const [prevRestId, setPrevRestId] = useState(restaurant?.id);
  if (restaurant?.id !== prevRestId) {
    setPrevRestId(restaurant?.id);
    setLoading(true);
  }

  // 1. Fetch raw ingredients in real-time (with pagination and search)
  useEffect(() => {
    if (!restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'inventory'),
      orderBy('name'),
      limit(pageSize)
    );
    
    const unsub = onSnapshot(q, snap => {
      setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return unsub;
  }, [restaurant?.id, pageSize]);

  // Case-insensitive, substring-capable instant search + Low Stock filter
  const filteredIngredients = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return ingredients.filter(ing => {
      if (stockFilter === 'low' && (Number(ing.qty) || 0) > (Number(ing.minQty) || 0)) {
        return false;
      }
      if (!term) return true;
      return (
        (ing.name && ing.name.toLowerCase().includes(term)) ||
        (ing.unit && ing.unit.toLowerCase().includes(term))
      );
    });
  }, [ingredients, debouncedSearch, stockFilter]);

  // 2. Fetch suppliers list in real-time
  useEffect(() => {
    if (!restaurant?.id) return;
    return onSnapshot(collection(db, 'restaurants', restaurant.id, 'suppliers'), snap => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [restaurant?.id]);

  // 3. Fetch purchase orders list in real-time
  useEffect(() => {
    if (!restaurant?.id) return;
    return onSnapshot(collection(db, 'restaurants', restaurant.id, 'purchase_orders'), snap => {
      setPurchaseOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [restaurant?.id]);

  // 4. Fetch inventory movement / wastage audit logs in real-time
  useEffect(() => {
    if (!restaurant?.id) return;
    const logsQ = query(
      collection(db, 'restaurants', restaurant.id, 'inventory_logs'),
      orderBy('createdAt', 'desc'),
      limit(150)
    );
    return onSnapshot(logsQ, snap => {
      setInventoryLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.warn('[Inventory] logs listener deferred:', err?.message);
    });
  }, [restaurant?.id]);

  // ── Ingredient (Stock) CRUD Operations ───────────────────
  const saveIngredient = async () => {
    if (!form.name.trim() || form.qty === '' || form.minQty === '' || form.cost === '') {
      toast.error('All fields are required');
      return;
    }

    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      qty: parseFloat(form.qty) || 0,
      minQty: parseFloat(form.minQty) || 0,
      cost: parseFloat(form.cost) || 0,
    };

    try {
      if (editId) {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'inventory', editId), payload);
        toast.success('Ingredient updated!');
      } else {
        if (ingredients.some(i => i.name.toLowerCase() === payload.name.toLowerCase())) {
          toast.error('An ingredient with this name already exists');
          return;
        }
        await addDoc(collection(db, 'restaurants', restaurant.id, 'inventory'), payload);
        toast.success('Ingredient added to stock!');
      }
      setShowForm(false);
      setEditId(null);
      setForm({ name: '', unit: 'pcs', qty: '', minQty: '', cost: '' });
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    }
  };

  const deleteIngredient = async (id) => {
    if (!confirm('Are you sure you want to delete this ingredient? This might break recipe links.')) return;
    try {
      await deleteDoc(doc(db, 'restaurants', restaurant.id, 'inventory', id));
      toast.success('Ingredient removed from inventory');
    } catch (e) {
      toast.error('Failed to delete: ' + e.message);
    }
  };

  // ── Supplier CRUD Operations ─────────────────────────────
  const saveSupplier = async () => {
    if (!supplierForm.name.trim() || !supplierForm.contactName.trim() || !supplierForm.phone.trim()) {
      toast.error('Name, Contact Person, and Phone number are required');
      return;
    }

    const payload = {
      name: supplierForm.name.trim(),
      contactName: supplierForm.contactName.trim(),
      phone: supplierForm.phone.trim().replace(/\D/g, ''),
      email: supplierForm.email.trim(),
      address: supplierForm.address.trim(),
      status: supplierForm.status,
      updatedAt: new Date()
    };

    try {
      if (editSupplierId) {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'suppliers', editSupplierId), payload);
        toast.success('Supplier details updated!');
      } else {
        payload.createdAt = new Date();
        await addDoc(collection(db, 'restaurants', restaurant.id, 'suppliers'), payload);
        toast.success('Supplier profile created!');
      }
      setShowSupplierForm(false);
      setEditSupplierId(null);
      setSupplierForm({ name: '', contactName: '', phone: '', email: '', address: '', status: 'active' });
    } catch (e) {
      toast.error('Failed to save: ' + e.message);
    }
  };

  const deleteSupplier = async (id) => {
    if (!confirm('Are you sure you want to delete this supplier profile?')) return;
    try {
      await deleteDoc(doc(db, 'restaurants', restaurant.id, 'suppliers', id));
      toast.success('Supplier deleted');
    } catch (e) {
      toast.error('Failed: ' + e.message);
    }
  };

  // ── Purchase Order Operations ────────────────────────────
  const handleAddPoItem = () => {
    if (!tempItem.ingredientId || !tempItem.qtyOrdered || !tempItem.unitCost) {
      toast.error('Ingredient, quantity, and cost are required');
      return;
    }

    const ing = ingredients.find(i => i.id === tempItem.ingredientId);
    if (!ing) return;

    // Check if item already exists in PO
    if (poItems.some(item => item.ingredientId === tempItem.ingredientId)) {
      toast.error('This ingredient is already in the purchase list');
      return;
    }

    setPoItems(prev => [
      ...prev,
      {
        ingredientId: tempItem.ingredientId,
        name: ing.name,
        qtyOrdered: parseFloat(tempItem.qtyOrdered) || 0,
        unitCost: parseFloat(tempItem.unitCost) || 0,
        unit: ing.unit
      }
    ]);
    setTempItem({ ingredientId: '', qtyOrdered: '', unitCost: '' });
  };

  const handleRemovePoItem = (index) => {
    setPoItems(prev => prev.filter((_, i) => i !== index));
  };

  const savePurchaseOrder = async () => {
    if (!poSupplierId) {
      toast.error('Please select a supplier');
      return;
    }
    if (poItems.length === 0) {
      toast.error('Please add at least one item to purchase');
      return;
    }

    const supplier = suppliers.find(s => s.id === poSupplierId);
    const totalCost = poItems.reduce((sum, item) => sum + (item.qtyOrdered * item.unitCost), 0);

    const payload = {
      supplierId: poSupplierId,
      supplierName: supplier?.name || 'Unknown Vendor',
      items: poItems,
      totalCost,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'restaurants', restaurant.id, 'purchase_orders'), payload);
      toast.success('Purchase Order draft saved!');
      setShowPoForm(false);
      setPoSupplierId('');
      setPoItems([]);
    } catch (e) {
      toast.error('PO creation failed: ' + e.message);
    }
  };

  const handleUpdatePoStatus = async (po, newStatus) => {
    try {
      if (newStatus === 'received') {
        if (!confirm('Marking as RECEIVED will automatically increment ingredient stock levels. Continue?')) return;
        
        const batch = writeBatch(db);
        const actorName = staffDoc?.name || user?.displayName || 'Admin';
        
        // 1. Loop through items, update quantities using Weighted Average Cost (WAC), and log receipt
        for (const item of po.items) {
          const existing = ingredients.find(i => i.id === item.ingredientId);
          const oldQty = Math.max(0, Number(existing?.qty) || 0);
          const oldCost = Number(existing?.cost) || 0;
          const newQty = Number(item.qtyOrdered) || 0;
          const unitCost = Number(item.unitCost) || 0;
          const totalQty = oldQty + newQty;
          const wacCost = totalQty > 0 && oldQty > 0
            ? Math.round((((oldQty * oldCost) + (newQty * unitCost)) / totalQty) * 100) / 100
            : unitCost;

          const ingRef = doc(db, 'restaurants', restaurant.id, 'inventory', item.ingredientId);
          batch.update(ingRef, {
            qty: increment(newQty),
            cost: wacCost
          });

          const logRef = doc(collection(db, 'restaurants', restaurant.id, 'inventory_logs'));
          batch.set(logRef, {
            ingredientId: item.ingredientId,
            ingredientName: item.name,
            unit: item.unit || existing?.unit || 'pcs',
            type: 'po_received',
            delta: newQty,
            previousQty: Number(existing?.qty) || 0,
            newQty: (Number(existing?.qty) || 0) + newQty,
            reason: `PO #${po.id.slice(-6).toUpperCase()} (${po.supplierName || 'Vendor'})`,
            staffName: actorName,
            createdAt: serverTimestamp()
          });
        }

        // 2. Set PO status to received
        const poRef = doc(db, 'restaurants', restaurant.id, 'purchase_orders', po.id);
        batch.update(poRef, {
          status: 'received',
          receivedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await batch.commit();
        toast.success('Stock levels updated successfully!', { icon: '📦' });
      } else {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'purchase_orders', po.id), {
          status: newStatus,
          updatedAt: serverTimestamp()
        });
        toast.success(`Purchase Order status updated to: ${newStatus}`);
      }
    } catch (e) {
      toast.error('PO status transition failed: ' + e.message);
    }
  };

  const handleStockAdjustSubmit = async () => {
    if (!adjustTarget || !restaurant?.id) return;
    const rawNum = parseFloat(adjustQty);
    if (isNaN(rawNum) || rawNum < 0 || (adjustType !== 'count' && rawNum <= 0)) {
      toast.error('Please enter a valid quantity');
      return;
    }

    const prevQty = Number(adjustTarget.qty) || 0;
    let delta = 0;
    if (adjustType === 'wastage' || adjustType === 'deduct') {
      delta = -rawNum;
    } else if (adjustType === 'restock') {
      delta = rawNum;
    } else if (adjustType === 'count') {
      delta = Math.round((rawNum - prevQty) * 1000000) / 1000000;
    }

    if (delta === 0) {
      toast.error('No stock change detected');
      return;
    }

    setAdjustSubmitting(true);
    try {
      const batch = writeBatch(db);
      const ingRef = doc(db, 'restaurants', restaurant.id, 'inventory', adjustTarget.id);
      batch.update(ingRef, { qty: increment(delta) });

      const logRef = doc(collection(db, 'restaurants', restaurant.id, 'inventory_logs'));
      batch.set(logRef, {
        ingredientId: adjustTarget.id,
        ingredientName: adjustTarget.name,
        unit: adjustTarget.unit,
        type: adjustType,
        delta,
        previousQty: prevQty,
        newQty: Math.round((prevQty + delta) * 1000000) / 1000000,
        reason: adjustReason.trim() || adjustType,
        staffName: staffDoc?.name || user?.displayName || 'Admin',
        createdAt: serverTimestamp()
      });

      await batch.commit();
      toast.success(`Stock updated (${delta > 0 ? `+${delta}` : delta} ${adjustTarget.unit})`);
      setAdjustTarget(null);
      setAdjustQty('');
    } catch (e) {
      toast.error('Failed to adjust stock: ' + e.message);
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // Calculations for Stock Dashboard
  const totalValValue = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + (ing.cost * ing.qty), 0);
  }, [ingredients]);

  const lowStockItems = useMemo(() => {
    return ingredients.filter(ing => ing.qty <= ing.minQty);
  }, [ingredients]);

  const stats = [
    { label: 'Total Valuation', value: formatCurrency(totalValValue, currency), icon: DollarSign, color: 'var(--color-green)', bg: 'var(--color-green-light)' },
    { label: 'Active Ingredients', value: ingredients.length, icon: Boxes, color: 'var(--color-accent)', bg: 'var(--color-accent-light)' },
    { label: 'Low Stock Alerts', value: lowStockItems.length, icon: AlertTriangle, color: lowStockItems.length > 0 ? 'var(--color-orange)' : 'var(--color-label-tertiary)', bg: lowStockItems.length > 0 ? 'var(--color-orange-light)' : 'var(--color-fill-tertiary)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 className="text-title2">Inventory & Supply Chain</h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Manage stock ledgers, safety stock alerts, supplier directories, and purchase receipt logs.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {activeTab === 'stock' && (
            <button className="btn btn-primary" id="add-ingredient-btn" onClick={() => { setEditId(null); setForm({ name: '', unit: 'pcs', qty: '', minQty: '', cost: '' }); setShowForm(true); }}>
              <Plus size={16} /> Add Ingredient
            </button>
          )}
          {activeTab === 'suppliers' && (
            <button className="btn btn-primary" id="add-supplier-btn" onClick={() => { setEditSupplierId(null); setSupplierForm({ name: '', contactName: '', phone: '', email: '', address: '', status: 'active' }); setShowSupplierForm(true); }}>
              <Plus size={16} /> Add Supplier
            </button>
          )}
          {activeTab === 'pos' && (
            <button className="btn btn-primary" id="new-po-btn" onClick={() => { setPoSupplierId(''); setPoItems([]); setShowPoForm(true); }}>
              <Plus size={16} /> Create PO
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards (Balanced 3-column KPI strip on Stock Ledger tab) */}
      {activeTab === 'stock' && (
        <div className="inventory-kpi-grid">
          {stats.map((s, i) => (
            <div
              key={i}
              className={`stat-card inventory-kpi-card ${i === 2 && lowStockItems.length > 0 ? 'is-clickable' : ''}`}
              onClick={() => {
                if (i === 2 && lowStockItems.length > 0) {
                  setStockFilter(prev => (prev === 'low' ? 'all' : 'low'));
                }
              }}
              title={i === 2 && lowStockItems.length > 0 ? 'Click to filter low-stock items' : undefined}
            >
              <div className="stat-card-icon" style={{ background: s.bg }}>
                <s.icon size={18} color={s.color} />
              </div>
              <div className="stat-card-value" style={{ fontSize: 22 }}>
                {loading ? <div className="skeleton" style={{ height: 26, width: 76, borderRadius: 6 }} /> : s.value}
              </div>
              <div className="stat-card-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs Selector Navigation */}
      <div className="nav-tabs no-scrollbar touch-scroll-x">
        {[
          { key: 'stock', label: 'Stock Ledger', icon: Boxes },
          { key: 'suppliers', label: 'Suppliers Directory', icon: Truck },
          { key: 'pos', label: 'Purchase Orders', icon: FileText },
          { key: 'logs', label: 'Stock Logs', icon: History }
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`nav-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content: Stock Ledger ─────────────────────── */}
      {activeTab === 'stock' && (
        <>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="card-title">Stock Ledger</span>
                <div className="inventory-filter-pills">
                  <button
                    type="button"
                    className={`inventory-filter-pill ${stockFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStockFilter('all')}
                  >
                    All ({ingredients.length})
                  </button>
                  <button
                    type="button"
                    className={`inventory-filter-pill ${stockFilter === 'low' ? 'active is-warn' : ''}`}
                    onClick={() => setStockFilter('low')}
                  >
                    Low Stock ({lowStockItems.length})
                  </button>
                </div>
              </div>
              <div className="inventory-search-wrap">
                <Search size={14} className="inventory-search-icon" />
                <input
                  type="text"
                  className="form-input inventory-search-input"
                  placeholder="Search ingredients..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>

            {/* Mobile Touch Cards View (visible on mobile <= 768px) */}
            <div className="mobile-only" style={{ padding: 'var(--space-3)' }}>
              {filteredIngredients.map(ing => {
                const isLow = ing.qty <= ing.minQty;
                const totalCostVal = ing.cost * ing.qty;
                return (
                  <div key={ing.id} className="inventory-mobile-card">
                    <div className="inventory-mobile-card-header">
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-label)' }}>
                          {ing.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
                          {formatCurrency(ing.cost, currency)} / {ing.unit}
                        </div>
                      </div>
                      <span className={`badge ${isLow ? 'badge-orange' : 'badge-green'}`} style={{ textTransform: 'uppercase', fontSize: '10.5px', fontWeight: 700 }}>
                        {isLow ? '⚠️ Low Stock' : '✓ Good'}
                      </span>
                    </div>

                    <div className="inventory-mobile-card-body">
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>In Stock</div>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: isLow ? 'var(--color-orange)' : 'var(--color-label)', marginTop: '2px' }}>
                          {ing.qty} {ing.unit}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Safety Minimum</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-label)', marginTop: '2px' }}>
                          {ing.minQty} {ing.unit}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Stock Value</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent)', marginTop: '2px' }}>
                          {formatCurrency(totalCostVal, currency)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Unit Cost</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-label)', marginTop: '2px' }}>
                          {formatCurrency(ing.cost, currency)}
                        </div>
                      </div>
                    </div>

                    <div className="inventory-mobile-card-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setAdjustTarget(ing);
                          setAdjustType('wastage');
                          setAdjustQty('');
                          setAdjustReason('Spoiled / Expired');
                        }}
                      >
                        <SlidersHorizontal size={13} />
                        <span>Adjust</span>
                      </button>
                      <button className="btn btn-secondary btn-sm" id={`mob-edit-ing-${ing.id}`} onClick={() => {
                        setEditId(ing.id);
                        setForm({ name: ing.name, unit: ing.unit, qty: String(ing.qty), minQty: String(ing.minQty), cost: String(ing.cost) });
                        setShowForm(true);
                      }}>
                        <Edit2 size={13} />
                        <span>Edit</span>
                      </button>
                      <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteIngredient(ing.id)} id={`mob-delete-ing-${ing.id}`}>
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredIngredients.length === 0 && !loading && (
                <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                  {debouncedSearch.trim() ? `No ingredients matching "${debouncedSearch.trim()}".` : 'No ingredients found. Tap "+ Add Ingredient" above.'}
                </div>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="inventory-desktop-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                    {['Ingredient Name', 'Unit Price', 'In Stock', 'Safety Threshold', 'Stock Value', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{
                        padding: 'var(--space-3) var(--space-4)',
                        textAlign: h === 'Actions' || h === 'Status' ? 'center' : (h === 'Stock Value' || h === 'Unit Price' ? 'right' : 'left'),
                        fontSize: 'var(--text-caption1)',
                        fontWeight: 'var(--weight-semibold)',
                        color: 'var(--color-label-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredIngredients.map(ing => {
                    const isLow = ing.qty <= ing.minQty;
                    const totalCostVal = ing.cost * ing.qty;

                    return (
                      <tr key={ing.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                          {ing.name}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', textAlign: 'right', color: 'var(--color-label-secondary)', whiteSpace: 'nowrap' }}>
                          {formatCurrency(ing.cost, currency)} <span style={{ opacity: 0.7 }}>/ {ing.unit}</span>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', whiteSpace: 'nowrap' }}>
                          <span>{ing.qty}</span>{' '}
                          <span className="inventory-unit-chip">{ing.unit}</span>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)', whiteSpace: 'nowrap' }}>
                          {ing.minQty} {ing.unit}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', textAlign: 'right', color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                          {formatCurrency(totalCostVal, currency)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span className={`badge ${isLow ? 'badge-orange' : 'badge-green'}`} style={{ textTransform: 'uppercase', fontSize: 10, whiteSpace: 'nowrap' }}>
                            {isLow ? 'Low Stock' : 'Good'}
                          </span>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                            <button
                              className="btn btn-secondary btn-xs"
                              title="Log Wastage / Adjust Stock"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 8px' }}
                              onClick={() => {
                                setAdjustTarget(ing);
                                setAdjustType('wastage');
                                setAdjustQty('');
                                setAdjustReason('Spoiled / Expired');
                              }}
                            >
                              <SlidersHorizontal size={12} />
                              <span>Adjust</span>
                            </button>
                            <button className="btn btn-secondary btn-icon btn-sm" id={`edit-ing-${ing.id}`} title="Edit ingredient" onClick={() => {
                              setEditId(ing.id);
                              setForm({ name: ing.name, unit: ing.unit, qty: String(ing.qty), minQty: String(ing.minQty), cost: String(ing.cost) });
                              setShowForm(true);
                            }}>
                              <Edit2 size={12} />
                            </button>
                            <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} title="Delete ingredient" onClick={() => deleteIngredient(ing.id)} id={`delete-ing-${ing.id}`}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {ingredients.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                        No ingredients in database. Add ingredients to configure recipes.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {ingredients.length >= pageSize && (
              <div style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setPageSize(p => p + 200)}
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tab Content: Suppliers Directory ───────────────── */}
      {activeTab === 'suppliers' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Registered Suppliers Directory</span>
            <span className="badge badge-gray">{suppliers.length} vendors</span>
          </div>

          {/* Mobile Touch Cards for Suppliers */}
          <div className="mobile-only" style={{ padding: 'var(--space-3)' }}>
            {suppliers.map(sup => (
              <div key={sup.id} className="inventory-mobile-card">
                <div className="inventory-mobile-card-header">
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-label)' }}>
                      {sup.name}
                    </div>
                    {sup.contactName && (
                      <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
                        Contact: {sup.contactName}
                      </div>
                    )}
                  </div>
                  <span className={`badge ${sup.status === 'active' ? 'badge-green' : 'badge-red'}`} style={{ textTransform: 'uppercase', fontSize: '10.5px', fontWeight: 700 }}>
                    {sup.status}
                  </span>
                </div>
                <div className="inventory-mobile-card-body">
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Phone</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-label)', marginTop: '2px' }}>
                      {sup.phone ? <a href={`tel:${sup.phone}`} style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>{sup.phone}</a> : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Email</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-label)', marginTop: '2px', wordBreak: 'break-all' }}>
                      {sup.email || '—'}
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Address</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
                      {sup.address || '—'}
                    </div>
                  </div>
                </div>
                <div className="inventory-mobile-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    setEditSupplierId(sup.id);
                    setSupplierForm({
                      name: sup.name,
                      contactName: sup.contactName,
                      phone: sup.phone,
                      email: sup.email ?? '',
                      address: sup.address ?? '',
                      status: sup.status ?? 'active'
                    });
                    setShowSupplierForm(true);
                  }}>
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>
                  <button className="btn btn-secondary btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteSupplier(sup.id)}>
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
            {suppliers.length === 0 && (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                No suppliers registered yet.
              </div>
            )}
          </div>

          <div className="inventory-desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['Supplier Name', 'Contact Person', 'Phone', 'Email', 'Address', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: 'var(--space-3) var(--space-4)',
                      textAlign: h === 'Actions' || h === 'Status' ? 'center' : 'left',
                      fontSize: 'var(--text-caption1)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-label-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suppliers.map(sup => (
                  <tr key={sup.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                      {sup.name}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)' }}>
                      {sup.contactName}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                      {sup.phone}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                      {sup.email || '—'}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-tertiary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sup.address}>
                      {sup.address || '—'}
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                      <span className={`badge ${sup.status === 'active' ? 'badge-green' : 'badge-red'}`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                        {sup.status}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                        <button className="btn btn-secondary btn-icon btn-sm" onClick={() => {
                          setEditSupplierId(sup.id);
                          setSupplierForm({
                            name: sup.name,
                            contactName: sup.contactName,
                            phone: sup.phone,
                            email: sup.email ?? '',
                            address: sup.address ?? '',
                            status: sup.status ?? 'active'
                          });
                          setShowSupplierForm(true);
                        }}>
                          <Edit2 size={12} />
                        </button>
                        <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteSupplier(sup.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                      No suppliers registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab Content: Purchase Orders Ledger ─────────────── */}
      {activeTab === 'pos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Purchase Order Ledger</span>
            <span className="badge badge-gray">{purchaseOrders.length} records</span>
          </div>

          {/* Mobile Touch Cards for Purchase Orders */}
          <div className="mobile-only" style={{ padding: 'var(--space-3)' }}>
            {purchaseOrders.map(po => {
              const dateStr = po.createdAt?.toDate 
                ? po.createdAt.toDate().toLocaleDateString()
                : (po.createdAt ? new Date(po.createdAt).toLocaleDateString() : '—');
              return (
                <div key={po.id} className="inventory-mobile-card" style={{ opacity: po.status === 'cancelled' ? 0.6 : 1 }}>
                  <div className="inventory-mobile-card-header">
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-label)' }}>
                        #{po.id.slice(-6).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
                        Supplier: {po.supplierName || '—'}
                      </div>
                    </div>
                    <span className={`badge ${po.status === 'received' ? 'badge-green' : (po.status === 'ordered' ? 'badge-blue' : (po.status === 'draft' ? 'badge-gray' : 'badge-red'))}`} style={{ textTransform: 'uppercase', fontSize: '10.5px', fontWeight: 700 }}>
                      {po.status}
                    </span>
                  </div>
                  <div className="inventory-mobile-card-body">
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Total Cost</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-accent)', marginTop: '2px' }}>
                        {formatCurrency(po.totalCost, currency)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Items Count</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-label)', marginTop: '2px' }}>
                        {po.items?.length ?? 0} items
                      </div>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>Date Created</div>
                      <div style={{ fontSize: '12px', color: 'var(--color-label)', marginTop: '2px' }}>
                        {dateStr}
                      </div>
                    </div>
                  </div>
                  <div className="inventory-mobile-card-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setViewPo(po)}>
                      <Eye size={13} />
                      <span>View PO</span>
                    </button>
                    {po.status === 'ordered' && (
                      <button className="btn btn-success btn-sm" onClick={() => handleUpdatePoStatus(po, 'received')}>
                        <span>Receive</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {purchaseOrders.length === 0 && (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                No purchase orders yet. Tap "+ Create PO" above.
              </div>
            )}
          </div>

          <div className="inventory-desktop-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['PO ID', 'Supplier', 'Total Items', 'Total Cost', 'Status', 'Date Created', 'Actions'].map(h => (
                    <th key={h} style={{
                      padding: 'var(--space-3) var(--space-4)',
                      textAlign: h === 'Actions' || h === 'Status' ? 'center' : (h === 'Total Cost' ? 'right' : 'left'),
                      fontSize: 'var(--text-caption1)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-label-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map(po => {
                  const dateStr = po.createdAt?.toDate 
                    ? po.createdAt.toDate().toLocaleDateString()
                    : (po.createdAt ? new Date(po.createdAt).toLocaleDateString() : '—');
                  
                  return (
                    <tr key={po.id} style={{ borderBottom: '1px solid var(--color-separator)', opacity: po.status === 'cancelled' ? 0.6 : 1 }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>
                        #{po.id.slice(-6).toUpperCase()}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                        {po.supplierName}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)' }}>
                        {po.items?.length ?? 0} items
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', textAlign: 'right', color: 'var(--color-accent)' }}>
                        {formatCurrency(po.totalCost, currency)}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <span className={`badge ${
                          po.status === 'received' ? 'badge-green' : 
                          po.status === 'sent' ? 'badge-blue' : 
                          po.status === 'cancelled' ? 'badge-red' : 'badge-gray'
                        }`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                          {po.status}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-secondary)' }}>
                        {dateStr}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                          <button className="btn btn-secondary btn-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setViewPo(po)}>
                            <Eye size={12} /> View
                          </button>
                          {po.status === 'draft' && (
                            <>
                              <button className="btn btn-primary btn-xs" onClick={() => handleUpdatePoStatus(po, 'sent')}>
                                Send PO
                              </button>
                              <button className="btn btn-xs" style={{ background: 'var(--color-red-light)', color: 'var(--color-red)', border: 'none' }} onClick={() => handleUpdatePoStatus(po, 'cancelled')}>
                                Cancel
                              </button>
                            </>
                          )}
                          {po.status === 'sent' && (
                            <>
                              <button className="btn btn-success btn-xs" onClick={() => handleUpdatePoStatus(po, 'received')}>
                                Receive Stock
                              </button>
                              <button className="btn btn-xs" style={{ background: 'var(--color-red-light)', color: 'var(--color-red)', border: 'none' }} onClick={() => handleUpdatePoStatus(po, 'cancelled')}>
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {purchaseOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                      No purchase orders recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Ingredient Form ────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editId ? 'Edit Ingredient' : 'New Stock Item'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Ingredient Name</label>
                <input id="ing-name-input" className="form-input" placeholder="e.g. Cooking Oil, Cheese Buns" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-3)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Cost per {form.unit} ({currency})</label>
                  <input id="ing-cost-input" className="form-input" type="number" min={0} step={0.01} placeholder="0.00" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Unit</label>
                  <select id="ing-unit-select" className="form-select" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{editId ? `Current Stock (${form.unit})` : `Opening Stock (${form.unit})`}</label>
                  <input id="ing-qty-input" className="form-input" type="number" min={0} step={0.001} placeholder="0" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Low-Stock Alert At ({form.unit})</label>
                  <input id="ing-min-input" className="form-input" type="number" min={0} step={0.001} placeholder="10" value={form.minQty} onChange={e => setForm(f => ({ ...f, minQty: e.target.value }))} />
                </div>
              </div>
              {(parseFloat(form.qty) > 0 && parseFloat(form.cost) > 0) && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-separator)',
                  fontSize: 12.5
                }}>
                  <span style={{ color: 'var(--color-label-secondary)' }}>Estimated Stock Value</span>
                  <strong style={{ color: 'var(--color-green)' }}>
                    {formatCurrency((parseFloat(form.qty) || 0) * (parseFloat(form.cost) || 0), currency)}
                  </strong>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-ing-btn" onClick={saveIngredient}>{editId ? 'Save Changes' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add / Edit Supplier Form ──────────────── */}
      {showSupplierForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSupplierForm(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editSupplierId ? 'Edit Supplier Profile' : 'Register Supplier'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowSupplierForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Vendor Name *</label>
                <input id="sup-name-input" className="form-input" placeholder="e.g. Gourmet Bakery Co." value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Contact Person *</label>
                  <input id="sup-contact-input" className="form-input" placeholder="e.g. David Miller" value={supplierForm.contactName} onChange={e => setSupplierForm(f => ({ ...f, contactName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone Number *</label>
                  <input id="sup-phone-input" className="form-input" placeholder="e.g. 9876543210" value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input id="sup-email-input" className="form-input" type="email" placeholder="e.g. sales@gourmetbakery.com" value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Warehouse Address</label>
                <textarea
                  id="sup-address-input"
                  className="form-input"
                  rows={2}
                  placeholder="Street, City, Country details..."
                  value={supplierForm.address}
                  onChange={e => setSupplierForm(f => ({ ...f, address: e.target.value }))}
                  style={{ resize: 'none', fontFamily: 'var(--font-family)', fontSize: 'var(--text-footnote)' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Vendor Status</label>
                <select id="sup-status-select" className="form-select" value={supplierForm.status} onChange={e => setSupplierForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="active">Active partner</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSupplierForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-sup-btn" onClick={saveSupplier}>{editSupplierId ? 'Save Changes' : 'Create Vendor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Create Purchase Order Form ─────────────── */}
      {showPoForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPoForm(false)}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <h2 className="modal-title">New Purchase Order Builder</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowPoForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label">Select Supplier Vendor</label>
                <select id="po-supplier-select" className="form-select" value={poSupplierId} onChange={e => setPoSupplierId(e.target.value)}>
                  <option value="">-- Choose Vendor --</option>
                  {suppliers.filter(s => s.status === 'active').map(s => (
                    <option key={s.id} value={s.id}>{s.name} (Contact: {s.contactName})</option>
                  ))}
                </select>
              </div>

              {/* Add PO Items Panel */}
              <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-separator)' }}>
                <span className="form-label" style={{ marginBottom: 6, display: 'block' }}>Add Ingredient to Purchase List</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.9fr 0.9fr 44px', gap: 'var(--space-2)' }}>
                  <select 
                    className="form-select" 
                    value={tempItem.ingredientId} 
                    onChange={e => {
                      const ing = ingredients.find(i => i.id === e.target.value);
                      setTempItem(prev => ({ 
                        ...prev, 
                        ingredientId: e.target.value,
                        unitCost: ing ? String(ing.cost) : '' 
                      }));
                    }}
                  >
                    <option value="">-- Ingredient --</option>
                    {ingredients.map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>
                  <input 
                    className="form-input" 
                    placeholder="Qty" 
                    type="number" 
                    min={0}
                    value={tempItem.qtyOrdered} 
                    onChange={e => setTempItem(prev => ({ ...prev, qtyOrdered: e.target.value }))} 
                  />
                  <input 
                    className="form-input" 
                    placeholder="Unit Cost" 
                    type="number" 
                    min={0}
                    value={tempItem.unitCost} 
                    onChange={e => setTempItem(prev => ({ ...prev, unitCost: e.target.value }))} 
                  />
                  <button className="btn btn-primary" style={{ padding: 0 }} onClick={handleAddPoItem}>+</button>
                </div>
              </div>

              {/* PO Items list table */}
              <div className="card" style={{ boxShadow: 'none', border: '1px solid var(--color-separator)' }}>
                <div className="card-header" style={{ padding: '8px 12px' }}><span className="card-title" style={{ fontSize: 13 }}>Items List</span></div>
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}>
                        {['Ingredient', 'Qty', 'Unit Cost', 'Subtotal', ''].map(h => (
                          <th key={h} style={{ padding: '6px 12px', fontSize: 11, textAlign: h === 'Qty' || h === 'Unit Cost' || h === 'Subtotal' ? 'right' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {poItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                          <td style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>{item.name}</td>
                          <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right' }}>{item.qtyOrdered} {item.unit}</td>
                          <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right' }}>{formatCurrency(item.unitCost, currency)}</td>
                          <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontWeight: 700, color: 'var(--color-accent)' }}>
                            {formatCurrency(item.qtyOrdered * item.unitCost, currency)}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--color-red)' }} onClick={() => handleRemovePoItem(idx)}>✕</button>
                          </td>
                        </tr>
                      ))}
                      {poItems.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-label-tertiary)', fontSize: 12 }}>
                            No items added yet. Choose from above inputs.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Running total footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)' }}>
                <span>ESTIMATED TOTAL COST</span>
                <span style={{ fontSize: 'var(--text-title3)', color: 'var(--color-green)' }}>
                  {formatCurrency(poItems.reduce((sum, item) => sum + (item.qtyOrdered * item.unitCost), 0), currency)}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowPoForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-po-btn" onClick={savePurchaseOrder} disabled={poItems.length === 0 || !poSupplierId}>
                Save Draft PO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab Content: Stock Movement & Wastage Logs ────── */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">Stock Movement &amp; Wastage Audit Log</span>
              <span className="badge badge-gray" style={{ marginLeft: 8 }}>{inventoryLogs.length} entries</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                  {['Time', 'Ingredient', 'Type', 'Change', 'New Balance', 'Reason', 'Staff'].map(h => (
                    <th key={h} style={{
                      padding: 'var(--space-3) var(--space-4)',
                      textAlign: h === 'Change' || h === 'New Balance' ? 'right' : 'left',
                      fontSize: 'var(--text-caption1)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-label-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inventoryLogs.map(log => {
                  const ts = log.createdAt?.toDate ? log.createdAt.toDate() : (log.createdAt ? new Date(log.createdAt) : null);
                  const isPos = Number(log.delta) > 0;
                  const typeLabel = log.type === 'po_received' ? 'PO Received'
                    : log.type === 'wastage' ? 'Wastage'
                    : log.type === 'count' ? 'Audit Count'
                    : log.type === 'restock' ? 'Restock'
                    : 'Adjustment';
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 12, color: 'var(--color-label-secondary)', whiteSpace: 'nowrap' }}>
                        {ts ? ts.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 600, fontSize: 13 }}>
                        {log.ingredientName}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                        <span className={`badge ${log.type === 'wastage' ? 'badge-red' : isPos ? 'badge-green' : 'badge-orange'}`} style={{ fontSize: 10, textTransform: 'uppercase' }}>
                          {typeLabel}
                        </span>
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 700, color: isPos ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {isPos ? `+${log.delta}` : log.delta} {log.unit}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontSize: 12.5, fontWeight: 600 }}>
                        {log.newQty} {log.unit}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 12.5, color: 'var(--color-label-secondary)' }}>
                        {log.reason || '—'}
                      </td>
                      <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 12, color: 'var(--color-label-tertiary)' }}>
                        {log.staffName || 'Admin'}
                      </td>
                    </tr>
                  );
                })}
                {inventoryLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                      No stock adjustments, wastage logs, or PO receipts recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Stock Adjustment / Wastage ───────────── */}
      {adjustTarget && (
        <div className="modal-overlay" onClick={() => setAdjustTarget(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Adjust Stock · {adjustTarget.name}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setAdjustTarget(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ fontSize: 12.5, color: 'var(--color-label-secondary)' }}>
                Current Stock: <strong style={{ color: 'var(--color-label)' }}>{adjustTarget.qty} {adjustTarget.unit}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { id: 'wastage', label: 'Wastage / Spoil (-)', defaultReason: 'Spoiled / Expired' },
                  { id: 'deduct', label: 'Manual Deduct (-)', defaultReason: 'Kitchen Usage' },
                  { id: 'restock', label: 'Quick Restock (+)', defaultReason: 'Cash Purchase' },
                  { id: 'count', label: 'Physical Audit (=)', defaultReason: 'Physical Count Variance' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`btn btn-sm ${adjustType === opt.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setAdjustType(opt.id);
                      setAdjustReason(opt.defaultReason);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="form-label">
                  {adjustType === 'count' ? `Actual Physical Count (${adjustTarget.unit})` : `Quantity (${adjustTarget.unit})`}
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="form-input"
                  placeholder="0"
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="form-label">Reason / Note</label>
                <input
                  type="text"
                  className="form-input"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="e.g., Spoiled, Spillage, Physical Count"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setAdjustTarget(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={adjustSubmitting} onClick={handleStockAdjustSubmit}>
                {adjustSubmitting ? 'Saving...' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: View Purchase Order Details Viewer ────── */}
      {viewPo && (
        <div className="modal-overlay" onClick={() => setViewPo(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title">PO Details #{viewPo.id.slice(-6).toUpperCase()}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setViewPo(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', fontSize: 13 }}>
                <div><strong>Supplier:</strong> {viewPo.supplierName}</div>
                <div><strong>Status:</strong> <span className={`badge ${viewPo.status === 'received' ? 'badge-green' : viewPo.status === 'sent' ? 'badge-blue' : viewPo.status === 'cancelled' ? 'badge-red' : 'badge-gray'}`} style={{ textTransform: 'uppercase', fontSize: 9 }}>{viewPo.status}</span></div>
                <div><strong>Date Created:</strong> {viewPo.createdAt?.toDate ? viewPo.createdAt.toDate().toLocaleDateString() : (viewPo.createdAt ? new Date(viewPo.createdAt).toLocaleDateString() : '—')}</div>
                {viewPo.receivedAt && (
                  <div><strong>Date Received:</strong> {viewPo.receivedAt?.toDate ? viewPo.receivedAt.toDate().toLocaleDateString() : new Date(viewPo.receivedAt).toLocaleDateString()}</div>
                )}
              </div>

              <div className="card" style={{ marginTop: 'var(--space-2)', border: '1px solid var(--color-separator)', boxShadow: 'none' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-separator)', background: 'var(--color-bg-secondary)' }}>
                      {['Ingredient Name', 'Ordered Qty', 'Unit Cost', 'Subtotal'].map(h => (
                        <th key={h} style={{ padding: '6px 12px', fontSize: 11, textAlign: h === 'Ordered Qty' || h === 'Unit Cost' || h === 'Subtotal' ? 'right' : 'left' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {viewPo.items?.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        <td style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right' }}>{item.qtyOrdered} {item.unit}</td>
                        <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right' }}>{formatCurrency(item.unitCost, currency)}</td>
                        <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontWeight: 700 }}>{formatCurrency(item.qtyOrdered * item.unitCost, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)' }}>
                <span>TOTAL VALUE</span>
                <span style={{ fontSize: 'var(--text-headline)', color: 'var(--color-accent)' }}>
                  {formatCurrency(viewPo.totalCost, currency)}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              {viewPo.status === 'sent' && (
                <button className="btn btn-success" onClick={() => { handleUpdatePoStatus(viewPo, 'received'); setViewPo(null); }}>
                  Mark Received (Update Stock)
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setViewPo(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
