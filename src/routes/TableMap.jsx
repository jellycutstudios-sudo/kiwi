import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useTableStore } from '../stores/tableStore';
import { useOrderStore } from '../stores/orderStore';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { formatCurrency } from '../utils/formatCurrency';
import { printReceipt } from '../utils/print';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import {
  ZoomIn, ZoomOut, Maximize2, LayoutGrid, Grid, Map as MapIcon, Search, X, Plus, Printer,
  ArrowRightLeft, GitMerge, DoorOpen, CheckCircle2, Utensils, Clock, TrendingUp,
  Users, Banknote, CreditCard, QrCode, Layers, Trash2, Sliders, Download
} from 'lucide-react';
import './admin/FloorPlanEditor.css';

/* ─── Elapsed time badge helper ─────────────────────────────── */
function elapsedColor(mins) {
  if (mins >= 90) return { bg: 'rgba(239,68,68,0.15)', color: '#dc2626' };
  if (mins >= 60) return { bg: 'rgba(245,158,11,0.15)', color: '#d97706' };
  if (mins >= 30) return { bg: 'rgba(59,130,246,0.12)', color: '#2563eb' };
  return { bg: 'rgba(16,185,129,0.12)', color: '#059669' };
}

function formatElapsed(mins) {
  if (!mins || mins <= 0) return 'Just seated';
  if (mins < 60) return `${mins}m seated`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m seated` : `${hrs}h seated`;
  const days = Math.floor(hrs / 24);
  return `${days}d seated`;
}

export default function TableMap() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restaurant = useAuthStore(s => s.restaurant);
  const staffDoc = useAuthStore(s => s.staffDoc);
  const canEditLayout = !staffDoc || ['admin', 'super_admin', 'manager', 'owner'].includes(staffDoc?.role);

  const tables = useTableStore(s => s.tables);
  const subscribe = useTableStore(s => s.subscribe);
  const freeTable = useTableStore(s => s.freeTable);
  const addTable = useTableStore(s => s.addTable);
  const updateTable = useTableStore(s => s.updateTable);
  const deleteTable = useTableStore(s => s.deleteTable);

  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);
  const loadOrderToCart = useOrderStore(s => s.loadOrderToCart);
  const settleOrder = useOrderStore(s => s.settleOrder);
  const clearCart = useOrderStore(s => s.clearCart);
  const setTable = useOrderStore(s => s.setTable);
  const setOrderType = useOrderStore(s => s.setOrderType);

  const [selected, setSelected] = useState(null);
  const [tableOrders, setTableOrders] = useState({});
  const [reservations, setReservations] = useState([]);

  // Modals
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [isSettling, setIsSettling] = useState(false);

  // Layout Editing state
  const [isEditingLayout, setIsEditingLayout] = useState(() => searchParams.get('edit') === 'true');
  const [selectedEditTableId, setSelectedEditTableId] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragTablePos, setDragTablePos] = useState(null);
  const activeDragRef = useRef(null);
  const isActuallyDragged = useRef(false);
  const [emptyFloors, setEmptyFloors] = useState([]);
  const [showAddFloorModal, setShowAddFloorModal] = useState(false);
  const [newFloorName, setNewFloorName] = useState('');
  const [autoAddFirstTable, setAutoAddFirstTable] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const todayStr = new Date().toISOString().split('T')[0];

  // View mode: 'grid' (clean, organized Petpooja-style table cards) or 'map' (2D layout)
  const [viewMode, setViewMode] = useState(() => (searchParams.get('edit') === 'true' ? 'map' : 'grid'));

  // Ensure map mode when edit parameter is present
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditingLayout(true);
      setViewMode('map');
    }
  }, [searchParams]);

  // Grid density: 'compact' (fits 30+ tables on screen with zero scroll) vs 'comfortable' (larger cards with inline buttons)
  const [gridDensity, setGridDensity] = useState(() => {
    return localStorage.getItem('dineos_table_density') || 'compact';
  });

  const handleDensityChange = (density) => {
    setGridDensity(density);
    localStorage.setItem('dineos_table_density', density);
  };

  const [activeFloor, setActiveFloor] = useState('Ground Floor');
  const allFloors = useMemo(() => {
    const list = ['Ground Floor'];
    if (restaurant?.floors && Array.isArray(restaurant.floors)) {
      list.push(...restaurant.floors);
    }
    tables.forEach(t => {
      if (t.floor) list.push(t.floor);
    });
    list.push(...emptyFloors);
    return Array.from(new Set(list.filter(Boolean)));
  }, [tables, emptyFloors, restaurant?.floors]);

  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef(null);
  const popoverRef = useRef(null);
  const canvasRef = useRef(null);

  // Live ticker for elapsed times
  const [nowTime, setNowTime] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTime(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const floorTables = useMemo(() => {
    return tables.filter(t => (t.floor || 'Ground Floor') === activeFloor);
  }, [tables, activeFloor]);

  const sortedFloorTables = useMemo(() => {
    return [...floorTables].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })
    );
  }, [floorTables]);

  const resolvedTables = useMemo(() => {
    return floorTables.map((t, idx) => {
      const isThisDragging = isEditingLayout && dragTablePos && dragTablePos.id === t.id;
      // Default to neat grid slot if table has no saved coordinates
      const defaultX = 70 + (idx % 4) * 200;
      const defaultY = 60 + Math.floor(idx / 4) * 170;
      return {
        ...t,
        renderX: isThisDragging ? dragTablePos.x : (t.x ?? defaultX),
        renderY: isThisDragging ? dragTablePos.y : (t.y ?? defaultY),
        renderW: t.w ?? ((Number(t.capacity) || 4) > 6 ? 110 : 90),
        renderH: t.h ?? ((Number(t.capacity) || 4) > 6 ? 110 : 90),
      };
    });
  }, [floorTables, isEditingLayout, dragTablePos]);

  const canvasHeight = useMemo(() => {
    let maxY = 650;
    resolvedTables.forEach(t => {
      const bottom = (t.renderY || 0) + (t.renderH || 90) + 80;
      if (bottom > maxY) maxY = bottom;
    });
    return maxY;
  }, [resolvedTables]);

  const floorMetrics = useMemo(() => {
    let free = 0, occupied = 0, reserved = 0, liveRevenue = 0;
    floorTables.forEach(t => {
      const order = tableOrders[t.id];
      const isOccupied = (order && order.status !== 'billed' && order.status !== 'cancelled') || t.status === 'occupied';
      const isReserved = !isOccupied && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');
      if (isOccupied) { occupied++; if (order?.total) liveRevenue += order.total; }
      else if (isReserved) reserved++;
      else free++;
    });
    return { free, occupied, reserved, liveRevenue };
  }, [floorTables, tableOrders, reservations]);

  const handleAutoAlign = async () => {
    if (!floorTables.length) {
      toast.error('No tables on this floor to align');
      return;
    }
    if (!restaurant?.id) {
      toast.error('Restaurant details not loaded');
      return;
    }

    // Switch to map view so the aligned layout is visible
    setViewMode('map');

    const sorted = [...floorTables].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })
    );

    const COLS = 4;
    const COL_W = 200;
    const ROW_H = 170;
    const MX = 70;
    const MY = 60;

    // Prepare target coordinates
    const updatesMap = new Map();
    sorted.forEach((t, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const isLarge = (Number(t.capacity) || 4) > 6;
      updatesMap.set(t.id, {
        x: MX + col * COL_W,
        y: MY + row * ROW_H,
        w: isLarge ? 110 : 90,
        h: isLarge ? 110 : 90,
      });
    });

    // 1. Instant optimistic update: tables glide into position with 0ms delay
    useTableStore.setState(prev => ({
      tables: prev.tables.map(t => {
        const u = updatesMap.get(t.id);
        return u ? { ...t, ...u } : t;
      })
    }));

    toast.loading('Auto-aligning tables...', { id: 'auto-align' });

    // 2. Persist atomically to Firestore via writeBatch
    try {
      await useAuthStore.getState().ensureAnonymousAuth();
      const batch = writeBatch(db);
      sorted.forEach(t => {
        const ref = doc(db, 'restaurants', restaurant.id, 'tables', t.id);
        batch.update(ref, updatesMap.get(t.id));
      });
      await batch.commit();
      toast.success(`Aligned ${sorted.length} tables cleanly!`, { id: 'auto-align', icon: '📐' });
    } catch (e) {
      console.warn('Batch write failed, attempting individual updates:', e);
      try {
        await Promise.all(sorted.map(t => updateTable(restaurant.id, t.id, updatesMap.get(t.id))));
        toast.success(`Aligned ${sorted.length} tables cleanly!`, { id: 'auto-align', icon: '📐' });
      } catch (err) {
        toast.error('Failed to save layout: ' + err.message, { id: 'auto-align' });
      }
    }
  };

  const toggleEditLayout = () => {
    setIsEditingLayout(prev => {
      const next = !prev;
      if (next) {
        setViewMode('map');
        setSelected(null);
      } else {
        setSelectedEditTableId(null);
        setDragging(null);
      }
      return next;
    });
  };

  const handleAddTable = async () => {
    if (!restaurant?.id) return;
    const currentFloorTables = tables.filter(t => (t.floor || 'Ground Floor') === activeFloor);
    const count = currentFloorTables.length;
    const prefix = activeFloor === 'Ground Floor' ? 'T' : activeFloor[0].toUpperCase();

    // Calculate smart grid position so newly added tables don't stack on top of each other
    const col = count % 4;
    const row = Math.floor(count / 4);
    const posX = 60 + col * 180;
    const posY = 60 + row * 160;

    try {
      await addTable(restaurant.id, {
        name: `${prefix}${count + 1}`,
        capacity: 4,
        shape: 'rect',
        x: Math.min(posX, 800),
        y: Math.min(posY, 500),
        w: 90,
        h: 90,
        floor: activeFloor,
      });
      toast.success(`Table ${prefix}${count + 1} added to ${activeFloor}! Drag to position it.`, { icon: '🍽️' });
    } catch (err) {
      toast.error('Failed to add table: ' + err.message);
    }
  };

  const handleAddFloor = () => {
    setNewFloorName('');
    setAutoAddFirstTable(true);
    setShowAddFloorModal(true);
  };

  const handleConfirmAddFloor = async (e) => {
    if (e) e.preventDefault();
    const cleanName = newFloorName.trim();
    if (!cleanName) {
      toast.error('Please enter a floor or area name');
      return;
    }
    if (allFloors.some(f => f.toLowerCase() === cleanName.toLowerCase())) {
      toast.error('A floor with this name already exists');
      return;
    }

    try {
      setEmptyFloors(prev => Array.from(new Set([...prev, cleanName])));
      setActiveFloor(cleanName);

      // Persist floor to restaurant document in Firestore
      if (restaurant?.id) {
        try {
          await updateDoc(doc(db, 'restaurants', restaurant.id), {
            floors: arrayUnion(cleanName)
          });
        } catch (dbErr) {
          console.warn('Could not save floor to restaurant doc:', dbErr);
        }
      }

      // Auto-create initial table if enabled
      if (autoAddFirstTable && restaurant?.id) {
        const prefix = cleanName[0].toUpperCase();
        await addTable(restaurant.id, {
          name: `${prefix}1`,
          capacity: 4,
          shape: 'rect',
          x: 80,
          y: 80,
          w: 90,
          h: 90,
          floor: cleanName,
        });
        toast.success(`Floor "${cleanName}" created with Table ${prefix}1!`, { icon: '🏗️' });
      } else {
        toast.success(`Floor "${cleanName}" created! Add tables to design your layout.`, { icon: '🏗️' });
      }

      setNewFloorName('');
      setShowAddFloorModal(false);
    } catch (err) {
      toast.error('Failed to create floor: ' + err.message);
    }
  };

  const handleDeleteFloor = async (floorToDelete) => {
    if (floorToDelete === 'Ground Floor') {
      toast.error('Cannot delete default Ground Floor');
      return;
    }
    const hasTables = tables.some(t => (t.floor || 'Ground Floor') === floorToDelete);
    if (hasTables) {
      toast.error(`Cannot delete "${floorToDelete}" while it has tables. Remove or move tables first.`);
      return;
    }
    if (!window.confirm(`Delete empty floor "${floorToDelete}"?`)) return;
    setEmptyFloors(prev => prev.filter(f => f !== floorToDelete));
    if (restaurant?.id) {
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id), {
          floors: arrayRemove(floorToDelete)
        });
      } catch (err) {
        console.warn('Could not remove floor from restaurant doc:', err);
      }
    }
    setActiveFloor('Ground Floor');
    toast.success(`Floor "${floorToDelete}" removed`);
  };

  const handlePrintAllQRs = () => {
    if (!restaurant || tables.length === 0) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Pop-up blocked! Please allow popups for this site.');
      return;
    }

    const qrCardsHTML = tables.map(t => {
      const url = `${window.location.origin}/order/${restaurant.id}?tableId=${t.id}&tableName=${encodeURIComponent(t.name)}`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
      return `
        <div class="qr-card">
          <div class="rest-name">${restaurant.name || 'Restaurant'}</div>
          <div class="table-name">Table ${t.name}</div>
          <img class="qr-img" src="${qrSrc}" alt="QR for Table ${t.name}" />
          <div class="scan-instructions">Scan to view menu & order</div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Table QR Codes - ${restaurant.name}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: #f4f4f7;
              display: flex;
              flex-wrap: wrap;
              gap: 20px;
              justify-content: center;
            }
            .qr-card {
              background: #ffffff;
              border: 1.5px dashed #cccccc;
              border-radius: 12px;
              padding: 20px;
              width: 240px;
              text-align: center;
              box-shadow: 0 4px 6px rgba(0,0,0,0.05);
              page-break-inside: avoid;
            }
            .rest-name {
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #666666;
              margin-bottom: 4px;
            }
            .table-name {
              font-size: 24px;
              font-weight: 800;
              color: #111111;
              margin-bottom: 15px;
            }
            .qr-img {
              width: 180px;
              height: 180px;
              display: block;
              margin: 0 auto 12px auto;
            }
            .scan-instructions {
              font-size: 11px;
              color: #888888;
              font-weight: 500;
            }
            @media print {
              body { background: #ffffff; padding: 0; }
              .qr-card { box-shadow: none; border: 1px dashed #666666; }
            }
          </style>
        </head>
        <body>
          ${qrCardsHTML}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleCanvasMouseDown = (e, table) => {
    if (!isEditingLayout) return;
    e.preventDefault();
    e.stopPropagation();
    isActuallyDragged.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const curX = table.x ?? 80;
    const curY = table.y ?? 80;
    const offsetX = (e.clientX - rect.left) / zoom - curX;
    const offsetY = (e.clientY - rect.top) / zoom - curY;

    activeDragRef.current = {
      id: table.id,
      tableW: table.w ?? 90,
      tableH: table.h ?? 90,
      offsetX,
      offsetY,
      currentX: curX,
      currentY: curY,
      startX: e.clientX,
      startY: e.clientY
    };

    setDragging(table.id);
    setDragTablePos({ id: table.id, x: curX, y: curY });
  };

  useEffect(() => {
    if (!dragging) return;

    const handleWindowMouseMove = (e) => {
      const active = activeDragRef.current;
      if (!active) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (Math.hypot(e.clientX - active.startX, e.clientY - active.startY) > 5) {
        isActuallyDragged.current = true;
      }

      const rect = canvas.getBoundingClientRect();
      const rawX = (e.clientX - rect.left) / zoom - active.offsetX;
      const rawY = (e.clientY - rect.top) / zoom - active.offsetY;
      const x = Math.max(0, Math.min(rawX, 1000 - active.tableW));
      const y = Math.max(0, Math.min(rawY, 650 - active.tableH));
      const snapX = Math.round(x / 20) * 20;
      const snapY = Math.round(y / 20) * 20;

      active.currentX = snapX;
      active.currentY = snapY;
      setDragTablePos({ id: active.id, x: snapX, y: snapY });
    };

    const handleWindowMouseUp = async () => {
      const active = activeDragRef.current;
      if (active && restaurant?.id && isActuallyDragged.current) {
        try {
          await updateTable(restaurant.id, active.id, {
            x: active.currentX,
            y: active.currentY
          });
        } catch (err) {
          console.warn('Failed to save table position:', err);
        }
      }
      activeDragRef.current = null;
      setDragging(null);
      setDragTablePos(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [dragging, zoom, restaurant?.id, updateTable]);

  const selectedEditTable = useMemo(() => {
    return tables.find(t => t.id === selectedEditTableId);
  }, [tables, selectedEditTableId]);

  // Resize zoom
  useEffect(() => {
    const handleResize = () => {
      if (!wrapperRef.current) return;
      const width = wrapperRef.current.clientWidth;
      if (window.innerWidth <= 1024) setZoom(Math.min((width - 24) / 1000, 1));
      else setZoom(1);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // UPI modal state — stores { order, tableId, tableName } so modal is independent of `selected`
  const [upiOrderToSettle, setUpiOrderToSettle] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [upiRef, setUpiRef] = useState('');
  const [settlingUpi, setSettlingUpi] = useState(false);
  const clearUpiSettle = () => { setUpiOrderToSettle(null); setQrDataUrl(''); setUpiRef(''); settlingUpi && setSettlingUpi(false); };

  // Subscriptions
  useEffect(() => { if (!restaurant?.id) return; return subscribe(restaurant.id); }, [restaurant?.id, subscribe]);

  useEffect(() => {
    if (!restaurant?.id) return;
    return onSnapshot(
      query(collection(db, 'restaurants', restaurant.id, 'orders'),
        where('status', 'in', ['pending', 'preparing', 'ready', 'served']),
        where('type', '==', 'dine-in')),
      snap => {
        const map = {};
        snap.docs.forEach(d => { const data = d.data(); if (data.tableId) map[data.tableId] = { id: d.id, ...data }; });
        setTableOrders(map);
      }, err => console.warn('TableMap orders err:', err));
  }, [restaurant?.id]);

  useEffect(() => {
    if (!restaurant?.id) return;
    return onSnapshot(
      query(collection(db, 'restaurants', restaurant.id, 'reservations'),
        where('date', '==', todayStr), where('status', '==', 'confirmed')),
      snap => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('TableMap reservations err:', err));
  }, [restaurant?.id, todayStr]);

  // Generate UPI QR
  const selectedTable = tables.find(t => t.id === selected);
  const currency = restaurant?.currency ?? 'INR';
  const selectedOrder = selected ? tableOrders[selected] : null;

  useEffect(() => {
    if (!upiOrderToSettle) return;
    const vpa = restaurant?.upiConfig?.vpa || 'demo@upi';
    const name = restaurant?.upiConfig?.name || 'DineOS';
    const note = upiOrderToSettle.tableName ? `Table_${upiOrderToSettle.tableName}` : 'TableOrder';
    const url = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(name)}&am=${(upiOrderToSettle.order?.total ?? 0).toFixed(2)}&cu=${currency}&tn=${note}`;
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } })
      .then(u => setQrDataUrl(u))
      .catch(() => setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`));
  }, [upiOrderToSettle, restaurant, currency]);

  // Escape key to close popover
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Click outside popover to close
  useEffect(() => {
    if (!selected) return;
    const handler = e => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        // Check if it's a table button click (handled by table click handler)
        if (e.target.closest('.table-item')) return;
        setSelected(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selected]);

  const handleSettle = async (method) => {
    if (!selectedOrder || isSettling) return;
    setIsSettling(true);
    try {
      await settleOrder(restaurant.id, selectedOrder.id, method, selectedOrder.total);
      await freeTable(restaurant.id, selected);
      setSelected(null);
      toast.success(`Settled via ${method.toUpperCase()} ✓ Table freed`, { icon: '💳' });
    } catch (err) { toast.error('Settle failed: ' + err.message); }
    finally { setIsSettling(false); }
  };

  const handlePrintBill = () => {
    if (!selectedOrder) return;
    printReceipt({ restaurant, order: selectedOrder, items: selectedOrder.items, taxInfo: selectedOrder.taxInfo, staffName: selectedOrder.customerName || 'Waiter' });
    toast.success('Bill sent to printer!', { icon: '🖨️' });
  };

  const handleAddItems = () => {
    if (!selectedOrder) return;
    loadOrderToCart(selectedOrder);
    toast.success(`Loaded ${selectedTable.name} order to cart`);
    navigate('/pos');
  };

  const handleTableClick = useCallback((t, e, effectiveStatus) => {
    if (isEditingLayout) {
      if (isActuallyDragged.current) {
        isActuallyDragged.current = false;
        return;
      }
      e.stopPropagation();
      setSelectedEditTableId(t.id);
      return;
    }
    if (effectiveStatus === 'free') {
      // Direct one-click: open POS for this table
      clearCart();
      setTable(t.id, t.name);
      setOrderType('dine-in');
      toast.success(`New order started for ${t.name}`);
      navigate('/pos');
      return;
    }
    // Occupied / reserved: toggle modal
    setSelected(prev => (prev === t.id ? null : t.id));
  }, [isEditingLayout, clearCart, setTable, setOrderType, navigate]);

  /* ─── Chairs renderer (clean, non-distracting) ────────────── */
  const renderChairs = (table, isOccupied) => {
    const chairs = [];
    const capacity = table.capacity || 4;
    const w = table.w || 90;
    const h = table.h || 90;
    const shape = table.shape || 'rect';

    if (shape === 'round') {
      const radius = Math.min(w, h) / 2;
      const dist = radius + 3;
      for (let i = 0; i < capacity; i++) {
        const angle = (i * 2 * Math.PI) / capacity - Math.PI / 2;
        chairs.push(
          <div key={i} className="table-chair chair-round"
            style={{ left: radius + dist * Math.cos(angle) - 4, top: radius + dist * Math.sin(angle) - 4, width: 8, height: 8, borderRadius: '50%', background: isOccupied ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.2)', border: 'none', boxShadow: 'none' }} />
        );
      }
    } else {
      let topC, botC, leftC, rightC;
      if (capacity <= 3) {
        topC = 1;
        botC = capacity >= 2 ? 1 : 0;
        leftC = capacity >= 3 ? 1 : 0;
        rightC = 0;
      } else {
        topC = Math.ceil(capacity / 4);
        botC = Math.floor(capacity / 4) + (capacity % 4 >= 2 ? 1 : 0);
        leftC = Math.floor(capacity / 4) + (capacity % 4 >= 3 ? 1 : 0);
        rightC = Math.floor(capacity / 4);
      }
      const addEdge = (count, edge) => {
        const span = (edge === 'top' || edge === 'bottom') ? w : h;
        const step = span / (count + 1);
        for (let i = 0; i < count; i++) {
          const off = (i + 1) * step;
          let style = { background: isOccupied ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.2)', border: 'none', boxShadow: 'none' };
          if (edge === 'top') style = { ...style, left: off - 6, top: -5, width: 12, height: 4, borderRadius: '2px 2px 0 0' };
          else if (edge === 'bottom') style = { ...style, left: off - 6, top: h + 1, width: 12, height: 4, borderRadius: '0 0 2px 2px' };
          else if (edge === 'left') style = { ...style, left: -5, top: off - 6, width: 4, height: 12, borderRadius: '2px 0 0 2px' };
          else style = { ...style, left: w + 1, top: off - 6, width: 4, height: 12, borderRadius: '0 2px 2px 0' };
          chairs.push(<div key={`${edge}-${i}`} className="table-chair" style={style} />);
        }
      };
      addEdge(topC, 'top'); addEdge(botC, 'bottom'); addEdge(leftC, 'left'); addEdge(rightC, 'right');
    }
    return chairs;
  };

  /* ─── Derived: order status for popover ─────────────────────── */
  const selOrder = selected ? tableOrders[selected] : null;
  const selElapsedMins = selOrder?.createdAt
    ? Math.max(0, Math.floor((nowTime - (selOrder.createdAt.toDate ? selOrder.createdAt.toDate() : new Date(selOrder.createdAt)).getTime()) / 60000))
    : 0;

  return (
    <div className="tm-root">
      {/* ═══ CONSOLIDATED UNIFIED TOOLBAR ═══ */}
      <div className="tm-toolbar" style={{ alignItems: 'center', gap: 10, padding: '6px 0', flexWrap: 'wrap' }}>
        {/* 1. Floor Tabs */}
        <div className="tm-floor-tabs">
          {allFloors.map(floor => {
            const floorCount = tables.filter(t => (t.floor || 'Ground Floor') === floor).length;
            const isCanDelete = isEditingLayout && floor !== 'Ground Floor' && floorCount === 0;
            return (
              <div key={floor} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <button
                  type="button"
                  className={`tm-floor-tab ${activeFloor === floor ? 'tm-floor-tab--active' : ''}`}
                  onClick={() => { setActiveFloor(floor); setSelected(null); }}
                >
                  {floor}
                  <span className="tm-floor-badge">
                    {floorCount}
                  </span>
                </button>
                {isCanDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFloor(floor); }}
                    style={{
                      border: 'none',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      borderRadius: '50%',
                      width: 18,
                      height: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginLeft: -10,
                      marginRight: 4,
                      zIndex: 3
                    }}
                    title={`Delete empty floor "${floor}"`}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {isEditingLayout && (
            <button
              type="button"
              className="tm-floor-tab"
              onClick={handleAddFloor}
              style={{ border: '1px dashed var(--color-separator-opaque)', color: 'var(--color-accent)', fontWeight: 700, gap: 4 }}
              title="Add a new dining floor or area"
            >
              <Plus size={12} /> Add Floor
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 22, background: 'var(--color-separator)', margin: '0 2px' }} />

        {/* 2. Filter Pills with live counts & Revenue chip */}
        <div className="tm-filter-pills" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[
            { key: 'all', label: `All (${floorTables.length})` },
            { key: 'free', label: `🟢 Free (${floorMetrics.free})` },
            { key: 'occupied', label: `🔴 Seated (${floorMetrics.occupied})` },
            ...(floorMetrics.reserved > 0 ? [{ key: 'reserved', label: `⭐ Reserved (${floorMetrics.reserved})` }] : []),
          ].map(p => (
            <button
              key={p.key}
              type="button"
              className={`tm-pill ${statusFilter === p.key ? 'tm-pill--active tm-pill--' + p.key : ''}`}
              onClick={() => setStatusFilter(statusFilter === p.key && p.key !== 'all' ? 'all' : p.key)}
            >
              {p.label}
            </button>
          ))}
          {floorMetrics.liveRevenue > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                fontWeight: 700,
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                padding: '3px 9px',
                borderRadius: 999
              }}
              title="Current live dining room revenue on this floor"
            >
              <TrendingUp size={12} /> {formatCurrency(floorMetrics.liveRevenue, currency)}
            </span>
          )}
        </div>

        {/* 3. Right: Search + Density + View Switcher + Edit Layout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {/* Compact Search */}
          <div className="tm-search" style={{ height: 30, minWidth: 150, maxWidth: 200 }}>
            <Search size={12} className="tm-search-icon" />
            <input
              type="text"
              placeholder="Find table…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="tm-search-input"
              style={{ fontSize: 12 }}
            />
            {searchQuery && <button className="tm-search-clear" onClick={() => setSearchQuery('')}><X size={11} /></button>}
          </div>

          {/* Density toggle (Grid mode only) */}
          {viewMode === 'grid' && (
            <div style={{
              display: 'inline-flex',
              padding: 2,
              background: 'var(--color-bg-secondary)',
              borderRadius: 8,
              border: '1px solid var(--color-separator)'
            }}>
              <button
                type="button"
                className={`btn btn-xs ${gridDensity === 'compact' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 6, height: 26, fontSize: 11, fontWeight: 700, gap: 4, padding: '0 8px' }}
                onClick={() => handleDensityChange('compact')}
                title="High-density zero-scroll grid"
              >
                <Grid size={12} /> Compact
              </button>
              <button
                type="button"
                className={`btn btn-xs ${gridDensity === 'comfortable' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 6, height: 26, fontSize: 11, fontWeight: 700, gap: 4, padding: '0 8px' }}
                onClick={() => handleDensityChange('comfortable')}
                title="Detailed cards with buttons"
              >
                <LayoutGrid size={12} /> Detailed
              </button>
            </div>
          )}

          {/* View mode toggle */}
          <div style={{
            display: 'inline-flex',
            padding: 2,
            background: 'var(--color-bg-secondary)',
            borderRadius: 8,
            border: '1px solid var(--color-separator)'
          }}>
            <button
              type="button"
              className={`btn btn-xs ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 6, height: 26, fontSize: 11, fontWeight: 700, gap: 4, padding: '0 10px' }}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid size={12} /> Grid
            </button>
            <button
              type="button"
              className={`btn btn-xs ${viewMode === 'map' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 6, height: 26, fontSize: 11, fontWeight: 700, gap: 4, padding: '0 10px' }}
              onClick={() => setViewMode('map')}
            >
              <MapIcon size={12} /> Floor Map
            </button>
          </div>

          {/* Edit Layout toggle */}
          {canEditLayout && (
            <button
              type="button"
              className={`btn btn-xs ${isEditingLayout ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                borderRadius: 8,
                height: 30,
                fontSize: 11,
                fontWeight: 700,
                gap: 5,
                padding: '0 12px',
                background: isEditingLayout ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--color-bg-secondary)',
                border: isEditingLayout ? 'none' : '1px solid var(--color-separator)',
                color: isEditingLayout ? '#fff' : 'var(--color-label)',
                boxShadow: isEditingLayout ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
                transition: 'all 0.2s ease',
              }}
              onClick={toggleEditLayout}
              title={isEditingLayout ? 'Done editing layout' : 'Customize table positions and floor layout'}
            >
              {isEditingLayout ? <CheckCircle2 size={13} /> : <Sliders size={13} />}
              {isEditingLayout ? 'Done' : 'Edit Layout'}
            </button>
          )}
        </div>
      </div>

      {/* ═══ STUDIO TOOLBAR (Active when editing layout) ═══ */}
      {isEditingLayout && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(37,99,235,0.06))',
          border: '1.5px solid rgba(59,130,246,0.3)',
          borderRadius: 14,
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 10,
          boxShadow: '0 4px 12px rgba(59,130,246,0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.02em'
            }}>
              <Sliders size={12} /> Studio Mode
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-label-secondary)', fontWeight: 500 }}>
              Drag tables to position (snaps to grid) • Click any table to customize seats, shape, or delete
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-xs btn-primary"
              onClick={handleAddTable}
              style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 5, padding: '0 12px' }}
            >
              <Plus size={13} /> Add Table
            </button>
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              onClick={handleAddFloor}
              style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 5, padding: '0 12px' }}
            >
              <Layers size={13} /> Add Floor
            </button>
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              onClick={handlePrintAllQRs}
              disabled={tables.length === 0}
              style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 5, padding: '0 12px' }}
            >
              <Printer size={13} /> Print All QRs
            </button>
            <button
              type="button"
              className="btn btn-xs btn-secondary"
              onClick={handleAutoAlign}
              disabled={floorTables.length === 0}
              style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 5, padding: '0 12px' }}
            >
              <LayoutGrid size={13} /> Auto-Align
            </button>
            <button
              type="button"
              className="btn btn-xs"
              onClick={() => setIsEditingLayout(false)}
              style={{
                height: 30,
                fontSize: 11,
                fontWeight: 800,
                gap: 5,
                padding: '0 14px',
                background: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: 8
              }}
            >
              <CheckCircle2 size={13} /> Done Editing
            </button>
          </div>
        </div>
      )}

      {/* ═══ VIEW MODE: QUICK GRID (PETPOOJA / TOAST STYLE) ═══ */}
      {viewMode === 'grid' ? (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: gridDensity === 'compact' ? '12px 16px 30px' : '16px 20px 40px',
          display: 'grid',
          gridTemplateColumns: gridDensity === 'compact'
            ? 'repeat(auto-fill, minmax(130px, 1fr))'
            : 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: gridDensity === 'compact' ? 10 : 14,
          alignContent: 'start',
          background: 'var(--color-bg)',
          borderRadius: 20,
          border: '1.5px solid var(--color-separator-opaque)'
        }}>
          {sortedFloorTables
            .filter(t => {
              const order = tableOrders[t.id];
              const hasOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
              const effectiveStatus = hasOrder ? 'occupied' : (t.status || 'free');
              const isReserved = !hasOrder && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');

              if (statusFilter === 'free' && effectiveStatus !== 'free') return false;
              if (statusFilter === 'occupied' && effectiveStatus !== 'occupied') return false;
              if (statusFilter === 'reserved' && !isReserved) return false;

              if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchName = t.name.toLowerCase().includes(q);
                const matchCap = String(t.capacity).includes(q);
                const matchWaiter = order?.assignedWaiterName?.toLowerCase().includes(q) || order?.staffName?.toLowerCase().includes(q);
                return matchName || matchCap || matchWaiter;
              }
              return true;
            })
            .map(t => {
              const order = tableOrders[t.id];
              const hasOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
              const effectiveStatus = hasOrder ? 'occupied' : (t.status || 'free');
              const isReserved = !hasOrder && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');
              const resForTable = reservations.find(r => r.tableId === t.id);

              let elapsedMins = 0;
              if (hasOrder && order.createdAt) {
                const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                elapsedMins = Math.max(0, Math.floor((nowTime - d.getTime()) / 60000));
              }

              /* ─── COMPACT TILE MODE (Petpooja zero-scroll style for 20+ tables) ─── */
              if (gridDensity === 'compact') {
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      if (effectiveStatus === 'free') {
                        clearCart();
                        setTable(t.id, t.name);
                        setOrderType('dine-in');
                        toast.success(`Order started for ${t.name}`);
                        navigate('/pos');
                      } else {
                        setSelected(t.id);
                      }
                    }}
                    style={{
                      background: effectiveStatus === 'occupied'
                        ? 'rgba(239, 68, 68, 0.05)'
                        : 'var(--color-bg-elevated)',
                      border: effectiveStatus === 'occupied'
                        ? '2px solid rgba(239, 68, 68, 0.7)'
                        : isReserved
                        ? '2px solid rgba(245, 158, 11, 0.7)'
                        : '1.5px solid var(--color-separator)',
                      borderRadius: '14px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '92px',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.15s ease',
                      boxShadow: selected === t.id
                        ? '0 0 0 2px var(--color-accent), 0 8px 20px rgba(0,0,0,0.15)'
                        : effectiveStatus === 'occupied'
                        ? '0 3px 10px rgba(239,68,68,0.12)'
                        : '0 1px 3px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Top Row: Name & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--color-label)', letterSpacing: '-0.3px' }}>
                          {t.name}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginLeft: 5, fontWeight: 600 }}>
                          👥{t.capacity}
                        </span>
                      </div>
                      {effectiveStatus === 'occupied' ? (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />
                          {elapsedMins > 0 ? formatElapsed(elapsedMins).replace(' seated', '') : 'BUSY'}
                        </span>
                      ) : isReserved ? (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          RES
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 999,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.25)'
                        }}>
                          FREE
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Bill total or Tap to Order */}
                    <div style={{ marginTop: 4 }}>
                      {effectiveStatus === 'occupied' && order ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>
                            {formatCurrency(order.total ?? 0, currency)}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)', fontWeight: 600 }}>
                            {(order.items ?? []).length} items
                          </span>
                        </div>
                      ) : isReserved ? (
                        <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {resForTable?.name || 'Reserved'}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: '#10b981', fontWeight: 800 }}>⚡</span>
                          <span>Start Order</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              /* ─── DETAILED / COMFORTABLE CARD MODE ─── */
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    if (effectiveStatus === 'free') {
                      clearCart();
                      setTable(t.id, t.name);
                      setOrderType('dine-in');
                      toast.success(`Order started for ${t.name}`);
                      navigate('/pos');
                    } else {
                      setSelected(t.id);
                    }
                  }}
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: effectiveStatus === 'occupied'
                      ? '1.5px solid rgba(239, 68, 68, 0.45)'
                      : isReserved
                      ? '1.5px solid rgba(245, 158, 11, 0.45)'
                      : '1.5px solid var(--color-separator)',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '175px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: selected === t.id
                      ? '0 0 0 2px var(--color-accent), 0 8px 24px rgba(0,0,0,0.12)'
                      : effectiveStatus === 'occupied'
                      ? '0 4px 14px rgba(239,68,68,0.08)'
                      : '0 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Top Bar: Table Name + Status Badge */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 21, fontWeight: 900, color: 'var(--color-label)', letterSpacing: '-0.3px' }}>
                        {t.name}
                      </span>
                      {effectiveStatus === 'occupied' ? (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                          OCCUPIED
                        </span>
                      ) : isReserved ? (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          ⭐ RESERVED
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                          VACANT
                        </span>
                      )}
                    </div>

                    {/* Capacity & Elapsed Time */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 11, color: 'var(--color-label-secondary)' }}>
                      <span>👥 {t.capacity} Guests</span>
                      {hasOrder && elapsedMins > 0 && (
                        <>
                          <span>·</span>
                          <span style={{ color: elapsedMins > 60 ? '#f87171' : 'var(--color-label-tertiary)', fontWeight: 600 }}>
                            ⏱️ {formatElapsed(elapsedMins)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Middle Info */}
                  <div style={{ margin: '10px 0 6px' }}>
                    {effectiveStatus === 'occupied' && order ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                          {formatCurrency(order.total ?? 0, currency)}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-label-secondary)' }}>
                          <span>👤 {order.assignedWaiterName || order.staffName || 'Walter'}</span>
                          <span>{(order.items ?? []).length} {(order.items ?? []).length === 1 ? 'item' : 'items'}</span>
                        </div>
                      </div>
                    ) : isReserved ? (
                      <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                        <div style={{ fontWeight: 700, color: '#f59e0b' }}>{resForTable?.name || 'Guest'}</div>
                        <div>{resForTable?.time ? `At ${resForTable.time}` : 'Reserved Today'}</div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-label-tertiary)', fontSize: 12 }}>
                        <span style={{ fontSize: 18 }}>🍽️</span>
                        <span>Available for seating</span>
                      </div>
                    )}
                  </div>

                  {/* Footer Quick Action Buttons */}
                  <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 10, display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {effectiveStatus === 'occupied' && order ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          style={{ flex: 1, height: 30, fontSize: 11, fontWeight: 700, gap: 4 }}
                          onClick={() => {
                            loadOrderToCart(order);
                            navigate('/pos');
                          }}
                          title="Add items to this table"
                        >
                          <Plus size={12} /> Add
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          style={{ height: 30, fontSize: 11, fontWeight: 600, padding: '0 8px' }}
                          onClick={() => {
                            printReceipt({ restaurant, order, items: order.items, taxInfo: order.taxInfo, staffName: order.customerName || 'Waiter' });
                            toast.success('Bill printed!');
                          }}
                          title="Print customer bill"
                        >
                          <Printer size={13} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          style={{ height: 30, fontSize: 11, fontWeight: 700, padding: '0 10px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}
                          onClick={() => setSelected(t.id)}
                          title="Settle bill payment"
                        >
                          Settle
                        </button>
                      </>
                    ) : isReserved ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        style={{ width: '100%', height: 30, fontSize: 11, fontWeight: 700, background: '#f59e0b', border: 'none' }}
                        onClick={() => setSelected(t.id)}
                      >
                        🪑 View / Seat
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        style={{ width: '100%', height: 32, fontSize: 12, fontWeight: 700, gap: 5 }}
                        onClick={() => {
                          clearCart();
                          setTable(t.id, t.name);
                          setOrderType('dine-in');
                          toast.success(`Order started for ${t.name}`);
                          navigate('/pos');
                        }}
                      >
                        ⚡ Start Order
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          {sortedFloorTables.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--color-label-tertiary)' }}>
              No tables found on this floor.
            </div>
          )}
        </div>
      ) : (
        /* ═══ VIEW MODE: 2D FLOOR MAP CANVAS ═══ */
        <div className="tm-canvas-wrapper" ref={wrapperRef}>
          {/* Zoom Controls */}
          <div className="canvas-zoom-controls">
            <button type="button" className="zoom-btn" onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.1) * 10) / 10))} disabled={zoom <= 0.25} title="Zoom Out"><ZoomOut size={16} /></button>
            <span className="zoom-val">{Math.round(zoom * 100)}%</span>
            <button type="button" className="zoom-btn" onClick={() => setZoom(z => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))} disabled={zoom >= 2.0} title="Zoom In"><ZoomIn size={16} /></button>
            <button type="button" className="zoom-btn fit-btn" onClick={() => { if (wrapperRef.current) setZoom(Math.min((wrapperRef.current.clientWidth - 24) / 1000, 1)); }} title="Fit Screen"><Maximize2 size={12} /> Fit</button>
            <button type="button" className="zoom-btn align-btn" onClick={handleAutoAlign} title="Auto-align grid" style={{ borderLeft: '1px solid var(--color-separator)', padding: '0 10px', width: 'auto', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>
              <LayoutGrid size={13} /><span>Auto-Align</span>
            </button>
          </div>

          {/* Legend overlay */}
          <div className="tm-canvas-legend">
            {isEditingLayout ? (
              <>
                <span className="tm-legend-item"><span className="tm-legend-dot" style={{ background: '#3b82f6' }} />Editing Layout (Snaps to 20px grid)</span>
                <span className="tm-legend-item"><span className="tm-legend-dot" style={{ background: '#10b981' }} />Click table to edit name & seats</span>
              </>
            ) : (
              <>
                <span className="tm-legend-item"><span className="tm-legend-dot" style={{ background: '#22c55e' }} />Free → click to start order</span>
                <span className="tm-legend-item"><span className="tm-legend-dot" style={{ background: '#ef4444' }} />Seated → click for actions</span>
              </>
            )}
          </div>

          <div className="table-canvas-scroll-area">
            <div className="table-canvas-scroll-container" style={{ width: `${1000 * zoom}px`, height: `${canvasHeight * zoom}px` }}>
              <div
                className={`table-canvas ${isEditingLayout ? 'editing' : ''}`}
                ref={canvasRef}
                style={{ transform: `scale(${zoom})`, height: `${canvasHeight}px` }}
              >
                {resolvedTables.map(t => {
                  const order = tableOrders[t.id];
                  const hasOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
                  const effectiveStatus = hasOrder ? 'occupied' : (t.status || 'free');
                  const isReserved = !hasOrder && (reservations.some(r => r.tableId === t.id) || t.status === 'reserved');
                  const isSelected = selected === t.id;
                  const isEditSelected = isEditingLayout && selectedEditTableId === t.id;
                  const isCurrentDragging = isEditingLayout && dragging === t.id;

                  if (statusFilter === 'free' && effectiveStatus !== 'free') return null;
                  if (statusFilter === 'occupied' && effectiveStatus !== 'occupied') return null;
                  if (statusFilter === 'reserved' && !isReserved) return null;

                  const isMatch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(t.capacity).includes(searchQuery);

                  let elapsedMins = 0;
                  if (hasOrder && order.createdAt) {
                    const d = order.createdAt.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
                    elapsedMins = Math.max(0, Math.floor((nowTime - d.getTime()) / 60000));
                  }
                  const ec = elapsedColor(elapsedMins);

                  return (
                    <button
                      key={t.id}
                      id={`map-table-${t.id}`}
                      onClick={e => handleTableClick(t, e, effectiveStatus)}
                      onMouseDown={isEditingLayout ? e => handleCanvasMouseDown(e, t) : undefined}
                      className={`table-item ${t.shape === 'round' ? 'round' : 'rect'} ${isEditSelected ? 'status-selected' : isSelected ? 'status-selected' : `status-${effectiveStatus}`}`}
                      style={{
                        position: 'absolute',
                        left: t.renderX, top: t.renderY,
                        width: t.renderW, height: t.renderH,
                        opacity: isMatch ? 1 : 0.2,
                        filter: isMatch ? 'none' : 'grayscale(80%)',
                        cursor: isEditingLayout ? (isCurrentDragging ? 'grabbing' : 'grab') : 'pointer',
                        outline: isEditSelected ? '2px solid #3b82f6' : 'none',
                        boxShadow: isEditSelected ? '0 0 0 4px rgba(59,130,246,0.35), 0 8px 24px rgba(0,0,0,0.35)' : undefined,
                        zIndex: isCurrentDragging ? 100 : isEditSelected ? 50 : 1,
                        transition: isCurrentDragging ? 'none' : 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                        userSelect: 'none',
                      }}
                      title={
                        isEditingLayout
                          ? `Drag to reposition ${t.name}, click to edit properties`
                          : effectiveStatus === 'free'
                          ? `Click to start order at ${t.name}`
                          : `Click to manage ${t.name}`
                      }
                    >
                      {renderChairs(t, effectiveStatus === 'occupied')}

                      <span className="table-label">{t.name}</span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <span className="table-capacity">👥 {t.capacity}p</span>
                        {!isEditingLayout && hasOrder && elapsedMins > 0 && (
                          <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '999px', background: ec.bg, color: ec.color, display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            ⏱️ {elapsedMins < 60 ? `${elapsedMins}m` : elapsedMins < 1440 ? `${Math.floor(elapsedMins / 60)}h` : `${Math.floor(elapsedMins / 1440)}d`}
                          </span>
                        )}
                      </div>

                      {!isEditingLayout && hasOrder && (
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#ef4444,#dc2626)', padding: '2px 7px', borderRadius: '999px', marginTop: '4px', boxShadow: '0 2px 6px rgba(220,38,38,0.35)', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(order.total ?? 0, currency)}
                        </span>
                      )}

                      {!isEditingLayout && isReserved && effectiveStatus === 'free' && (
                        <span style={{ position: 'absolute', top: -6, right: -6, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', boxShadow: '0 2px 6px rgba(217,119,6,.35)', fontWeight: 'bold', border: '2px solid #fff', zIndex: 4 }} title="Reserved Today">
                          ⭐
                        </span>
                      )}

                      {/* Quick action hint on hover for free tables in service mode */}
                      {!isEditingLayout && effectiveStatus === 'free' && (
                        <span className="tm-quick-hint">⚡ Start</span>
                      )}

                      {/* Edit mode indicator on table card */}
                      {isEditingLayout && (
                        <span style={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          fontSize: 10,
                          background: 'rgba(0,0,0,0.5)',
                          borderRadius: '50%',
                          width: 16,
                          height: 16,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          pointerEvents: 'none',
                          zIndex: 5
                        }}>
                          ✎
                        </span>
                      )}
                    </button>
                  );
                })}

                {tables.length === 0 && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-label-tertiary)', gap: 'var(--space-3)' }}>
                    <div style={{ fontSize: 40 }}>🗺️</div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--color-label)' }}>No tables configured yet</div>
                    <div style={{ fontSize: 13 }}>Click below to create your first table in this floor plan</div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleAddTable} style={{ marginTop: 8, gap: 5 }}>
                      <Plus size={14} /> Add Table
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

        {/* ═══ TABLE DETAILS MODAL / DRAWER ═══ — opens seamlessly when clicking any table */}
        {selected && selectedTable && (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              backdropFilter: 'blur(5px)',
            }}
            onClick={() => setSelected(null)}
          >
            <div
              ref={popoverRef}
              className="animate-scale-in"
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '430px',
                maxHeight: '90vh',
                zIndex: 1001,
                overflowY: 'auto',
                boxShadow: '0 24px 70px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.12)',
                borderRadius: '24px',
                pointerEvents: 'all',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-separator-opaque, rgba(255, 255, 255, 0.12))',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* ─ Clean Header ─ */}
              <div style={{
                padding: '18px 20px 14px',
                borderBottom: '1px solid var(--color-separator)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ fontSize: 21, fontWeight: 800, margin: 0, color: 'var(--color-label)', letterSpacing: '-0.4px' }}>
                      Table {selectedTable.name}
                    </h3>
                    {selOrder ? (
                      <span style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        fontWeight: 700,
                        borderRadius: 999,
                        background: 'rgba(239, 68, 68, 0.14)',
                        color: '#ef4444',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                        Occupied
                      </span>
                    ) : (
                      <span style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        fontWeight: 700,
                        borderRadius: 999,
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                        Available
                      </span>
                    )}
                  </div>

                  {/* Sub-meta tags */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-label-secondary)',
                      background: 'var(--color-bg-secondary)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--color-separator)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}>
                      <Users size={12} /> {selectedTable.capacity} Guests
                    </span>

                    {selOrder && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: selElapsedMins > 60 ? '#f87171' : 'var(--color-label-secondary)',
                        background: 'var(--color-bg-secondary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--color-separator)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <Clock size={12} /> {formatElapsed(selElapsedMins)}
                      </span>
                    )}

                    {selOrder && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--color-label-secondary)',
                        background: 'var(--color-bg-secondary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--color-separator)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        👤 {selOrder.assignedWaiterName || selOrder.staffName || 'Walter'}
                      </span>
                    )}

                    {selOrder && (
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--color-label-secondary)',
                        background: 'var(--color-bg-secondary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        border: '1px solid var(--color-separator)'
                      }}>
                        #{selOrder.id.slice(-6).toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-secondary btn-icon btn-sm"
                  onClick={() => setSelected(null)}
                  style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }}
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>

              {selOrder ? (
                <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* High-Frequency 1-Tap Actions: Add Items (POS) & Print Bill */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button
                      className="btn btn-primary"
                      style={{
                        height: 44,
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 700,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)'
                      }}
                      onClick={handleAddItems}
                      title="Open order in POS to add more items"
                    >
                      <Plus size={17} /> Add Items
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{
                        height: 44,
                        borderRadius: 'var(--radius-md)',
                        fontWeight: 600,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        border: '1px solid var(--color-separator-opaque)'
                      }}
                      onClick={handlePrintBill}
                      title="Print customer receipt bill"
                    >
                      <Printer size={16} /> Print Bill
                    </button>
                  </div>

                  {/* Order Items Breakdown Box */}
                  <div style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '16px',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    border: '1px solid var(--color-separator)'
                  }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                      color: 'var(--color-label-tertiary)',
                      paddingBottom: 2
                    }}>
                      <span>Order Items ({(selOrder.items ?? []).length})</span>
                      <span>Amount</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '200px', overflowY: 'auto' }}>
                      {(selOrder.items ?? []).map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 800,
                              background: 'var(--color-bg-elevated)',
                              border: '1px solid var(--color-separator)',
                              padding: '2px 7px',
                              borderRadius: 5,
                              color: 'var(--color-label)',
                              marginTop: 1,
                              flexShrink: 0
                            }}>
                              {item.qty}×
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ color: 'var(--color-label)', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>
                                {item.name}
                              </span>
                              {(item.variantMatrixSelection || item.selectedModifiers?.length > 0 || item.notes) && (
                                <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                                  {[
                                    item.variantMatrixSelection ? Object.values(item.variantMatrixSelection).join(' · ') : null,
                                    item.selectedModifiers?.map(m => m.name).join(', '),
                                    item.notes
                                  ].filter(Boolean).join(' | ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8, fontSize: 13 }}>
                            {formatCurrency(item.price * item.qty, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                    
                    {/* Total Due Banner */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 12,
                      marginTop: 4,
                      borderTop: '1px dashed var(--color-separator)'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label-secondary)' }}>Total Due</span>
                        <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)' }}>All taxes & charges incl.</span>
                      </div>
                      <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--color-label)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                        {formatCurrency(selOrder.total ?? 0, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Kitchen Status Tracker */}
                  {selOrder.status !== 'served' && (
                    <div style={{
                      background: 'var(--color-bg-secondary)',
                      borderRadius: '12px',
                      padding: '10px 14px',
                      border: '1px solid var(--color-separator)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      <div className="tm-status-progress" style={{ padding: '0', borderBottom: 'none' }}>
                        {['pending', 'preparing', 'ready', 'served'].map((s, i) => {
                          const idx = ['pending', 'preparing', 'ready', 'served'].indexOf(selOrder.status);
                          return (
                            <div key={s} className={`tm-step ${i <= idx ? 'tm-step--done' : ''} ${i === idx ? 'tm-step--current' : ''}`}>
                              <div className="tm-step-dot" />
                              <span className="tm-step-label">{s}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Advance kitchen status button */}
                      {selOrder.status === 'pending' || selOrder.status === 'preparing' ? (
                        <button className="btn btn-secondary btn-sm" style={{ height: 32, width: '100%', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                          onClick={async () => { await updateOrderStatus(restaurant.id, selOrder.id, 'ready'); toast.success('Order marked ready!'); }}>
                          <CheckCircle2 size={14} color="#10b981" /> Advance to Ready
                        </button>
                      ) : selOrder.status === 'ready' ? (
                        <button className="btn btn-sm" style={{ height: 32, width: '100%', background: '#10b981', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                          onClick={async () => { await updateOrderStatus(restaurant.id, selOrder.id, 'served'); toast.success('Served to table! ✓'); }}>
                          <Utensils size={14} /> Mark as Served
                        </button>
                      ) : null}
                    </div>
                  )}

                    {/* Settle Bill 1-Touch Payment Tiles */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--color-label-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>💳</span> Settle Bill
                      </div>
                      {selOrder.paymentMethod === 'unpaid' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                          <button
                            type="button"
                            className="btn tm-settle-tile tm-settle-cash"
                            disabled={isSettling}
                            onClick={() => handleSettle('cash')}
                            title="Settle full bill with Cash"
                          >
                            <Banknote size={22} strokeWidth={2.4} className="tm-settle-icon" />
                            <span className="tm-settle-name">Cash</span>
                            <span className="tm-settle-desc">1-Tap Free</span>
                          </button>
                          <button
                            type="button"
                            className="btn tm-settle-tile tm-settle-card"
                            disabled={isSettling}
                            onClick={() => handleSettle('card')}
                            title="Settle full bill with Credit/Debit Card"
                          >
                            <CreditCard size={22} strokeWidth={2.4} className="tm-settle-icon" />
                            <span className="tm-settle-name">Card</span>
                            <span className="tm-settle-desc">Swipe / POS</span>
                          </button>
                          <button
                            type="button"
                            className="btn tm-settle-tile tm-settle-upi"
                            disabled={isSettling}
                            onClick={() => setUpiOrderToSettle({ order: selOrder, tableId: selectedTable?.id, tableName: selectedTable?.name })}
                            title="Show UPI QR Code for instant mobile payment"
                          >
                            <QrCode size={22} strokeWidth={2.4} className="tm-settle-icon" />
                            <span className="tm-settle-name">UPI QR</span>
                            <span className="tm-settle-desc">Scan & Pay</span>
                          </button>
                        </div>
                      ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        color: '#10b981',
                        fontWeight: 700,
                        fontSize: 13
                      }}>
                        <span>✓ Settled via {selOrder.paymentMethod?.toUpperCase()}</span>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ height: 30, fontSize: 12, fontWeight: 700 }}
                          onClick={async () => {
                            await updateOrderStatus(restaurant.id, selOrder.id, 'billed');
                            await freeTable(restaurant.id, selectedTable.id);
                            setSelected(null);
                            toast.success('Table freed!');
                          }}
                        >
                          <DoorOpen size={13} /> Free Table
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Secondary Table Actions: Move, Merge, Free */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid var(--color-separator)' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, height: 34, fontSize: 12, border: '1px solid var(--color-separator)', color: 'var(--color-label-secondary)' }}
                      onClick={() => setShowTransfer(true)}
                    >
                      <ArrowRightLeft size={13} /> Move Table
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, height: 34, fontSize: 12, border: '1px solid var(--color-separator)', color: 'var(--color-label-secondary)' }}
                      onClick={() => setShowMerge(true)}
                    >
                      <GitMerge size={13} /> Merge Tables
                    </button>
                  </div>
                </div>
              ) : (
                /* ─ FREE TABLE POPOVER ─ */
                (() => {
                  const resForTable = reservations.find(r => r.tableId === selectedTable.id);
                  if (resForTable) {
                    return (
                      <div className="tm-reservation-card">
                        <div className="tm-res-header">📅 Reserved at {resForTable.time}</div>
                        <div className="tm-res-name">{resForTable.name}</div>
                        <div className="tm-res-detail">{resForTable.phone} · {resForTable.partySize} guests</div>
                        {resForTable.notes && <div className="tm-res-notes">{resForTable.notes}</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button className="btn btn-primary" style={{ flex: 1, height: 36, fontSize: 13, background: '#f59e0b', border: 'none' }}
                            onClick={async () => {
                              try {
                                await updateDoc(doc(db, 'restaurants', restaurant.id, 'reservations', resForTable.id), { status: 'seated' });
                                await updateDoc(doc(db, 'restaurants', restaurant.id, 'tables', selectedTable.id), { status: 'occupied' });
                                toast.success(`Seated ${resForTable.name} at ${selectedTable.name}!`);
                                setSelected(null);
                              } catch (e) { toast.error('Failed: ' + e.message); }
                            }}>
                            🪑 Seat Guest
                          </button>
                          <button className="btn btn-primary" style={{ flex: 1, height: 36, fontSize: 13 }}
                            onClick={() => { clearCart(); setTable(selectedTable.id, selectedTable.name); setOrderType('dine-in'); toast.success(`Order started for ${selectedTable.name}`); navigate('/pos'); }}>
                            ⚡ Start Order
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="tm-free-cta">
                      <div className="tm-free-icon">🍽️</div>
                      <div className="tm-free-label">Table Available</div>
                      <div className="tm-free-hint">Tap to start a new dine-in order</div>
                      <button className="btn btn-primary" style={{ width: '100%', height: 42, marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 700 }}
                        onClick={() => { clearCart(); setTable(selectedTable.id, selectedTable.name); setOrderType('dine-in'); toast.success(`Order started for ${selectedTable.name}`); navigate('/pos'); }}>
                        ⚡ Start Order for {selectedTable.name}
                      </button>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}

        {/* ═══ TABLE PROPERTIES MODAL (Studio / Edit Mode) ═══ */}
        {isEditingLayout && selectedEditTable && (
          <div
            className="modal-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              background: 'rgba(0, 0, 0, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              backdropFilter: 'blur(5px)',
            }}
            onClick={() => setSelectedEditTableId(null)}
          >
            <div
              className="animate-scale-in"
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 440,
                background: 'var(--color-bg-elevated)',
                border: '1.5px solid var(--color-separator-opaque)',
                borderRadius: 20,
                boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-separator)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20 }}>🪑</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>
                      Table {selectedEditTable.name}
                    </h3>
                    <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>
                      Customize seats, shape & QR code
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-danger btn-xs"
                    onClick={() => {
                      if (window.confirm(`Delete Table ${selectedEditTable.name}?`)) {
                        deleteTable(restaurant.id, selectedEditTable.id);
                        setSelectedEditTableId(null);
                        toast.success(`Table ${selectedEditTable.name} removed`);
                      }
                    }}
                    style={{ height: 28, fontSize: 11, fontWeight: 700, gap: 4, padding: '0 8px' }}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setSelectedEditTableId(null)}
                    style={{ width: 28, height: 28, padding: 0, borderRadius: '50%' }}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '75vh', overflowY: 'auto' }}>
                {/* Table Name */}
                <div className="fpe-form-group">
                  <label className="fpe-label">Table Name / Number</label>
                  <input
                    className="fpe-input"
                    value={selectedEditTable.name}
                    onChange={e => updateTable(restaurant.id, selectedEditTable.id, { name: e.target.value })}
                    placeholder="e.g. T1, Bar 2, Patio 4"
                  />
                </div>

                {/* Capacity */}
                <div className="fpe-form-group">
                  <label className="fpe-label">Capacity (Seats)</label>
                  <input
                    className="fpe-input"
                    type="number"
                    min={1}
                    max={50}
                    value={selectedEditTable.capacity ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        updateTable(restaurant.id, selectedEditTable.id, { capacity: '' });
                      } else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) updateTable(restaurant.id, selectedEditTable.id, { capacity: num });
                      }
                    }}
                    onBlur={() => {
                      if (!selectedEditTable.capacity || selectedEditTable.capacity < 1) {
                        updateTable(restaurant.id, selectedEditTable.id, { capacity: 1 });
                      } else if (selectedEditTable.capacity > 50) {
                        updateTable(restaurant.id, selectedEditTable.id, { capacity: 50 });
                      }
                    }}
                  />
                </div>

                {/* Shape */}
                <div className="fpe-form-group">
                  <label className="fpe-label">Table Shape</label>
                  <div className="fpe-segmented">
                    <button
                      type="button"
                      className={`fpe-segment-btn ${selectedEditTable.shape !== 'round' ? 'active' : ''}`}
                      onClick={() => updateTable(restaurant.id, selectedEditTable.id, { shape: 'rect' })}
                    >
                      <span>▭</span> Rectangle
                    </button>
                    <button
                      type="button"
                      className={`fpe-segment-btn ${selectedEditTable.shape === 'round' ? 'active' : ''}`}
                      onClick={() => updateTable(restaurant.id, selectedEditTable.id, { shape: 'round' })}
                    >
                      <span>⭕</span> Circle
                    </button>
                  </div>
                </div>

                {/* Size */}
                <div className="fpe-form-group">
                  <label className="fpe-label">Display Size</label>
                  <div className="fpe-range-container">
                    <input
                      type="range"
                      min={60}
                      max={150}
                      className="fpe-range"
                      value={selectedEditTable.w ?? 90}
                      onChange={e => {
                        const s = parseInt(e.target.value, 10);
                        updateTable(restaurant.id, selectedEditTable.id, { w: s, h: s });
                      }}
                    />
                    <span className="fpe-range-val">{selectedEditTable.w ?? 90}px</span>
                  </div>
                </div>

                {/* Floor Location */}
                <div className="fpe-form-group">
                  <label className="fpe-label">Floor / Area</label>
                  <select
                    className="fpe-input"
                    value={selectedEditTable.floor ?? 'Ground Floor'}
                    onChange={e => {
                      const nextFloor = e.target.value;
                      updateTable(restaurant.id, selectedEditTable.id, { floor: nextFloor });
                      setActiveFloor(nextFloor);
                      toast.success(`Moved table to ${nextFloor}`);
                    }}
                  >
                    {allFloors.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                {/* QR Code Section */}
                <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 14 }}>
                  <label className="fpe-label">Customer Dine-In QR Code</label>
                  {(() => {
                    const qrUrl = `${window.location.origin}/order/${restaurant?.id}?tableId=${selectedEditTable.id}&tableName=${encodeURIComponent(selectedEditTable.name)}`;
                    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`;
                    return (
                      <div className="fpe-qr-card">
                        <div className="fpe-qr-wrapper">
                          <img className="fpe-qr-img" src={qrSrc} alt={`QR for Table ${selectedEditTable.name}`} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', textAlign: 'center' }}>
                          Customers can scan this code to browse menu & order directly.
                        </div>
                        <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, fontSize: 12, gap: 5 }}
                            onClick={() => window.open(qrSrc, '_blank')}
                          >
                            <Download size={13} /> Download
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, fontSize: 12, gap: 5 }}
                            onClick={() => {
                              const pw = window.open('', '_blank');
                              if (!pw) { toast.error('Pop-up blocked'); return; }
                              pw.document.write(`
                                <html>
                                  <head>
                                    <title>Table ${selectedEditTable.name} QR</title>
                                    <style>
                                      body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                                      .card { border: 2px dashed #999; border-radius: 12px; padding: 24px; text-align: center; width: 220px; }
                                      h2 { margin: 0 0 12px; font-size: 20px; }
                                      p { font-size: 11px; color: #666; margin-top: 10px; }
                                    </style>
                                  </head>
                                  <body>
                                    <div class="card">
                                      <h2>${restaurant?.name || 'Restaurant'}</h2>
                                      <div style="font-weight: 800; font-size: 24px; margin-bottom: 12px;">Table ${selectedEditTable.name}</div>
                                      <img src="${qrSrc}" width="160" height="160" />
                                      <p>Scan to order & pay</p>
                                    </div>
                                    <script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>
                                  </body>
                                </html>
                              `);
                              pw.document.close();
                            }}
                          >
                            <Printer size={13} /> Print
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--color-separator)',
                display: 'flex',
                justifyContent: 'flex-end',
                background: 'var(--color-bg-secondary)',
              }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setSelectedEditTableId(null)}
                  style={{ padding: '0 20px', fontWeight: 700 }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ═══ MOVE TABLE MODAL ═══ */}
      {showTransfer && selectedTable && selOrder && (
        <div className="modal-overlay" onClick={() => setShowTransfer(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔀 Move Table</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowTransfer(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginBottom: 4 }}>Move order from <strong>{selectedTable.name}</strong> to:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {tables.filter(t => {
                  if (t.id === selectedTable.id) return false;
                  const order = tableOrders[t.id];
                  const hasActiveOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
                  return !hasActiveOrder && t.status !== 'occupied';
                }).map(t => (
                  <button key={t.id} type="button" className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}
                    onClick={async () => {
                      const res = await useOrderStore.getState().transferTable(restaurant.id, selectedTable.id, t.id, selOrder.id, t.name);
                      if (res.ok) { toast.success(`Moved to ${t.name}!`); setSelected(null); setShowTransfer(false); }
                      else toast.error('Move failed: ' + res.error);
                    }}>
                    <span style={{ fontWeight: 700 }}>🪑 {t.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>{t.capacity} seats</span>
                  </button>
                ))}
                {tables.filter(t => {
                  if (t.id === selectedTable.id) return false;
                  const order = tableOrders[t.id];
                  const hasActiveOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
                  return !hasActiveOrder && t.status !== 'occupied';
                }).length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)' }}>No vacant tables available</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MERGE BILLS MODAL ═══ */}
      {showMerge && selectedTable && selOrder && (
        <div className="modal-overlay" onClick={() => setShowMerge(false)}>
          <div className="modal animate-slide-up" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔗 Merge Bills</h3>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowMerge(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--color-label-secondary)', marginBottom: 4 }}>Merge <strong>{selectedTable.name}</strong> into:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {tables.filter(t => {
                  if (t.id === selectedTable.id) return false;
                  const order = tableOrders[t.id];
                  const hasActiveOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
                  return hasActiveOrder;
                }).map(t => (
                  <button key={t.id} type="button" className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}
                    onClick={async () => {
                      const primaryOrder = tableOrders[t.id];
                      if (!primaryOrder) return;
                      const res = await useOrderStore.getState().mergeTables(restaurant.id, t.id, selectedTable.id, primaryOrder.id, selOrder.id);
                      if (res.ok) { toast.success(`Merged into ${t.name}!`); setSelected(null); setShowMerge(false); }
                      else toast.error('Merge failed: ' + res.error);
                    }}>
                    <span style={{ fontWeight: 700 }}>🪑 {t.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)' }}>{formatCurrency(tableOrders[t.id]?.total ?? 0, currency)}</span>
                  </button>
                ))}
                {tables.filter(t => {
                  if (t.id === selectedTable.id) return false;
                  const order = tableOrders[t.id];
                  const hasActiveOrder = order && order.status !== 'billed' && order.status !== 'cancelled';
                  return hasActiveOrder;
                }).length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)' }}>No other occupied tables</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ UPI SETTLE MODAL ═══ */}
      {upiOrderToSettle && (
        <div
          className="modal-overlay"
          onClick={clearUpiSettle}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: '16px' }}
        >
          <div
            className="modal"
            style={{ maxWidth: 380, width: '100%', borderRadius: 20, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.35)', border: '1.5px solid var(--color-separator-opaque)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--color-separator)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>📱</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>Collect UPI Payment</h3>
                  <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>{upiOrderToSettle.tableName} · Scan &amp; confirm when paid</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={clearUpiSettle} style={{ width: 28, height: 28, padding: 0, borderRadius: '50%' }}><X size={14} /></button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', padding: '20px 20px 12px' }}>
              {/* Amount hero */}
              <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)', borderRadius: 'var(--radius-lg)', padding: '14px 20px', width: '100%' }}>
                <div style={{ fontSize: 10, opacity: 0.8, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4, color: '#fff' }}>{upiOrderToSettle.tableName?.toUpperCase()} · TOTAL DUE</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{formatCurrency(upiOrderToSettle.order?.total ?? 0, currency)}</div>
              </div>

              {/* QR Code */}
              <div style={{ background: '#fff', padding: 12, borderRadius: 'var(--radius-lg)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)', width: 220, height: 220, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {qrDataUrl
                  ? <img src={qrDataUrl} alt="UPI QR" style={{ width: 196, height: 196, display: 'block', borderRadius: 4 }} />
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 28, height: 28, border: '3px solid var(--color-accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      <span style={{ color: 'var(--color-label-tertiary)', fontSize: 11 }}>Generating QR…</span>
                    </div>
                }
              </div>

              {/* App logos & VPA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-label)' }}>📲 Scan with any UPI app</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['GPay', 'PhonePe', 'Paytm', 'BHIM'].map(app => (
                    <span key={app} style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-label-secondary)', padding: '2px 6px', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-separator-opaque)' }}>{app}</span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>VPA: <strong style={{ color: 'var(--color-accent)' }}>{restaurant?.upiConfig?.vpa || 'demo@upi'}</strong></div>
                {!restaurant?.upiConfig?.vpa && (
                  <div style={{ fontSize: 9, color: 'var(--color-orange)', background: 'rgba(255,149,0,0.1)', padding: '2px 8px', borderRadius: 'var(--radius-sm)' }}>⚠️ Demo VPA — configure in Settings</div>
                )}
              </div>

              {/* Ref input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', textAlign: 'left', borderTop: '1px solid var(--color-separator)', paddingTop: 12 }}>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 0 }}>UPI Transaction Ref (Optional)</label>
                <input className="form-input" placeholder="Last 4–6 digits of UPI Ref No." value={upiRef} onChange={e => setUpiRef(e.target.value)} style={{ height: 34, fontSize: 12 }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--color-separator)', background: 'var(--color-bg-elevated)' }}>
              <button className="btn btn-secondary" onClick={clearUpiSettle} style={{ flex: '0 0 auto', padding: '0 16px', height: 42, borderRadius: 12 }}>Cancel</button>
              <button
                className="btn btn-success"
                disabled={settlingUpi}
                style={{ flex: 1, height: 42, borderRadius: 12, fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={async () => {
                  setSettlingUpi(true);
                  try {
                    const orderId = upiOrderToSettle.order?.id;
                    const tableId = upiOrderToSettle.tableId;
                    const total = upiOrderToSettle.order?.total ?? 0;
                    await settleOrder(restaurant.id, orderId, 'upi', total, upiRef ? { upiRef } : {});
                    await freeTable(restaurant.id, tableId);
                    clearUpiSettle();
                    setSelected(null);
                    toast.success('Bill settled via UPI! Table freed.', { icon: '💳' });
                  } catch (err) { toast.error('Settle failed: ' + err.message); }
                  finally { setSettlingUpi(false); }
                }}
              >
                {settlingUpi ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Settling…</> : <>✓ Confirm Settled</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ═══ ADD FLOOR MODAL ═══ */}
      {showAddFloorModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            backdropFilter: 'blur(5px)',
          }}
          onClick={() => setShowAddFloorModal(false)}
        >
          <div
            className="animate-scale-in"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 440,
              background: 'var(--color-bg-elevated)',
              border: '1.5px solid var(--color-separator-opaque)',
              borderRadius: 20,
              boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-separator)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🏗️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>
                    Add New Dining Floor / Area
                  </h3>
                  <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>
                    Organize tables across rooms, patios, or floors
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setShowAddFloorModal(false)}
                style={{ width: 28, height: 28, padding: 0, borderRadius: '50%' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleConfirmAddFloor} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="fpe-form-group">
                <label className="fpe-label">Floor or Area Name</label>
                <input
                  autoFocus
                  className="fpe-input"
                  placeholder="e.g. First Floor, Rooftop, Patio, Garden"
                  value={newFloorName}
                  onChange={e => setNewFloorName(e.target.value)}
                />
              </div>

              {/* Quick suggestions */}
              <div>
                <label className="fpe-label" style={{ marginBottom: 6, display: 'block' }}>Quick Suggestions</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['First Floor', 'Second Floor', 'Rooftop', 'Outdoor Patio', 'Terrace', 'Garden', 'VIP Lounge', 'Bar Area', 'Mezzanine'].map(sugg => (
                    <button
                      key={sugg}
                      type="button"
                      className="btn btn-xs btn-ghost"
                      style={{
                        borderRadius: 999,
                        fontSize: 11,
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-separator)',
                        padding: '4px 10px',
                        color: newFloorName === sugg ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                        fontWeight: newFloorName === sugg ? 700 : 500
                      }}
                      onClick={() => setNewFloorName(sugg)}
                    >
                      + {sugg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Option to auto-add first table */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: 'var(--color-bg-secondary)',
                borderRadius: 12,
                border: '1px solid var(--color-separator)',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--color-label)'
              }}>
                <input
                  type="checkbox"
                  checked={autoAddFirstTable}
                  onChange={e => setAutoAddFirstTable(e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#2563eb' }}
                />
                <span style={{ fontWeight: 600 }}>Create first table automatically (Table 1)</span>
              </label>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAddFloorModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ padding: '0 18px', fontWeight: 700 }}
                  disabled={!newFloorName.trim()}
                >
                  Create Floor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
