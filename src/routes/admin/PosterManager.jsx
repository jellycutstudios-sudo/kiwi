import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { usePosterStore } from '../../stores/posterStore';
import { 
  Tv, Plus, Trash2, Save, Copy, Check, ExternalLink, 
  Upload, ArrowUp, ArrowDown, Settings, Loader2, Eye, EyeOff,
  QrCode, RefreshCw, Zap, X, CheckCircle2
} from 'lucide-react';
import QRCode from 'qrcode';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';

export default function PosterManager() {
  const { restaurant } = useAuthStore();
  const { 
    slideshows, posters, loadingSlideshows, loadingPosters,
    subscribeSlideshows, subscribePosters, addSlideshow, updateSlideshow, 
    deleteSlideshow, uploadPoster, uploadMultiplePosters, addPosterLink, 
    updatePoster, deletePoster, reorderPosters, assignPosterToScreens,
    cloneSlideshowPosters, bulkUpdatePosters, bulkDeletePosters, sendRemoteTvCommand
  } = usePosterStore();

  const [selectedSlideshowId, setSelectedSlideshowId] = useState('');
  const [isCreatingScreen, setIsCreatingScreen] = useState(false);
  const [newScreenName, setNewScreenName] = useState('');
  const [newScreenOrientation, setNewScreenOrientation] = useState('landscape');
  const [copiedId, setCopiedId] = useState(null);

  // Target screens selection for upload
  const [broadcastToAll, setBroadcastToAll] = useState(false);
  const [targetScreenIds, setTargetScreenIds] = useState([]);

  // Upload Method: 'file' | 'url'
  const [uploadMethod, setUploadMethod] = useState('file');
  const [pastedUrl, setPastedUrl] = useState('');
  const [uploadDuration, setUploadDuration] = useState(6);
  
  // Multi-file selection state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Bulk selection of posters in playlist
  const [selectedPosterIds, setSelectedPosterIds] = useState([]);
  const [bulkDurationInput, setBulkDurationInput] = useState('8');

  // Assign Poster Modal State
  const [assignModalPoster, setAssignModalPoster] = useState(null);
  const [modalAssignedScreens, setModalAssignedScreens] = useState([]);
  const [loadingAssignDetails, setLoadingAssignDetails] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);

  // Clone Screen Modal
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneTargetScreenId, setCloneTargetScreenId] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  // QR Code Setup Modal
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [qrGenerating, setQrGenerating] = useState(false);

  // Fullscreen Preview Modal for a poster
  const [previewPoster, setPreviewPoster] = useState(null);

  // Remote command loading state
  const [sendingRemoteCmd, setSendingRemoteCmd] = useState(false);

  // 1. Subscribe to slideshows
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribeSlideshows(restaurant.id);
    return () => {
      if (unsub) unsub();
    };
  }, [restaurant?.id, subscribeSlideshows]);

  // Derived effective active screen ID
  const effectiveScreenId = selectedSlideshowId || (slideshows.length > 0 ? slideshows[0].id : '');
  const activeScreenDoc = slideshows.find(s => s.id === effectiveScreenId);

  // 2. Subscribe to posters for active slideshow
  useEffect(() => {
    if (!restaurant?.id || !effectiveScreenId) return;
    const unsub = subscribePosters(restaurant.id, effectiveScreenId);
    return () => {
      if (unsub) unsub();
    };
  }, [restaurant?.id, effectiveScreenId, subscribePosters]);

  // Handle switching active screen
  const handleSelectScreen = (id) => {
    setSelectedSlideshowId(id);
    setSelectedPosterIds([]);
    if (!broadcastToAll) {
      setTargetScreenIds([id]);
    }
  };

  // Resolved target TV screens for uploads
  const resolvedTargetIds = broadcastToAll 
    ? slideshows.map(s => s.id) 
    : (targetScreenIds.length > 0 ? targetScreenIds : (effectiveScreenId ? [effectiveScreenId] : []));

  // Toggle target screen checkbox
  const handleToggleTargetScreen = (screenId) => {
    if (broadcastToAll) {
      setBroadcastToAll(false);
      setTargetScreenIds([screenId]);
      return;
    }
    setTargetScreenIds(prev => {
      const currentList = prev.length > 0 ? prev : [effectiveScreenId];
      if (currentList.includes(screenId)) {
        if (currentList.length === 1) {
          toast.error('Select at least one TV screen');
          return currentList;
        }
        return currentList.filter(id => id !== screenId);
      } else {
        return [...currentList, screenId];
      }
    });
  };

  // Create Screen
  const handleCreateScreen = async (e) => {
    e.preventDefault();
    if (!newScreenName.trim()) return;
    try {
      const id = await addSlideshow(restaurant.id, newScreenName.trim(), {
        orientation: newScreenOrientation,
        transition: 'kenburns',
        defaultDuration: 6
      });
      if (id) {
        setSelectedSlideshowId(id);
        setNewScreenName('');
        setIsCreatingScreen(false);
        toast.success(`TV Screen "${newScreenName.trim()}" created!`);
      }
    } catch {
      toast.error('Failed to create TV screen');
    }
  };

  // Save Screen Settings
  const handleSaveSettings = async (settings) => {
    if (!settings.name.trim()) {
      toast.error('Screen name is required');
      return;
    }
    try {
      await updateSlideshow(restaurant.id, effectiveScreenId, {
        name: settings.name.trim(),
        orientation: settings.orientation,
        fitMode: settings.fitMode,
        transition: settings.transition,
        transitionSpeed: Number(settings.transitionSpeed),
        defaultDuration: Number(settings.defaultDuration),
        shuffle: Boolean(settings.shuffle),
        showProgressBar: Boolean(settings.showProgressBar),
        showClock: Boolean(settings.showClock),
        showTicker: Boolean(settings.showTicker),
        tickerText: settings.tickerText || '',
        wifiInfo: settings.wifiInfo || { show: false, ssid: '', password: '' },
        showBranding: Boolean(settings.showBranding),
        backgroundColor: settings.backgroundColor || '#000000'
      });
      toast.success('Screen settings saved & synced to TV display!');
    } catch {
      toast.error('Failed to update screen settings');
    }
  };

  // Send Remote Command
  const handleSendRemoteCommand = async (action, screenName) => {
    if (!effectiveScreenId) return;
    setSendingRemoteCmd(true);
    try {
      await sendRemoteTvCommand(restaurant.id, effectiveScreenId, { action });
      if (action === 'identify') {
        toast.success(`⚡ Identifying "${screenName}"! Banner displayed on live TV.`);
      } else if (action === 'reload') {
        toast.success(`🔄 Reload command sent to "${screenName}" TV!`);
      }
    } catch {
      toast.error('Failed to send remote TV command');
    } finally {
      setSendingRemoteCmd(false);
    }
  };

  // Delete Screen
  const handleDeleteScreen = async (screenName) => {
    if (slideshows.length <= 1) {
      toast.error('You must keep at least one TV Screen');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete "${screenName}"? All posters on this screen channel will be removed.`)) {
      return;
    }
    try {
      const targetIndex = slideshows.findIndex(s => s.id === effectiveScreenId);
      const nextIndex = targetIndex === 0 ? 1 : targetIndex - 1;
      const nextId = slideshows[nextIndex].id;
      
      await deleteSlideshow(restaurant.id, effectiveScreenId);
      setSelectedSlideshowId(nextId);
      toast.success('Screen deleted');
    } catch {
      toast.error('Failed to delete screen');
    }
  };

  // Multi-File selection handler
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const validFiles = [];
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        toast.error(`"${f.name}" is not an image file. Skipped.`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`"${f.name}" exceeds 10MB limit. Skipped.`);
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Upload handler
  const handleUpload = async (e) => {
    e.preventDefault();
    if (resolvedTargetIds.length === 0) {
      toast.error('Please select at least one target TV screen');
      return;
    }

    if (uploadMethod === 'file') {
      if (selectedFiles.length === 0) {
        toast.error('Please select at least one image file');
        return;
      }

      setIsUploading(true);
      try {
        if (selectedFiles.length === 1) {
          setUploadProgress({ current: 1, total: 1, fileName: selectedFiles[0].name, percent: 50 });
          await uploadPoster(
            restaurant.id,
            resolvedTargetIds,
            selectedFiles[0],
            selectedFiles[0].name.split('.')[0].replace(/[-_]/g, ' '),
            Number(uploadDuration)
          );
        } else {
          await uploadMultiplePosters(
            restaurant.id,
            resolvedTargetIds,
            selectedFiles,
            Number(uploadDuration),
            (progress) => setUploadProgress(progress)
          );
        }

        const screenCountStr = resolvedTargetIds.length === 1 ? '1 TV' : `${resolvedTargetIds.length} TVs`;
        toast.success(`${selectedFiles.length} poster(s) distributed to ${screenCountStr}!`);
        setSelectedFiles([]);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        console.error('Upload error:', err);
        toast.error('Failed to upload posters: ' + err.message);
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    } else {
      // URL Upload
      if (!pastedUrl.trim()) {
        toast.error('Please enter a valid image URL');
        return;
      }
      if (!pastedUrl.startsWith('http://') && !pastedUrl.startsWith('https://')) {
        toast.error('Image URL must start with http:// or https://');
        return;
      }

      setIsUploading(true);
      try {
        await addPosterLink(
          restaurant.id,
          resolvedTargetIds,
          'Slide URL',
          pastedUrl.trim(),
          Number(uploadDuration)
        );
        const screenCountStr = resolvedTargetIds.length === 1 ? '1 TV' : `${resolvedTargetIds.length} TVs`;
        toast.success(`Poster URL distributed to ${screenCountStr}!`);
        setPastedUrl('');
      } catch {
        toast.error('Failed to add poster link');
      } finally {
        setIsUploading(false);
      }
    }
  };

  // Open "Assign to TVs" Modal
  const handleOpenAssignModal = async (poster) => {
    setAssignModalPoster(poster);
    setLoadingAssignDetails(true);
    try {
      const assigned = [];
      for (const s of slideshows) {
        if (s.id === effectiveScreenId) {
          assigned.push(s.id);
          continue;
        }
        const snap = await getDocs(collection(db, 'restaurants', restaurant.id, 'slideshows', s.id, 'posters'));
        const match = snap.docs.some(d => {
          const data = d.data();
          return (poster.groupId && data.groupId === poster.groupId) || data.imageUrl === poster.imageUrl;
        });
        if (match) assigned.push(s.id);
      }
      setModalAssignedScreens(assigned);
    } catch {
      setModalAssignedScreens([effectiveScreenId]);
    } finally {
      setLoadingAssignDetails(false);
    }
  };

  // Save "Assign to TVs"
  const handleSaveAssignModal = async () => {
    if (!assignModalPoster) return;
    if (modalAssignedScreens.length === 0) {
      toast.error('A poster must be assigned to at least one TV screen');
      return;
    }
    setSavingAssign(true);
    try {
      await assignPosterToScreens(restaurant.id, assignModalPoster, modalAssignedScreens);
      toast.success(`Poster screen assignments updated across ${modalAssignedScreens.length} TV(s)!`);
      setAssignModalPoster(null);
    } catch {
      toast.error('Failed to update screen assignments');
    } finally {
      setSavingAssign(false);
    }
  };

  // Toggle poster active
  const handleTogglePosterActive = async (poster) => {
    try {
      await updatePoster(restaurant.id, effectiveScreenId, poster.id, {
        isActive: !poster.isActive
      });
      toast.success(poster.isActive ? 'Poster deactivated' : 'Poster activated');
    } catch {
      toast.error('Failed to update poster');
    }
  };

  // Update single poster duration
  const handleUpdatePosterDuration = async (posterId, seconds) => {
    const val = Number(seconds);
    if (isNaN(val) || val < 1) return;
    try {
      await updatePoster(restaurant.id, effectiveScreenId, posterId, {
        duration: val
      });
    } catch (err) {
      console.error('Failed to update duration', err);
    }
  };

  // Delete single poster
  const handleDeletePoster = async (poster) => {
    const confirmDelete = window.confirm(`Remove "${poster.title}" from this TV screen?`);
    if (!confirmDelete) return;

    try {
      await deletePoster(restaurant.id, effectiveScreenId, poster.id, poster.imageUrl, poster.groupId, false);
      toast.success('Poster removed from this screen');
    } catch (err) {
      toast.error('Failed to delete poster: ' + err.message);
    }
  };

  // Move poster reorder
  const handleMovePoster = async (index, direction) => {
    const newPosters = [...posters];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newPosters.length) return;

    const temp = newPosters[index];
    newPosters[index] = newPosters[targetIdx];
    newPosters[targetIdx] = temp;

    try {
      await reorderPosters(restaurant.id, effectiveScreenId, newPosters);
    } catch {
      toast.error('Failed to save order');
    }
  };

  // Bulk Actions
  const handleSelectAllPosters = () => {
    if (selectedPosterIds.length === posters.length) {
      setSelectedPosterIds([]);
    } else {
      setSelectedPosterIds(posters.map(p => p.id));
    }
  };

  const handleToggleSelectPoster = (id) => {
    setSelectedPosterIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const handleBulkSetDuration = async () => {
    const dur = Number(bulkDurationInput);
    if (isNaN(dur) || dur < 1) {
      toast.error('Enter a valid duration (seconds)');
      return;
    }
    try {
      await bulkUpdatePosters(restaurant.id, effectiveScreenId, selectedPosterIds, { duration: dur });
      toast.success(`Duration updated to ${dur}s for ${selectedPosterIds.length} posters`);
      setSelectedPosterIds([]);
    } catch {
      toast.error('Failed to update durations');
    }
  };

  const handleBulkToggleActive = async (targetActive) => {
    try {
      await bulkUpdatePosters(restaurant.id, effectiveScreenId, selectedPosterIds, { isActive: targetActive });
      toast.success(`${selectedPosterIds.length} posters ${targetActive ? 'activated' : 'deactivated'}`);
      setSelectedPosterIds([]);
    } catch {
      toast.error('Failed to toggle status');
    }
  };

  const handleBulkBroadcastToAll = async () => {
    if (slideshows.length <= 1) {
      toast.error('You only have 1 TV screen. Create another TV screen to broadcast across screens.');
      return;
    }
    const allScreenIds = slideshows.map(s => s.id);
    const selectedPosters = posters.filter(p => selectedPosterIds.includes(p.id));

    toast.loading(`Broadcasting ${selectedPosters.length} posters to all ${slideshows.length} screens...`, { id: 'bulk-bcast' });
    try {
      for (const p of selectedPosters) {
        await assignPosterToScreens(restaurant.id, p, allScreenIds);
      }
      toast.success(`Successfully broadcasted ${selectedPosters.length} posters to all screens!`, { id: 'bulk-bcast' });
      setSelectedPosterIds([]);
    } catch {
      toast.error('Failed to broadcast posters to all screens', { id: 'bulk-bcast' });
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedPosterIds.length} selected posters from this screen?`)) return;
    const selectedItems = posters.filter(p => selectedPosterIds.includes(p.id));
    try {
      await bulkDeletePosters(restaurant.id, effectiveScreenId, selectedItems);
      toast.success(`${selectedItems.length} posters deleted`);
      setSelectedPosterIds([]);
    } catch {
      toast.error('Failed to delete posters');
    }
  };

  // Clone Screen Playlist
  const handleClonePlaylist = async () => {
    if (!cloneTargetScreenId) {
      toast.error('Select a target TV screen');
      return;
    }
    setIsCloning(true);
    try {
      await cloneSlideshowPosters(restaurant.id, effectiveScreenId, cloneTargetScreenId);
      const targetName = slideshows.find(s => s.id === cloneTargetScreenId)?.name || 'Target TV';
      toast.success(`All posters cloned to "${targetName}" successfully!`);
      setIsCloneModalOpen(false);
      setCloneTargetScreenId('');
    } catch {
      toast.error('Failed to clone playlist');
    } finally {
      setIsCloning(false);
    }
  };

  // Open Smart TV Setup & QR Code
  const handleOpenQrModal = async () => {
    setIsQrModalOpen(true);
    setQrGenerating(true);
    const url = `${window.location.origin}/display/slides/${restaurant?.id}/${effectiveScreenId}`;
    try {
      const qr = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
      setQrCodeUrl(qr);
    } catch (err) {
      console.error('QR generation error:', err);
    } finally {
      setQrGenerating(false);
    }
  };

  // Copy Live TV URL
  const copyDisplayUrl = (sId = effectiveScreenId) => {
    const url = `${window.location.origin}/display/slides/${restaurant?.id}/${sId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(sId);
    toast.success('Live TV Display URL copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Calculate total loop duration for current screen
  const defaultDuration = activeScreenDoc?.defaultDuration || 6;
  const totalDuration = posters
    .filter(p => p.isActive)
    .reduce((sum, p) => sum + (p.duration || defaultDuration), 0);

  const screenName = activeScreenDoc?.name || 'Screen';

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '1280px', margin: '0 auto' }}>
      
      {/* ── Top Header ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div>
          <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Tv size={28} style={{ color: 'var(--accent)' }} /> TV Digital Poster Boards
          </h2>
          <p className="text-secondary text-caption1">
            Display menus, special offers, and animated announcements across 1 or multiple TV screens in your restaurant.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}
            onClick={handleOpenQrModal}
          >
            <QrCode size={16} /> Smart TV Pairing & QR
          </button>

          {isCreatingScreen ? (
            <form onSubmit={handleCreateScreen} style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input 
                type="text" 
                placeholder="Screen name (e.g. Bar TV)" 
                className="form-input"
                style={{ width: '180px', height: '40px' }}
                value={newScreenName}
                onChange={e => setNewScreenName(e.target.value)}
                autoFocus
              />
              <select 
                className="form-select"
                style={{ width: '140px', height: '40px' }}
                value={newScreenOrientation}
                onChange={e => setNewScreenOrientation(e.target.value)}
              >
                <option value="landscape">📺 Landscape (16:9)</option>
                <option value="portrait">📱 Portrait (9:16)</option>
              </select>
              <button type="submit" className="btn btn-primary" style={{ height: '40px' }}>Create</button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ height: '40px' }} 
                onClick={() => { setIsCreatingScreen(false); setNewScreenName(''); }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button 
              className="btn btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}
              onClick={() => setIsCreatingScreen(true)}
            >
              <Plus size={16} /> Add TV Screen
            </button>
          )}
        </div>
      </div>

      {/* ── TV Screen Management Strip ───────────────────────────── */}
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-6)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Connected TV Channels ({slideshows.length})
          </span>
          {slideshows.length > 1 && (
            <button 
              type="button"
              className="btn btn-secondary"
              style={{ height: '30px', fontSize: '12px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={() => setIsCloneModalOpen(true)}
            >
              <Copy size={13} /> Clone Playlist to Another TV
            </button>
          )}
        </div>

        {/* Screen Cards Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
          {loadingSlideshows ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px' }}>
              <Loader2 size={18} className="animate-spin text-secondary" /> Loading TV Screens...
            </div>
          ) : (
            slideshows.map(s => {
              const isSelected = s.id === effectiveScreenId;
              const isPortrait = s.orientation === 'portrait';
              return (
                <div 
                  key={s.id}
                  onClick={() => handleSelectScreen(s.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid #e2e8f0',
                    background: isSelected ? 'rgba(var(--accent-rgb, 234, 88, 12), 0.05)' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.06)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: isSelected ? 'var(--accent)' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Tv size={16} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: isSelected ? 'var(--accent)' : 'inherit' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{isPortrait ? '📱 9:16 Portrait' : '📺 16:9 Landscape'}</span>
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <span style={{ fontSize: '10px', fontWeight: 800, background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: '10px' }}>
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {s.transition || 'kenburns'}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon"
                        style={{ width: '26px', height: '26px', padding: 0 }}
                        title="Copy TV Link"
                        onClick={(e) => { e.stopPropagation(); copyDisplayUrl(s.id); }}
                      >
                        {copiedId === s.id ? <Check size={12} color="var(--color-green)" /> : <Copy size={12} />}
                      </button>
                      <a
                        href={`/display/slides/${restaurant?.id}/${s.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-icon"
                        style={{ width: '26px', height: '26px', padding: 0, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Open Live TV Display"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Two Column Main Layout ─────────────────────────────────── */}
      {effectiveScreenId && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 'var(--space-6)', alignItems: 'start' }}>
          
          {/* Left Column: Multi-File Upload & Playlist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            
            {/* ── Add Posters Card ────────────────────────────────────── */}
            <div className="card card-padded">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: '8px' }}>
                <h3 className="text-title3" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Upload size={18} style={{ color: 'var(--accent)' }} /> Add Posters to TV Screens
                </h3>

                {/* Upload Method Tabs */}
                <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                  <button 
                    type="button" 
                    className="btn"
                    style={{
                      height: '30px', 
                      padding: '0 12px', 
                      fontSize: '12px', 
                      borderRadius: '6px',
                      background: uploadMethod === 'file' ? '#ffffff' : 'transparent',
                      color: uploadMethod === 'file' ? '#0f172a' : '#64748b',
                      boxShadow: uploadMethod === 'file' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                    onClick={() => setUploadMethod('file')}
                  >
                    📁 Upload Files
                  </button>
                  <button 
                    type="button" 
                    className="btn"
                    style={{ 
                      height: '30px', 
                      padding: '0 12px', 
                      fontSize: '12px', 
                      borderRadius: '6px',
                      background: uploadMethod === 'url' ? '#ffffff' : 'transparent',
                      color: uploadMethod === 'url' ? '#0f172a' : '#64748b',
                      boxShadow: uploadMethod === 'url' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                    onClick={() => setUploadMethod('url')}
                  >
                    🔗 Image URL
                  </button>
                </div>
              </div>

              {/* ── Target TV Selector (Multi-TV Assignment) ────────── */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    📺 Target TV Screen(s) for this upload:
                  </span>
                  <button 
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    onClick={() => setBroadcastToAll(!broadcastToAll)}
                  >
                    {broadcastToAll ? 'Switch to custom screen select' : '⚡ Broadcast to All TVs'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {/* Broadcast to All Button */}
                  <label style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    padding: '6px 12px', 
                    borderRadius: '6px', 
                    fontSize: '12px', 
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: broadcastToAll ? 'var(--accent)' : '#ffffff',
                    color: broadcastToAll ? '#ffffff' : '#475569',
                    border: broadcastToAll ? '1px solid var(--accent)' : '1px solid #cbd5e1'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={broadcastToAll} 
                      onChange={e => setBroadcastToAll(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    ⚡ All TVs ({slideshows.length} screens)
                  </label>

                  {/* Individual TV screen checkboxes */}
                  {!broadcastToAll && slideshows.map(s => {
                    const isChecked = targetScreenIds.includes(s.id);
                    return (
                      <label 
                        key={s.id} 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          padding: '6px 12px', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: 500,
                          cursor: 'pointer',
                          background: isChecked ? '#e0f2fe' : '#ffffff',
                          color: isChecked ? '#0369a1' : '#475569',
                          border: isChecked ? '1px solid #38bdf8' : '1px solid #cbd5e1'
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => handleToggleTargetScreen(s.id)}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Upload Form */}
              <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label className="form-label" style={{ margin: 0, fontSize: '13px', whiteSpace: 'nowrap' }}>Slide Duration:</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="300"
                      className="form-input"
                      style={{ width: '75px', height: '36px' }}
                      value={uploadDuration}
                      onChange={e => setUploadDuration(e.target.value)}
                    />
                    <span style={{ fontSize: '13px', color: '#64748b' }}>seconds</span>
                  </div>

                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Target: <strong>{broadcastToAll ? `All ${slideshows.length} TV screens` : `${resolvedTargetIds.length} TV screen(s)`}</strong>
                  </span>
                </div>

                {uploadMethod === 'file' ? (
                  <div>
                    {/* Drag & drop multi-file zone */}
                    <div 
                      style={{ 
                        border: '2px dashed #cbd5e1', 
                        borderRadius: 'var(--radius-lg)', 
                        padding: 'var(--space-6)', 
                        textAlign: 'center', 
                        background: '#fafafa', 
                        cursor: 'pointer', 
                        position: 'relative',
                        transition: 'border-color 0.2s'
                      }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        if (e.dataTransfer.files) {
                          handleFileChange({ target: { files: e.dataTransfer.files } });
                        }
                      }}
                    >
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple
                        onChange={handleFileChange}
                        ref={fileInputRef}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <Upload size={32} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontWeight: 700, fontSize: '15px' }}>
                          Drag & drop posters here, or <span style={{ color: 'var(--accent)', textDecoration: 'underline' }}>browse</span>
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          Select 1 or multiple posters at once (PNG, JPG, WebP • Max 10MB each)
                        </span>
                      </div>
                    </div>

                    {/* Previews of selected files */}
                    {selectedFiles.length > 0 && (
                      <div style={{ marginTop: 'var(--space-3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600 }}>
                            {selectedFiles.length} file(s) selected:
                          </span>
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: 'var(--color-red)', fontSize: '12px', cursor: 'pointer' }}
                            onClick={() => setSelectedFiles([])}
                          >
                            Clear all
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                          {selectedFiles.map((file, idx) => (
                            <div 
                              key={idx}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                padding: '6px 10px', 
                                background: '#ffffff', 
                                border: '1px solid #e2e8f0', 
                                borderRadius: '8px',
                                fontSize: '12px'
                              }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: 500 }}>
                                {file.name}
                              </span>
                              <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>
                                {(file.size / 1024 / 1024).toFixed(1)}MB
                              </span>
                              <button 
                                type="button" 
                                onClick={() => removeSelectedFile(idx)}
                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#94a3b8' }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Batch progress display */}
                    {uploadProgress && (
                      <div style={{ marginTop: 'var(--space-3)', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#166534', marginBottom: '4px' }}>
                          <span>Uploading {uploadProgress.current} of {uploadProgress.total}: {uploadProgress.fileName}</span>
                          <span>{uploadProgress.percent}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#dcfce7', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${uploadProgress.percent}%`, height: '100%', background: '#22c55e', transition: 'width 0.2s ease' }} />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">Image URL</label>
                    <input 
                      type="url" 
                      placeholder="e.g. https://images.unsplash.com/photo-example.jpg" 
                      className="form-input"
                      value={pastedUrl}
                      onChange={e => setPastedUrl(e.target.value)}
                    />
                    <span className="text-secondary text-caption2" style={{ marginTop: '4px', display: 'block' }}>
                      Must be a direct image link ending in .jpg, .png, or .webp
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={isUploading || (uploadMethod === 'file' ? selectedFiles.length === 0 : !pastedUrl.trim())}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px', justifyContent: 'center' }}
                  >
                    {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {isUploading 
                      ? 'Uploading to TVs...' 
                      : uploadMethod === 'file' 
                        ? `Upload ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''} to TVs` 
                        : 'Add URL to TVs'}
                  </button>
                </div>
              </form>
            </div>

            {/* ── Slideshow Playlist Card ─────────────────────────────── */}
            <div className="card card-padded">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="text-title3" style={{ margin: 0 }}>
                    Playlist for "{screenName}"
                  </h3>
                  <p className="text-secondary text-caption2" style={{ marginTop: '2px' }}>
                    {posters.length} slide{posters.length !== 1 ? 's' : ''} total • {totalDuration}s loop cycle
                  </p>
                </div>

                {/* Bulk Actions Bar if items selected */}
                {selectedPosterIds.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '4px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>
                      {selectedPosterIds.length} selected
                    </span>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ height: '28px', fontSize: '11px', padding: '0 8px' }}
                      title="Broadcast selected to all TV screens"
                      onClick={handleBulkBroadcastToAll}
                    >
                      ⚡ Push to All TVs
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input 
                        type="number" 
                        min="1" 
                        max="300"
                        placeholder="Sec"
                        style={{ width: '44px', height: '28px', fontSize: '11px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        value={bulkDurationInput}
                        onChange={e => setBulkDurationInput(e.target.value)}
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        style={{ height: '28px', fontSize: '11px', padding: '0 6px' }}
                        onClick={handleBulkSetDuration}
                      >
                        Set Duration
                      </button>
                    </div>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ height: '28px', fontSize: '11px', padding: '0 8px' }}
                      onClick={() => handleBulkToggleActive(true)}
                    >
                      Activate
                    </button>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ height: '28px', fontSize: '11px', padding: '0 8px', color: 'var(--color-red)' }}
                      onClick={handleBulkDelete}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                ) : (
                  posters.length > 0 && (
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ height: '30px', fontSize: '12px', padding: '0 10px' }}
                      onClick={handleSelectAllPosters}
                    >
                      Select All
                    </button>
                  )
                )}
              </div>

              {loadingPosters ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
                  <Loader2 size={32} className="animate-spin text-secondary" />
                </div>
              ) : posters.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: '#64748b' }}>
                  <Tv size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p style={{ fontWeight: 600 }}>No posters uploaded yet for "{screenName}".</p>
                  <p style={{ fontSize: '13px', marginTop: '4px' }}>Upload 1 or multiple posters above to start your TV slideshow.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {posters.map((poster, index) => {
                    const isSelected = selectedPosterIds.includes(poster.id);
                    return (
                      <div 
                        key={poster.id} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 'var(--space-3)', 
                          padding: 'var(--space-3)', 
                          border: isSelected ? '1.5px solid var(--accent)' : '1px solid #e2e8f0', 
                          borderRadius: 'var(--radius-md)',
                          background: isSelected ? 'rgba(var(--accent-rgb, 234, 88, 12), 0.03)' : (poster.isActive ? '#fff' : '#f8fafc'),
                          opacity: poster.isActive ? 1 : 0.75,
                          transition: 'border-color 0.15s ease'
                        }}
                      >
                        {/* Checkbox for bulk actions */}
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectPoster(poster.id)}
                          style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                        />

                        {/* Order index badge */}
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', width: '22px', textAlign: 'center' }}>
                          #{index + 1}
                        </span>

                        {/* Thumbnail with click to preview */}
                        <div 
                          onClick={() => setPreviewPoster(poster)}
                          title="Click to view full size"
                          style={{ 
                            width: '84px', 
                            height: '48px', 
                            borderRadius: '6px', 
                            overflow: 'hidden', 
                            background: '#0f172a', 
                            flexShrink: 0,
                            cursor: 'zoom-in',
                            position: 'relative'
                          }}
                        >
                          <img 
                            src={poster.imageUrl} 
                            alt={poster.title} 
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        </div>

                        {/* Poster Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {poster.title}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {/* Duration input */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>Duration:</span>
                              <input 
                                type="number" 
                                min="1" 
                                max="300"
                                style={{ width: '48px', height: '22px', padding: '0 4px', fontSize: '11px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                value={poster.duration || defaultDuration}
                                onChange={e => handleUpdatePosterDuration(poster.id, e.target.value)}
                              />
                              <span style={{ fontSize: '11px', color: '#64748b' }}>s</span>
                            </div>

                            {/* Assign to TVs button / pill */}
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(poster)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '2px 8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#0369a1',
                                cursor: 'pointer'
                              }}
                              title="Click to assign or share this poster across other TV screens"
                            >
                              <Tv size={11} />
                              <span>Assign to TVs...</span>
                            </button>
                          </div>
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          {/* Toggle Active */}
                          <button 
                            className={`btn btn-icon ${poster.isActive ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ width: '30px', height: '30px', borderRadius: '50%', padding: 0 }}
                            title={poster.isActive ? 'Deactivate' : 'Activate'}
                            onClick={() => handleTogglePosterActive(poster)}
                          >
                            {poster.isActive ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>

                          {/* Reorder Buttons */}
                          <button 
                            className="btn btn-secondary btn-icon"
                            style={{ width: '30px', height: '30px', padding: 0 }}
                            disabled={index === 0}
                            onClick={() => handleMovePoster(index, -1)}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button 
                            className="btn btn-secondary btn-icon"
                            style={{ width: '30px', height: '30px', padding: 0 }}
                            disabled={index === posters.length - 1}
                            onClick={() => handleMovePoster(index, 1)}
                          >
                            <ArrowDown size={13} />
                          </button>

                          {/* Delete */}
                          <button 
                            className="btn btn-secondary btn-icon"
                            style={{ width: '30px', height: '30px', padding: 0, color: 'var(--color-red)' }}
                            onClick={() => handleDeletePoster(poster)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Right Column: Granular Screen Settings & Live Controls ─── */}
          <div>
            <ScreenSettingsPanel 
              key={effectiveScreenId}
              screen={activeScreenDoc}
              onSave={handleSaveSettings}
              onSendRemoteCommand={handleSendRemoteCommand}
              onDeleteScreen={handleDeleteScreen}
              sendingRemoteCmd={sendingRemoteCmd}
            />
          </div>

        </div>
      )}

      {/* ── Modal: Assign Poster to TV Screens ─────────────────────── */}
      {assignModalPoster && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '480px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tv size={20} style={{ color: 'var(--accent)' }} /> Assign Poster to TV Screens
              </h3>
              <button 
                type="button" 
                onClick={() => setAssignModalPoster(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Poster Info Card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', marginBottom: '18px' }}>
              <img 
                src={assignModalPoster.imageUrl} 
                alt={assignModalPoster.title} 
                style={{ width: '64px', height: '36px', objectFit: 'contain', background: '#000', borderRadius: '4px' }} 
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {assignModalPoster.title}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Duration: {assignModalPoster.duration}s
                </div>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '12px' }}>
              Select which TV screen channels should display this poster. Changes will sync immediately without re-uploading the image.
            </p>

            {loadingAssignDetails ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                <Loader2 size={24} className="animate-spin text-secondary" />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {slideshows.map(s => {
                  const isChecked = modalAssignedScreens.includes(s.id);
                  return (
                    <label 
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: isChecked ? '1.5px solid var(--accent)' : '1px solid #e2e8f0',
                        background: isChecked ? 'rgba(var(--accent-rgb, 234, 88, 12), 0.04)' : '#ffffff',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setModalAssignedScreens(prev => 
                              prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                            );
                          }}
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {s.orientation === 'portrait' ? '📱 9:16 Portrait' : '📺 16:9 Landscape'}
                          </div>
                        </div>
                      </div>

                      {isChecked && (
                        <CheckCircle2 size={16} color="var(--accent)" />
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setAssignModalPoster(null)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                disabled={savingAssign}
                onClick={handleSaveAssignModal}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {savingAssign ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Save Assignments
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Clone Playlist to Another TV ───────────────────── */}
      {isCloneModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Copy size={20} style={{ color: 'var(--accent)' }} /> Clone Playlist
            </h3>
            <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
              Duplicate all <strong>{posters.length} posters</strong> from "{screenName}" to another TV screen channel.
            </p>

            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label">Destination TV Screen</label>
              <select 
                className="form-select"
                value={cloneTargetScreenId}
                onChange={e => setCloneTargetScreenId(e.target.value)}
              >
                <option value="">-- Choose destination TV --</option>
                {slideshows.filter(s => s.id !== effectiveScreenId).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.orientation || 'landscape'})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setIsCloneModalOpen(false)}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="btn btn-primary"
                disabled={!cloneTargetScreenId || isCloning}
                onClick={handleClonePlaylist}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isCloning ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                Clone All Posters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Smart TV Setup & QR Code ───────────────────────── */}
      {isQrModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <QrCode size={22} style={{ color: 'var(--accent)' }} /> Smart TV Setup & Pairing
              </h3>
              <button 
                type="button" 
                onClick={() => setIsQrModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={22} />
              </button>
            </div>

            <div style={{ textAlign: 'center', padding: '16px', background: '#f8fafc', borderRadius: '12px', marginBottom: '16px' }}>
              {qrGenerating ? (
                <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={32} className="animate-spin text-accent" />
                </div>
              ) : (
                <img 
                  src={qrCodeUrl} 
                  alt="TV Display QR Code" 
                  style={{ width: '220px', height: '220px', margin: '0 auto', display: 'block', borderRadius: '8px' }} 
                />
              )}
              <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginTop: '10px' }}>
                {screenName}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Scan with your phone or point your Smart TV's camera/browser to launch
              </div>
            </div>

            {/* Direct Link Box */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <input 
                type="text" 
                readOnly 
                className="form-input"
                style={{ fontSize: '12px', height: '36px', background: '#f1f5f9' }}
                value={`${window.location.origin}/display/slides/${restaurant?.id}/${effectiveScreenId}`}
              />
              <button 
                type="button" 
                className="btn btn-primary"
                style={{ height: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={() => copyDisplayUrl()}
              >
                {copiedId === effectiveScreenId ? <Check size={14} /> : <Copy size={14} />}
                Copy
              </button>
            </div>

            {/* 3 Step Setup Instructions */}
            <div style={{ fontSize: '12px', color: '#334155', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: '6px' }}>
                📺 Quick 3-Step TV Setup:
              </div>
              <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li>Open the web browser on your <strong>Android TV, Fire TV, or Smart TV</strong>.</li>
                <li>Enter the link above or scan the QR code using your phone to cast.</li>
                <li>Press <strong>F</strong> or double-click the screen on the TV to enter full-screen mode.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Fullscreen Poster Preview ──────────────────────── */}
      {previewPoster && (
        <div 
          onClick={() => setPreviewPoster(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100000,
            padding: '24px',
            cursor: 'zoom-out'
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img 
              src={previewPoster.imageUrl} 
              alt={previewPoster.title} 
              style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)' }}
            />
            <div style={{ color: '#ffffff', textAlign: 'center', marginTop: '12px', fontSize: '16px', fontWeight: 700 }}>
              {previewPoster.title} ({previewPoster.duration}s)
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Subcomponent: Granular Screen Settings & Remote Controls
function ScreenSettingsPanel({
  screen,
  onSave,
  onSendRemoteCommand,
  onDeleteScreen,
  sendingRemoteCmd
}) {
  const [settingsTab, setSettingsTab] = useState('display');
  const [slideshowSettings, setSlideshowSettings] = useState(() => ({
    name: screen?.name || '',
    orientation: screen?.orientation || 'landscape',
    fitMode: screen?.fitMode || 'contain',
    transition: screen?.transition || 'kenburns',
    transitionSpeed: screen?.transitionSpeed ?? 1.2,
    defaultDuration: screen?.defaultDuration || 6,
    shuffle: screen?.shuffle ?? false,
    showProgressBar: screen?.showProgressBar ?? true,
    showClock: screen?.showClock ?? false,
    showTicker: screen?.showTicker ?? false,
    tickerText: screen?.tickerText || '',
    wifiInfo: screen?.wifiInfo || { show: false, ssid: '', password: '' },
    showBranding: screen?.showBranding ?? true,
    backgroundColor: screen?.backgroundColor || '#000000'
  }));

  return (
    <div className="card card-padded" style={{ position: 'sticky', top: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <h3 className="text-title3" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Settings size={18} /> TV Settings
        </h3>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', background: 'rgba(var(--accent-rgb, 234, 88, 12), 0.1)', padding: '2px 8px', borderRadius: '10px' }}>
          {slideshowSettings.name}
        </span>
      </div>

      {/* Settings Sub-Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', background: '#f1f5f9', padding: '3px', borderRadius: '8px', marginBottom: 'var(--space-4)' }}>
        {[
          { id: 'display', label: 'Layout' },
          { id: 'motion',  label: 'Motion' },
          { id: 'overlays', label: 'Overlays' },
          { id: 'remote',  label: 'Remote' }
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSettingsTab(t.id)}
            style={{
              background: settingsTab === t.id ? '#ffffff' : 'transparent',
              color: settingsTab === t.id ? '#0f172a' : '#64748b',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 4px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: settingsTab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Layout & Orientation ─────────────────────── */}
      {settingsTab === 'display' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="form-group">
            <label className="form-label">Screen Channel Name</label>
            <input 
              type="text" 
              className="form-input"
              value={slideshowSettings.name}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Orientation & Aspect Ratio</label>
            <select 
              className="form-select"
              value={slideshowSettings.orientation}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, orientation: e.target.value })}
            >
              <option value="landscape">📺 Landscape 16:9 (Standard TV)</option>
              <option value="portrait">📱 Portrait 9:16 (Vertical Kiosk/Pillar)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Poster Image Fit Mode</label>
            <select 
              className="form-select"
              value={slideshowSettings.fitMode}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, fitMode: e.target.value })}
            >
              <option value="contain">🖼️ Contain (Letterbox / No Crop)</option>
              <option value="cover">📐 Cover (Fill Full Screen Edge-to-Edge)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Screen Background Color</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="color" 
                value={slideshowSettings.backgroundColor || '#000000'}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, backgroundColor: e.target.value })}
                style={{ width: '38px', height: '38px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#64748b' }}>
                {slideshowSettings.backgroundColor || '#000000'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: Motion & Timing ─────────────────────────── */}
      {settingsTab === 'motion' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="form-group">
            <label className="form-label">Transition Animation</label>
            <select 
              className="form-select"
              value={slideshowSettings.transition}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, transition: e.target.value })}
            >
              <option value="kenburns">🎬 Ken Burns + Crossfade</option>
              <option value="fade">💨 Smooth Fade</option>
              <option value="slide">➡️ Slide Left</option>
              <option value="zoom">🔍 Zoom In</option>
              <option value="none">⚡ Instant Cut (None)</option>
            </select>
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label className="form-label">Transition Speed</label>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>
                {slideshowSettings.transitionSpeed}s
              </span>
            </div>
            <input 
              type="range" 
              min="0.4" 
              max="3.0" 
              step="0.2"
              value={slideshowSettings.transitionSpeed}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, transitionSpeed: parseFloat(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
              <span>Fast (0.4s)</span>
              <span>Cinematic (3.0s)</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Default Slide Duration (seconds)</label>
            <input 
              type="number" 
              min="1" 
              max="300"
              className="form-input"
              value={slideshowSettings.defaultDuration}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, defaultDuration: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.shuffle}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, shuffle: e.target.checked })}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>Shuffle / Randomize slide order</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.showProgressBar}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, showProgressBar: e.target.checked })}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>Show slide timer countdown progress bar</span>
            </label>
          </div>
        </div>
      )}

      {/* ── Tab 3: Overlays & Ticker ───────────────────────── */}
      {settingsTab === 'overlays' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Live Clock */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={slideshowSettings.showClock}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, showClock: e.target.checked })}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span>Show Live Clock & Date Overlay</span>
          </label>

          {/* DineOS Branding */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={slideshowSettings.showBranding}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, showBranding: e.target.checked })}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span>Show Restaurant & DineOS Badge</span>
          </label>

          {/* Announcement Ticker */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.showTicker}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, showTicker: e.target.checked })}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>Running Announcement Ticker</span>
            </label>

            {slideshowSettings.showTicker && (
              <textarea 
                className="form-input"
                rows="2"
                placeholder="e.g. 🎉 Happy Hour 4-7 PM: 20% off all beverages • Ask your server for chef dessert specials!"
                style={{ fontSize: '12px' }}
                value={slideshowSettings.tickerText}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, tickerText: e.target.value })}
              />
            )}
          </div>

          {/* Guest Wi-Fi */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.wifiInfo?.show}
                onChange={e => setSlideshowSettings({ 
                  ...slideshowSettings, 
                  wifiInfo: { ...slideshowSettings.wifiInfo, show: e.target.checked } 
                })}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>Show Guest Wi-Fi Info Pill</span>
            </label>

            {slideshowSettings.wifiInfo?.show && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <input 
                  type="text" 
                  placeholder="Wi-Fi SSID (Name)" 
                  className="form-input"
                  style={{ height: '32px', fontSize: '12px' }}
                  value={slideshowSettings.wifiInfo?.ssid || ''}
                  onChange={e => setSlideshowSettings({
                    ...slideshowSettings,
                    wifiInfo: { ...slideshowSettings.wifiInfo, ssid: e.target.value }
                  })}
                />
                <input 
                  type="text" 
                  placeholder="Password" 
                  className="form-input"
                  style={{ height: '32px', fontSize: '12px' }}
                  value={slideshowSettings.wifiInfo?.password || ''}
                  onChange={e => setSlideshowSettings({
                    ...slideshowSettings,
                    wifiInfo: { ...slideshowSettings.wifiInfo, password: e.target.value }
                  })}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 4: Live Remote Actions ───────────────────────── */}
      {settingsTab === 'remote' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Control physical TVs located in your dining area remotely without touching the TV remote.
          </p>

          <button 
            type="button" 
            className="btn btn-secondary"
            disabled={sendingRemoteCmd}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '38px', color: '#0369a1', borderColor: '#bae6fd', background: '#f0f9ff' }}
            onClick={() => onSendRemoteCommand('identify', slideshowSettings.name)}
          >
            <Zap size={16} /> Identify TV Screen (Flash Banner)
          </button>

          <button 
            type="button" 
            className="btn btn-secondary"
            disabled={sendingRemoteCmd}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '38px' }}
            onClick={() => onSendRemoteCommand('reload', slideshowSettings.name)}
          >
            <RefreshCw size={16} /> Force TV Remote Reload
          </button>

          <a 
            href={`/display/slides/${screen?.id}`} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '38px', textDecoration: 'none' }}
          >
            <ExternalLink size={16} /> Open TV Screen in New Tab
          </a>

          <button 
            type="button" 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '38px', color: 'var(--color-red)', borderColor: 'rgba(239, 68, 68, 0.3)', marginTop: '8px' }}
            onClick={() => onDeleteScreen(slideshowSettings.name)}
          >
            <Trash2 size={16} /> Delete This TV Channel
          </button>
        </div>
      )}

      {/* Save Settings Button */}
      <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid #e2e8f0', paddingTop: 'var(--space-3)' }}>
        <button 
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '38px' }}
          onClick={() => onSave(slideshowSettings)}
        >
          <Save size={16} /> Save Screen Config
        </button>
      </div>
    </div>
  );
}
