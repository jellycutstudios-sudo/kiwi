import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useTableStore } from '../../stores/tableStore';
import { Plus, Trash2, Printer, Download, Layers, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import toast from 'react-hot-toast';
import './FloorPlanEditor.css';

export default function FloorPlanEditor() {
  const { restaurant } = useAuthStore();
  const { tables, subscribe, addTable, updateTable, deleteTable } = useTableStore();
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const wrapperRef = useRef(null);

  const [activeFloor, setActiveFloor] = useState('Ground Floor');
  const [emptyFloors, setEmptyFloors] = useState([]);

  const allFloors = Array.from(new Set([
    'Ground Floor',
    ...tables.map(t => t.floor || 'Ground Floor'),
    ...emptyFloors
  ]));

  useEffect(() => {
    if (!restaurant?.id) return;
    return subscribe(restaurant.id);
  }, [restaurant?.id, subscribe]);

  useEffect(() => {
    const handleResize = () => {
      if (!wrapperRef.current) return;
      const width = wrapperRef.current.clientWidth;
      if (window.innerWidth <= 1024) {
        const fitZoom = Math.min((width - 24) / 1000, 1);
        setZoom(fitZoom);
      } else {
        setZoom(1);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = (e, table) => {
    e.preventDefault();
    setDragging(table.id);
    setSelected(table.id);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - table.x,
      y: (e.clientY - rect.top) / zoom - table.y
    });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / zoom - dragOffset.x;
    const rawY = (e.clientY - rect.top) / zoom - dragOffset.y;
    const table = tables.find(t => t.id === dragging);
    const tableW = table?.w ?? 80;
    const tableH = table?.h ?? 80;
    const x = Math.max(0, Math.min(rawX, 1000 - tableW));
    const y = Math.max(0, Math.min(rawY, 650 - tableH));
    updateTable(restaurant.id, dragging, { x: Math.round(x / 40) * 40, y: Math.round(y / 40) * 40 });
  };

  const handleMouseUp = () => setDragging(null);

  const handleAddTable = () => {
    const floorTables = tables.filter(t => (t.floor || 'Ground Floor') === activeFloor);
    const prefix = activeFloor === 'Ground Floor' ? 'G' : activeFloor[0].toUpperCase();
    addTable(restaurant.id, {
      name: `${prefix}${floorTables.length + 1}`,
      capacity: 4,
      shape: 'rect',
      x: 80, y: 80,
      w: 80, h: 80,
      floor: activeFloor,
    });
  };

  const handleAddFloor = () => {
    const name = prompt('Enter new floor name (e.g. Mezzanine, Rooftop, Outdoor):');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    if (allFloors.includes(cleanName)) {
      toast.error('Floor already exists');
      return;
    }
    setEmptyFloors(prev => [...prev, cleanName]);
    setActiveFloor(cleanName);
    toast.success(`Floor "${cleanName}" added! Add tables to save it.`);
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
              body {
                background: #ffffff;
                padding: 0;
              }
              .qr-card {
                box-shadow: none;
                border: 1px dashed #666666;
              }
            }
          </style>
        </head>
        <body>
          ${qrCardsHTML}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const selectedTable = tables.find(t => t.id === selected);

  // Construct selected table QR URL
  const selectedTableQrUrl = selectedTable 
    ? `${window.location.origin}/order/${restaurant?.id}?tableId=${selectedTable.id}&tableName=${encodeURIComponent(selectedTable.name)}`
    : '';
  const selectedTableQrImg = selectedTable
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(selectedTableQrUrl)}`
    : '';

  // Render visual chairs dynamically around a table card
  const renderChairs = (table) => {
    const chairs = [];
    const capacity = table.capacity || 4;
    const size = table.w || 80;
    const shape = table.shape || 'rect';
    const isOccupied = table.status === 'occupied';

    const defaultEmojis = ['🍕', '🍹', '🍔', '🧁', '🍜', '☕', '🍩', '🌮', '🍣', '🍟', '🍷', '🍝', '😋', '🥤'];
    const hash = (table.id ?? '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    if (shape === 'round') {
      const radius = size / 2;
      const dist = radius + 4; // Distance from center to chair center
      for (let i = 0; i < capacity; i++) {
        const angle = (i * 2 * Math.PI) / capacity - Math.PI / 2;
        const x = radius + dist * Math.cos(angle) - 7;
        const y = radius + dist * Math.sin(angle) - 7;
        chairs.push(
          <div
            key={`chair-${i}`}
            className="table-chair"
            style={{ left: x, top: y }}
          />
        );

        if (isOccupied) {
          const emojiX = radius + (dist + 12) * Math.cos(angle) - 6;
          const emojiY = radius + (dist + 12) * Math.sin(angle) - 6;
          const emoji = defaultEmojis[(hash + i) % defaultEmojis.length];
          chairs.push(
            <span
              key={`chair-emoji-${i}`}
              className="chair-emoji"
              style={{
                left: emojiX,
                top: emojiY,
                animationDelay: `${i * 0.4}s`
              }}
            >
              {emoji}
            </span>
          );
        }
      }
    } else {
      // Rectangular table: distribute chairs along the 4 edges
      let topCount = 0;
      let bottomCount = 0;
      let leftCount = 0;
      let rightCount = 0;

      if (capacity === 1 || capacity === 2 || capacity === 3) {
        topCount = 1;
        if (capacity >= 2) bottomCount = 1;
        if (capacity >= 3) leftCount = 1;
      } else if (capacity > 3) {
        topCount = Math.ceil(capacity / 4);
        bottomCount = Math.floor(capacity / 4) + (capacity % 4 >= 2 ? 1 : 0);
        leftCount = Math.floor(capacity / 4) + (capacity % 4 >= 3 ? 1 : 0);
        rightCount = Math.floor(capacity / 4);
      }

      let chairIndex = 0;
      const addChairsForEdge = (count, edge) => {
        const step = size / (count + 1);
        for (let i = 0; i < count; i++) {
          const offset = (i + 1) * step;
          let style = {};
          let emojiStyle = {};
          if (edge === 'top') {
            style = { left: offset - 7, top: -11 };
            emojiStyle = { left: offset - 6, top: -25 };
          } else if (edge === 'bottom') {
            style = { left: offset - 7, top: size - 3 };
            emojiStyle = { left: offset - 6, top: size + 11 };
          } else if (edge === 'left') {
            style = { left: -11, top: offset - 7 };
            emojiStyle = { left: -25, top: offset - 6 };
          } else if (edge === 'right') {
            style = { left: size - 3, top: offset - 7 };
            emojiStyle = { left: size + 11, top: offset - 6 };
          }
          chairs.push(
            <div
              key={`chair-${edge}-${i}`}
              className="table-chair"
              style={style}
            />
          );

          if (isOccupied) {
            const emoji = defaultEmojis[(hash + chairIndex) % defaultEmojis.length];
            chairs.push(
              <span
                key={`chair-emoji-${edge}-${i}`}
                className="chair-emoji"
                style={{
                  ...emojiStyle,
                  animationDelay: `${chairIndex * 0.4}s`
                }}
              >
                {emoji}
              </span>
            );
            chairIndex++;
          }
        }
      };

      addChairsForEdge(topCount, 'top');
      addChairsForEdge(bottomCount, 'bottom');
      addChairsForEdge(leftCount, 'left');
      addChairsForEdge(rightCount, 'right');
    }

    return chairs;
  };

  return (
    <div className="fpe-container">
      {/* Toolbar */}
      <div className="fpe-toolbar">
        <div className="fpe-title-section">
          <h2 className="fpe-title">Floor Plan Editor</h2>
          <span className="fpe-subtitle">Arrange tables and generate customer QR codes</span>
        </div>
        <div className="fpe-actions">
          <button className="btn btn-primary" id="add-table-btn" onClick={handleAddTable} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Add Table
          </button>
          <button className="btn btn-secondary" id="add-floor-btn" onClick={handleAddFloor} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Layers size={15} /> Add Floor
          </button>
          <button 
            className="btn btn-secondary" 
            id="print-all-qrs-btn" 
            onClick={handlePrintAllQRs}
            disabled={tables.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={15} /> Print All QRs
          </button>
        </div>
        <div className="fpe-badge">
          {tables.length} tables configured
        </div>
      </div>

      {/* Floor Selection Tabs */}
      <div className="fpe-floor-tabs">
        {allFloors.map(floor => {
          const isActive = activeFloor === floor;
          const floorTableCount = tables.filter(t => (t.floor || 'Ground Floor') === floor).length;
          return (
            <button
              key={floor}
              type="button"
              className={`fpe-floor-btn ${isActive ? 'active' : ''}`}
              onClick={() => {
                setActiveFloor(floor);
                setSelected(null);
              }}
            >
              <span>{floor}</span>
              <span className="fpe-floor-count">
                {floorTableCount}
              </span>
            </button>
          );
        })}
      </div>

      <div className="fpe-workspace">
        {/* Canvas */}
        <div className="table-canvas-wrapper" ref={wrapperRef}>
          {/* Zoom Controls */}
          <div className="canvas-zoom-controls">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom(z => Math.max(0.25, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoom <= 0.25}
              title="Zoom Out"
            >
              <ZoomOut size={16} />
            </button>
            <span className="zoom-val">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom(z => Math.min(2.0, Math.round((z + 0.1) * 10) / 10))}
              disabled={zoom >= 2.0}
              title="Zoom In"
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              className="zoom-btn fit-btn"
              onClick={() => {
                if (wrapperRef.current) {
                  const width = wrapperRef.current.clientWidth;
                  const fitZoom = Math.min((width - 24) / 1000, 1);
                  setZoom(fitZoom);
                }
              }}
              title="Fit Screen"
            >
              <Maximize2 size={12} /> Fit
            </button>
          </div>

          <div className="table-canvas-scroll-area">
            <div
              className="table-canvas-scroll-container"
              style={{
                width: `${1000 * zoom}px`,
                height: `${650 * zoom}px`,
              }}
            >
              <div
                ref={canvasRef}
                className={`table-canvas ${dragging ? 'dragging' : ''}`}
                style={{
                  transform: `scale(${zoom})`,
                }}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {tables.filter(t => (t.floor || 'Ground Floor') === activeFloor).map(table => (
                  <div
                    key={table.id}
                    id={`table-item-${table.id}`}
                    className={`table-item ${table.shape === 'round' ? 'round' : 'rect'} ${selected === table.id ? 'status-selected' : `status-${table.status || 'free'}`}`}
                    style={{
                      left: table.x,
                      top: table.y,
                      width: table.w ?? 80,
                      height: table.h ?? 80,
                    }}
                    onMouseDown={e => handleMouseDown(e, table)}
                  >
                    {renderChairs(table)}
                    <div className="table-label">{table.name}</div>
                    <div className="table-capacity">
                      <span>👥</span> {table.capacity}p
                    </div>
                  </div>
                ))}
                {tables.filter(t => (t.floor || 'Ground Floor') === activeFloor).length === 0 && (
                  <div className="fpe-empty-canvas">
                    <div className="fpe-empty-icon">🗺️</div>
                    <div className="fpe-empty-text">No tables on this floor</div>
                    <div className="fpe-empty-sub">Click "Add Table" above to place your first table here, or move an existing table to this floor.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Properties panel */}
        {selectedTable && (
          <div className="fpe-sidebar">
            <div className="fpe-sidebar-header">
              <span className="fpe-sidebar-title">Table Properties</span>
              <button 
                className="btn btn-danger btn-xs" 
                id="delete-table-btn" 
                onClick={() => { deleteTable(restaurant.id, selected); setSelected(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
            <div className="fpe-sidebar-body">
              <div className="fpe-form-group">
                <label className="fpe-label">Table Name</label>
                <input
                  id="table-name-input"
                  className="fpe-input"
                  value={selectedTable.name}
                  onChange={e => updateTable(restaurant.id, selected, { name: e.target.value })}
                />
              </div>
              <div className="fpe-form-group">
                <label className="fpe-label">Capacity (Seats)</label>
                <input
                  id="table-capacity-input"
                  className="fpe-input"
                  type="number"
                  min={1}
                  max={20}
                  value={selectedTable.capacity}
                  onChange={e => updateTable(restaurant.id, selected, { capacity: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="fpe-form-group">
                <label className="fpe-label">Table Shape</label>
                <div className="fpe-segmented">
                  <button
                    id="shape-rect"
                    className={`fpe-segment-btn ${selectedTable.shape === 'rect' ? 'active' : ''}`}
                    onClick={() => updateTable(restaurant.id, selected, { shape: 'rect' })}
                  >
                    <span>▭</span> Rectangle
                  </button>
                  <button
                    id="shape-round"
                    className={`fpe-segment-btn ${selectedTable.shape === 'round' ? 'active' : ''}`}
                    onClick={() => updateTable(restaurant.id, selected, { shape: 'round' })}
                  >
                    <span>⭕</span> Circle
                  </button>
                </div>
              </div>
              <div className="fpe-form-group">
                <label className="fpe-label">Size</label>
                <div className="fpe-range-container">
                  <input
                    id="table-size-input"
                    className="fpe-range"
                    type="range"
                    min={60}
                    max={160}
                    value={selectedTable.w ?? 80}
                    onChange={e => updateTable(restaurant.id, selected, { w: parseInt(e.target.value), h: parseInt(e.target.value) })}
                  />
                  <span className="fpe-range-val">{selectedTable.w ?? 80}px</span>
                </div>
              </div>

              <div className="fpe-form-group">
                <label className="fpe-label">Floor Location</label>
                <select
                  id="table-floor-select"
                  className="fpe-input"
                  value={selectedTable.floor ?? 'Ground Floor'}
                  onChange={e => {
                    const nextFloor = e.target.value;
                    updateTable(restaurant.id, selected, { floor: nextFloor });
                    setActiveFloor(nextFloor);
                    toast.success(`Moved table to ${nextFloor}`);
                  }}
                >
                  {allFloors.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              {/* Table QR Code section */}
              <div className="fpe-form-group" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 'var(--space-4)' }}>
                <label className="fpe-label">Table QR Code</label>
                <div className="fpe-qr-card">
                  <div className="fpe-qr-wrapper">
                    <img className="fpe-qr-img" src={selectedTableQrImg} alt={`QR Code for Table ${selectedTable.name}`} />
                  </div>
                  <button
                    className="btn btn-secondary btn-sm fpe-qr-btn"
                    id="download-qr-btn"
                    onClick={() => window.open(selectedTableQrImg, '_blank')}
                  >
                    <Download size={14} /> Download QR
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

