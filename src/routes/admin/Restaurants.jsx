import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { collection, onSnapshot, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  Plus, ExternalLink, Building2, BarChart3, TrendingUp, ShoppingCart, 
  AlertTriangle, RefreshCw, Layers, ShieldCheck, 
  Globe, Sparkles, Sliders, Users, Flame,
  Search, Phone, Mail, User, Clock, CheckCircle2, XCircle, AlertCircle,
  Trash2, Copy, Check, Rocket
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY_OPTIONS, formatCurrency } from '../../utils/formatCurrency';
import { 
  calculateLocalizedPrice, 
  prepareMasterMenuPayload, 
  ENTERPRISE_ROLES
} from '../../utils/enterpriseMenuSync';

export default function Restaurants() {
  const navigate = useNavigate();
  const { staffDoc, restaurant: currentRestaurant, switchRestaurant } = useAuthStore();
  const [restaurants, setRestaurants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', address:'', phone:'', currency:'INR' });
  const [saving, setSaving] = useState(false);

  // Platform Accounts & Approvals States
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'approved' | 'suspended'
  const [searchQuery, setSearchQuery] = useState('');
  const [usersMap, setUsersMap] = useState({});
  const [copiedId, setCopiedId] = useState(null);

  // Tabs layout: 'outlets' | 'analytics' | 'menu_hub' | 'staff_roles'
  const [activeTab, setActiveTab] = useState('outlets');
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState({
    outletsData: [],
    totalRevenue: 0,
    totalOrders: 0,
    totalLowStock: 0,
    totalStaff: 0,
    lowStockList: []
  });
  const [analyticsDays, setAnalyticsDays] = useState(30);

  // Master Menu Hub States
  const [sourceOutletId, setSourceOutletId] = useState('');
  const [targetOutletIds, setTargetOutletIds] = useState([]);
  const [markupType, setMarkupType] = useState('percent'); // 'percent' | 'fixed'
  const [markupValue, setMarkupValue] = useState(10);
  const [roundTo, setRoundTo] = useState(0.5);
  const [sourceCategories, setSourceCategories] = useState([]);
  const [loadingSourceMenu, setLoadingSourceMenu] = useState(false);
  const [pushingMenu, setPushingMenu] = useState(false);
  const [global86Dish, setGlobal86Dish] = useState('');
  const [global86Status, setGlobal86Status] = useState(false); // false = 86'd, true = in-stock
  const [running86, setRunning86] = useState(false);

  // Enterprise Staff Directory State
  const [allStaffList, setAllStaffList] = useState([]);
  const [loadingAllStaff, setLoadingAllStaff] = useState(false);

  const isSuperAdmin = staffDoc?.role === 'super_admin';

  // Listen to registered users when super_admin to display owner email, name, and phone
  useEffect(() => {
    if (!isSuperAdmin) return;
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const map = {};
      snap.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      setUsersMap(map);
    }, err => {
      console.warn('Users listener in Restaurants:', err);
    });
    return unsub;
  }, [isSuperAdmin]);

  useEffect(() => {
    let q;
    if (isSuperAdmin) {
      // Super admin can see all restaurants across the SaaS platform
      q = collection(db, 'restaurants');
    } else if (currentRestaurant?.brandId) {
      // Franchise owner: only see branches belonging to their brand
      q = query(collection(db, 'restaurants'), where('brandId', '==', currentRestaurant.brandId));
    } else if (currentRestaurant?.ownerUid) {
      // Restaurant owner: only see branches registered under their owner UID
      q = query(collection(db, 'restaurants'), where('ownerUid', '==', currentRestaurant.ownerUid));
    } else if (currentRestaurant?.id) {
      // Fallback: only view the currently active restaurant
      q = query(collection(db, 'restaurants'), where('__name__', '==', currentRestaurant.id));
    } else {
      setRestaurants([]);
      return;
    }

    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRestaurants(list.length > 0 ? list : (currentRestaurant ? [currentRestaurant] : []));
    }, err => {
      console.warn("Restaurants snapshot listener:", err);
      if (currentRestaurant) {
        setRestaurants([currentRestaurant]);
      }
    });
  }, [isSuperAdmin, currentRestaurant]);

  const fetchConsolidatedData = useCallback(async () => {
    if (restaurants.length === 0) return;
    setLoadingAnalytics(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - analyticsDays);

      const results = await Promise.all(
        restaurants.map(async (r) => {
          // Bounded fetch of recent orders, inventory, and staff for each branch
          const [ordersSnap, inventorySnap, staffSnap] = await Promise.all([
            getDocs(query(
              collection(db, 'restaurants', r.id, 'orders'),
              where('createdAt', '>=', startDate)
            )),
            getDocs(collection(db, 'restaurants', r.id, 'inventory')),
            getDocs(collection(db, 'restaurants', r.id, 'staff'))
          ]);

          const rawOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const orders = rawOrders.filter(o => o.status === 'billed');
          const inventory = inventorySnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const staff = staffSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          const revenue = orders.reduce((sum, o) => sum + (o.total ?? 0), 0);
          const lowStockIngredients = inventory.filter(ing => ing.qty <= ing.minQty);
          const lowStockCount = lowStockIngredients.length;

          return {
            id: r.id,
            name: r.name,
            currency: r.currency || 'INR',
            revenue,
            ordersCount: orders.length,
            lowStockCount,
            staffCount: staff.length,
            lowStockIngredients: lowStockIngredients.map(ing => ({
              id: ing.id,
              name: ing.name,
              qty: ing.qty,
              minQty: ing.minQty,
              unit: ing.unit,
              cost: ing.cost,
              restaurantName: r.name,
              restaurantId: r.id
            }))
          };
        })
      );

      const totalRevenue = results.reduce((sum, res) => sum + res.revenue, 0);
      const totalOrders = results.reduce((sum, res) => sum + res.ordersCount, 0);
      const totalLowStock = results.reduce((sum, res) => sum + res.lowStockCount, 0);
      const totalStaff = results.reduce((sum, res) => sum + res.staffCount, 0);
      const lowStockList = results.flatMap(res => res.lowStockIngredients);

      setAnalyticsData({
        outletsData: results,
        totalRevenue,
        totalOrders,
        totalLowStock,
        totalStaff,
        lowStockList
      });
    } catch (err) {
      console.error("Error loading consolidated analytics:", err);
      toast.error("Failed to load consolidated analytics");
    } finally {
      setLoadingAnalytics(false);
    }
  }, [restaurants, analyticsDays]);

  useEffect(() => {
    if (activeTab === 'analytics' && restaurants.length > 0) {
      Promise.resolve().then(() => {
        fetchConsolidatedData();
      });
    }
  }, [activeTab, restaurants.length, fetchConsolidatedData]);

  // Master Menu fetch for source outlet
  const fetchSourceMenu = useCallback(async (outletId) => {
    if (!outletId) return;
    setLoadingSourceMenu(true);
    try {
      const snap = await getDocs(collection(db, 'restaurants', outletId, 'menu'));
      const cats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSourceCategories(cats);
    } catch (e) {
      console.warn("Could not load source menu:", e);
      toast.error("Failed to load source outlet menu");
    } finally {
      setLoadingSourceMenu(false);
    }
  }, []);

  useEffect(() => {
    if (sourceOutletId) {
      fetchSourceMenu(sourceOutletId);
    } else if (restaurants.length > 0) {
      setSourceOutletId(restaurants[0].id);
    }
  }, [sourceOutletId, restaurants, fetchSourceMenu]);

  // Push master menu to selected target outlets with localized pricing
  const handlePushMasterMenu = async () => {
    if (!sourceOutletId) { toast.error("Select a source master outlet"); return; }
    if (targetOutletIds.length === 0) { toast.error("Select at least one target branch"); return; }
    if (sourceCategories.length === 0) { toast.error("Source outlet has no menu categories to push"); return; }

    setPushingMenu(true);
    const toastId = toast.loading(`Propagating master menu across ${targetOutletIds.length} branches...`);

    try {
      const adjustment = {
        type: markupType,
        value: Number(markupValue) || 0,
        roundTo: Number(roundTo) || null
      };

      const payload = prepareMasterMenuPayload(sourceCategories, { adjustment });

      for (const targetId of targetOutletIds) {
        // Query existing categories on target to upsert in-place and avoid duplicate categories
        const existingSnap = await getDocs(collection(db, 'restaurants', targetId, 'menu'));
        const existingCatsByName = new Map();
        existingSnap.docs.forEach(d => {
          const dData = d.data();
          if (dData.name) existingCatsByName.set(dData.name.trim().toLowerCase(), d.id);
        });

        for (const cat of payload) {
          const catKey = (cat.name || '').trim().toLowerCase();
          const existingDocId = existingCatsByName.get(catKey);

          const catData = {
            name: cat.name,
            emoji: cat.emoji || '🍽️',
            items: cat.items,
            taxRate: cat.taxRate ?? null,
            updatedAt: serverTimestamp(),
            pushedFromMaster: sourceOutletId
          };

          if (existingDocId) {
            await updateDoc(doc(db, 'restaurants', targetId, 'menu', existingDocId), catData);
          } else {
            await addDoc(collection(db, 'restaurants', targetId, 'menu'), catData);
          }
        }
      }

      toast.success(`Master menu successfully synchronized to ${targetOutletIds.length} outlet(s)!`, { id: toastId, icon: '🚀' });
    } catch (err) {
      console.error("Master menu push error:", err);
      toast.error(`Push failed: ${err.message}`, { id: toastId });
    } finally {
      setPushingMenu(false);
    }
  };

  // Global 86'ing tool across all outlets
  const handleGlobal86 = async () => {
    if (!global86Dish.trim()) { toast.error("Enter a dish name to 86/restore"); return; }
    setRunning86(true);
    const toastId = toast.loading(`Updating ${global86Dish} across all outlets...`);

    try {
      let updatedBranches = 0;
      const targetDishNorm = global86Dish.trim().toLowerCase();

      for (const r of restaurants) {
        const snap = await getDocs(collection(db, 'restaurants', r.id, 'menu'));
        let branchHadItem = false;

        for (const catDoc of snap.docs) {
          const catData = catDoc.data();
          const items = catData.items || [];
          let catModified = false;

          const updatedItems = items.map(item => {
            if (item.name && item.name.toLowerCase().includes(targetDishNorm)) {
              catModified = true;
              branchHadItem = true;
              return { ...item, available: global86Status, eightySixedAt: global86Status ? null : new Date().toISOString() };
            }
            return item;
          });

          if (catModified) {
            await updateDoc(doc(db, 'restaurants', r.id, 'menu', catDoc.id), {
              items: updatedItems,
              updatedAt: serverTimestamp()
            });
          }
        }
        if (branchHadItem) updatedBranches++;
      }

      toast.success(`${global86Dish} marked as ${global86Status ? 'Available' : '86\'d (Sold Out)'} across ${updatedBranches} branch(es)!`, { id: toastId, icon: global86Status ? '✅' : '🚫' });
      setGlobal86Dish('');
    } catch (e) {
      console.error("Global 86 error:", e);
      toast.error(`Global 86 failed: ${e.message}`, { id: toastId });
    } finally {
      setRunning86(false);
    }
  };

  // Fetch all staff across branches for staff_roles tab
  const fetchAllStaff = useCallback(async () => {
    if (restaurants.length === 0) return;
    setLoadingAllStaff(true);
    try {
      const results = await Promise.all(
        restaurants.map(async (r) => {
          const snap = await getDocs(collection(db, 'restaurants', r.id, 'staff'));
          return snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
            restaurantId: r.id,
            restaurantName: r.name
          }));
        })
      );
      setAllStaffList(results.flat());
    } catch (e) {
      console.warn("Could not load all staff:", e);
    } finally {
      setLoadingAllStaff(false);
    }
  }, [restaurants]);

  useEffect(() => {
    if (activeTab === 'staff_roles') {
      fetchAllStaff();
    }
  }, [activeTab, fetchAllStaff]);

  const createRestaurant = async () => {
    if (!form.name.trim()) { toast.error('Enter restaurant name'); return; }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'restaurants'), {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        currency: form.currency,
        modes: ['pos'],
        taxConfig: { type: 'none' },
        createdAt: serverTimestamp(),
        ownerUid: staffDoc?.uid,
        status: 'approved', // Manual creation by super admin is pre-approved
      });
      toast.success(`Restaurant created! ID: ${ref.id}`);
      setShowForm(false);
      setSaving(false);
      setForm({ name:'', address:'', phone:'', currency:'INR' });
    } catch (e) {
      toast.error('Error creating restaurant: ' + e.message);
      setSaving(false);
    }
  };

  const handleCopyId = (e, id) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success(`ID copied: ${id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEnterConsole = (restaurantItem) => {
    switchRestaurant(restaurantItem);
    toast.success(`Switched active context to ${restaurantItem.name}`);
    navigate('/dashboard');
  };

  const handleDeleteRestaurant = async (restaurantItem) => {
    if (!window.confirm(`Permanently delete account "${restaurantItem.name}" (${restaurantItem.id})? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantItem.id));
      toast.success(`Account for "${restaurantItem.name}" deleted successfully`);
    } catch (e) {
      toast.error('Failed to delete account: ' + e.message);
    }
  };

  const updateRestaurantStatus = async (restaurantId, newStatus) => {
    try {
      const docRef = doc(db, 'restaurants', restaurantId);
      await updateDoc(docRef, { status: newStatus });
      toast.success(`Restaurant account ${newStatus === 'approved' ? 'approved & activated' : 'suspended'}!`);
    } catch (e) {
      toast.error('Failed to update status: ' + e.message);
    }
  };

  const formatRegistrationDate = (ts) => {
    if (!ts) return 'N/A';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return 'N/A';
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  // Status counters for Super Admin & Owners
  const pendingCount = restaurants.filter(r => r.status === 'pending' || r.status === 'trial_pending').length;
  const approvedCount = restaurants.filter(r => r.status === 'approved' || (!r.status && !r.isPending)).length;
  const suspendedCount = restaurants.filter(r => r.status === 'suspended').length;

  const filteredRestaurants = restaurants.filter(r => {
    if (statusFilter === 'pending') {
      if (r.status !== 'pending' && r.status !== 'trial_pending') return false;
    } else if (statusFilter === 'approved') {
      if (r.status !== 'approved' && (r.status || r.isPending)) return false;
    } else if (statusFilter === 'suspended') {
      if (r.status !== 'suspended') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const owner = usersMap[r.ownerUid];
      const matchName = (r.name || '').toLowerCase().includes(q);
      const matchAddress = (r.address || '').toLowerCase().includes(q);
      const matchId = (r.id || '').toLowerCase().includes(q);
      const matchPhone = (r.phone || owner?.phone || '').toLowerCase().includes(q);
      const matchEmail = (r.email || owner?.email || '').toLowerCase().includes(q);
      const matchOwnerName = (owner?.name || '').toLowerCase().includes(q);
      return matchName || matchAddress || matchId || matchPhone || matchEmail || matchOwnerName;
    }
    return true;
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-anim {
          animation: spin 1s linear infinite;
        }
      `}</style>

      {/* Header Section */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h2 className="text-title2">
            {isSuperAdmin ? 'Registered Accounts' : 'Restaurants'}
          </h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            {isSuperAdmin
              ? 'Verify, approve, and manage registered restaurant accounts across the platform'
              : 'Manage all your restaurant branches'}
          </p>
        </div>
        {activeTab === 'outlets' ? (
          <button className="btn btn-primary" id="add-restaurant-btn" onClick={() => setShowForm(true)}>
            <Plus size={16}/> {isSuperAdmin ? 'Register New Account' : 'New Restaurant'}
          </button>
        ) : (
          <button
            className="btn btn-secondary"
            onClick={fetchConsolidatedData}
            disabled={loadingAnalytics}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            id="sync-analytics-btn"
          >
            <RefreshCw size={14} className={loadingAnalytics ? 'spin-anim' : ''} />
            {loadingAnalytics ? 'Syncing...' : 'Sync Analytics'}
          </button>
        )}
      </div>

      <div className="nav-tabs no-scrollbar touch-scroll-x">
        {[
          { key: 'outlets', label: isSuperAdmin ? 'Accounts Directory' : 'Outlets Directory', icon: isSuperAdmin ? ShieldCheck : Building2 },
          { key: 'analytics', label: isSuperAdmin ? 'Platform & Franchise Analytics' : 'Consolidated Analytics & P&L', icon: BarChart3 },
          { key: 'menu_hub', label: 'Master Menu Hub & Push', icon: Layers },
          { key: 'staff_roles', label: isSuperAdmin ? 'Global Staff Directory' : 'Franchise Staff & Roles', icon: Users }
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`nav-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            id={`tab-btn-${tab.key}`}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content: Accounts & Outlets Directory ────────────── */}
      {activeTab === 'outlets' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
          {/* Pending Approval Alert Banner for Super Admin */}
          {isSuperAdmin && pendingCount > 0 && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1.5px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '12px',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={22} color="#f59e0b" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-label)' }}>
                    {pendingCount} Account{pendingCount > 1 ? 's' : ''} Awaiting Approval
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
                    New registrations need Super Admin verification before they can access the full terminal and live POS.
                  </div>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setStatusFilter('pending')}
                style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  borderColor: 'rgba(245, 158, 11, 0.5)',
                  color: '#f59e0b',
                  fontWeight: 600
                }}
              >
                Review Pending ({pendingCount})
              </button>
            </div>
          )}

          {/* Quick Metrics Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-3)'
          }}>
            <div className="card card-padded" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', fontWeight: 600 }}>Total Accounts</div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: 'var(--color-label)' }}>{restaurants.length}</div>
            </div>
            <div
              className="card card-padded"
              style={{
                padding: '14px 16px',
                border: pendingCount > 0 ? '1.5px solid rgba(245, 158, 11, 0.5)' : undefined,
                background: pendingCount > 0 ? 'rgba(245, 158, 11, 0.05)' : undefined
              }}
            >
              <div style={{ fontSize: '12px', color: pendingCount > 0 ? '#f59e0b' : 'var(--color-label-secondary)', fontWeight: 600 }}>
                Pending Approvals
              </div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: pendingCount > 0 ? '#f59e0b' : 'var(--color-label)' }}>
                {pendingCount}
              </div>
            </div>
            <div className="card card-padded" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', fontWeight: 600 }}>Active & Live</div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: '#10b981' }}>{approvedCount}</div>
            </div>
            <div className="card card-padded" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', fontWeight: 600 }}>Suspended</div>
              <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '4px', color: suspendedCount > 0 ? 'var(--color-red)' : 'var(--color-label)' }}>
                {suspendedCount}
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginTop: '4px'
          }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All (${restaurants.length})` },
                { id: 'pending', label: `Pending (${pendingCount})` },
                { id: 'approved', label: `Active (${approvedCount})` },
                { id: 'suspended', label: `Suspended (${suspendedCount})` }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: statusFilter === f.id ? 700 : 500,
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: statusFilter === f.id ? 'var(--color-accent)' : 'var(--color-separator)',
                    background: statusFilter === f.id ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
                    color: statusFilter === f.id ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div style={{ position: 'relative', minWidth: '260px', flex: '1 1 260px', maxWidth: '420px' }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)' }} />
              <input
                type="text"
                className="input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search account, owner, email, phone, ID..."
                style={{ paddingLeft: '34px', fontSize: '13px', height: '36px', width: '100%' }}
              />
            </div>
          </div>

          {/* Accounts Grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:'var(--space-4)' }}>
            {filteredRestaurants.map(r => {
              const owner = usersMap[r.ownerUid];
              const isPending = r.status === 'pending' || r.status === 'trial_pending';
              const isSuspended = r.status === 'suspended';
              const isApproved = !isPending && !isSuspended;
              const isCurrent = currentRestaurant?.id === r.id;

              return (
                <div
                  key={r.id}
                  className="card card-padded"
                  style={{
                    display:'flex',
                    flexDirection:'column',
                    gap:'var(--space-3)',
                    border: isPending
                      ? '1.5px solid #f59e0b'
                      : isSuspended
                      ? '1px solid var(--color-red)'
                      : isCurrent
                      ? '1.5px solid var(--color-accent)'
                      : '1px solid var(--color-separator)',
                    position: 'relative'
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'var(--space-3)' }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 'var(--radius-lg)',
                      background: isPending ? 'rgba(245, 158, 11, 0.15)' : isSuspended ? 'rgba(239, 68, 68, 0.15)' : 'var(--color-accent-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22,
                      flexShrink: 0
                    }}>
                      {isPending ? '⏳' : isSuspended ? '🛑' : '🍽️'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 'var(--weight-bold)', fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}
                        </div>
                        <span
                          className={`badge ${isPending ? 'badge-orange' : isSuspended ? 'badge-red' : 'badge-green'}`}
                          style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}
                        >
                          {isPending ? 'Pending Approval' : isSuspended ? 'Suspended' : 'Approved'}
                        </span>
                      </div>
                      {r.address && (
                        <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📍 {r.address}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Owner Information Box */}
                  <div style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-label)' }}>
                      <User size={13} color="var(--color-label-tertiary)" />
                      <span style={{ fontWeight: 600 }}>{owner?.name || r.ownerName || 'Owner Name: N/A'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-label-secondary)' }}>
                      <Mail size={13} color="var(--color-label-tertiary)" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {owner?.email || r.email || 'No email registered'}
                      </span>
                    </div>
                    {(owner?.phone || r.phone) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-label-secondary)' }}>
                        <Phone size={13} color="var(--color-label-tertiary)" />
                        <span>{owner?.phone || r.phone}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginTop: 2, paddingTop: 4, borderTop: '1px solid var(--color-separator)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-label-tertiary)', fontSize: '11px' }}>
                        <Clock size={11} />
                        <span>Joined: {formatRegistrationDate(r.createdAt || owner?.createdAt)}</span>
                      </div>
                      {r.trialEndsAt && (
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#f59e0b' }}>
                          Trial active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Account Identifier & Direct Links */}
                  <div style={{ display:'flex', gap:'var(--space-2)', alignItems:'center' }}>
                    <div
                      onClick={(e) => handleCopyId(e, r.id)}
                      title="Click to copy Restaurant ID"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--color-bg-secondary)',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-xs)',
                        cursor: 'pointer',
                        flex: 1,
                        minWidth: 0,
                        border: '1px solid var(--color-separator)'
                      }}
                    >
                      <code style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        ID: {r.id}
                      </code>
                      {copiedId === r.id ? <Check size={12} color="#10b981" /> : <Copy size={12} color="var(--color-label-tertiary)" />}
                    </div>

                    <a
                      href={`/order/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-icon btn-sm"
                      title="Open public digital ordering page"
                    >
                      <ExternalLink size={13}/>
                    </a>
                  </div>

                  {/* Operational Action Controls */}
                  {isSuperAdmin && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--color-separator)' }}>
                      {/* If Pending: Approve vs Reject */}
                      {isPending && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-success btn-sm"
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
                            onClick={() => updateRestaurantStatus(r.id, 'approved')}
                          >
                            <CheckCircle2 size={14} /> Approve & Activate
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            onClick={() => handleDeleteRestaurant(r)}
                            title="Reject and delete this registration"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      )}

                      {/* If Approved: Open Outlet Console + Suspend Toggle */}
                      {isApproved && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600 }}
                            onClick={() => handleEnterConsole(r)}
                          >
                            <Rocket size={14} /> Open Outlet Console
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: 'var(--color-label-secondary)' }}
                            onClick={() => updateRestaurantStatus(r.id, 'suspended')}
                          >
                            Suspend
                          </button>
                        </div>
                      )}

                      {/* If Suspended: Reactivate + Delete */}
                      {isSuspended && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-success btn-sm"
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}
                            onClick={() => updateRestaurantStatus(r.id, 'approved')}
                          >
                            <CheckCircle2 size={14} /> Reactivate Account
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            onClick={() => handleDeleteRestaurant(r)}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredRestaurants.length === 0 && (
              <div style={{ textAlign: 'center', padding: '48px 24px', gridColumn: '1 / -1', background: 'var(--color-bg-secondary)', borderRadius: '16px', border: '1px dashed var(--color-separator)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏢</div>
                <h4 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--color-label)' }}>
                  {searchQuery || statusFilter !== 'all' ? 'No Accounts Match Filters' : 'No Accounts Registered Yet'}
                </h4>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-label-secondary)' }}>
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try clearing your search query or switching filters.'
                    : 'Register your brand\'s branch locations or franchise stores to enable centralized management.'}
                </p>
                {(searchQuery || statusFilter !== 'all') ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
                    Reset Filters
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => setShowForm(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 auto' }}>
                    <Plus size={16} /> Register First Outlet
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab Content: Consolidated Analytics ────────── */}
      {activeTab === 'analytics' && loadingAnalytics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <div className="stat-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="stat-card">
                <div className="skeleton" style={{ height: 40, width: 40, borderRadius: 8 }} />
                <div className="skeleton" style={{ height: 28, width: 100, borderRadius: 6, marginTop: 8 }} />
                <div className="skeleton" style={{ height: 16, width: 80, borderRadius: 4, marginTop: 4 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div className="card card-padded" style={{ flex: 1, height: 250 }}>
              <div className="skeleton" style={{ height: '100%', borderRadius: 8 }} />
            </div>
            <div className="card card-padded" style={{ flex: 1.2, height: 250 }}>
              <div className="skeleton" style={{ height: '100%', borderRadius: 8 }} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && !loadingAnalytics && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {/* Time range selector */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            {[
              { days: 7, label: 'Last 7 Days' },
              { days: 30, label: 'Last 30 Days' },
              { days: 90, label: 'Last 90 Days' },
            ].map(({ days, label }) => (
              <button
                key={days}
                className={`btn btn-sm ${analyticsDays === days ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setAnalyticsDays(days)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* KPI Summary Cards Grid */}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: 'var(--color-accent-light)' }}>
                <Building2 size={20} color="var(--color-accent)" />
              </div>
              <div className="stat-card-value">{restaurants.length}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Total Outlets</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(52, 199, 89, 0.15)' }}>
                <TrendingUp size={20} color="#34C759" />
              </div>
              <div className="stat-card-value">{formatCurrency(analyticsData.totalRevenue, 'INR')}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Group Sales Revenue</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: 'rgba(0, 122, 255, 0.15)' }}>
                <ShoppingCart size={20} color="#007AFF" />
              </div>
              <div className="stat-card-value">{analyticsData.totalOrders}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Group Orders</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ backgroundColor: analyticsData.totalLowStock > 0 ? 'rgba(255, 149, 0, 0.15)' : 'var(--color-bg-secondary)' }}>
                <AlertTriangle size={20} color={analyticsData.totalLowStock > 0 ? '#FF9500' : 'var(--color-label-secondary)'} />
              </div>
              <div className="stat-card-value">{analyticsData.totalLowStock}</div>
              <div className="stat-card-label" style={{ color: 'var(--color-label-secondary)' }}>Global Stock Alerts</div>
            </div>
          </div>

          {/* Sales Leaderboard and Outlets Overview Tables */}
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {/* Sales Share Leaderboard SVG chart */}
            <div className="card card-padded" style={{ flex: 1, minWidth: 'min(100%, 320px)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>Sales Leaderboard</h3>
                <span className="badge badge-blue">Comparison Shares</span>
              </div>
              {analyticsData.outletsData.length === 0 ? (
                <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>No data available</div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg viewBox={`0 0 600 ${Math.max(120, analyticsData.outletsData.length * 45 + 20)}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
                    {analyticsData.outletsData.map((res, idx) => {
                      const maxRevenue = Math.max(...analyticsData.outletsData.map(o => o.revenue), 1);
                      const sharePercent = analyticsData.totalRevenue > 0 ? (res.revenue / analyticsData.totalRevenue) * 100 : 0;
                      const barWidth = maxRevenue > 0 ? (res.revenue / maxRevenue) * 360 : 0;
                      const y = idx * 45 + 10;
                      return (
                        <g key={res.id}>
                          <text
                            x={140}
                            y={y + 15}
                            textAnchor="end"
                            style={{
                              fill: 'var(--color-label)',
                              fontSize: 12,
                              fontWeight: 'var(--weight-bold)',
                              fontFamily: 'var(--font-family)'
                            }}
                          >
                            {res.name}
                          </text>
                          <rect
                            x={150}
                            y={y + 3}
                            width={360}
                            height={16}
                            rx={8}
                            fill="var(--color-bg-secondary)"
                          />
                          <rect
                            x={150}
                            y={y + 3}
                            width={Math.max(barWidth, 6)}
                            height={16}
                            rx={8}
                            fill="var(--color-accent)"
                          />
                          <text
                            x={150 + Math.max(barWidth, 6) + 8}
                            y={y + 15}
                            style={{
                              fill: 'var(--color-label-secondary)',
                              fontSize: 11,
                              fontWeight: 'var(--weight-semibold)',
                              fontFamily: 'var(--font-family)'
                            }}
                          >
                            {formatCurrency(res.revenue, res.currency)} ({sharePercent.toFixed(0)}%)
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>

            {/* Outlets comparison table */}
            <div className="card card-padded" style={{ flex: 1.2, minWidth: 'min(100%, 320px)' }}>
              <h3 style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-4)' }}>Outlets Overview</h3>
              
              {/* Desktop Table */}
              <div className="desktop-only" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                      {['Restaurant Branch', 'Net Sales', 'Orders', 'Low Stock', 'Active Staff'].map(h => (
                        <th key={h} style={{
                          padding: 'var(--space-3) var(--space-4)',
                          textAlign: h === 'Restaurant Branch' ? 'left' : 'right',
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
                    {analyticsData.outletsData.map(res => (
                      <tr key={res.id} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-bold)' }}>
                          <div>{res.name}</div>
                          <code style={{ fontSize: 10, color: 'var(--color-label-tertiary)', fontFamily: 'var(--font-mono)' }}>{res.id}</code>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--weight-semibold)' }}>
                          {formatCurrency(res.revenue, res.currency)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                          {res.ordersCount}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                          <span className={`badge ${res.lowStockCount > 0 ? 'badge-red' : 'badge-green'}`}>
                            {res.lowStockCount} alerts
                          </span>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                          {res.staffCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {analyticsData.outletsData.map(res => (
                  <div key={res.id} style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    border: '1px solid var(--color-separator)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)' }}>{res.name}</div>
                        <code style={{ fontSize: 10, color: 'var(--color-label-tertiary)', fontFamily: 'var(--font-mono)' }}>{res.id}</code>
                      </div>
                      <span className={`badge ${res.lowStockCount > 0 ? 'badge-red' : 'badge-green'}`}>
                        {res.lowStockCount} alerts
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--color-bg)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--color-label-tertiary)', textTransform: 'uppercase' }}>Net Sales</div>
                        <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-footnote)' }}>{formatCurrency(res.revenue, res.currency)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--color-label-tertiary)', textTransform: 'uppercase' }}>Orders</div>
                        <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-footnote)' }}>{res.ordersCount}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--color-label-tertiary)', textTransform: 'uppercase' }}>Staff</div>
                        <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-footnote)' }}>{res.staffCount}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Consolidated Low Stock Ledger */}
          <div className="card card-padded">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              <AlertTriangle size={18} color="#FF9500" />
              <h3 style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)' }}>Consolidated Low Stock Ledger</h3>
            </div>
            {analyticsData.lowStockList.length === 0 ? (
              <div style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--color-label-secondary)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
                🎉 All outlets are fully stocked! No low stock warnings.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="desktop-only" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-separator)' }}>
                        {['Outlet Branch', 'Ingredient', 'Stock Quantity', 'Safety Level', 'Unit Cost', 'Status'].map(h => (
                          <th key={h} style={{
                            padding: 'var(--space-3) var(--space-4)',
                            textAlign: h === 'Outlet Branch' || h === 'Ingredient' ? 'left' : (h === 'Status' ? 'center' : 'right'),
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
                      {analyticsData.lowStockList.map((ing, idx) => (
                        <tr key={`${ing.restaurantId}-${ing.id}-${idx}`} style={{ borderBottom: '1px solid var(--color-separator)' }}>
                          <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)', fontWeight: 'var(--weight-semibold)' }}>
                            {ing.restaurantName}
                          </td>
                          <td style={{ padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-subhead)' }}>
                            {ing.name}
                          </td>
                          <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', fontWeight: 'var(--weight-semibold)', color: 'var(--color-red)' }}>
                            {ing.qty} {ing.unit}
                          </td>
                          <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', color: 'var(--color-label-secondary)' }}>
                            {ing.minQty} {ing.unit}
                          </td>
                          <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right' }}>
                            {formatCurrency(ing.cost, 'INR')}
                          </td>
                          <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }}>
                            <span className="badge badge-red">Low Stock</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {analyticsData.lowStockList.map((ing, idx) => (
                    <div key={`${ing.restaurantId}-${ing.id}-${idx}`} style={{
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-3)',
                      border: '1px solid var(--color-separator)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)' }}>{ing.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>📍 {ing.restaurantName}</div>
                        </div>
                        <span className="badge badge-red">Low Stock</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, background: 'var(--color-bg)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--color-label-tertiary)', textTransform: 'uppercase' }}>Stock</div>
                          <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-footnote)', color: 'var(--color-red)' }}>{ing.qty} {ing.unit}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--color-label-tertiary)', textTransform: 'uppercase' }}>Min Safe</div>
                          <div style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)' }}>{ing.minQty} {ing.unit}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--color-label-tertiary)', textTransform: 'uppercase' }}>Unit Cost</div>
                          <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-footnote)' }}>{formatCurrency(ing.cost, 'INR')}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab Content: Master Menu Hub & Cross-Store Push ── */}
      {activeTab === 'menu_hub' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Header Card */}
          <div className="card card-padded" style={{ background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.08) 0%, rgba(99, 102, 241, 0.05) 100%)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-accent)', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Layers size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Franchise Master Menu Hub</h3>
                  <p style={{ fontSize: 12, color: 'var(--color-label-secondary)', margin: '2px 0 0' }}>
                    Push standardized dishes, categories, and localized pricing tiers across branches from a single master menu.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                id="push-master-menu-btn"
                disabled={pushingMenu || targetOutletIds.length === 0}
                onClick={handlePushMasterMenu}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, height: 38 }}
              >
                <Sparkles size={15} />
                <span>{pushingMenu ? 'Pushing Menu...' : `Push to ${targetOutletIds.length} Outlet(s)`}</span>
              </button>
            </div>
          </div>

          {/* Sync Configuration Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
            {/* Step 1: Source & Targets */}
            <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-separator)', paddingBottom: 8 }}>
                <Globe size={16} color="var(--color-accent)" />
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>1. Select Source &amp; Target Outlets</span>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Source Master Outlet</label>
                <select
                  className="form-select"
                  id="source-outlet-select"
                  value={sourceOutletId}
                  onChange={e => setSourceOutletId(e.target.value)}
                  style={{ height: 36, fontSize: 12.5 }}
                >
                  {restaurants.map(r => (
                    <option key={r.id} value={r.id}>{r.name} ({r.id.slice(0, 8)}...)</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ fontSize: 11, margin: 0 }}>Target Branches ({targetOutletIds.length} selected)</label>
                  <button
                    type="button"
                    className="btn btn-link btn-xs"
                    style={{ fontSize: 11, padding: 0 }}
                    onClick={() => {
                      const otherIds = restaurants.filter(r => r.id !== sourceOutletId).map(r => r.id);
                      setTargetOutletIds(targetOutletIds.length === otherIds.length ? [] : otherIds);
                    }}
                  >
                    {targetOutletIds.length === restaurants.filter(r => r.id !== sourceOutletId).length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto', paddingRight: 4 }}>
                  {restaurants.filter(r => r.id !== sourceOutletId).map(r => {
                    const isChecked = targetOutletIds.includes(r.id);
                    return (
                      <label 
                        key={r.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 8, 
                          fontSize: 12, 
                          padding: '6px 10px', 
                          borderRadius: 8, 
                          background: isChecked ? 'rgba(56, 189, 248, 0.08)' : 'var(--color-bg-secondary)',
                          border: isChecked ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid var(--color-separator)',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) setTargetOutletIds([...targetOutletIds, r.id]);
                            else setTargetOutletIds(targetOutletIds.filter(id => id !== r.id));
                          }}
                        />
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--color-label-secondary)', marginLeft: 'auto' }}>{r.currency || 'INR'}</span>
                      </label>
                    );
                  })}
                  {restaurants.length <= 1 && (
                    <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', padding: 8 }}>
                      Create additional branch outlets in Outlets Directory to push master menus.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2: Localized Pricing Tiers */}
            <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-separator)', paddingBottom: 8 }}>
                <Sliders size={16} color="var(--color-accent)" />
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>2. Localized Pricing Tiers</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Adjustment Type</label>
                  <select
                    className="form-select"
                    value={markupType}
                    onChange={e => setMarkupType(e.target.value)}
                    style={{ height: 36, fontSize: 12.5 }}
                  >
                    <option value="percent">Percentage Markup (%)</option>
                    <option value="fixed">Fixed Surcharge (+Flat)</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>
                    {markupType === 'percent' ? 'Rate (+ / - %)' : 'Amount (+Flat)'}
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={markupValue}
                    onChange={e => setMarkupValue(e.target.value)}
                    placeholder="e.g. 10"
                    style={{ height: 36, fontSize: 12.5 }}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Smart Price Rounding</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {[
                    { label: 'Exact (0.01)', val: null },
                    { label: 'Nearest 0.50', val: 0.5 },
                    { label: 'Nearest 1.00', val: 1.0 }
                  ].map(opt => (
                    <button
                      key={opt.label}
                      type="button"
                      className={`btn btn-xs ${roundTo === opt.val ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setRoundTo(opt.val)}
                      style={{ fontSize: 11, height: 30 }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sample Calculation Preview */}
              <div style={{ background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: 8, fontSize: 11, color: 'var(--color-label-secondary)' }}>
                Sample Dish ($20.00 base): Target outlet price will be{' '}
                <strong style={{ color: 'var(--color-label)', fontSize: 12 }}>
                  ${calculateLocalizedPrice(20, { type: markupType, value: markupValue, roundTo }).toFixed(2)}
                </strong>
                {markupType === 'percent' && markupValue !== 0 && ` (${markupValue > 0 ? `+${markupValue}%` : `${markupValue}%`})`}
              </div>
            </div>

            {/* Step 3: Global 86'ing Across Branches */}
            <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-separator)', paddingBottom: 8 }}>
                <Flame size={16} color="#ef4444" />
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>3. Global 86'ing Across All Outlets</span>
              </div>

              <p style={{ fontSize: 11.5, color: 'var(--color-label-secondary)', margin: 0 }}>
                Instant supply-chain emergency control: 86 a dish across all franchise outlets in 1 click.
              </p>

              <div>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 4 }}>Dish Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Avocado Toast or Salmon"
                  value={global86Dish}
                  onChange={e => setGlobal86Dish(e.target.value)}
                  style={{ height: 36, fontSize: 12.5 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${!global86Status ? 'btn-danger' : 'btn-secondary'}`}
                  onClick={() => setGlobal86Status(false)}
                  style={{ fontSize: 11.5 }}
                >
                  🚫 86 (Sold Out)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${global86Status ? 'btn-success' : 'btn-secondary'}`}
                  onClick={() => setGlobal86Status(true)}
                  style={{ fontSize: 11.5 }}
                >
                  ✅ Available
                </button>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                id="apply-global-86-btn"
                disabled={running86 || !global86Dish.trim()}
                onClick={handleGlobal86}
                style={{ fontWeight: 700, height: 34 }}
              >
                {running86 ? 'Applying...' : 'Apply Across All Outlets'}
              </button>
            </div>
          </div>

          {/* Master Menu Preview Table */}
          <div className="card card-padded">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>
                Master Menu Preview ({sourceCategories.reduce((sum, c) => sum + (c.items?.length || 0), 0)} dishes loaded)
              </h4>
              <span className="badge badge-blue">
                Live Pricing Preview
              </span>
            </div>

            {loadingSourceMenu ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-label-secondary)' }}>
                Loading source menu dishes...
              </div>
            ) : sourceCategories.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                No dishes found in source outlet. Add items in Menu Editor to populate the master catalog.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--color-separator)', textAlign: 'left', color: 'var(--color-label-secondary)' }}>
                      <th style={{ padding: '8px 10px' }}>Dish Name</th>
                      <th style={{ padding: '8px 10px' }}>Category</th>
                      <th style={{ padding: '8px 10px' }}>Master Base Price</th>
                      <th style={{ padding: '8px 10px' }}>Target Localized Price</th>
                      <th style={{ padding: '8px 10px' }}>Dietary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceCategories.flatMap(c => (c.items || []).map(i => {
                      const locPrice = calculateLocalizedPrice(i.price, { type: markupType, value: markupValue, roundTo });
                      return (
                        <tr key={i.id || i.name} style={{ borderBottom: '1px solid var(--color-separator-opaque, rgba(255,255,255,0.04))' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>{i.name}</td>
                          <td style={{ padding: '8px 10px', color: 'var(--color-label-secondary)' }}>{c.name}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>${Number(i.price || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--color-accent)', fontWeight: 800 }}>
                            ${locPrice.toFixed(2)}
                            {markupValue !== 0 && (
                              <span style={{ fontSize: 10, opacity: 0.75, marginLeft: 4 }}>
                                ({markupValue > 0 ? `+${markupValue}%` : `${markupValue}%`})
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span className={i.isVeg ? "food-badge-veg" : "food-badge-nonveg"} />
                          </td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab Content: Enterprise Roles & Staff Hierarchy ── */}
      {activeTab === 'staff_roles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Header Card */}
          <div className="card card-padded" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.05) 100%)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#8b5cf6', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Franchise Roles &amp; Staff Hierarchy</h3>
                <p style={{ fontSize: 12, color: 'var(--color-label-secondary)', margin: '2px 0 0' }}>
                  Centralized multi-store permission tiers and cross-branch staff assignment.
                </p>
              </div>
            </div>
          </div>

          {/* 4 Tier Role Cards Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
            {Object.values(ENTERPRISE_ROLES).map(role => (
              <div 
                key={role.id} 
                className="card card-padded"
                style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: `3px solid ${role.badgeColor}` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-label)' }}>{role.title}</span>
                  <span style={{ fontSize: 10, background: `${role.badgeColor}22`, color: role.badgeColor, padding: '2px 7px', borderRadius: 6, fontWeight: 800 }}>
                    {role.id.toUpperCase()}
                  </span>
                </div>

                <p style={{ fontSize: 11.5, color: 'var(--color-label-secondary)', margin: 0, minHeight: 36, lineHeight: 1.4 }}>
                  {role.description}
                </p>

                <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-label-secondary)', marginBottom: 6 }}>
                    Granted Capabilities ({role.permissions.length}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {role.permissions.map(perm => (
                      <span 
                        key={perm}
                        style={{ 
                          fontSize: 9.5, 
                          padding: '2px 6px', 
                          borderRadius: 4, 
                          background: 'var(--color-bg-secondary)', 
                          border: '1px solid var(--color-separator)',
                          fontWeight: 600,
                          color: 'var(--color-label)'
                        }}
                      >
                        ✓ {perm.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Cross-Store Staff Overview Directory */}
          <div className="card card-padded">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={16} color="var(--color-accent)" />
                <h4 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>
                  Cross-Branch Staff Directory ({allStaffList.length} employees)
                </h4>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={fetchAllStaff}
                disabled={loadingAllStaff}
                style={{ fontSize: 11 }}
              >
                {loadingAllStaff ? 'Refreshing...' : 'Refresh Staff'}
              </button>
            </div>

            {loadingAllStaff ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-label-secondary)' }}>
                Loading staff across all branches...
              </div>
            ) : allStaffList.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                No branch staff registered yet. Add employees in Staff Manager.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid var(--color-separator)', textAlign: 'left', color: 'var(--color-label-secondary)' }}>
                      <th style={{ padding: '8px 10px' }}>Staff Name</th>
                      <th style={{ padding: '8px 10px' }}>Assigned Role</th>
                      <th style={{ padding: '8px 10px' }}>Home Branch</th>
                      <th style={{ padding: '8px 10px' }}>Multi-Outlet Scope</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allStaffList.map((emp, i) => {
                      const isOwner = emp.role === 'admin' || emp.role === 'franchise_owner';
                      return (
                        <tr key={emp.id || i} style={{ borderBottom: '1px solid var(--color-separator-opaque, rgba(255,255,255,0.04))' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                            👤 {emp.name || 'Staff Member'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span 
                              style={{ 
                                fontSize: 10, 
                                padding: '2px 7px', 
                                borderRadius: 5, 
                                background: isOwner ? '#8b5cf622' : 'var(--color-bg-tertiary)',
                                color: isOwner ? '#8b5cf6' : 'var(--color-label)',
                                fontWeight: 800,
                                textTransform: 'uppercase'
                              }}
                            >
                              {emp.role || 'Cashier'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--color-label-secondary)' }}>
                            🏢 {emp.restaurantName}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span className={`badge ${isOwner ? 'badge-blue' : 'badge-green'}`} style={{ fontSize: 10 }}>
                              {isOwner ? 'Global (All Stores)' : 'Branch Dedicated'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ color: '#10b981', fontWeight: 700, fontSize: 11 }}>● Active</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">New Restaurant</h2>
              <button className="btn btn-secondary btn-icon" onClick={()=>setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Restaurant Name</label>
                <input id="new-rest-name" className="form-input" placeholder="My Restaurant" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input id="new-rest-address" className="form-input" placeholder="Street, City" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input id="new-rest-phone" className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select id="new-rest-currency" className="form-select" value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
                    {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="create-restaurant-btn" onClick={createRestaurant} disabled={saving}>
                {saving?'Creating...':'Create Restaurant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
