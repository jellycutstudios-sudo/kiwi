import { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  Plus, Edit2, Trash2, X, AlertTriangle, Boxes, 
  DollarSign, Truck, FileText, Eye 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml'];

export default function Inventory() {
  const { restaurant } = useAuthStore();
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'suppliers' | 'pos'
  
  // Core states
  const [ingredients, setIngredients] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  
  // Loading state
  const [loading, setLoading] = useState(true);

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

  // 1. Fetch raw ingredients in real-time
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = onSnapshot(collection(db, 'restaurants', restaurant.id, 'inventory'), snap => {
      setIngredients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [restaurant?.id]);

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
        
        // 1. Loop through items and update quantities + cost references
        for (const item of po.items) {
          const ingRef = doc(db, 'restaurants', restaurant.id, 'inventory', item.ingredientId);
          batch.update(ingRef, {
            qty: increment(item.qtyOrdered),
            cost: item.unitCost // Update inventory baseline to latest cost
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

      {/* Stats Cards (Rendered only on Stock Ledger tab) */}
      {activeTab === 'stock' && (
        <div className="stat-grid">
          {stats.map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-card-icon" style={{ background: s.bg }}>
                <s.icon size={20} color={s.color} />
              </div>
              <div className="stat-card-value">
                {loading ? <div className="skeleton" style={{ height: 28, width: 80, borderRadius: 6 }} /> : s.value}
              </div>
              <div className="stat-card-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs Selector Navigation */}
      <div style={{ display: 'flex', borderBottom: '1.5px solid var(--color-separator)', marginBottom: '-1px' }}>
        {[
          { key: 'stock', label: 'Stock Ledger', icon: Boxes },
          { key: 'suppliers', label: 'Suppliers Directory', icon: Truck },
          { key: 'pos', label: 'Purchase Orders', icon: FileText }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'none',
              border: 'none',
              borderBottom: `2.5px solid ${activeTab === tab.key ? 'var(--color-accent)' : 'transparent'}`,
              color: activeTab === tab.key ? 'var(--color-accent)' : 'var(--color-label-secondary)',
              fontWeight: activeTab === tab.key ? 'var(--weight-bold)' : 'var(--weight-semibold)',
              fontSize: 'var(--text-subhead)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast)',
              fontFamily: 'var(--font-family)',
              marginBottom: '-2px'
            }}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content: Stock Ledger ─────────────────────── */}
      {activeTab === 'stock' && (
        <>
          {lowStockItems.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-orange-light)',
              borderRadius: 'var(--radius-lg)',
              border: '1.5px solid var(--color-orange)',
              color: 'var(--color-orange)',
              fontWeight: 'var(--weight-semibold)',
              fontSize: 'var(--text-footnote)'
            }}>
              <AlertTriangle size={18} />
              <span>Attention: {lowStockItems.length} ingredients are running below safety stock minimums. Please issue purchase orders to restock immediately.</span>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <span className="card-title">Active Ingredient Stock</span>
              <span className="badge badge-gray">{ingredients.length} items</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
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
                  {ingredients.map(ing => {
                    const isLow = ing.qty <= ing.minQty;
                    const totalCostVal = ing.cost * ing.qty;

                    return (
                      <tr key={ing.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                          {ing.name}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', textAlign: 'right', color: 'var(--color-label-secondary)' }}>
                          {formatCurrency(ing.cost, currency)} / {ing.unit}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>
                          {ing.qty} {ing.unit}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>
                          {ing.minQty} {ing.unit}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)', textAlign: 'right', color: 'var(--color-accent)' }}>
                          {formatCurrency(totalCostVal, currency)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                          <span className={`badge ${isLow ? 'badge-orange' : 'badge-green'}`} style={{ textTransform: 'uppercase', fontSize: 10 }}>
                            {isLow ? 'Low Stock' : 'Good'}
                          </span>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
                            <button className="btn btn-secondary btn-icon btn-sm" id={`edit-ing-${ing.id}`} onClick={() => {
                              setEditId(ing.id);
                              setForm({ name: ing.name, unit: ing.unit, qty: String(ing.qty), minQty: String(ing.minQty), cost: String(ing.cost) });
                              setShowForm(true);
                            }}>
                              <Edit2 size={12} />
                            </button>
                            <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteIngredient(ing.id)} id={`delete-ing-${ing.id}`}>
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
          <div style={{ overflowX: 'auto' }}>
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
          <div style={{ overflowX: 'auto' }}>
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
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Ingredient Name</label>
                <input id="ing-name-input" className="form-input" placeholder="e.g. Cooking Oil, Cheese Buns" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Unit Cost ({currency})</label>
                  <input id="ing-cost-input" className="form-input" type="number" min={0} step={0.01} placeholder="0.00" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit UoM</label>
                  <select id="ing-unit-select" className="form-select" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Current Stock Qty</label>
                  <input id="ing-qty-input" className="form-input" type="number" min={0} step={0.001} placeholder="0" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Safety Alert Stock</label>
                  <input id="ing-min-input" className="form-input" type="number" min={0} step={0.001} placeholder="10" value={form.minQty} onChange={e => setForm(f => ({ ...f, minQty: e.target.value }))} />
                </div>
              </div>
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
