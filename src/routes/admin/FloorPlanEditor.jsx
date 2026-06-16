import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useTableStore } from '../../stores/tableStore';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FloorPlanEditor() {
  const { restaurant } = useAuthStore();
  const { tables, subscribe, addTable, updateTable, deleteTable } = useTableStore();
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selected, setSelected] = useState(null);
  const canvasRef = useRef(null);

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

  const handleMouseDown = (e, table) => {
    e.preventDefault();
    setDragging(table.id);
    setSelected(table.id);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left - dragOffset.x, rect.width - 100));
    const y = Math.max(0, Math.min(e.clientY - rect.top - dragOffset.y, rect.height - 100));
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

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)', height:'calc(100vh - 120px)' }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', flexWrap:'wrap' }}>
        <h2 className="text-title2">Floor Plan Editor</h2>
        <button className="btn btn-primary" id="add-table-btn" onClick={handleAddTable}>
          <Plus size={16} /> Add Table
        </button>
        <button className="btn btn-secondary" id="add-floor-btn" onClick={handleAddFloor}>
          ➕ Add Floor
        </button>
        <button 
          className="btn btn-secondary" 
          id="print-all-qrs-btn" 
          onClick={handlePrintAllQRs}
          disabled={tables.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          🖨️ Print All QRs
        </button>
        {selected && (
          <button className="btn btn-danger btn-sm" id="delete-table-btn" onClick={() => { deleteTable(restaurant.id, selected); setSelected(null); }}>
            <Trash2 size={14} /> Remove
          </button>
        )}
        <div className="badge badge-green" style={{ marginLeft:'auto' }}>
          {tables.length} tables configured
        </div>
      </div>

      {/* Floor Selection Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--color-separator)', paddingBottom: '10px' }}>
        {allFloors.map(floor => {
          const isActive = activeFloor === floor;
          const floorTableCount = tables.filter(t => (t.floor || 'Ground Floor') === floor).length;
          return (
            <button
              key={floor}
              type="button"
              className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setActiveFloor(floor);
                setSelected(null);
              }}
              style={{ padding: '6px 14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span>{floor}</span>
              <span style={{ 
                fontSize: 10, 
                opacity: 0.85, 
                background: isActive ? 'var(--color-bg-elevated)' : 'var(--color-bg-secondary)', 
                color: isActive ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 'bold'
              }}>
                {floorTableCount}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display:'flex', gap:'var(--space-4)', flex:1, overflow:'hidden' }}>
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="table-canvas"
          style={{
            flex: 1,
            position: 'relative',
            border: '1px solid var(--color-separator)',
            borderRadius: 'var(--radius-xl)',
            overflow: 'hidden',
            cursor: dragging ? 'grabbing' : 'default',
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {tables.filter(t => (t.floor || 'Ground Floor') === activeFloor).map(table => (
            <div
              key={table.id}
              id={`table-item-${table.id}`}
              className={`table-item ${table.shape === 'round' ? 'round' : 'rect'} ${selected === table.id ? 'status-selected' : `status-${table.status}`}`}
              style={{
                left: table.x,
                top: table.y,
                width: table.w ?? 80,
                height: table.h ?? 80,
              }}
              onMouseDown={e => handleMouseDown(e, table)}
            >
              <div className="table-label">{table.name}</div>
              <div className="table-capacity">{table.capacity}p</div>
            </div>
          ))}
          {tables.length === 0 && (
            <div style={{
              position:'absolute', inset:0, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', color:'var(--color-label-tertiary)', gap:'var(--space-3)',
            }}>
              <div style={{fontSize:40}}>🗺️</div>
              <div>Click "Add Table" to start building your floor plan</div>
            </div>
          )}
        </div>

        {/* Properties panel */}
        {selectedTable && (
          <div className="card" style={{ width: 240, flexShrink:0, display: 'flex', flexDirection: 'column', maxHeight: '100%', overflowY: 'auto' }}>
            <div className="card-header"><span className="card-title">Table Properties</span></div>
            <div style={{ padding:'var(--space-4)', display:'flex', flexDirection:'column', gap:'var(--space-4)', flex: 1 }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input
                  id="table-name-input"
                  className="form-input"
                  value={selectedTable.name}
                  onChange={e => updateTable(restaurant.id, selected, { name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Capacity</label>
                <input
                  id="table-capacity-input"
                  className="form-input"
                  type="number"
                  min={1}
                  max={20}
                  value={selectedTable.capacity}
                  onChange={e => updateTable(restaurant.id, selected, { capacity: parseInt(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Shape</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-2)' }}>
                  {['rect','round'].map(s => (
                    <button
                      key={s}
                      id={`shape-${s}`}
                      onClick={() => updateTable(restaurant.id, selected, { shape: s })}
                      style={{
                        padding:'var(--space-3)',
                        borderRadius: s === 'round' ? '50%' : 'var(--radius-md)',
                        border:`2px solid ${selectedTable.shape === s ? 'var(--color-accent)' : 'var(--color-separator-opaque)'}`,
                        background: selectedTable.shape === s ? 'var(--color-accent-light)' : 'var(--color-bg)',
                        color: selectedTable.shape === s ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                        fontWeight:'var(--weight-semibold)',
                        fontSize:'var(--text-caption1)',
                        cursor:'pointer',
                        fontFamily:'var(--font-family)',
                      }}
                    >
                      {s === 'round' ? '⭕' : '▭'} {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Size</label>
                <input
                  id="table-size-input"
                  className="form-input"
                  type="range"
                  min={60}
                  max={160}
                  value={selectedTable.w ?? 80}
                  onChange={e => updateTable(restaurant.id, selected, { w: parseInt(e.target.value), h: parseInt(e.target.value) })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Floor Location</label>
                <select
                  id="table-floor-select"
                  className="form-select"
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
              <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="form-label" style={{ alignSelf: 'flex-start' }}>Table QR Code</span>
                <div style={{ padding: 6, background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                  <img src={selectedTableQrImg} alt={`QR Code for Table ${selectedTable.name}`} style={{ width: 130, height: 130, display: 'block' }} />
                </div>
                <button
                  className="btn btn-secondary btn-xs"
                  id="download-qr-btn"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  onClick={() => window.open(selectedTableQrImg, '_blank')}
                >
                  Download QR
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
