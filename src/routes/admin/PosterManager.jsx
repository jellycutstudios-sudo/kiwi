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

const SAMPLE_POSTERS = [
  {
    label: '🍔 Burger Combo',
    title: 'Gourmet Burger Special',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80',
    duration: 6
  },
  {
    label: '🍕 Artisan Pizza',
    title: 'Wood-Fired Pizza Deal',
    url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    duration: 6
  },
  {
    label: '🍹 Happy Hour',
    title: 'Craft Cocktails & Drinks',
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=80',
    duration: 8
  },
  {
    label: '☕ Artisan Coffee',
    title: 'Morning Brew & Pastries',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
    duration: 6
  }
];

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
  const [showCustomTargetScreens, setShowCustomTargetScreens] = useState(false);

  // Upload Method: 'url' (Postimages / Image URL) | 'file' (direct device upload)
  const [uploadMethod, setUploadMethod] = useState('url');
  const [pastedUrl, setPastedUrl] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const [uploadDuration, setUploadDuration] = useState(6);
  const [previewStatus, setPreviewStatus] = useState('idle'); // 'idle' | 'loading' | 'valid' | 'error'
  const [previewDims, setPreviewDims] = useState(null);
  
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

  // Smart cleaner for pasted image links (e.g. from Postimages, markdown, bbcode, html)
  const handleUrlInput = (rawVal) => {
    let clean = rawVal.trim();
    // 1. Extract markdown image: ![...](URL)
    const mdMatch = clean.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
    if (mdMatch) clean = mdMatch[1];
    
    // 2. Extract HTML img tag: <img src="URL"...>
    const htmlMatch = clean.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (htmlMatch) clean = htmlMatch[1];

    // 3. Extract BBCode [img]URL[/img]
    const bbMatch = clean.match(/\[img\](https?:\/\/[^\[]+)\[\/img\]/i);
    if (bbMatch) clean = bbMatch[1];

    setPastedUrl(clean);
  };

  const isPostimgPageLink = Boolean(
    pastedUrl && 
    (pastedUrl.includes('postimg.cc/') || pastedUrl.includes('postimages.org/')) && 
    !pastedUrl.includes('i.postimg.cc/')
  );

  // Debounced live image preview validation
  useEffect(() => {
    const trimmed = pastedUrl.trim();
    if (!trimmed) {
      setPreviewStatus('idle');
      setPreviewDims(null);
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setPreviewStatus('error');
      setPreviewDims(null);
      return;
    }

    setPreviewStatus('loading');
    const timer = setTimeout(() => {
      const img = new Image();
      img.onload = () => {
        setPreviewStatus('valid');
        setPreviewDims({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        setPreviewStatus('error');
        setPreviewDims(null);
      };
      img.src = trimmed;
    }, 250);

    return () => clearTimeout(timer);
  }, [pastedUrl]);

  // Select demo sample poster
  const handleSelectSample = (sample) => {
    setPastedUrl(sample.url);
    setPastedTitle(sample.title);
    setUploadDuration(sample.duration || 6);
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
          pastedTitle.trim() || 'Food Special',
          pastedUrl.trim(),
          Number(uploadDuration) || 6
        );
        const screenCountStr = resolvedTargetIds.length === 1 
          ? (activeScreenDoc?.name ? `"${activeScreenDoc.name}"` : '1 TV') 
          : `All ${resolvedTargetIds.length} TVs`;
        toast.success(`Poster added to ${screenCountStr}!`, { icon: '📺' });
        setPastedUrl('');
        setPastedTitle('');
        setPreviewStatus('idle');
        setPreviewDims(null);
      } catch (err) {
        toast.error('Failed to add poster link: ' + (err?.message || 'Unknown error'));
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
          <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', color: '#0f172a', fontWeight: 800 }}>
            <Tv size={28} style={{ color: '#059669' }} /> TV Digital Poster Boards
          </h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#475569', fontWeight: 500 }}>
            Display menus, special offers, and animated announcements across 1 or multiple TV screens in your restaurant.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button 
            type="button" 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 700, background: '#ffffff' }}
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
                style={{ width: '180px', height: '40px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
                value={newScreenName}
                onChange={e => setNewScreenName(e.target.value)}
                autoFocus
              />
              <select 
                className="form-select"
                style={{ width: '140px', height: '40px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
                value={newScreenOrientation}
                onChange={e => setNewScreenOrientation(e.target.value)}
              >
                <option value="landscape">📺 Landscape (16:9)</option>
                <option value="portrait">📱 Portrait (9:16)</option>
              </select>
              <button type="submit" className="btn btn-primary" style={{ height: '40px', background: '#059669', color: '#ffffff', fontWeight: 700 }}>Create</button>
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ height: '40px', border: '1.5px solid #cbd5e1', color: '#475569', fontWeight: 700 }} 
                onClick={() => { setIsCreatingScreen(false); setNewScreenName(''); }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button 
              className="btn btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px', background: '#0f172a', color: '#ffffff', fontWeight: 800 }}
              onClick={() => setIsCreatingScreen(true)}
            >
              <Plus size={16} /> Add TV Screen
            </button>
          )}
        </div>
      </div>

      {/* ── TV Screen Management Strip ───────────────────────────── */}
      <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-6)', background: '#ffffff', border: '1.5px solid #cbd5e1', borderRadius: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Connected TV Channels ({slideshows.length})
          </span>
          {slideshows.length > 1 && (
            <button 
              type="button"
              className="btn btn-secondary"
              style={{ height: '30px', fontSize: '12px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 700, background: '#ffffff' }}
              onClick={() => setIsCloneModalOpen(true)}
            >
              <Copy size={13} /> Clone Playlist to Another TV
            </button>
          )}
        </div>

        {/* Screen Cards Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--space-3)' }}>
          {loadingSlideshows ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', color: '#475569', fontWeight: 600 }}>
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
                    borderRadius: '12px',
                    border: isSelected ? '2px solid #059669' : '1.5px solid #cbd5e1',
                    background: isSelected ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 4px 14px rgba(5, 150, 105, 0.15)' : '0 1px 3px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        background: isSelected ? '#059669' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Tv size={18} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: isSelected ? '#065f46' : '#0f172a' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '11.5px', color: isSelected ? '#047857' : '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{isPortrait ? '📱 9:16 Portrait' : '📺 16:9 Landscape'}</span>
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <span style={{ fontSize: '10px', fontWeight: 800, background: '#059669', color: '#ffffff', padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.04em' }}>
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: isSelected ? '1px solid #bbf7d0' : '1px solid #e2e8f0', paddingTop: '8px', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: isSelected ? '#047857' : '#475569', fontWeight: 600 }}>
                      {s.transition || 'kenburns'}
                    </span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon"
                        style={{ width: '28px', height: '28px', padding: 0, border: '1px solid #cbd5e1', color: '#334155', background: '#ffffff' }}
                        title="Copy TV Link"
                        onClick={(e) => { e.stopPropagation(); copyDisplayUrl(s.id); }}
                      >
                        {copiedId === s.id ? <Check size={12} color="#059669" /> : <Copy size={12} />}
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
            
            {/* ── Add Posters Card (Streamlined URL-First with Live Preview) ── */}
            <div className="card card-padded" style={{ borderRadius: '16px', border: '1.5px solid #cbd5e1', background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="text-title3" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    <Plus size={18} style={{ color: '#059669' }} /> Add Poster Slide
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#475569', fontWeight: 500 }}>
                    Use free Postimages links or direct device upload with instant TV preview.
                  </p>
                </div>

                {/* Method Switcher: Postimages / Web Link & Device File Upload */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1.5px solid #cbd5e1', padding: '3px', borderRadius: '10px' }}>
                  <button 
                    type="button" 
                    className="btn"
                    style={{
                      height: '32px', 
                      padding: '0 14px', 
                      fontSize: '12px', 
                      fontWeight: 800,
                      borderRadius: '7px',
                      background: uploadMethod === 'url' ? '#0f172a' : 'transparent',
                      color: uploadMethod === 'url' ? '#ffffff' : '#334155',
                      border: 'none',
                      boxShadow: uploadMethod === 'url' ? '0 1px 3px rgba(15,23,42,0.2)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    onClick={() => setUploadMethod('url')}
                  >
                    <span>🔗 Postimages / Image URL</span>
                  </button>
                  <button 
                    type="button" 
                    className="btn"
                    style={{
                      height: '32px', 
                      padding: '0 14px', 
                      fontSize: '12px', 
                      fontWeight: 800,
                      borderRadius: '7px',
                      background: uploadMethod === 'file' ? '#0f172a' : 'transparent',
                      color: uploadMethod === 'file' ? '#ffffff' : '#334155',
                      border: 'none',
                      boxShadow: uploadMethod === 'file' ? '0 1px 3px rgba(15,23,42,0.2)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                    onClick={() => setUploadMethod('file')}
                  >
                    <Upload size={13} />
                    <span>Upload from Device (Free)</span>
                  </button>
                </div>
              </div>

              {/* High-Contrast Target TV Switcher */}
              <div style={{
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a' }}>
                    Display on:
                  </span>
                  <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: '3px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <button
                      type="button"
                      onClick={() => { setBroadcastToAll(false); setShowCustomTargetScreens(false); }}
                      style={{
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: !broadcastToAll ? '#0f172a' : 'transparent',
                        color: !broadcastToAll ? '#ffffff' : '#334155',
                        boxShadow: !broadcastToAll ? '0 2px 5px rgba(15,23,42,0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Tv size={13} /> {activeScreenDoc?.name ? `"${activeScreenDoc.name}" only` : 'Current TV'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setBroadcastToAll(true); setShowCustomTargetScreens(false); }}
                      style={{
                        border: 'none',
                        borderRadius: '6px',
                        padding: '5px 12px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: broadcastToAll ? '#0f172a' : 'transparent',
                        color: broadcastToAll ? '#ffffff' : '#334155',
                        boxShadow: broadcastToAll ? '0 2px 5px rgba(15,23,42,0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Zap size={13} /> All TVs ({slideshows.length})
                    </button>
                  </div>
                </div>

                {slideshows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowCustomTargetScreens(v => !v)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#0369a1',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      padding: '4px 8px'
                    }}
                  >
                    {showCustomTargetScreens ? 'Hide selection ▲' : 'Custom TVs ▼'}
                  </button>
                )}
              </div>

              {/* Custom TV screen checkboxes (collapsed by default) */}
              {showCustomTargetScreens && !broadcastToAll && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '10px 14px 14px', marginTop: '-8px', marginBottom: '14px', background: '#f8fafc', border: '1.5px solid #cbd5e1', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  {slideshows.map(s => {
                    const isChecked = targetScreenIds.includes(s.id);
                    return (
                      <label 
                        key={s.id} 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          padding: '6px 12px', 
                          borderRadius: '8px', 
                          fontSize: '12px', 
                          fontWeight: 700,
                          cursor: 'pointer',
                          background: isChecked ? '#e0f2fe' : '#ffffff',
                          color: isChecked ? '#0369a1' : '#0f172a',
                          border: isChecked ? '1.5px solid #0284c7' : '1.5px solid #cbd5e1',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => handleToggleTargetScreen(s.id)}
                          style={{ accentColor: '#059669' }}
                        />
                        {s.name}
                      </label>
                    );
                  })}
                </div>
              )}

              {/* ── Mode 1: Device File Upload ── */}
              {uploadMethod === 'file' && (
                <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    style={{ display: 'none' }} 
                  />

                  {selectedFiles.length === 0 ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files) {
                          handleFileChange({ target: { files: e.dataTransfer.files } });
                        }
                      }}
                      style={{
                        border: '2px dashed #059669',
                        borderRadius: '12px',
                        padding: '36px 20px',
                        background: '#f0fdf4',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                        <Upload size={26} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                          Click to select poster images from your device
                        </div>
                        <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '3px' }}>
                          or drag & drop files here • JPG, PNG, WEBP (automatically optimized for 1080p TV)
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ height: '36px', fontSize: '12px', fontWeight: 800, background: '#059669', color: '#ffffff', borderRadius: '8px', border: 'none', padding: '0 18px', marginTop: '4px' }}
                      >
                        Browse Files
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                          Selected Images ({selectedFiles.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            background: '#f1f5f9',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            color: '#0f172a',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Plus size={13} /> Add More Files
                        </button>
                      </div>

                      {/* File Cards Strip */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px' }}>
                        {selectedFiles.map((file, idx) => {
                          const previewUrl = URL.createObjectURL(file);
                          const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
                          return (
                            <div 
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 10px',
                                borderRadius: '10px',
                                border: '1.5px solid #cbd5e1',
                                background: '#ffffff',
                                position: 'relative'
                              }}
                            >
                              <img 
                                src={previewUrl} 
                                alt={file.name} 
                                style={{ width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover', background: '#0f172a', flexShrink: 0 }} 
                              />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {file.name}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                  {sizeMb} MB
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeSelectedFile(idx)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#dc2626',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title="Remove file"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Duration Setting */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                          Display Duration per Slide:
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '90px' }}>
                          <input 
                            type="number" 
                            min="1" 
                            max="300" 
                            className="form-input"
                            style={{ height: '36px', fontSize: '13px', fontWeight: 700, borderRadius: '8px', paddingRight: '22px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a' }}
                            value={uploadDuration}
                            onChange={e => setUploadDuration(e.target.value)}
                          />
                          <span style={{ position: 'absolute', right: '8px', fontSize: '12px', fontWeight: 800, color: '#475569', pointerEvents: 'none' }}>
                            s
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Upload Progress Bar if active */}
                  {uploadProgress && (
                    <div style={{ marginTop: '8px', background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #cbd5e1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        <span>Uploading {uploadProgress.fileName}... ({uploadProgress.current}/{uploadProgress.total})</span>
                        <span>{uploadProgress.percent}%</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ width: `${uploadProgress.percent}%`, height: '100%', background: '#059669', transition: 'width 0.2s ease' }} />
                      </div>
                    </div>
                  )}

                  {/* Submit Action for File Upload */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isUploading || selectedFiles.length === 0}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        height: '42px',
                        padding: '0 24px',
                        fontSize: '13px',
                        fontWeight: 800,
                        borderRadius: '10px',
                        background: '#059669',
                        boxShadow: '0 2px 8px rgba(5,150,105,0.35)',
                        border: 'none',
                        color: '#ffffff',
                        cursor: isUploading || selectedFiles.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: isUploading || selectedFiles.length === 0 ? 0.6 : 1
                      }}
                    >
                      {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      {isUploading 
                        ? 'Optimizing & Uploading...' 
                        : broadcastToAll 
                        ? `+ Upload & Broadcast to All TVs (${selectedFiles.length || 0})` 
                        : `+ Upload & Add to "${activeScreenDoc?.name || 'Screen'}" (${selectedFiles.length || 0})`}
                    </button>
                  </div>
                </form>
              )}

              {/* ── Mode 2: Web Image Link (URL & Postimages) ── */}
              {uploadMethod === 'url' && (
                <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Postimages Free Service Helper Card */}
                  <div style={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '240px', flex: 1 }}>
                      <div style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        background: '#059669',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        fontSize: '18px',
                        flexShrink: 0
                      }}>
                        P
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#065f46', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          Upload Free on Postimages (postimages.org)
                          <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', border: '1px solid #86efac', fontWeight: 700 }}>
                            100% Free • No Account
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px', lineHeight: 1.4 }}>
                          Upload your image → Copy the <strong>"Direct link"</strong> (starts with <code>https://i.postimg.cc/...</code>) → Paste below!
                        </div>
                      </div>
                    </div>
                    <a
                      href="https://postimages.org"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{
                        height: '34px',
                        padding: '0 14px',
                        fontSize: '12px',
                        fontWeight: 800,
                        background: '#059669',
                        color: '#ffffff',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 2px 4px rgba(5,150,105,0.2)'
                      }}
                    >
                      <span>Open Postimages.org</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>

                  {/* Inputs Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px 100px', gap: '10px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
                        Image Link (URL) *
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input 
                          type="url" 
                          placeholder="Paste direct image link (e.g. https://i.postimg.cc/.../burger.jpg)" 
                          className="form-input"
                          style={{
                            paddingRight: pastedUrl ? '32px' : '12px',
                            height: '42px',
                            fontSize: '13px',
                            fontWeight: 600,
                            borderRadius: '10px',
                            border: previewStatus === 'valid' ? '2px solid #059669' : previewStatus === 'error' ? '2px solid #dc2626' : '1.5px solid #cbd5e1',
                            background: '#ffffff',
                            color: '#0f172a'
                          }}
                          value={pastedUrl}
                          onChange={e => handleUrlInput(e.target.value)}
                          autoFocus
                        />
                        {pastedUrl && (
                          <button
                            type="button"
                            onClick={() => { setPastedUrl(''); setPastedTitle(''); setPreviewStatus('idle'); }}
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '4px'
                            }}
                            title="Clear URL"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
                        Title (Optional)
                      </label>
                      <input 
                        type="text" 
                        placeholder="e.g. Combo Deal" 
                        className="form-input"
                        style={{ height: '42px', fontSize: '13px', fontWeight: 600, borderRadius: '10px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a' }}
                        value={pastedTitle}
                        onChange={e => setPastedTitle(e.target.value)}
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'block' }}>
                        Duration
                      </label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input 
                          type="number" 
                          min="1" 
                          max="300" 
                          className="form-input"
                          style={{ height: '42px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', paddingRight: '24px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a' }}
                          value={uploadDuration}
                          onChange={e => setUploadDuration(e.target.value)}
                        />
                        <span style={{ position: 'absolute', right: '10px', fontSize: '12px', fontWeight: 800, color: '#475569', pointerEvents: 'none' }}>
                          s
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warning if user pasted postimg.cc gallery page instead of direct link */}
                  {isPostimgPageLink && (
                    <div style={{
                      background: '#fffbeb',
                      border: '1.5px solid #f59e0b',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      fontSize: '12.5px',
                      color: '#92400e',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}>
                      <span style={{ fontSize: '18px', lineHeight: 1 }}>💡</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#b45309' }}>
                          Postimages Direct Link Needed
                        </div>
                        <div style={{ marginTop: '2px', color: '#78350f', lineHeight: 1.4 }}>
                          You pasted the Postimages viewer page link (<code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>{pastedUrl}</code>). 
                          TV screens need the direct image file to show your poster. On Postimages, look for the row labeled <strong>"Direct link"</strong> (starts with <code style={{ background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>https://i.postimg.cc/...</code> and ends in .jpg/.png) and paste that here!
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick Sample Presets */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Quick Presets:
                    </span>
                    {SAMPLE_POSTERS.map((sample, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSample(sample)}
                        style={{
                          background: pastedUrl === sample.url ? '#ecfdf5' : '#ffffff',
                          border: pastedUrl === sample.url ? '1.5px solid #059669' : '1.5px solid #cbd5e1',
                          color: pastedUrl === sample.url ? '#065f46' : '#0f172a',
                          padding: '5px 12px',
                          borderRadius: '999px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: pastedUrl === sample.url ? '0 1px 3px rgba(5,150,105,0.2)' : '0 1px 2px rgba(0,0,0,0.03)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>

                  {/* Live Image Preview Window */}
                  {pastedUrl.trim() && (
                    <div style={{
                      marginTop: '6px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: previewStatus === 'valid' ? '2px solid #059669' : previewStatus === 'error' ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                      background: '#090d16',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      {/* Status header */}
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                        <span style={{ fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                          LIVE TV PREVIEW ({activeScreenDoc?.orientation === 'portrait' ? '9:16 Portrait' : '16:9 Landscape'})
                        </span>
                        {previewStatus === 'valid' && (
                          <span style={{ color: '#34d399', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={13} /> Valid Image {previewDims ? `(${previewDims.width}×${previewDims.height}px)` : ''}
                          </span>
                        )}
                        {previewStatus === 'loading' && (
                          <span style={{ color: '#60a5fa', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Loader2 size={12} className="animate-spin" /> Verifying link...
                          </span>
                        )}
                        {previewStatus === 'error' && (
                          <span style={{ color: '#f87171', fontWeight: 700 }}>
                            ⚠️ Unable to load image link
                          </span>
                        )}
                      </div>

                      {/* Aspect Ratio Preview Canvas */}
                      <div style={{
                        width: '100%',
                        maxWidth: activeScreenDoc?.orientation === 'portrait' ? '200px' : '440px',
                        aspectRatio: activeScreenDoc?.orientation === 'portrait' ? '9/16' : '16/9',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        background: '#000000',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {previewStatus === 'valid' && (
                          <img 
                            src={pastedUrl} 
                            alt="Live Preview" 
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: activeScreenDoc?.fitMode === 'cover' ? 'cover' : 'contain'
                            }}
                          />
                        )}
                        {previewStatus === 'loading' && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                            <Loader2 size={24} className="animate-spin" />
                            <span style={{ fontSize: '11px', fontWeight: 600 }}>Loading preview...</span>
                          </div>
                        )}
                        {previewStatus === 'error' && (
                          <div style={{ textAlign: 'center', padding: '16px', color: '#f87171', fontSize: '11px' }}>
                            <p style={{ margin: 0, fontWeight: 800 }}>Cannot display image</p>
                            <p style={{ margin: '4px 0 0', opacity: 0.9, fontSize: '10px', color: '#cbd5e1' }}>Direct link must end in .jpg, .png, or .webp</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Submit Action for URL */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button 
                      type="submit" 
                      className="btn btn-primary"
                      disabled={isUploading || !pastedUrl.trim() || previewStatus === 'error' || previewStatus === 'loading'}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        height: '42px',
                        padding: '0 24px',
                        fontSize: '13px',
                        fontWeight: 800,
                        borderRadius: '10px',
                        background: '#059669',
                        boxShadow: '0 2px 8px rgba(5,150,105,0.35)',
                        border: 'none',
                        color: '#ffffff',
                        cursor: isUploading || !pastedUrl.trim() || previewStatus === 'error' ? 'not-allowed' : 'pointer',
                        opacity: isUploading || !pastedUrl.trim() || previewStatus === 'error' ? 0.6 : 1
                      }}
                    >
                      {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      {isUploading ? 'Adding to TV...' : broadcastToAll ? `+ Broadcast to All TVs (${slideshows.length})` : `+ Add to "${activeScreenDoc?.name || 'Screen'}"`}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* ── Slideshow Playlist Card ─────────────────────────────── */}
            <div className="card card-padded" style={{ borderRadius: '16px', border: '1.5px solid #cbd5e1', background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3 className="text-title3" style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                    Playlist for "{screenName}"
                  </h3>
                  <p style={{ marginTop: '2px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                    {posters.length} slide{posters.length !== 1 ? 's' : ''} total • {totalDuration}s loop cycle
                  </p>
                </div>

                {/* Bulk Actions Bar if items selected */}
                {selectedPosterIds.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '4px 10px', borderRadius: '8px', border: '1.5px solid #cbd5e1', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#065f46' }}>
                      {selectedPosterIds.length} selected
                    </span>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ height: '28px', fontSize: '11px', padding: '0 8px', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 700 }}
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
                        style={{ width: '48px', height: '28px', fontSize: '11px', padding: '0 4px', border: '1.5px solid #cbd5e1', borderRadius: '4px', background: '#ffffff', color: '#0f172a', fontWeight: 700 }}
                        value={bulkDurationInput}
                        onChange={e => setBulkDurationInput(e.target.value)}
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        style={{ height: '28px', fontSize: '11px', padding: '0 6px', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 700 }}
                        onClick={handleBulkSetDuration}
                      >
                        Set Duration
                      </button>
                    </div>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ height: '28px', fontSize: '11px', padding: '0 8px', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 700 }}
                      onClick={() => handleBulkToggleActive(true)}
                    >
                      Activate
                    </button>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      style={{ height: '28px', fontSize: '11px', padding: '0 8px', color: '#dc2626', border: '1px solid #fca5a5', fontWeight: 700 }}
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
                      style={{ height: '32px', fontSize: '12px', padding: '0 12px', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 700, background: '#ffffff' }}
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
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: '#475569' }}>
                  <Tv size={48} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                  <p style={{ fontWeight: 700, color: '#0f172a' }}>No posters uploaded yet for "{screenName}".</p>
                  <p style={{ fontSize: '13px', marginTop: '4px', color: '#475569' }}>Upload 1 or multiple posters above to start your TV slideshow.</p>
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
                          border: isSelected ? '2px solid #059669' : '1.5px solid #cbd5e1', 
                          borderRadius: '12px',
                          background: isSelected ? '#f0fdf4' : (poster.isActive ? '#ffffff' : '#f8fafc'),
                          opacity: poster.isActive ? 1 : 0.75,
                          transition: 'border-color 0.15s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                        }}
                      >
                        {/* Checkbox for bulk actions */}
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectPoster(poster.id)}
                          style={{ accentColor: '#059669', width: '16px', height: '16px', cursor: 'pointer' }}
                        />

                        {/* Order index badge */}
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', width: '22px', textAlign: 'center' }}>
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
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              if (e.currentTarget.nextElementSibling) {
                                e.currentTarget.nextElementSibling.style.display = 'flex';
                              }
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                          <div style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: '#1e293b', color: '#94a3b8', fontSize: '9px', gap: '2px', flexDirection: 'column' }}>
                            <Tv size={14} />
                            <span>Preview</span>
                          </div>
                        </div>

                        {/* Poster Details */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {poster.title}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                            {/* Duration input */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>Duration:</span>
                              <input 
                                type="number" 
                                min="1" 
                                max="300"
                                style={{ width: '48px', height: '24px', padding: '0 6px', fontSize: '12px', border: '1.5px solid #cbd5e1', borderRadius: '5px', background: '#ffffff', color: '#0f172a', fontWeight: 700 }}
                                value={poster.duration || defaultDuration}
                                onChange={e => handleUpdatePosterDuration(poster.id, e.target.value)}
                              />
                              <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>s</span>
                            </div>

                            {/* Assign to TVs button / pill */}
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(poster)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '12px',
                                padding: '3px 10px',
                                fontSize: '11px',
                                fontWeight: 700,
                                color: '#1d4ed8',
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
                            style={{ width: '30px', height: '30px', borderRadius: '50%', padding: 0, background: poster.isActive ? '#0f172a' : '#ffffff', color: poster.isActive ? '#ffffff' : '#475569', border: '1px solid #cbd5e1' }}
                            title={poster.isActive ? 'Deactivate' : 'Activate'}
                            onClick={() => handleTogglePosterActive(poster)}
                          >
                            {poster.isActive ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>

                          {/* Reorder Buttons */}
                          <button 
                            className="btn btn-secondary btn-icon"
                            style={{ width: '30px', height: '30px', padding: 0, border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155' }}
                            disabled={index === 0}
                            onClick={() => handleMovePoster(index, -1)}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button 
                            className="btn btn-secondary btn-icon"
                            style={{ width: '30px', height: '30px', padding: 0, border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155' }}
                            disabled={index === posters.length - 1}
                            onClick={() => handleMovePoster(index, 1)}
                          >
                            <ArrowDown size={13} />
                          </button>

                          {/* Delete */}
                          <button 
                            className="btn btn-secondary btn-icon"
                            style={{ width: '30px', height: '30px', padding: 0, color: '#dc2626', border: '1px solid #fca5a5', background: '#ffffff' }}
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
            background: 'var(--color-bg-elevated)',
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
                        border: isChecked ? '2px solid #059669' : '1.5px solid #cbd5e1',
                        background: isChecked ? '#f0fdf4' : '#ffffff',
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
                          style={{ accentColor: '#059669', width: '16px', height: '16px' }}
                        />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{s.name}</div>
                          <div style={{ fontSize: '11.5px', color: isChecked ? '#047857' : '#475569', fontWeight: 600 }}>
                            {s.orientation === 'portrait' ? '📱 9:16 Portrait' : '📺 16:9 Landscape'}
                          </div>
                        </div>
                      </div>

                      {isChecked && (
                        <CheckCircle2 size={18} color="#059669" />
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
            background: 'var(--color-bg-elevated)',
            borderRadius: '16px',
            maxWidth: '440px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Copy size={20} style={{ color: 'var(--accent)' }} /> Clone Playlist
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--color-label-secondary)', marginBottom: '16px' }}>
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
            background: 'var(--color-bg-elevated)',
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

            <div style={{ textAlign: 'center', padding: '16px', background: 'var(--color-bg-secondary)', borderRadius: '12px', marginBottom: '16px' }}>
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
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--color-label)', marginTop: '10px' }}>
                {screenName}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
                Scan with your phone or point your Smart TV's camera/browser to launch
              </div>
            </div>

            {/* Direct Link Box */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
              <input 
                type="text" 
                readOnly 
                className="form-input"
                style={{ fontSize: '12px', height: '36px', background: 'var(--color-bg-secondary)' }}
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
            <div style={{ fontSize: '12px', color: 'var(--color-label)', background: 'var(--color-blue-light)', border: '1px solid var(--color-blue)', borderRadius: '10px', padding: '12px 16px' }}>
              <div style={{ fontWeight: 700, color: 'var(--color-blue)', marginBottom: '6px' }}>
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
    <div className="card card-padded" style={{ position: 'sticky', top: 'var(--space-6)', borderRadius: '16px', border: '1.5px solid #cbd5e1', background: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
        <h3 className="text-title3" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
          <Settings size={18} /> TV Settings
        </h3>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: '10px' }}>
          {slideshowSettings.name}
        </span>
      </div>

      {/* Settings Sub-Tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', background: '#e2e8f0', padding: '4px', borderRadius: '10px', border: '1px solid #cbd5e1', marginBottom: 'var(--space-4)' }}>
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
              background: settingsTab === t.id ? '#0f172a' : 'transparent',
              color: settingsTab === t.id ? '#ffffff' : '#334155',
              border: 'none',
              borderRadius: '7px',
              padding: '7px 4px',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: settingsTab === t.id ? '0 2px 4px rgba(15,23,42,0.2)' : 'none',
              transition: 'all 0.15s ease'
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
            <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>Screen Channel Name</label>
            <input 
              type="text" 
              className="form-input"
              style={{ height: '40px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
              value={slideshowSettings.name}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>Orientation & Aspect Ratio</label>
            <select 
              className="form-select"
              style={{ height: '40px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
              value={slideshowSettings.orientation}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, orientation: e.target.value })}
            >
              <option value="landscape">📺 Landscape 16:9 (Standard TV)</option>
              <option value="portrait">📱 Portrait 9:16 (Vertical Kiosk/Pillar)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>Poster Image Fit Mode</label>
            <select 
              className="form-select"
              style={{ height: '40px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
              value={slideshowSettings.fitMode}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, fitMode: e.target.value })}
            >
              <option value="contain">🖼️ Contain (Letterbox / No Crop)</option>
              <option value="cover">📐 Cover (Fill Full Screen Edge-to-Edge)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>Screen Background Color</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input 
                type="color" 
                value={slideshowSettings.backgroundColor || '#000000'}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, backgroundColor: e.target.value })}
                style={{ width: '40px', height: '40px', border: '1.5px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#0f172a', fontWeight: 700 }}>
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
            <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>Transition Animation</label>
            <select 
              className="form-select"
              style={{ height: '40px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Transition Speed</label>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#065f46' }}>
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
              style={{ width: '100%', accentColor: '#059669' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475569', fontWeight: 600 }}>
              <span>Fast (0.4s)</span>
              <span>Cinematic (3.0s)</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' }}>Default Slide Duration (seconds)</label>
            <input 
              type="number" 
              min="1" 
              max="300" 
              className="form-input"
              style={{ height: '40px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 700 }}
              value={slideshowSettings.defaultDuration}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, defaultDuration: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.shuffle}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, shuffle: e.target.checked })}
                style={{ accentColor: '#059669', width: '16px', height: '16px' }}
              />
              <span>Shuffle / Randomize slide order</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.showProgressBar}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, showProgressBar: e.target.checked })}
                style={{ accentColor: '#059669', width: '16px', height: '16px' }}
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
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={slideshowSettings.showClock}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, showClock: e.target.checked })}
              style={{ accentColor: '#059669', width: '16px', height: '16px' }}
            />
            <span>Show Live Clock & Date Overlay</span>
          </label>

          {/* DineOS Branding */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={slideshowSettings.showBranding}
              onChange={e => setSlideshowSettings({ ...slideshowSettings, showBranding: e.target.checked })}
              style={{ accentColor: '#059669', width: '16px', height: '16px' }}
            />
            <span>Show Restaurant & DineOS Badge</span>
          </label>

          {/* Announcement Ticker */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer', marginBottom: '8px' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.showTicker}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, showTicker: e.target.checked })}
                style={{ accentColor: '#059669', width: '16px', height: '16px' }}
              />
              <span>Running Announcement Ticker</span>
            </label>

            {slideshowSettings.showTicker && (
              <textarea 
                className="form-input"
                rows="2"
                placeholder="e.g. 🎉 Happy Hour 4-7 PM: 20% off all beverages • Ask your server for chef dessert specials!"
                style={{ fontSize: '12.5px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 500 }}
                value={slideshowSettings.tickerText}
                onChange={e => setSlideshowSettings({ ...slideshowSettings, tickerText: e.target.value })}
              />
            )}
          </div>

          {/* Guest Wi-Fi */}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0f172a', cursor: 'pointer', marginBottom: '8px' }}>
              <input 
                type="checkbox" 
                checked={slideshowSettings.wifiInfo?.show}
                onChange={e => setSlideshowSettings({ 
                  ...slideshowSettings, 
                  wifiInfo: { ...slideshowSettings.wifiInfo, show: e.target.checked } 
                })}
                style={{ accentColor: '#059669', width: '16px', height: '16px' }}
              />
              <span>Show Guest Wi-Fi Info Pill</span>
            </label>

            {slideshowSettings.wifiInfo?.show && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input 
                  type="text" 
                  placeholder="Wi-Fi SSID (Name)" 
                  className="form-input"
                  style={{ height: '36px', fontSize: '12.5px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
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
                  style={{ height: '36px', fontSize: '12.5px', borderRadius: '8px', border: '1.5px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontWeight: 600 }}
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
          <p style={{ fontSize: '12.5px', color: '#475569', margin: 0, fontWeight: 500 }}>
            Control physical TVs located in your dining area remotely without touching the TV remote.
          </p>

          <button 
            type="button" 
            className="btn btn-secondary"
            disabled={sendingRemoteCmd}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px', color: '#0369a1', border: '1.5px solid #7dd3fc', background: '#f0f9ff', fontWeight: 700 }}
            onClick={() => onSendRemoteCommand('identify', slideshowSettings.name)}
          >
            <Zap size={16} /> Identify TV Screen (Flash Banner)
          </button>

          <button 
            type="button" 
            className="btn btn-secondary"
            disabled={sendingRemoteCmd}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 700, background: '#ffffff' }}
            onClick={() => onSendRemoteCommand('reload', slideshowSettings.name)}
          >
            <RefreshCw size={16} /> Force TV Remote Reload
          </button>

          <a 
            href={`/display/slides/${screen?.id}`} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px', textDecoration: 'none', border: '1.5px solid #cbd5e1', color: '#0f172a', fontWeight: 700, background: '#ffffff' }}
          >
            <ExternalLink size={16} /> Open TV Screen in New Tab
          </a>

          <button 
            type="button" 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '40px', color: '#dc2626', border: '1.5px solid #fca5a5', background: '#fef2f2', fontWeight: 700, marginTop: '8px' }}
            onClick={() => onDeleteScreen(slideshowSettings.name)}
          >
            <Trash2 size={16} /> Delete This TV Channel
          </button>
        </div>
      )}

      {/* Save Settings Button */}
      <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid #cbd5e1', paddingTop: 'var(--space-3)' }}>
        <button 
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '42px', borderRadius: '10px', background: '#0f172a', color: '#ffffff', fontWeight: 800, fontSize: '13.5px', boxShadow: '0 2px 8px rgba(15,23,42,0.25)', border: 'none', cursor: 'pointer' }}
          onClick={() => onSave(slideshowSettings)}
        >
          <Save size={16} /> Save Screen Config
        </button>
      </div>
    </div>
  );
}
