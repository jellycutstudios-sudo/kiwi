import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Building2, ChevronRight, ChevronsUpDown, CreditCard, Link2, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../firebase';
import { CURRENCY_OPTIONS, formatCurrency } from '../../utils/formatCurrency';
import { fromMinorUnits, subscriptionStatus, suggestedRenewal, todayDate, toMinorUnits } from '../../utils/branchBilling';
import { connectBranches, createBranch, createBusinessGroup, newPaymentId, recordBranchPayment, saveBranchFee } from '../../services/branchAdministration';
import { billingLoadMessage } from '../../utils/platformAdministration';
import './BranchManagement.css';

function Field({ label, children, ...props }) {
  return <label className="branch-field" {...props}><span className="form-label">{label}</span>{children}</label>;
}

function CurrencySelect({ value, onChange, disabled = false }) {
  return <select className="form-select" value={value} disabled={disabled} onChange={e => onChange(e.target.value)}>
    {CURRENCY_OPTIONS.map(currency => <option key={currency.code} value={currency.code}>{currency.label}</option>)}
  </select>;
}

function CycleSelect({ value, onChange }) {
  return <select className="form-select" value={value} onChange={e => onChange(e.target.value)}>
    <option value="monthly">Monthly</option><option value="yearly">Yearly</option>
  </select>;
}

function Modal({ title, children, onClose, onSubmit, saving, submitLabel }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.querySelector('input, select, button')?.focus();
    const onKey = event => {
      if (event.key === 'Escape' && !saving) onClose();
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll('button, input, select, textarea, [tabindex="0"]')].filter(node => !node.disabled);
      const first = nodes[0];
      const last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [onClose, saving]);
  return <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
    <form ref={dialogRef} className="modal branch-modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit || (e => e.preventDefault())}>
      <div className="modal-header"><h2 className="modal-title">{title}</h2>
        <button type="button" className="btn btn-secondary btn-icon" aria-label="Close dialog" disabled={saving} onClick={onClose}><X size={18} /></button>
      </div>
      <div className="modal-body"><fieldset disabled={saving} style={{ display: 'contents' }}>{children}</fieldset></div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>{submitLabel ? 'Cancel' : 'Close'}</button>
        {submitLabel && <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>}
      </div>
    </form>
  </div>;
}

export default function BranchManagement({ restaurants, usersMap, onEnter, onStatusChange }) {
  const [groups, setGroups] = useState([]);
  const [subscriptions, setSubscriptions] = useState({});
  const [loaded, setLoaded] = useState({ groups: false, subscriptions: false });
  const [loadErrors, setLoadErrors] = useState({});
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [history, setHistory] = useState({ rows: [], loading: false, error: false });
  const [actionBranchId, setActionBranchId] = useState(null);
  const submitting = useRef(false);

  useEffect(() => {
    const failure = resource => error => {
      console.warn(`Branch administration (${resource}):`, error);
      setLoadErrors(state => ({ ...state, [resource]: error }));
    };
    const stopGroups = onSnapshot(collection(db, 'businessGroups'), snapshot => {
      setGroups(snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => a.name.localeCompare(b.name)));
      setLoaded(state => ({ ...state, groups: true }));
    }, failure('businesses'));
    const stopSubscriptions = onSnapshot(collection(db, 'branchSubscriptions'), snapshot => {
      setSubscriptions(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()])));
      setLoaded(state => ({ ...state, subscriptions: true }));
    }, failure('billing'));
    return () => { stopGroups(); stopSubscriptions(); };
  }, [retry]);

  const historyBranchId = modal?.type === 'history' ? modal.branchId : null;
  useEffect(() => {
    if (!historyBranchId) return;
    return onSnapshot(query(collection(db, 'branchPayments'), where('branchIds', 'array-contains', historyBranchId), orderBy('recordedAt', 'desc'), limit(50)), snapshot => {
      setHistory({ rows: snapshot.docs.map(item => ({ ...item.data(), id: item.id })), loading: false, error: false });
    }, error => {
      console.warn('Branch payment history:', error);
      setHistory({ rows: [], loading: false, error: true });
    });
  }, [historyBranchId]);

  const loadError = Object.values(loadErrors).some(Boolean);
  const groupsAvailable = loaded.groups && !loadErrors.businesses;
  const ready = loaded.groups && loaded.subscriptions && !loadError;
  const owners = Object.values(usersMap).filter(owner => owner.role === 'admin').sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
  const ungrouped = groupsAvailable ? restaurants.filter(branch => !branch.businessGroupId || !groups.some(group => group.id === branch.businessGroupId)) : restaurants;
  const groupMap = Object.fromEntries(groups.map(group => [group.id, group]));

  const ungroupedBrands = useMemo(() => {
    const map = new Map();
    ungrouped.forEach(branch => {
      const key = branch.ownerUid || branch.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(branch);
    });

    return Array.from(map.entries()).map(([ownerUid, branchList]) => {
      const owner = usersMap[ownerUid];
      const mainBranch = branchList.find(b => b.isMainBranch) || branchList.find(b => !b.parentRestaurantId) || branchList[0];
      const brandTitle = mainBranch?.name || 'Restaurant Brand';
      return {
        ownerUid,
        owner,
        brandTitle,
        branches: branchList.sort((a, b) => (a.id === mainBranch?.id ? -1 : 1))
      };
    });
  }, [ungrouped, usersMap]);

  const [collapsedBrands, setCollapsedBrands] = useState(() => new Set());
  const toggleBrand = key => {
    setCollapsedBrands(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const allBrandKeys = useMemo(() => {
    const groupKeys = groups.map(g => g.id);
    const brandKeys = ungroupedBrands.map(b => b.ownerUid || b.brandTitle);
    return [...groupKeys, ...brandKeys];
  }, [groups, ungroupedBrands]);
  const allCollapsed = allBrandKeys.length > 0 && allBrandKeys.every(k => collapsedBrands.has(k));
  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsedBrands(new Set());
    } else {
      setCollapsedBrands(new Set(allBrandKeys));
    }
  };
  const pendingCount = restaurants.filter(branch => ['pending', 'trial_pending'].includes(branch.status)).length;
  const overdueCount = restaurants.filter(branch => subscriptionStatus(branch, subscriptions[branch.id]).key === 'overdue').length;
  const dueCount = restaurants.filter(branch => subscriptionStatus(branch, subscriptions[branch.id]).key === 'due_soon').length;

  function matches(branch) {
    const owner = usersMap[branch.ownerUid];
    const text = [branch.name, branch.address, branch.phone, branch.id, owner?.name, owner?.email, groupMap[branch.businessGroupId]?.name].join(' ').toLowerCase();
    if (search.trim() && !text.includes(search.trim().toLowerCase())) return false;
    if (filter === 'pending') return ['pending', 'trial_pending'].includes(branch.status);
    if (filter === 'suspended') return branch.status === 'suspended';
    return filter === 'all' || subscriptionStatus(branch, subscriptions[branch.id]).key === filter;
  }

  function open(type, details = {}, initial = {}) {
    setFormError('');
    setForm(initial);
    setModal({ type, ...details });
  }

  // A stable callback prevents focus from resetting on each form keystroke.
  const close = useRef(() => {});
  close.current = () => { if (!submitting.current) setModal(null); };
  const [closeModal] = useState(() => () => close.current());
  const update = (key, value) => setForm(state => ({ ...state, [key]: value }));
  const toggleBranch = id => update('restaurantIds', form.restaurantIds.includes(id) ? form.restaurantIds.filter(value => value !== id) : [...form.restaurantIds, id]);

  function openNewBranch(groupId = groups[0]?.id || '', ownerUid = '') {
    open('branch', {}, { 
      groupId, 
      ownerUid: ownerUid || owners[0]?.id || '', 
      name: '', 
      address: '', 
      phone: '', 
      currency: 'INR', 
      fee: '', 
      cycle: 'monthly' 
    });
  }

  function openPayment(branches) {
    const currency = subscriptions[branches[0]?.id]?.currency || branches[0]?.currency || 'INR';
    const rows = branches.map(branch => {
      const subscription = subscriptions[branch.id];
      const branchCurrency = subscription?.currency || branch.currency || 'INR';
      return { restaurantId: branch.id, name: branch.name, currency: branchCurrency,
        selected: branchCurrency === currency && branches.indexOf(branch) < 50,
        amount: subscription ? String(fromMinorUnits(subscription.feeMinor, branchCurrency)) : '',
        paidThrough: suggestedRenewal(subscription?.paidThrough, subscription?.cycle),
        activate: ['pending', 'trial_pending'].includes(branch.status), status: branch.status };
    });
    open('payment', { paymentId: newPaymentId() }, { currency, paidOn: todayDate(), method: 'cash', reference: '', note: '', rows });
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !ready) return;
    submitting.current = true;
    setSaving(true);
    setFormError('');
    try {
      if (modal.type === 'group') await createBusinessGroup(form);
      else if (modal.type === 'connect') await connectBranches(modal.groupId, form.restaurantIds);
      else if (modal.type === 'branch') await createBranch(form);
      else if (modal.type === 'fee') await saveBranchFee(modal.branchId, form);
      else if (modal.type === 'payment') await recordBranchPayment(modal.paymentId, {
        ...form, allocations: form.rows.filter(row => row.selected),
      });
      toast.success(modal.type === 'payment' ? 'Payment recorded and branch renewals updated.' : 'Changes saved.');
      setModal(null);
    } catch (error) {
      setFormError(error.code === 'permission-denied' ? 'You do not have permission to save these changes. Contact platform support.' : error.message);
    } finally { submitting.current = false; setSaving(false); }
  }

  async function changeStatus(branch) {
    setActionBranchId(branch.id);
    try { await onStatusChange(branch.id, branch.status === 'approved' ? 'suspended' : 'approved'); }
    catch (error) { toast.error(error.message || 'Unable to update this branch. Try again.'); }
    finally { setActionBranchId(null); }
  }

  function renderBranch(branch) {
    const subscription = subscriptions[branch.id];
    const status = subscriptionStatus(branch, subscription);
    const owner = usersMap[branch.ownerUid];
    const isMainHQ = branch.isMainBranch || (!branch.parentRestaurantId && branch.isMainBranch !== false);
    const isOutlet = Boolean(branch.parentRestaurantId || branch.isMainBranch === false);

    return <article key={branch.id} className={`branch-card ${isMainHQ ? 'is-main-hq' : isOutlet ? 'is-outlet' : ''}`} aria-label={`Branch ${branch.name}`}>
      <div className="branch-row">
        <div className="branch-grow">
          <h4>{branch.name}</h4>
          <p className="text-secondary">{branch.address || 'Address not added'}</p>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {isMainHQ ? (
            <span className="badge badge-purple" style={{ fontSize: '10px' }}>⭐ Main HQ</span>
          ) : (
            <span className="badge badge-blue" style={{ fontSize: '10px' }}>📍 Outlet</span>
          )}
          <span className={`badge ${branch.status === 'suspended' ? 'badge-red' : branch.status === 'approved' ? 'badge-green' : 'badge-orange'}`}>
            {branch.status === 'suspended' ? 'Suspended' : branch.status === 'approved' ? 'Approved' : 'Pending approval'}
          </span>
        </div>
      </div>
      <p className="text-secondary branch-owner">{owner?.name || branch.ownerName || 'Owner'} · {owner?.email || branch.email || 'No owner email'}</p>
      <div className="branch-billing-summary">
        <div><span className="branch-caption">Subscription</span><span className={`badge badge-${status.tone}`}>{loadErrors.billing ? 'Unavailable' : loaded.subscriptions ? status.label : 'Loading…'}</span></div>
        <div><span className="branch-caption">Branch fee</span><strong>{loadErrors.billing ? 'Unavailable' : !loaded.subscriptions ? 'Loading…' : subscription ? `${formatCurrency(fromMinorUnits(subscription.feeMinor, subscription.currency), subscription.currency)} / ${subscription.cycle === 'yearly' ? 'year' : 'month'}` : 'Not set'}</strong></div>
        <div><span className="branch-caption">Paid through</span><strong>{loadErrors.billing ? 'Unavailable' : !loaded.subscriptions ? 'Loading…' : subscription?.paidThrough || 'No payment recorded'}</strong></div>
      </div>
      <small className="text-secondary branch-id">ID: {branch.id}</small>
      <div className="branch-actions">
        <button className="btn btn-primary btn-sm" disabled={!ready} onClick={() => openPayment([branch])}><CreditCard size={14} /> Record payment</button>
        <button className="btn btn-secondary btn-sm" disabled={!ready} onClick={() => open('fee', { branchId: branch.id, name: branch.name }, {
          fee: subscription ? String(fromMinorUnits(subscription.feeMinor, subscription.currency)) : '', currency: subscription?.currency || branch.currency || 'INR', cycle: subscription?.cycle || 'monthly',
        })}>Edit fee</button>
        <button className="btn btn-secondary btn-sm" disabled={!ready} onClick={() => { setHistory({ rows: [], loading: true, error: false }); open('history', { branchId: branch.id, name: branch.name }); }}>Payment history</button>
        <button className="btn btn-secondary btn-sm" onClick={() => onEnter(branch)}>Open console</button>
        <button className="btn btn-secondary btn-sm" disabled={Boolean(actionBranchId)} onClick={() => changeStatus(branch)}>
          {actionBranchId === branch.id ? 'Saving…' : branch.status === 'approved' ? 'Suspend' : branch.status === 'suspended' ? 'Reactivate' : 'Approve'}
        </button>
      </div>
    </article>;
  }

  const eligibleBranches = ungrouped.filter(branch => branch.ownerUid === (modal?.type === 'connect' ? groupMap[modal.groupId]?.ownerUid : form.ownerUid) && !branch.businessGroupId);
  let paymentTotal = null;
  if (modal?.type === 'payment') {
    try { paymentTotal = form.rows.filter(row => row.selected).reduce((sum, row) => sum + toMinorUnits(row.amount, form.currency), 0); } catch { /* Total appears after valid amounts are entered. */ }
  }
  const selectedCount = form.rows?.filter(row => row.selected).length || 0;
  const shownCount = restaurants.filter(matches).length;

  return <div className="branch-management">
    <div className="branch-row branch-toolbar">
      <p className="text-secondary branch-grow">One owner login. Separate fees and renewals for every branch.</p>
      <button className="btn btn-secondary" disabled={!ready} onClick={() => open('group', {}, { name: '', ownerUid: '', restaurantIds: [] })}><Building2 size={16} /> Create business</button>
      <button className="btn btn-primary" disabled={!ready} onClick={() => openNewBranch()} title={!groups.length ? 'Create a business first to add branches' : 'Add new branch'}><Plus size={16} /> New branch</button>
    </div>
    {loadError && <div className="branch-notice" role="alert">{billingLoadMessage(loadErrors)}
      <button className="btn btn-secondary btn-sm" onClick={() => { setLoadErrors({}); setLoaded({ groups: false, subscriptions: false }); setRetry(value => value + 1); }}>Try again</button>
    </div>}
    {!ready && !loadError && <p role="status" className="text-secondary">Loading businesses and billing…</p>}
    <div className="branch-metrics">
      {[
        ['Active Brands', (loaded.groups && !loadErrors.businesses ? groups.length : 0) + (ungrouped.length > 0 ? (new Set(ungrouped.map(b => b.ownerUid || b.id)).size) : 0) || '—'],
        ['Total Outlets', restaurants.length],
        ['Pending approval', pendingCount],
        ['Due in 7 days', ready ? dueCount : '—'],
        ['Overdue', ready ? overdueCount : '—']
      ].map(([label, value]) =>
        <div className="card card-padded" key={label}><span className="branch-caption">{label}</span><strong>{value}</strong></div>)}
    </div>
    <div className="branch-row branch-toolbar">
      <label className="branch-search"><Search size={16} /><input aria-label="Search businesses and branches" className="form-input" placeholder="Search business, branch, owner or ID…" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select className="form-select branch-filter" aria-label="Filter branches" value={filter} onChange={e => setFilter(e.target.value)}>
        {[['all', 'All branches'], ['pending', 'Pending approval'], ['active', 'Active subscription'], ['due_soon', 'Due soon'], ['overdue', 'Overdue'], ['awaiting_payment', 'Awaiting payment'], ['not_set', 'Billing not set'], ['suspended', 'Suspended']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '36px', whiteSpace: 'nowrap' }}
        onClick={toggleAll}
        title={allCollapsed ? 'Expand all brands' : 'Collapse all brands'}
      >
        <ChevronsUpDown size={14} />
        {allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>
    </div>
    <p className="text-secondary branch-help">Paid-through dates are inclusive. Overdue branches remain usable until you suspend them. Click any brand to expand or collapse.</p>
    {groupsAvailable && groups.map(group => {
      const allBranches = restaurants.filter(branch => branch.businessGroupId === group.id);
      const visible = allBranches.filter(matches);
      if (!visible.length && (search || filter !== 'all')) return null;
      const owner = usersMap[group.ownerUid];
      const isOpen = Boolean(search.trim()) || !collapsedBrands.has(group.id);

      return <section className="card branch-group brand-accordion-card" key={group.id} aria-label={`Business ${group.name}`}>
        <div
          className="brand-accordion-header"
          onClick={() => toggleBrand(group.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBrand(group.id); } }}
          aria-expanded={isOpen}
        >
          <div className="brand-header-left">
            <div className={`brand-chevron-icon ${isOpen ? 'open' : ''}`}>
              <ChevronRight size={18} />
            </div>
            <div className="brand-header-titles">
              <div className="brand-header-title-row">
                <strong className="brand-title">🏢 {group.name}</strong>
                <span className="badge badge-purple" style={{ fontSize: '10.5px' }}>
                  {allBranches.length} Branch{allBranches.length === 1 ? '' : 'es'}
                </span>
              </div>
              <p className="brand-header-subtitle">
                {owner?.name || 'Owner'} · {owner?.email || group.ownerUid}
              </p>
            </div>
          </div>
          <div className="brand-header-actions" onClick={e => e.stopPropagation()}>
            <button className="btn btn-secondary btn-sm" disabled={!ready} onClick={() => open('connect', { groupId: group.id, name: group.name }, { restaurantIds: [] })}><Link2 size={14} /> Connect existing</button>
            <button className="btn btn-secondary btn-sm" disabled={!ready} onClick={() => openNewBranch(group.id)}><Plus size={14} /> Add branch</button>
            <button className="btn btn-primary btn-sm" disabled={!ready || !allBranches.length} onClick={() => openPayment(allBranches)}>Record payment</button>
          </div>
        </div>
        {isOpen && (
          visible.length ? <div className="branch-grid">{visible.map(renderBranch)}</div> : <p className="text-secondary branch-empty">Connect an existing branch or add this business’s first branch.</p>
        )}
      </section>;
    })}
    {ungrouped.filter(matches).length > 0 && (
      <section className="card branch-group" aria-label={groupsAvailable ? 'Ungrouped branches' : 'Branches'}>
        <div className="branch-group-header">
          <h3>{groupsAvailable ? 'Restaurant Brands (Main HQ & Outlets)' : 'Branches'}</h3>
          <p className="text-secondary">
            {groupsAvailable
              ? 'Main headquarters and multi-branch outlets grouped by restaurant brand. Click any brand to expand or collapse.'
              : 'Business grouping is unavailable. You can still open branch consoles and manage approvals.'}
          </p>
        </div>
        {ungroupedBrands.map(brand => {
          const brandKey = brand.ownerUid || brand.brandTitle;
          const visible = brand.branches.filter(matches);
          if (!visible.length && (search || filter !== 'all')) return null;
          const isOpen = Boolean(search.trim()) || !collapsedBrands.has(brandKey);
          const isMulti = brand.branches.length > 1;

          return (
            <div key={brandKey} className="brand-accordion-card">
              <div
                className="brand-accordion-header"
                onClick={() => toggleBrand(brandKey)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBrand(brandKey); } }}
                aria-expanded={isOpen}
              >
                <div className="brand-header-left">
                  <div className={`brand-chevron-icon ${isOpen ? 'open' : ''}`}>
                    <ChevronRight size={18} />
                  </div>
                  <div className="brand-header-titles">
                    <div className="brand-header-title-row">
                      <strong className="brand-title">🏢 {brand.brandTitle}</strong>
                      {isMulti ? (
                        <span className="badge badge-purple" style={{ fontSize: '10.5px' }}>
                          {brand.branches.length} Outlets (Multi-Branch)
                        </span>
                      ) : (
                        <span className="badge badge-secondary" style={{ fontSize: '10.5px' }}>
                          Single Location
                        </span>
                      )}
                    </div>
                    <p className="brand-header-subtitle">
                      {brand.owner?.name || 'Owner'} · {brand.owner?.email || brand.ownerUid}
                      {brand.branches[0]?.address ? ` · 📍 ${brand.branches[0].address}` : ''}
                    </p>
                  </div>
                </div>
                <div className="brand-header-actions" onClick={e => e.stopPropagation()}>
                  <button className="btn btn-secondary btn-sm" disabled={!ready} onClick={() => openNewBranch('', brand.ownerUid)}>
                    <Plus size={14} /> Add Outlet
                  </button>
                  <button className="btn btn-secondary btn-sm" disabled={!ready || !brand.branches.length} onClick={() => openPayment(brand.branches)}>
                    <CreditCard size={14} /> Record Payment
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="brand-accordion-content">
                  {isMulti && (
                    <div className="brand-chain-banner">
                      <span>🏛️ Brand Structure:</span>
                      <strong>⭐ Main HQ</strong> + <strong>📍 {brand.branches.length - 1} Sub-Outlet{brand.branches.length > 2 ? 's' : ''}</strong>
                    </div>
                  )}
                  <div className="branch-grid">{visible.map(renderBranch)}</div>
                </div>
              )}
            </div>
          );
        })}
      </section>
    )}
    {!shownCount && <div className="card card-padded branch-empty">{restaurants.length ? 'No branches match your filters.' : 'Create a business, then add its first branch.'}</div>}

    {modal && <Modal title={modal.type === 'group' ? 'Create business' : modal.type === 'connect' ? `Connect branches · ${modal.name}` : modal.type === 'branch' ? 'New branch' : modal.type === 'fee' ? `Branch fee · ${modal.name}` : modal.type === 'history' ? `Payment history · ${modal.name}` : 'Record manual payment'} onClose={closeModal} saving={saving} onSubmit={submit}
      submitLabel={modal.type === 'history' ? null : modal.type === 'payment' ? 'Record payment & renew' : 'Save changes'}>
      {formError && <p className="branch-notice" role="alert">{formError}</p>}
      {modal.type === 'group' && <>
        <Field label="Business name"><input className="form-input" required maxLength={120} value={form.name} onChange={e => update('name', e.target.value)} placeholder="Kiwi Café" /></Field>
        <Field label="Owner account"><select className="form-select" required value={form.ownerUid} onChange={e => setForm(state => ({ ...state, ownerUid: e.target.value, restaurantIds: [] }))}>
          <option value="">Select registered owner</option>{owners.map(owner => <option value={owner.id} key={owner.id}>{owner.name || owner.email} · {owner.email || owner.id}</option>)}
        </select></Field>
        <p className="text-secondary">This owner will use their existing login to access the business’s branches. Staff remain assigned to their own branch.</p>
      </>}
      {['group', 'connect'].includes(modal.type) && <div className="branch-choice-list">
        <strong>{modal.type === 'group' ? 'Connect existing branches (optional)' : 'Select existing branches'}</strong>
        <p className="text-secondary">Only ungrouped branches belonging to this owner can be connected. Orders, stock, staff and payment history stay with each branch.</p>
        {eligibleBranches.map(branch => <label className="branch-check" key={branch.id}><input type="checkbox" checked={form.restaurantIds.includes(branch.id)} onChange={() => toggleBranch(branch.id)} /><span>{branch.name}<small className="text-secondary">{branch.address || branch.id}</small></span></label>)}
        {!eligibleBranches.length && <p className="text-secondary">{form.ownerUid || modal.type === 'connect' ? 'No ungrouped branches for this owner.' : 'Choose an owner to see their branches.'}</p>}
      </div>}
      {modal.type === 'branch' && <>
        {groups.length > 0 && (
          <Field label="Business (Optional)">
            <select className="form-select" value={form.groupId} onChange={e => update('groupId', e.target.value)}>
              <option value="">No Business (Standalone Branch)</option>
              {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </Field>
        )}
        {!form.groupId && (
          <Field label="Owner account">
            <select required className="form-select" value={form.ownerUid} onChange={e => update('ownerUid', e.target.value)}>
              <option value="">Select registered owner</option>
              {owners.map(owner => <option value={owner.id} key={owner.id}>{owner.name || owner.email} · {owner.email || owner.id}</option>)}
            </select>
          </Field>
        )}
        <Field label="Branch name"><input required className="form-input" maxLength={120} value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Downtown Outlet" /></Field>
        <Field label="Address"><input className="form-input" maxLength={300} value={form.address} onChange={e => update('address', e.target.value)} placeholder="Street, City" /></Field>
        <Field label="Phone"><input className="form-input" type="tel" value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+91..." /></Field>
        <p className="text-secondary">The branch starts pending approval. Record its first payment or click Approve to activate it.</p>
      </>}
      {['branch', 'fee'].includes(modal.type) && <>
        <Field label="Billing currency"><CurrencySelect value={form.currency} disabled={modal.type === 'fee' && Boolean(subscriptions[modal.branchId]?.lastPaymentId)} onChange={value => update('currency', value)} /></Field>
        <div className="branch-form-grid"><Field label="Fee per branch"><input required className="form-input" inputMode="decimal" placeholder="0.00" value={form.fee} onChange={e => update('fee', e.target.value)} /></Field>
          <Field label="Billing cycle"><CycleSelect value={form.cycle} onChange={value => update('cycle', value)} /></Field></div>
        {modal.type === 'fee' && <p className="text-secondary">Changing the fee does not change the paid-through date. Record a payment to renew this branch.</p>}
      </>}
      {modal.type === 'payment' && <>
        <p className="text-secondary">Record money already collected. Each selected branch receives its own payment allocation and paid-through date.</p>
        <div className="branch-form-grid"><Field label="Payment date"><input required className="form-input" type="date" max={todayDate()} value={form.paidOn} onChange={e => update('paidOn', e.target.value)} /></Field>
          <Field label="Payment method"><select className="form-select" value={form.method} onChange={e => update('method', e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="other">Other</option></select></Field></div>
        <Field label="Payment currency"><CurrencySelect value={form.currency} onChange={value => setForm(state => ({ ...state, currency: value, rows: state.rows.map(row => ({ ...row, selected: false })) }))} /></Field>
        <div className="branch-choice-list">{form.rows.map((row, index) => {
          const setRow = patch => update('rows', form.rows.map((item, i) => i === index ? { ...item, ...patch } : item));
          return <div className="branch-allocation" key={row.restaurantId}>
            <label className="branch-check"><input type="checkbox" checked={row.selected} disabled={row.currency !== form.currency} onChange={e => setRow({ selected: e.target.checked })} /><strong>{row.name}</strong><small className="text-secondary">{row.currency}</small></label>
            {row.currency !== form.currency && <p className="text-secondary">Record a separate payment in {row.currency} for this branch.</p>}
            {row.selected && <><div className="branch-form-grid"><Field label={`Amount · ${row.name}`}><input required className="form-input" inputMode="decimal" value={row.amount} onChange={e => setRow({ amount: e.target.value })} /></Field>
              <Field label={`Paid through · ${row.name}`}><input required className="form-input" type="date" min={form.paidOn} value={row.paidThrough} onChange={e => setRow({ paidThrough: e.target.value })} /></Field></div>
              <small className="text-secondary">Currently paid through: {subscriptions[row.restaurantId]?.paidThrough || 'No payment recorded'}</small>
              {row.status !== 'approved' && <label className="branch-check"><input type="checkbox" checked={row.activate} onChange={e => setRow({ activate: e.target.checked })} /><span>{row.status === 'suspended' ? 'Reactivate this suspended branch' : 'Approve and activate this branch'}</span></label>}
            </>}
          </div>;
        })}</div>
        <Field label="Payment reference (optional)"><input className="form-input" maxLength={200} value={form.reference} onChange={e => update('reference', e.target.value)} placeholder="Receipt or bank transaction reference" /></Field>
        <Field label="Note (optional)"><textarea className="form-input" rows={2} maxLength={1000} value={form.note} onChange={e => update('note', e.target.value)} /></Field>
        <div className="branch-payment-total"><span>{selectedCount} branch{selectedCount === 1 ? '' : 'es'} selected</span><strong>{paymentTotal === null ? 'Enter valid amounts' : formatCurrency(fromMinorUnits(paymentTotal, form.currency), form.currency)}</strong></div>
      </>}
      {modal.type === 'history' && <>
        <p className="text-secondary">Latest 50 recorded payments. Amounts below are this branch’s allocation.</p>
        {history.loading && <p role="status">Loading payments…</p>}
        {history.error && <p role="alert">Unable to load payment history. Close and try again.</p>}
        {!history.loading && !history.error && !history.rows.length && <p>No payments recorded for this branch.</p>}
        {history.rows.map(payment => {
          const allocation = payment.allocations.find(line => line.restaurantId === modal.branchId);
          if (!allocation) return null;
          return <article className="branch-allocation" key={payment.id}>
            <div className="branch-row"><strong>{formatCurrency(fromMinorUnits(allocation.amountMinor, payment.currency), payment.currency)}</strong><span>{payment.paidOn}</span></div>
            <p>Paid through: <strong>{allocation.paidThrough}</strong></p><p className="text-secondary">{payment.method.replaceAll('_', ' ')}{payment.reference ? ` · ${payment.reference}` : ''}</p>
            {payment.note && <p>{payment.note}</p>}
            <small className="text-secondary">Receipt: {payment.id}{payment.branchIds.length > 1 ? ` · Combined payment for ${payment.branchIds.length} branches` : ''}</small>
          </article>;
        })}
      </>}
    </Modal>}
  </div>;
}
