import React from 'react';
import { ChefHat, Printer, Monitor, Zap, Volume2, Sliders } from 'lucide-react';
import toast from 'react-hot-toast';
import { printSingleKitchenTicket } from '../../utils/print';

export default function KitchenSettings({ settings, updateField }) {
  const kitchenConfig = settings?.kitchenConfig || {};
  const currentMode = kitchenConfig.mode || (settings?.modes?.includes('kds') ? 'both' : 'printer_only');
  const paperSize = kitchenConfig.paperSize || '80mm';
  const ticketTitle = kitchenConfig.ticketTitle ?? 'KITCHEN TICKET (KOT)';
  const stationName = kitchenConfig.stationName ?? 'Main Kitchen';
  const soundBuzzer = kitchenConfig.soundBuzzer ?? true;
  const autoPrintOnDineIn = kitchenConfig.autoPrintOnDineIn ?? true;
  const autoPrintOnQuickPay = kitchenConfig.autoPrintOnQuickPay ?? true;
  const autoPrintOnOnlineOrder = kitchenConfig.autoPrintOnOnlineOrder ?? true;
  const highlightNotes = kitchenConfig.highlightNotes ?? true;

  const handleModeSelect = (modeKey) => {
    updateField('kitchenConfig.mode', modeKey);
    const currentModes = settings?.modes ?? [];
    if (modeKey === 'display_only' || modeKey === 'both') {
      if (!currentModes.includes('kds')) {
        updateField('modes', [...currentModes, 'kds']);
      }
    } else if (modeKey === 'disabled') {
      if (currentModes.includes('kds')) {
        updateField('modes', currentModes.filter(m => m !== 'kds'));
      }
    }
    toast.success(`Kitchen workflow updated to: ${
      modeKey === 'both' ? 'Both (Display & Thermal 3" Print)' :
      modeKey === 'display_only' ? 'Display Screen Only (KDS)' :
      modeKey === 'printer_only' ? 'Thermal 3" Printer Only (KOT)' : 'Disabled'
    }`, { icon: '🍳' });
  };

  const handleTestKitchenPrint = () => {
    toast.success('Sending test 3-inch kitchen ticket to printer... 🖨️');
    const testOrder = {
      id: 'KOT-' + Math.floor(1000 + Math.random() * 9000),
      type: 'dine-in',
      tableName: 'Table 5 (Patio)',
      token: '48',
      customerName: 'Alex M.',
      note: 'EXTRA CRISPY FRIES, NO ONIONS ON BURGER please!',
      staffName: 'Sam (Waiter)'
    };
    const testItems = [
      {
        name: 'Smokehouse BBQ Burger',
        qty: 2,
        selectedModifiers: [{ name: 'Medium Well' }, { name: 'Extra Cheddar' }]
      },
      {
        name: 'Truffle Parmesan Fries',
        qty: 1,
        selectedModifiers: [{ name: 'Garlic Aioli Dip' }]
      },
      {
        name: 'Fresh Mint Lime Soda',
        qty: 2
      }
    ];

    printSingleKitchenTicket({
      restaurant: settings,
      order: testOrder,
      items: testItems,
      staffName: 'Sam (Waiter)'
    });
  };

  const isThermalActive = currentMode === 'printer_only' || currentMode === 'both';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-6)' }}>
      {/* Settings Form Column */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '1.4rem' }}>🍳</span>
            <h3 className="text-title3" style={{ margin: 0 }}>Kitchen Order & KOT Routing</h3>
          </div>
          <p className="text-secondary text-footnote">
            Configure how orders reach your kitchen: through digital display screens (KDS), thermal 3-inch order tickets (KOT), or both.
          </p>
        </div>

        {/* Mode Selector Cards */}
        <div>
          <label className="form-label" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={14} color="var(--color-accent)" /> Kitchen Routing Mode
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            {/* Option 1: Both */}
            <div
              onClick={() => handleModeSelect('both')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: currentMode === 'both' ? '2px solid var(--color-accent)' : '1px solid var(--color-separator)',
                background: currentMode === 'both' ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-sm)',
                background: currentMode === 'both' ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: currentMode === 'both' ? '#fff' : 'var(--color-label-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Zap size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontWeight: 'var(--weight-bold)', fontSize: '13px', color: 'var(--color-label-primary)' }}>
                    ⚡ Both: Display Screen & 3" Thermal Printer
                  </span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--color-accent)',
                    color: '#fff'
                  }}>
                    Recommended
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', marginTop: '2px', lineHeight: 1.35 }}>
                  Kitchen staff see orders on the live digital KDS screen <strong>and</strong> get an automatic 3" thermal printed ticket (KOT).
                </div>
              </div>
            </div>

            {/* Option 2: Display Only */}
            <div
              onClick={() => handleModeSelect('display_only')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: currentMode === 'display_only' ? '2px solid var(--color-accent)' : '1px solid var(--color-separator)',
                background: currentMode === 'display_only' ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-sm)',
                background: currentMode === 'display_only' ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: currentMode === 'display_only' ? '#fff' : 'var(--color-label-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Monitor size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'var(--weight-bold)', fontSize: '13px', color: 'var(--color-label-primary)' }}>
                    🖥️ Display Only (KDS Screen)
                  </span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(52, 199, 89, 0.15)',
                    color: 'var(--color-success)'
                  }}>
                    Paperless
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', marginTop: '2px', lineHeight: 1.35 }}>
                  Orders route strictly to the digital kitchen tablet or monitor screen (<code style={{ fontSize: '10.5px' }}>/kds</code>). No physical thermal tickets.
                </div>
              </div>
            </div>

            {/* Option 3: Thermal 3" Printer Only */}
            <div
              onClick={() => handleModeSelect('printer_only')}
              style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: currentMode === 'printer_only' ? '2px solid var(--color-accent)' : '1px solid var(--color-separator)',
                background: currentMode === 'printer_only' ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}
            >
              <div style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-sm)',
                background: currentMode === 'printer_only' ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
                color: currentMode === 'printer_only' ? '#fff' : 'var(--color-label-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Printer size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'var(--weight-bold)', fontSize: '13px', color: 'var(--color-label-primary)' }}>
                    🖨️ Thermal 3" Printer Only (Physical KOT)
                  </span>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(255, 149, 0, 0.15)',
                    color: '#d97706'
                  }}>
                    Classic KOT
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', marginTop: '2px', lineHeight: 1.35 }}>
                  Automatically prints physical 3-inch (80mm) tickets for the chef/cook line. No tablet screen needed in the kitchen.
                </div>
              </div>
            </div>

            {/* Option 4: Disabled */}
            <div
              onClick={() => handleModeSelect('disabled')}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                border: currentMode === 'disabled' ? '2px solid var(--color-separator-opaque)' : '1px solid var(--color-separator)',
                background: currentMode === 'disabled' ? 'var(--color-bg-tertiary)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              <div style={{
                width: 30,
                height: 30,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-secondary)',
                color: 'var(--color-label-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                🚫
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: '12.5px', color: 'var(--color-label-secondary)' }}>
                  Disabled / Direct Billing Only
                </span>
                <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                  No kitchen routing. Orders bypass kitchen tickets and check out directly.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Thermal 3" Printer Detailed Settings (Only visible if printer is used) */}
        {isThermalActive && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            borderTop: '1px solid var(--color-separator)',
            paddingTop: 'var(--space-4)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Printer size={16} color="var(--color-accent)" />
              <span style={{ fontSize: '13px', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-primary)' }}>
                Thermal KOT Printer Configuration
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="form-group">
                <label className="form-label">Thermal Paper Size</label>
                <select
                  className="form-select"
                  value={paperSize}
                  onChange={e => updateField('kitchenConfig.paperSize', e.target.value)}
                >
                  <option value="80mm">3-inch (80mm) — Kitchen Pass (48 cols)</option>
                  <option value="58mm">2-inch (58mm) — Compact Mobile (32 cols)</option>
                </select>
                <div className="text-caption2 text-secondary" style={{ marginTop: 2 }}>
                  3-inch (80mm) is standard for clear kitchen readability.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Station / Pass Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Main Kitchen, Grill, Hot Station"
                  value={stationName}
                  onChange={e => updateField('kitchenConfig.stationName', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Ticket Header Title</label>
              <input
                className="form-input"
                placeholder="e.g. KITCHEN TICKET (KOT), ORDER TICKET"
                value={ticketTitle}
                onChange={e => updateField('kitchenConfig.ticketTitle', e.target.value)}
              />
            </div>

            {/* Auto Print Triggers & Sound */}
            <div style={{
              background: 'var(--color-bg-secondary)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <span style={{ fontSize: '12.5px', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-secondary)' }}>
                Auto-Print Triggers & Alerts
              </span>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 'var(--weight-medium)' }}>Print on Dine-In "Send to Kitchen"</span>
                  <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Prints KOT when table orders are placed or modified</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoPrintOnDineIn}
                  onChange={e => updateField('kitchenConfig.autoPrintOnDineIn', e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 'var(--weight-medium)' }}>Print on Counter / Takeaway Checkout</span>
                  <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Prints ticket when takeaway/quick-pay orders are completed</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoPrintOnQuickPay}
                  onChange={e => updateField('kitchenConfig.autoPrintOnQuickPay', e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 'var(--weight-medium)' }}>Print when Online Order is Accepted</span>
                  <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Automatically dispatches ticket to kitchen when order accepted</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoPrintOnOnlineOrder}
                  onChange={e => updateField('kitchenConfig.autoPrintOnOnlineOrder', e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Volume2 size={15} color="var(--color-accent)" />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 'var(--weight-medium)' }}>Sound Buzzer / Chime Alert</span>
                    <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Beeper command on ESC/POS thermal printer</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={soundBuzzer}
                  onChange={e => updateField('kitchenConfig.soundBuzzer', e.target.checked)}
                />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 'var(--weight-medium)' }}>Highlight Cooking Notes Prominently</span>
                  <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Bold caution box for allergy / special preparation notes</div>
                </div>
                <input
                  type="checkbox"
                  checked={highlightNotes}
                  onChange={e => updateField('kitchenConfig.highlightNotes', e.target.checked)}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Live Simulation & Test Column */}
      <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', background: 'var(--color-bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h4 className="text-title3" style={{ margin: 0, fontSize: '15px' }}>
              {isThermalActive ? '🖨️ 3" Thermal KOT Slip Preview' : '🖥️ Digital KDS Display Mode'}
            </h4>
            <span className="text-secondary text-caption1">
              {isThermalActive ? `${paperSize === '80mm' ? '3-inch (80mm)' : '2-inch (58mm)'} Thermal Ticket` : 'No thermal paper is consumed'}
            </span>
          </div>
          {isThermalActive && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleTestKitchenPrint}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px' }}
            >
              <Printer size={14} /> Test Print KOT
            </button>
          )}
        </div>

        {/* Realistic Ticket Rendering */}
        {isThermalActive ? (
          <div style={{
            background: '#fff',
            color: '#111',
            borderRadius: '4px',
            padding: paperSize === '58mm' ? '14px 10px' : '20px 16px',
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: paperSize === '58mm' ? '11px' : '13px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
            maxWidth: paperSize === '58mm' ? '240px' : '320px',
            margin: '0 auto',
            width: '100%',
            lineHeight: 1.3
          }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: paperSize === '58mm' ? '14px' : '18px', letterSpacing: '-0.5px' }}>
              {ticketTitle || 'KITCHEN TICKET'}
            </div>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: paperSize === '58mm' ? '11px' : '13px', marginTop: '2px', color: '#444' }}>
              Station: {stationName || 'Main Kitchen'}
            </div>
            <div style={{ borderTop: '1.5px dashed #333', margin: '8px 0' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: paperSize === '58mm' ? '13px' : '16px', fontWeight: 900 }}>
                Table: Table 5 (Patio)
              </span>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#555' }}>
                Token #48
              </span>
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
              Time: {new Date().toLocaleTimeString()}
            </div>
            <div style={{ fontSize: '11px', color: '#666' }}>
              Server: Sam (Waiter)
            </div>

            <div style={{ borderTop: '1.5px dashed #333', margin: '8px 0' }} />

            {/* Items Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: paperSize === '58mm' ? '13px' : '15px' }}>
                  <span>Smokehouse BBQ Burger</span>
                  <span style={{ fontWeight: 900 }}>×2</span>
                </div>
                <div style={{ fontSize: '11px', color: '#555', paddingLeft: '6px' }}>
                  + Medium Well, Extra Cheddar
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: paperSize === '58mm' ? '13px' : '15px' }}>
                  <span>Truffle Parmesan Fries</span>
                  <span style={{ fontWeight: 900 }}>×1</span>
                </div>
                <div style={{ fontSize: '11px', color: '#555', paddingLeft: '6px' }}>
                  + Garlic Aioli Dip
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: paperSize === '58mm' ? '13px' : '15px' }}>
                  <span>Fresh Mint Lime Soda</span>
                  <span style={{ fontWeight: 900 }}>×2</span>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1.5px dashed #333', margin: '8px 0' }} />

            {/* Special Instructions Note */}
            {highlightNotes && (
              <div style={{
                background: '#fef08a',
                border: '1px solid #eab308',
                color: '#854d0e',
                borderRadius: '3px',
                padding: '5px 8px',
                fontSize: paperSize === '58mm' ? '10.5px' : '12px',
                fontWeight: 'bold',
                margin: '6px 0'
              }}>
                ⚠️ Note: EXTRA CRISPY FRIES, NO ONIONS ON BURGER please!
              </div>
            )}

            <div style={{ textAlign: 'center', fontSize: '10px', color: '#777', marginTop: '6px' }}>
              Order #9482 · DineOS Kitchen Engine
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--color-bg-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6) var(--space-4)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            border: '1px dashed var(--color-separator)'
          }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 'var(--radius-full)',
              background: 'rgba(52, 199, 89, 0.12)',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Monitor size={28} />
            </div>
            <div>
              <div style={{ fontWeight: 'var(--weight-bold)', fontSize: '15px' }}>Digital KDS Screen Active</div>
              <p className="text-secondary text-footnote" style={{ maxWidth: 300, margin: '6px auto 0' }}>
                Kitchen staff use the interactive touchscreen at <code style={{ color: 'var(--color-accent)' }}>/kds</code> to bump tickets, view timers, and mark stations as ready.
              </p>
            </div>
            <a
              href="/kds"
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ChefHat size={14} /> Open Kitchen Display (KDS)
            </a>
          </div>
        )}

        {isThermalActive && (
          <div style={{ textAlign: 'center', marginTop: 'auto' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleTestKitchenPrint}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Printer size={14} /> Send Sample 3" Test Ticket
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
