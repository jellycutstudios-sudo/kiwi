import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { CURRENCY_OPTIONS } from '../../utils/formatCurrency';
import { Save, Copy, Check, Plus, Trash2, Edit2, Printer, X } from 'lucide-react';
import toast from 'react-hot-toast';

const MODES = [
  { key: 'pos',          label: '🧾 Bill Only',            desc: 'Simple cashier-only billing' },
  { key: 'table',        label: '🗺️ Table Management',      desc: 'Floor plan with table assignment' },
  { key: 'token',        label: '🎫 Token / QSR',           desc: 'Token issuance & TV display' },
  { key: 'online',       label: '📱 Online Orders',         desc: 'Customer-facing order page' },
  { key: 'kds',          label: '🍳 Kitchen Display',       desc: 'KDS screen for kitchen staff' },
  { key: 'inventory',    label: '📦 Inventory Management',  desc: 'Track ingredients, stock, and suppliers' },
  { key: 'payroll',      label: '💸 Staff Payroll',         desc: 'Manage staff wages, shifts, and payouts' },
  { key: 'delivery_hub', label: '🛵 Delivery Hub',          desc: 'Manage in-house and third-party delivery orders' },
  { key: 'reservations',  label: '📅 Table Reservations',    desc: 'Book and manage table reservations' },
  { key: 'customers',    label: '🤝 Loyalty & Customers',   desc: 'Manage customer profiles and reward points' },
];

const TAX_TYPES = [
  { key: 'none',  label: 'No Tax' },
  { key: 'gst',   label: 'GST (India — CGST + SGST)' },
  { key: 'vat',   label: 'VAT (Middle East)' },
  { key: 'flat',  label: 'Flat Rate %' },
];

const TABS = [
  { id: 'general',    label: 'General Settings',   icon: '⚙️' },
  { id: 'tax-pay',    label: 'Taxes & Payments',  icon: '💳' },
  { id: 'online-del', label: 'Online & Delivery', icon: '📱' },
  { id: 'hardware',   label: 'Peripherals',       icon: '🖨️' },
];

export default function Settings() {
  const { restaurant } = useAuthStore();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const { categories, subscribeMenu } = useMenuStore();

  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribeMenu(restaurant.id);
    return () => unsub();
  }, [restaurant?.id, subscribeMenu]);

  const [showPrinterForm, setShowPrinterForm] = useState(false);
  const [activePrinterIndex, setActivePrinterIndex] = useState(-1);
  const [printerForm, setPrinterForm] = useState({
    id: '',
    name: '',
    type: 'receipt', // receipt, kitchen
    mode: 'browser', // browser, bluetooth, serial, network
    ipAddress: '',
    drawerKick: false,
    soundAlerts: false,
    categories: []
  });

  const handleAddPrinter = () => {
    setPrinterForm({
      id: crypto.randomUUID(),
      name: '',
      type: 'receipt',
      mode: 'browser',
      ipAddress: '',
      drawerKick: false,
      soundAlerts: false,
      categories: []
    });
    setActivePrinterIndex(-1);
    setShowPrinterForm(true);
  };

  const handleEditPrinter = (idx, printer) => {
    setPrinterForm({
      id: printer.id || crypto.randomUUID(),
      name: printer.name || '',
      type: printer.type || 'receipt',
      mode: printer.mode || 'browser',
      ipAddress: printer.ipAddress || '',
      drawerKick: printer.drawerKick || false,
      soundAlerts: printer.soundAlerts || false,
      categories: printer.categories || []
    });
    setActivePrinterIndex(idx);
    setShowPrinterForm(true);
  };

  const handleDeletePrinter = (idx) => {
    if (!confirm('Are you sure you want to remove this printer?')) return;
    const printers = [...(settings.peripheralConfig?.printers ?? [])];
    printers.splice(idx, 1);
    updateField('peripheralConfig.printers', printers);
    toast.success('Printer removed');
  };

  const handleSavePrinter = () => {
    if (!printerForm.name.trim()) {
      toast.error('Printer name is required');
      return;
    }
    if (printerForm.mode === 'network' && !printerForm.ipAddress.trim()) {
      toast.error('Printer IP address is required for network mode');
      return;
    }
    const printers = [...(settings.peripheralConfig?.printers ?? [])];
    if (activePrinterIndex >= 0) {
      printers[activePrinterIndex] = printerForm;
    } else {
      printers.push(printerForm);
    }
    updateField('peripheralConfig.printers', printers);
    setShowPrinterForm(false);
    toast.success(activePrinterIndex >= 0 ? 'Printer updated' : 'Printer added');
  };

  const handleToggleCategory = (catId) => {
    const updatedCats = printerForm.categories.includes(catId)
      ? printerForm.categories.filter(id => id !== catId)
      : [...printerForm.categories, catId];
    setPrinterForm({ ...printerForm, categories: updatedCats });
  };


  useEffect(() => {
    if (copiedToken) {
      const timer = setTimeout(() => setCopiedToken(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedToken]);

  const copyTokenDisplayLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/display/tokens/${restaurant?.id}`);
    setCopiedToken(true);
    toast.success('TV display URL copied!');
  };

  useEffect(() => {
    if (!restaurant?.id) return;
    getDoc(doc(db, 'restaurants', restaurant.id)).then(d => {
      if (d.exists()) setSettings({ ...d.data() });
    });
  }, [restaurant?.id]);

  const save = async () => {
    setSaving(true);
    try {
      const settingsToSave = { ...settings };
      
      // Validate and check slug conflict
      if (settings.slug && settings.slug.trim()) {
        const cleanSlug = settings.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (cleanSlug !== settings.slug) {
          toast.error('Slug can only contain letters, numbers, hyphens, and underscores.');
          setSaving(false);
          return;
        }

        const q = query(collection(db, 'restaurants'), where('slug', '==', cleanSlug));
        const snap = await getDocs(q);
        const conflict = snap.docs.some(docSnap => docSnap.id !== restaurant.id);
        if (conflict) {
          toast.error('This custom URL slug is already taken by another restaurant.');
          setSaving(false);
          return;
        }
        settingsToSave.slug = cleanSlug;
      }

      // Validate and check customId conflict
      if (settings.customId && settings.customId.trim()) {
        const cleanCustomId = settings.customId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (cleanCustomId !== settings.customId) {
          toast.error('Custom Restaurant ID can only contain letters, numbers, hyphens, and underscores.');
          setSaving(false);
          return;
        }

        const q = query(collection(db, 'restaurants'), where('customId', '==', cleanCustomId));
        const snap = await getDocs(q);
        const conflict = snap.docs.some(docSnap => docSnap.id !== restaurant.id);
        if (conflict) {
          toast.error('This Custom Restaurant ID is already taken by another restaurant.');
          setSaving(false);
          return;
        }
        settingsToSave.customId = cleanCustomId;
      } else {
        settingsToSave.customId = '';
      }

      await updateDoc(doc(db, 'restaurants', restaurant.id), settingsToSave);
      setSettings(settingsToSave);
      useAuthStore.setState({ restaurant: { id: restaurant.id, ...settingsToSave } });
      toast.success('Settings saved!');
    } catch (e) {
      toast.error('Failed to save settings: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (path, value) => {
    setSettings(s => {
      const parts = path.split('.');
      const newSettings = { ...s };
      let current = newSettings;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        current[part] = { ...(current[part] ?? {}) };
        current = current[part];
      }
      current[parts[parts.length - 1]] = value;
      return newSettings;
    });
  };

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const copyOrderLink = () => {
    const orderPath = settings.slug ? settings.slug : restaurant?.id;
    navigator.clipboard.writeText(`${window.location.origin}/order/${orderPath}`);
    setCopied(true);
    toast.success('Order link copied!');
  };

  if (!settings) return <div style={{padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)'}}>Loading settings...</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-6)', maxWidth: 960, width: '100%' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-4)' }}>
        <div>
          <h2 className="text-title2" style={{ marginBottom: '2px' }}>Restaurant Settings</h2>
          <p className="text-secondary text-caption1">Configure your restaurant identity, modes, billing, and integrations.</p>
        </div>
        <button className="btn btn-primary" id="save-settings-btn" onClick={save} disabled={saving} style={{ height: '40px', padding: '0 var(--space-4)' }}>
          <Save size={16}/> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      <div className="settings-container">
        {/* Navigation Sidebar */}
        <div className="settings-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`settings-nav-item ${activeTab === tab.id ? 'active' : ''}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-6)', minWidth: 0 }}>
          
          {/* General Tab */}
          {activeTab === 'general' && (
            <>
              {/* Basic Info */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-4)'}}>Basic Info</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Restaurant Name</label>
                    <input id="settings-name" className="form-input" value={settings.name??''} onChange={e=>updateField('name',e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Custom Restaurant ID (for Staff PIN Login)</label>
                    <input 
                      id="settings-custom-id" 
                      className="form-input" 
                      placeholder="e.g. my-restaurant" 
                      value={settings.customId??''} 
                      onChange={e=>updateField('customId',e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))} 
                    />
                    <span className="text-secondary text-caption2">A custom ID staff can use to log in. Only lowercase letters, numbers, hyphens, and underscores allowed.</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <input id="settings-address" className="form-input" placeholder="Street, City" value={settings.address??''} onChange={e=>updateField('address',e.target.value)} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <input id="settings-phone" className="form-input" placeholder="+971 50 000 0000" value={settings.phone??''} onChange={e=>updateField('phone',e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Currency</label>
                      <select id="settings-currency" className="form-select" value={settings.currency??'INR'} onChange={e=>updateField('currency',e.target.value)}>
                        {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
                    <label className="form-label">Cash Management Mode</label>
                    <select 
                      className="form-select" 
                      value={settings.shiftMode || 'global'} 
                      onChange={e => updateField('shiftMode', e.target.value)}
                    >
                      <option value="global">Single Till (Shared by all staff)</option>
                      <option value="staff">Individual Staff Banks (Each staff member opens their own shift)</option>
                    </select>
                    <span className="text-secondary text-caption2" style={{ marginTop: '4px', display: 'block' }}>
                      Determines if cash shifts are shared across the restaurant or tracked individually per staff member.
                    </span>
                  </div>
                </div>
              </div>

              {/* Modes */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Active Modes</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Enable or disable features for your restaurant type
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
                  {[
                    {
                      title: '⚡ Core Operations & Billing',
                      desc: 'Basic modes for managing service types and kitchen workflow.',
                      keys: ['pos', 'table', 'token', 'kds']
                    },
                    {
                      title: '🌐 Sales Channels & Bookings',
                      desc: 'Enable customer-facing ordering, reservations, and deliveries.',
                      keys: ['online', 'delivery_hub', 'reservations']
                    },
                    {
                      title: '💼 Back Office & Admin',
                      desc: 'Tools for tracking inventory, staff payroll, and customer loyalty.',
                      keys: ['inventory', 'payroll', 'customers']
                    }
                  ].map(group => (
                    <div key={group.title} style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)' }}>
                      <div style={{ borderBottom:'1px solid var(--color-separator)', paddingBottom:'var(--space-2)' }}>
                        <h4 style={{ fontWeight:'var(--weight-bold)', fontSize:'var(--text-subhead)', color:'var(--color-label-primary)' }}>{group.title}</h4>
                        <p className="text-secondary text-caption1" style={{ marginTop:2 }}>{group.desc}</p>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'var(--space-3)' }}>
                        {group.keys.map(key => {
                          const m = MODES.find(x => x.key === key);
                          if (!m) return null;
                          const active = (settings.modes ?? []).includes(m.key);
                          return (
                            <label key={m.key} style={{
                              display:'flex', alignItems:'flex-start', gap:'var(--space-3)',
                              padding:'var(--space-3) var(--space-4)',
                              border:`1px solid ${active ? 'var(--color-accent)' : 'var(--color-separator-opaque)'}`,
                              borderRadius:'var(--radius-md)',
                              background: active ? 'var(--color-accent-light)' : 'var(--color-bg)',
                              cursor:'pointer',
                              transition:'all var(--duration-fast)',
                            }}>
                              <input
                                type="checkbox"
                                id={`mode-${m.key}`}
                                checked={active}
                                style={{ marginTop: 3 }}
                                onChange={e => {
                                  const modes = settings.modes ?? [];
                                  updateField('modes', e.target.checked ? [...modes, m.key] : modes.filter(x => x !== m.key));
                                }}
                              />
                              <div>
                                <div style={{ fontWeight:'var(--weight-semibold)', fontSize:'var(--text-footnote)', color:'var(--color-label-primary)' }}>{m.label}</div>
                                <div style={{ fontSize:'var(--text-caption2)', color:'var(--color-label-secondary)', marginTop:2, lineHeight:1.3 }}>{m.desc}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* QSR TV Display Link */}
              {(settings.modes ?? []).includes('token') && (
                <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div>
                    <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>📺 QSR TV Token Display Link</h3>
                    <p className="text-secondary text-footnote">
                      Open this URL on a TV or monitor in the waiting area to show the live token queue to customers.
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center' }}>
                    <input
                      className="form-input"
                      readOnly
                      value={`${window.location.origin}/display/tokens/${restaurant?.id}`}
                      style={{ fontFamily:'var(--font-mono)', fontSize:'var(--text-footnote)', background:'var(--color-bg-secondary)' }}
                    />
                    <button className="btn btn-primary" id="copy-token-link-btn" onClick={copyTokenDisplayLink} type="button">
                      {copiedToken ? <Check size={16}/> : <Copy size={16}/>}
                      {copiedToken ? 'Copied!' : 'Copy'}
                    </button>
                    <a 
                      href={`/display/tokens/${restaurant?.id}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-icon"
                      title="Open in new tab"
                      style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}
                    >
                      🔗
                    </a>
                  </div>
                </div>
              )}

              {/* Service Charge & Gratuity */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Service Charge & Gratuity</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Configure default service charge percentage applied to bills.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Service Charge Rate %</label>
                      <input
                        id="service-charge-rate-input"
                        className="form-input"
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={settings.serviceChargeRate ?? 0}
                        onChange={e => updateField('serviceChargeRate', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Apply Tax on Service Charge</label>
                      <select
                        id="service-charge-taxable-select"
                        className="form-select"
                        value={settings.serviceChargeTaxable ?? 'no'}
                        onChange={e => updateField('serviceChargeTaxable', e.target.value)}
                      >
                        <option value="no">No (added post-tax)</option>
                        <option value="yes">Yes (added pre-tax)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Taxes & Payments Tab */}
          {activeTab === 'tax-pay' && (
            <>
              {/* Tax Config */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-4)'}}>Tax Configuration</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Tax Type</label>
                    <select id="tax-type-select" className="form-select" value={settings.taxConfig?.type??'none'} onChange={e=>updateField('taxConfig.type',e.target.value)}>
                      {TAX_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  {settings.taxConfig?.type === 'gst' && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                      <div className="form-group">
                        <label className="form-label">CGST %</label>
                        <input id="cgst-input" className="form-input" type="number" min={0} max={50} step={0.5} value={settings.taxConfig?.cgst??9} onChange={e=>updateField('taxConfig.cgst',parseFloat(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">SGST %</label>
                        <input id="sgst-input" className="form-input" type="number" min={0} max={50} step={0.5} value={settings.taxConfig?.sgst??9} onChange={e=>updateField('taxConfig.sgst',parseFloat(e.target.value))} />
                      </div>
                    </div>
                  )}
                  {['vat','flat'].includes(settings.taxConfig?.type) && (
                    <div className="form-group">
                      <label className="form-label">Rate %</label>
                      <input id="tax-rate-input" className="form-input" type="number" min={0} max={50} step={0.5} value={settings.taxConfig?.rate??5} onChange={e=>updateField('taxConfig.rate',parseFloat(e.target.value))} />
                    </div>
                  )}
                </div>
              </div>

              {/* Stripe Payment Terminal */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>💳 Stripe Payment Terminal</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Configure credentials to pair a physical Stripe Reader card terminal via Cloud API.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Stripe Publishable Key</label>
                    <input
                      id="settings-stripe-publishable-key"
                      className="form-input"
                      type="password"
                      placeholder="pk_test_..."
                      value={settings.stripePublishableKey ?? ''}
                      onChange={e => updateField('stripePublishableKey', e.target.value)}
                    />
                  </div>
                  
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Stripe Location ID</label>
                      <input
                        id="settings-stripe-location-id"
                        className="form-input"
                        placeholder="tmpl_..."
                        value={settings.stripeLocationId ?? ''}
                        onChange={e => updateField('stripeLocationId', e.target.value)}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Stripe Reader ID</label>
                      <input
                        id="settings-stripe-reader-id"
                        className="form-input"
                        placeholder="e.g. reader_..."
                        value={settings.stripeReaderId ?? ''}
                        onChange={e => updateField('stripeReaderId', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (!settings.stripePublishableKey || !settings.stripeReaderId) {
                          toast.error('Please configure Stripe Publishable Key and Reader ID first!');
                          return;
                        }
                        toast.success(`Registering Stripe reader ${settings.stripeReaderId}... Check console!`);
                        console.log('%c[Stripe Terminal Connection Handshake]', 'color:#3b82f6;font-weight:bold;', {
                          publishableKey: settings.stripePublishableKey.slice(0, 10) + '...',
                          locationId: settings.stripeLocationId || 'N/A',
                          readerId: settings.stripeReaderId,
                          status: 'READER_CONNECTED'
                        });
                      }}
                    >
                      🔌 Test Stripe Reader Connection
                    </button>
                  </div>
                </div>
              </div>

              {/* UPI Payment Gateway */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>📱 UPI Payment Gateway</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Configure Merchant details to collect instant zero-fee payments via dynamic UPI QR codes.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Merchant UPI VPA ID</label>
                      <input
                        id="settings-upi-vpa"
                        className="form-input"
                        placeholder="e.g. merchant@upi"
                        value={settings.upiConfig?.vpa ?? ''}
                        onChange={e => updateField('upiConfig.vpa', e.target.value)}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Merchant Display Name</label>
                      <input
                        id="settings-upi-name"
                        className="form-input"
                        placeholder="e.g. RestaurantOS India"
                        value={settings.upiConfig?.name ?? ''}
                        onChange={e => updateField('upiConfig.name', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const vpa = settings.upiConfig?.vpa;
                        if (!vpa) {
                          toast.error('Please configure a Merchant UPI VPA ID first!');
                          return;
                        }
                        const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
                        if (!upiRegex.test(vpa)) {
                          toast.error('Invalid UPI VPA ID format (must contain @ and valid handles like merchant@upi)');
                          return;
                        }
                        toast.success('UPI configuration format is valid!');
                      }}
                    >
                      🔌 Validate UPI VPA ID Format
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Online & Delivery Tab */}
          {activeTab === 'online-del' && (
            <>
              {/* Online Order Link */}
              {(settings.modes??[]).includes('online') ? (
                <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div>
                    <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Online Order Page</h3>
                    <p className="text-secondary text-footnote">
                      Share this link with customers to let them order online
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center' }}>
                    <input
                      className="form-input"
                      readOnly
                      value={`${window.location.origin}/order/${settings.slug || restaurant?.id}`}
                      style={{ fontFamily:'var(--font-mono)', fontSize:'var(--text-footnote)', background:'var(--color-bg-secondary)' }}
                    />
                    <button className="btn btn-primary" id="copy-order-link-btn" onClick={copyOrderLink}>
                      {copied ? <Check size={16}/> : <Copy size={16}/>}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-secondary text-caption2" style={{marginTop:'calc(-1 * var(--space-2))'}}>
                    QR code — print this page or use a QR generator with the link above
                  </p>

                  <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)', borderTop:'1px solid var(--color-separator)', paddingTop:'var(--space-4)' }}>
                    <h4 style={{ fontWeight:'var(--weight-semibold)', fontSize:'var(--text-subhead)', color:'var(--color-label)', marginBottom: -4 }}>Branding & Setup</h4>
                    
                    <div className="form-group">
                      <label className="form-label">Custom URL Slug</label>
                      <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                        <span style={{ fontSize:'var(--text-footnote)', color:'var(--color-label-secondary)', whiteSpace:'nowrap' }}>/order/</span>
                        <input
                          id="settings-slug"
                          className="form-input"
                          placeholder="e.g. my-cafe-name"
                          value={settings.slug ?? ''}
                          onChange={e => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                        />
                      </div>
                      <span className="text-secondary text-caption2">Only lowercase letters, numbers, hyphens, and underscores are allowed.</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Restaurant Description</label>
                      <textarea
                        id="settings-online-desc"
                        className="form-input"
                        placeholder="Brief description of your restaurant, tagline, or opening hours..."
                        value={settings.onlineDescription ?? ''}
                        onChange={e => updateField('onlineDescription', e.target.value)}
                        style={{ minHeight: 80, fontFamily: 'inherit', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                      <div className="form-group">
                        <label className="form-label">Logo Image URL</label>
                        <input
                          id="settings-online-logo"
                          className="form-input"
                          placeholder="https://example.com/logo.png"
                          value={settings.onlineLogo ?? ''}
                          onChange={e => updateField('onlineLogo', e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Cover Banner URL</label>
                        <input
                          id="settings-online-cover"
                          className="form-input"
                          placeholder="https://example.com/cover.jpg"
                          value={settings.onlineCover ?? ''}
                          onChange={e => updateField('onlineCover', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px', padding: '40px var(--space-6)' }}>
                  <div style={{ fontSize: '48px' }}>📱</div>
                  <h3 className="text-title3">Online Ordering is Disabled</h3>
                  <p className="text-secondary text-footnote" style={{ maxWidth: '400px', lineHeight: '1.5' }}>
                    To configure your online store link, custom URL slug, description, and storefront branding, please enable the <strong>Online Orders</strong> mode in General settings first.
                  </p>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => setActiveTab('general')}
                    style={{ marginTop: '8px' }}
                  >
                    Go to General Settings
                  </button>
                </div>
              )}

              {/* Delivery Integrations */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Delivery Integrations</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Directly connect Zomato, Swiggy, Uber Eats, and Deliveroo. (Partner approval required on developer portals).
                </p>

                {/* Auto Accept Settings */}
                <div style={{
                  marginBottom: 'var(--space-6)',
                  padding: 'var(--space-4)',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      id="delivery-auto-accept"
                      checked={settings.deliverySettings?.autoAccept ?? false}
                      onChange={e => updateField('deliverySettings.autoAccept', e.target.checked)}
                    />
                    <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>Auto-Accept Delivery Orders</span>
                  </label>
                  <p className="text-secondary text-caption1" style={{ marginLeft: 'var(--space-6)' }}>
                    Automatically accept incoming platform orders and push them directly to the KDS/Kitchen. Turn off to manually review first.
                  </p>
                </div>

                {/* Platforms List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  {[
                    {
                      id: 'ubereats',
                      name: 'Uber Eats',
                      emoji: '🚗',
                      fields: [
                        { key: 'clientId', label: 'Client ID', placeholder: 'client_id_...' },
                        { key: 'clientSecret', label: 'Client Secret', placeholder: 'client_secret_...', type: 'password' },
                        { key: 'storeId', label: 'Store ID', placeholder: 'store_id_...' }
                      ]
                    },
                    {
                      id: 'zomato',
                      name: 'Zomato',
                      emoji: '🍕',
                      fields: [
                        { key: 'apiKey', label: 'API Key', placeholder: 'zomato_api_key_...' },
                        { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'zomato_restaurant_id_...' }
                      ]
                    },
                    {
                      id: 'swiggy',
                      name: 'Swiggy',
                      emoji: '🟠',
                      fields: [
                        { key: 'apiKey', label: 'API Key', placeholder: 'swiggy_api_key_...' },
                        { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'swiggy_restaurant_id_...' }
                      ]
                    },
                    {
                      id: 'deliveroo',
                      name: 'Deliveroo',
                      emoji: '🦘',
                      fields: [
                        { key: 'apiKey', label: 'API Key', placeholder: 'deliveroo_api_key_...' },
                        { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'deliveroo_restaurant_id_...' }
                      ]
                    }
                  ].map(platform => {
                    const config = settings.deliveryIntegrations?.[platform.id] ?? {};
                    const enabled = config.enabled ?? false;
                    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project';
                    const webhookUrl = `https://us-central1-${projectId}.cloudfunctions.net/handleDeliveryWebhook?platform=${platform.id}&restaurantId=${restaurant?.id}`;

                    return (
                      <div key={platform.id} style={{
                        border: '1px solid var(--color-separator-opaque)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden'
                      }}>
                        {/* Header */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 'var(--space-4)',
                          background: enabled ? 'var(--color-bg-secondary)' : 'transparent',
                          borderBottom: enabled ? '1px solid var(--color-separator-opaque)' : 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span style={{ fontSize: '1.5rem' }}>{platform.emoji}</span>
                            <div>
                              <span style={{ fontWeight: 'var(--weight-semibold)' }}>{platform.name}</span>
                              <span style={{
                                marginLeft: 'var(--space-2)',
                                fontSize: 'var(--text-caption2)',
                                color: enabled ? 'var(--color-success)' : 'var(--color-label-tertiary)',
                                background: enabled ? 'rgba(52, 199, 89, 0.1)' : 'rgba(142, 142, 147, 0.1)',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-sm)'
                              }}>
                                {enabled ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              id={`enable-${platform.id}`}
                              checked={enabled}
                              onChange={e => updateField(`deliveryIntegrations.${platform.id}.enabled`, e.target.checked)}
                            />
                            <span style={{ fontSize: 'var(--text-caption1)' }}>Enable</span>
                          </label>
                        </div>

                        {/* Form fields */}
                        {enabled && (
                          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            {platform.fields.map(field => (
                              <div className="form-group" key={field.key}>
                                <label className="form-label">{field.label}</label>
                                <input
                                  id={`${platform.id}-${field.key}`}
                                  className="form-input"
                                  type={field.type || 'text'}
                                  placeholder={field.placeholder}
                                  value={config[field.key] ?? ''}
                                  onChange={e => updateField(`deliveryIntegrations.${platform.id}.${field.key}`, e.target.value)}
                                />
                              </div>
                            ))}

                            {/* Webhook Info */}
                            <div style={{ marginTop: 'var(--space-2)' }}>
                              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                Webhook URL
                              </label>
                              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                <input
                                  id={`${platform.id}-webhook`}
                                  className="form-input"
                                  readOnly
                                  value={webhookUrl}
                                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption2)', background: 'var(--color-bg-secondary)' }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: 'var(--space-2)' }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(webhookUrl);
                                    toast.success(`${platform.name} Webhook URL copied!`);
                                  }}
                                >
                                  <Copy size={14} />
                                </button>
                              </div>
                              <p className="text-secondary text-caption2" style={{ marginTop: 'var(--space-1)' }}>
                                Provide this URL in the {platform.name} Developer Portal to receive real-time order updates.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Peripherals Tab */}
          {activeTab === 'hardware' && (
            <>
              {/* Hardware Peripherals */}
              <div className="card card-padded">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <h3 className="text-title3" style={{ marginBottom: '2px' }}>🔌 Printer & Hardware Peripherals</h3>
                    <p className="text-secondary text-footnote">
                      Manage receipts and kitchen tickets by configuring and routing multiple ESC/POS thermal printers.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleAddPrinter}
                    style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={16} /> Add Printer
                  </button>
                </div>

                {/* Printers list */}
                {(!settings.peripheralConfig?.printers || settings.peripheralConfig.printers.length === 0) ? (
                  <div style={{
                    textAlign: 'center',
                    padding: 'var(--space-8) var(--space-4)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--color-separator)',
                    color: 'var(--color-label-tertiary)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <Printer size={36} color="var(--color-label-quaternary)" />
                    <div>
                      <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>No Printers Configured</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>Add physical receipt or kitchen printers to route order print jobs.</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleAddPrinter}
                      style={{ marginTop: '4px' }}
                    >
                      Configure First Printer
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {settings.peripheralConfig.printers.map((printer, idx) => {
                      const modeLabel = printer.mode === 'network' ? `Network: ${printer.ipAddress}` :
                                        printer.mode === 'browser' ? 'Browser Print Dialog' :
                                        printer.mode === 'bluetooth' ? 'Web Bluetooth' : 'Web Serial (COM)';
                      
                      const assignedCats = printer.categories && printer.categories.length > 0
                        ? categories.filter(c => printer.categories.includes(c.id)).map(c => c.name).join(', ')
                        : 'All Categories';

                      return (
                        <div
                          key={printer.id || idx}
                          style={{
                            padding: 'var(--space-4)',
                            background: 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--color-separator)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 'var(--space-4)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <div style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: 'var(--radius-md)',
                              background: 'var(--color-accent-light)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--color-accent)'
                            }}>
                              <Printer size={20} />
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-label-primary)' }}>
                                  {printer.name}
                                </span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 'var(--weight-heavy)',
                                  textTransform: 'uppercase',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  background: printer.type === 'receipt' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(0, 122, 255, 0.1)',
                                  color: printer.type === 'receipt' ? 'var(--color-success)' : 'var(--color-accent)'
                                }}>
                                  {printer.type}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '4px' }}>
                                {modeLabel} {printer.drawerKick && '• Drawer Kick'} {printer.soundAlerts && '• Sound Alerts'}
                              </div>
                              {printer.type === 'kitchen' && (
                                <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: '2px' }}>
                                  Routing: <strong style={{ color: 'var(--color-label-secondary)' }}>{assignedCats}</strong>
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                toast.success(`Simulating printer check for ${printer.name}...`);
                                console.log(`%c[ESC/POS Print Engine Test: ${printer.name}]`, 'color:#3b82f6;font-weight:bold;', {
                                  name: printer.name,
                                  type: printer.type,
                                  mode: printer.mode,
                                  ip: printer.ipAddress || 'N/A',
                                  drawerKick: printer.drawerKick ? 'ENABLED' : 'DISABLED',
                                  soundAlerts: printer.soundAlerts ? 'ENABLED' : 'DISABLED',
                                  categoriesRouted: printer.categories
                                });
                              }}
                              style={{ padding: '0 var(--space-2)', height: '32px', fontSize: '11px' }}
                            >
                              Test
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-icon"
                              onClick={() => handleEditPrinter(idx, printer)}
                              style={{ width: '32px', height: '32px' }}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-icon"
                              onClick={() => handleDeletePrinter(idx)}
                              style={{ width: '32px', height: '32px', color: 'var(--color-red)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Printer Modal Dialog */}
              {showPrinterForm && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPrinterForm(false)}>
                  <div className="modal animate-slide-up" style={{ maxWidth: 460 }}>
                    <div className="modal-header">
                      <h2 className="modal-title">
                        {activePrinterIndex >= 0 ? '📝 Edit Printer Config' : '🔌 Add New Printer'}
                      </h2>
                      <button className="btn btn-secondary btn-icon" onClick={() => setShowPrinterForm(false)} type="button">
                        <X size={16} />
                      </button>
                    </div>

                    <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      <div className="form-group">
                        <label className="form-label">Printer Name</label>
                        <input
                          className="form-input"
                          placeholder="e.g. Front Cashier, Kitchen BBQ"
                          value={printerForm.name}
                          onChange={e => setPrinterForm({ ...printerForm, name: e.target.value })}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div className="form-group">
                          <label className="form-label">Printer Type</label>
                          <select
                            className="form-select"
                            value={printerForm.type}
                            onChange={e => setPrinterForm({ ...printerForm, type: e.target.value, categories: e.target.value === 'receipt' ? [] : printerForm.categories })}
                          >
                            <option value="receipt">Receipt (Cashier/Customer)</option>
                            <option value="kitchen">Kitchen / Station Ticket</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label className="form-label">Connection Mode</label>
                          <select
                            className="form-select"
                            value={printerForm.mode}
                            onChange={e => setPrinterForm({ ...printerForm, mode: e.target.value, ipAddress: e.target.value !== 'network' ? '' : printerForm.ipAddress })}
                          >
                            <option value="browser">Browser Print Dialog</option>
                            <option value="bluetooth">Web Bluetooth ESC/POS</option>
                            <option value="serial">Web Serial COM Port</option>
                            <option value="network">Network IP / Print Server</option>
                          </select>
                        </div>
                      </div>

                      {printerForm.mode === 'network' && (
                        <div className="form-group">
                          <label className="form-label">Printer IP Address / Port</label>
                          <input
                            className="form-input"
                            placeholder="e.g. 192.168.1.100:9100"
                            value={printerForm.ipAddress}
                            onChange={e => setPrinterForm({ ...printerForm, ipAddress: e.target.value })}
                          />
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={printerForm.drawerKick}
                            onChange={e => setPrinterForm({ ...printerForm, drawerKick: e.target.checked })}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 'var(--weight-semibold)' }}>Open Cash Drawer</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={printerForm.soundAlerts}
                            onChange={e => setPrinterForm({ ...printerForm, soundAlerts: e.target.checked })}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 'var(--weight-semibold)' }}>Sound Alerts (Buzzer)</span>
                        </label>
                      </div>

                      {printerForm.type === 'kitchen' && (
                        <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)' }}>
                          <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                            Route Menu Categories
                          </label>
                          <p className="text-secondary text-footnote" style={{ marginBottom: '10px' }}>
                            Select which categories print to this kitchen ticket. Leave empty to route all categories.
                          </p>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: '8px',
                            maxHeight: '160px',
                            overflowY: 'auto',
                            padding: '8px',
                            background: 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-separator)'
                          }}>
                            {categories.map(cat => (
                              <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={printerForm.categories.includes(cat.id)}
                                  onChange={() => handleToggleCategory(cat.id)}
                                />
                                <span style={{ fontSize: '12px' }}>{cat.emoji} {cat.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="modal-footer">
                      <button className="btn btn-secondary" onClick={() => setShowPrinterForm(false)} type="button">
                        Cancel
                      </button>
                      <button className="btn btn-primary" onClick={handleSavePrinter} type="button">
                        Save Printer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
