import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuthStore } from '../../stores/authStore';
import { X, User, Phone, Check, Sparkles, MessageSquare, Trash2, Award, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CustomerModal({
  isOpen,
  onClose,
  initialPhone = '',
  restaurant,
  customer,
  customerName = '',
  customerPhone = '',
  onAttach,
  onDetach,
  allowSkip = false,
  onSkip
}) {
  const { t } = useTranslation();
  const { ensureAnonymousAuth } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [showGstin, setShowGstin] = useState(false);
  const [isExisting, setIsExisting] = useState(null);
  const [existingProfile, setExistingProfile] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const phoneInputRef = useRef(null);
  const nameInputRef = useRef(null);

  const lookupCustomer = useCallback(async (numStr) => {
    const clean = numStr.replace(/\D/g, '');
    if (clean.length < 8 || !restaurant?.id) {
      setIsExisting(null);
      setExistingProfile(null);
      return;
    }

    setIsSearching(true);
    try {
      if (ensureAnonymousAuth) await ensureAnonymousAuth();
      const docRef = doc(db, 'restaurants', restaurant.id, 'customers', clean);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setIsExisting(true);
        setExistingProfile(data);
        setName(prev => (prev && prev.trim() ? prev : (data.name || '')));
        if (data.address) {
          setAddress(prev => (prev && prev.trim() ? prev : (data.address || '')));
        }
        if (data.gstin) {
          setGstin(prev => (prev && prev.trim() ? prev : (data.gstin || '')));
          setShowGstin(true);
        }
      } else {
        setIsExisting(false);
        setExistingProfile(null);
      }
    } catch (e) {
      console.warn('Customer lookup error:', e?.message);
    } finally {
      setIsSearching(false);
    }
  }, [restaurant?.id, ensureAnonymousAuth]);

  // Sync state ONLY when modal opens (never on every keystroke!)
  useEffect(() => {
    if (!isOpen) return;

    const startPhone = (initialPhone || customerPhone || customer?.phone || '').replace(/\D/g, '');
    const startName = customerName || customer?.name || '';
    const startAddress = customer?.address || '';
    const startGstin = customer?.gstin || '';
    setPhone(startPhone);
    setName(startName);
    setAddress(startAddress);
    setGstin(startGstin);
    setShowGstin(Boolean(startGstin));
    setIsExisting(customer ? true : null);
    setExistingProfile(customer || null);

    // Initial lookup if phone is already provided
    if (startPhone.length >= 10) {
      lookupCustomer(startPhone);
      // Only focus name if the complete 10-digit phone was already provided before opening!
      setTimeout(() => nameInputRef.current?.focus(), 80);
    } else {
      if (startPhone.length >= 8) lookupCustomer(startPhone);
      setTimeout(() => phoneInputRef.current?.focus(), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handlePhoneChange = (e) => {
    const val = e.target.value;
    setPhone(val);
    const clean = val.replace(/\D/g, '');
    if (clean.length >= 8) {
      lookupCustomer(clean);
    } else {
      setIsExisting(null);
      setExistingProfile(null);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      toast.error('Please enter a valid mobile number (at least 8 digits)');
      phoneInputRef.current?.focus();
      return;
    }

    const cleanGstin = gstin.trim().toUpperCase();
    if (cleanGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
      toast.error('Enter a valid 15-character GSTIN (e.g. 27AAAAA0000A1Z5)');
      return;
    }

    const finalName = name.trim() || existingProfile?.name || 'Customer';
    setIsSaving(true);

    const payload = {
      name: finalName,
      phone: cleanPhone,
      address: address.trim() || existingProfile?.address || '',
      gstin: cleanGstin || existingProfile?.gstin || '',
      points: existingProfile?.points || customer?.points || 0,
      khataBalance: existingProfile?.khataBalance || customer?.khataBalance || 0,
      visitCount: (existingProfile?.visitCount || customer?.visitCount || 0) + 1,
      lifetimeSpend: existingProfile?.lifetimeSpend || customer?.lifetimeSpend || 0,
      updatedAt: new Date()
    };

    try {
      if (restaurant?.id) {
        await ensureAnonymousAuth();
        await setDoc(doc(db, 'restaurants', restaurant.id, 'customers', cleanPhone), payload, { merge: true });
      }
      onAttach(payload);
      toast.success(`Attached: ${finalName} (${cleanPhone})`, { icon: '👤' });
      onClose();
    } catch (err) {
      console.warn('Customer save error:', err?.message);
      // Fallback: attach directly to current order
      onAttach(payload);
      toast.success(`Attached to order: ${finalName}`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const isWaActive = Boolean(
    (restaurant?.whatsapp?.enabled || restaurant?.settings?.whatsapp?.enabled) &&
    (restaurant?.whatsapp?.phoneNumberId || restaurant?.settings?.whatsapp?.phoneNumberId)
  );

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={onClose}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--color-bg-elevated, #1e2230)',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px var(--color-separator, rgba(255,255,255,0.1))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-separator, rgba(255,255,255,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary, #3b82f6)'
            }}>
              <User size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-label, #ffffff)' }}>
                {customer ? 'Edit Customer' : 'Customer & Loyalty'}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-label-secondary, #94a3b8)' }}>
                Attach for WhatsApp e-receipts and reward points
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-label-tertiary, #94a3b8)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Phone Field */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-label, #ffffff)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Phone size={13} style={{ color: 'var(--color-primary, #3b82f6)' }} />
                Mobile / WhatsApp Number
              </label>
              {isSearching ? (
                <span style={{ fontSize: 10.5, color: 'var(--color-label-tertiary, #94a3b8)' }}>Searching...</span>
              ) : isExisting === true ? (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.12)',
                  padding: '2px 7px',
                  borderRadius: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}>
                  <Check size={10} /> Returning Customer
                </span>
              ) : isExisting === false ? (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#3b82f6',
                  background: 'rgba(59, 130, 246, 0.12)',
                  padding: '2px 7px',
                  borderRadius: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}>
                  <Sparkles size={10} /> New Customer
                </span>
              ) : null}
            </div>

            <div style={{ position: 'relative' }}>
              <input
                ref={phoneInputRef}
                type="tel"
                className="form-input"
                placeholder="Enter 10-digit mobile number"
                value={phone}
                onChange={handlePhoneChange}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!name.trim()) {
                      nameInputRef.current?.focus();
                    } else {
                      handleSave(e);
                    }
                  }
                }}
                style={{
                  width: '100%',
                  height: 38,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: isExisting === false ? '1.5px solid #3b82f6' : isExisting === true ? '1.5px solid #10b981' : undefined
                }}
              />
              {phone && (
                <button
                  type="button"
                  onClick={() => {
                    setPhone('');
                    setIsExisting(null);
                    setExistingProfile(null);
                    phoneInputRef.current?.focus();
                  }}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-label-tertiary, #94a3b8)',
                    cursor: 'pointer',
                    padding: 4
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Customer Name Field */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-label, #ffffff)', display: 'block', marginBottom: 6 }}>
              Customer Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              className="form-input"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave(e);
                }
              }}
              style={{
                width: '100%',
                height: 38,
                fontSize: 13,
                padding: '0 12px',
                borderRadius: 8
              }}
            />
          </div>

          {/* Delivery Address Field */}
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-label, #ffffff)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <MapPin size={13} style={{ color: '#f59e0b' }} /> Delivery Address / Landmark (For Riders)
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Flat 402, Sunshine Heights, Near City Mall"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave(e);
                }
              }}
              style={{
                width: '100%',
                height: 38,
                fontSize: 13,
                padding: '0 12px',
                borderRadius: 8
              }}
            />
          </div>

          {/* Optional B2B GSTIN (Progressive Disclosure — 0 clicks for walk-in) */}
          <div style={{ marginTop: 10 }}>
            {!showGstin ? (
              <button
                type="button"
                id="customer-add-gstin-toggle"
                onClick={() => setShowGstin(true)}
                style={{
                  background: 'none',
                  border: '1px dashed var(--color-separator-opaque, rgba(255,255,255,0.2))',
                  color: 'var(--color-label-secondary, #94a3b8)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left'
                }}
              >
                + Add Business GSTIN (For B2B Tax Invoice)
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-label, #ffffff)' }}>
                    Customer GSTIN (B2B)
                  </label>
                  <button
                    type="button"
                    onClick={() => { setGstin(''); setShowGstin(false); }}
                    style={{ background: 'none', border: 'none', color: 'var(--color-label-tertiary)', fontSize: 11, cursor: 'pointer' }}
                  >
                    Hide
                  </button>
                </div>
                <input
                  id="customer-gstin-input"
                  type="text"
                  maxLength={15}
                  className="form-input"
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  value={gstin}
                  onChange={e => setGstin(e.target.value.toUpperCase())}
                  style={{ width: '100%', height: 38, fontSize: 13, padding: '0 12px', borderRadius: 8, fontFamily: 'var(--font-mono)' }}
                />
              </div>
            )}
          </div>

          {/* Customer Profile Status & Loyalty Info */}
          {existingProfile && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: 10,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 12
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 600 }}>
                <Award size={15} /> Loyalty Points
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {Number(existingProfile.khataBalance || 0) > 0 && (
                  <strong style={{ fontSize: 12, color: '#f59e0b' }}>
                    Khata Due: ₹{Number(existingProfile.khataBalance).toFixed(0)}
                  </strong>
                )}
                <strong style={{ fontSize: 13, color: '#10b981' }}>
                  {existingProfile.points || 0} pts
                </strong>
              </span>
            </div>
          )}

          {/* WhatsApp E-Receipt Status Note */}
          {isWaActive && (
            <div style={{
              background: 'rgba(37, 211, 102, 0.08)',
              border: '1px solid rgba(37, 211, 102, 0.2)',
              borderRadius: 10,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11.5,
              color: 'var(--color-label-secondary, #94a3b8)'
            }}>
              <MessageSquare size={14} style={{ color: '#25d366', flexShrink: 0 }} />
              <span>
                WhatsApp receipt will automatically deliver to <strong>+{phone || 'mobile #'}</strong>
              </span>
            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, alignItems: 'center' }}>
            {customer && onDetach && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  onDetach();
                  toast.success('Customer removed from order');
                  onClose();
                }}
                style={{
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 8,
                  color: 'var(--color-red, #ef4444)',
                  borderColor: 'rgba(239, 68, 68, 0.3)'
                }}
                title="Detach customer"
              >
                <Trash2 size={14} />
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ flex: 1, height: 38, borderRadius: 8, fontWeight: 600, fontSize: 12.5 }}
            >
              {t('cancel') || 'Cancel'}
            </button>

            {allowSkip && onSkip && (
              <button
                type="button"
                id="delivery-skip-customer-btn"
                className="btn btn-secondary"
                onClick={onSkip}
                style={{
                  flex: 1.1,
                  height: 38,
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 12.5,
                  color: '#f59e0b',
                  borderColor: 'rgba(245, 158, 11, 0.35)',
                  background: 'rgba(245, 158, 11, 0.1)'
                }}
                title="Proceed without entering customer or address"
              >
                Skip →
              </button>
            )}

            <button
              type="submit"
              disabled={isSaving || phone.replace(/\D/g, '').length < 8}
              className="btn btn-primary"
              style={{
                flex: 1.5,
                height: 38,
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <Check size={15} />
              {isSaving ? 'Saving...' : 'Attach Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
