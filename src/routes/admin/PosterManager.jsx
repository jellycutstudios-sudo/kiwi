import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { usePosterStore } from '../../stores/posterStore';
import { 
  Tv, Plus, Trash2, Edit2, Save, Copy, Check, ExternalLink, 
  Upload, ArrowUp, ArrowDown, Info, Settings, Loader2, Eye, EyeOff 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function PosterManager() {
  const { restaurant } = useAuthStore();
  const { 
    slideshows, posters, loadingSlideshows, loadingPosters, uploadProgress,
    subscribeSlideshows, subscribePosters, addSlideshow, updateSlideshow, 
    deleteSlideshow, uploadPoster, addPosterLink, updatePoster, deletePoster, reorderPosters 
  } = usePosterStore();

  const [selectedSlideshowId, setSelectedSlideshowId] = useState('');
  const [isCreatingScreen, setIsCreatingScreen] = useState(false);
  const [newScreenName, setNewScreenName] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  
  // Local state for editing slideshow settings
  const [slideshowSettings, setSlideshowSettings] = useState({
    name: '',
    transition: 'kenburns',
    defaultDuration: 6
  });

  // Local state for uploading poster metadata
  const [uploadMethod, setUploadMethod] = useState('file'); // 'file' or 'url'
  const [pastedUrl, setPastedUrl] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDuration, setUploadDuration] = useState(6);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Subscribe to slideshows
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribeSlideshows(restaurant.id);
    return () => {
      if (unsub) unsub();
    };
  }, [restaurant?.id, subscribeSlideshows]);

  // Set default selected slideshow
  useEffect(() => {
    if (slideshows.length > 0 && !selectedSlideshowId) {
      setSelectedSlideshowId(slideshows[0].id);
    }
  }, [slideshows, selectedSlideshowId]);

  // Subscribe to posters for selected slideshow
  useEffect(() => {
    if (!restaurant?.id || !selectedSlideshowId) return;
    const unsub = subscribePosters(restaurant.id, selectedSlideshowId);
    
    // Set local settings state when slideshow changes
    const current = slideshows.find(s => s.id === selectedSlideshowId);
    if (current) {
      setSlideshowSettings({
        name: current.name || '',
        transition: current.transition || 'kenburns',
        defaultDuration: current.defaultDuration || 6
      });
    }

    return () => {
      if (unsub) unsub();
    };
  }, [restaurant?.id, selectedSlideshowId, subscribePosters, slideshows]);

  const handleCreateScreen = async (e) => {
    e.preventDefault();
    if (!newScreenName.trim()) return;
    try {
      const id = await addSlideshow(restaurant.id, newScreenName.trim());
      if (id) {
        setSelectedSlideshowId(id);
        setNewScreenName('');
        setIsCreatingScreen(false);
        toast.success('New TV Screen created!');
      }
    } catch (err) {
      toast.error('Failed to create screen');
    }
  };

  const handleSaveSettings = async () => {
    if (!slideshowSettings.name.trim()) {
      toast.error('Screen name is required');
      return;
    }
    try {
      await updateSlideshow(restaurant.id, selectedSlideshowId, {
        name: slideshowSettings.name.trim(),
        transition: slideshowSettings.transition,
        defaultDuration: Number(slideshowSettings.defaultDuration)
      });
      toast.success('Screen settings updated');
    } catch (err) {
      toast.error('Failed to update screen settings');
    }
  };

  const handleDeleteScreen = async () => {
    if (slideshows.length <= 1) {
      toast.error('You must keep at least one TV Screen');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete "${slideshowSettings.name}"? All uploaded posters for this screen will be deleted.`)) {
      return;
    }
    try {
      const targetIndex = slideshows.findIndex(s => s.id === selectedSlideshowId);
      const nextIndex = targetIndex === 0 ? 1 : targetIndex - 1;
      const nextId = slideshows[nextIndex].id;
      
      await deleteSlideshow(restaurant.id, selectedSlideshowId);
      setSelectedSlideshowId(nextId);
      toast.success('Screen deleted');
    } catch (err) {
      toast.error('Failed to delete screen');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Client-side validations
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WebP)');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image is too large. Maximum size allowed is 8MB.');
      return;
    }

    // Recommended size warning
    if (file.size > 3 * 1024 * 1024) {
      toast.warn('⚠️ File is over 3MB. High resolution files may take longer to load on TVs.');
    }

    // Aspect ratio check
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      if (Math.abs(ratio - 16/9) > 0.05) {
        toast.warn('⚠️ Image is not 16:9 aspect ratio. It will be letterboxed on TV screens.');
      }
    };
    img.src = URL.createObjectURL(file);

    setSelectedFile(file);
    if (!uploadTitle) {
      setUploadTitle(file.name.split('.')[0].replace(/[-_]/g, ' '));
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (uploadMethod === 'file') {
      if (!selectedFile) {
        toast.error('Please select an image first');
        return;
      }

      setUploading(true);
      try {
        await uploadPoster(
          restaurant.id, 
          selectedSlideshowId, 
          selectedFile, 
          uploadTitle.trim(), 
          Number(uploadDuration)
        );
        toast.success('Poster uploaded successfully!');
        setSelectedFile(null);
        setUploadTitle('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        toast.error('Failed to upload poster image');
      } finally {
        setUploading(false);
      }
    } else {
      if (!pastedUrl.trim()) {
        toast.error('Please enter a valid image URL');
        return;
      }
      if (!pastedUrl.startsWith('http://') && !pastedUrl.startsWith('https://')) {
        toast.error('Image URL must start with http:// or https://');
        return;
      }

      setUploading(true);
      try {
        let finalUrl = pastedUrl.trim();

        await addPosterLink(
          restaurant.id,
          selectedSlideshowId,
          uploadTitle.trim() || 'Custom Slide URL',
          finalUrl,
          Number(uploadDuration)
        );
        toast.success('Poster link added successfully!');
        setPastedUrl('');
        setUploadTitle('');
      } catch (err) {
        toast.error('Failed to add poster link');
      } finally {
        setUploading(false);
      }
    }
  };

  const handleTogglePosterActive = async (poster) => {
    try {
      await updatePoster(restaurant.id, selectedSlideshowId, poster.id, {
        isActive: !poster.isActive
      });
      toast.success(poster.isActive ? 'Poster deactivated' : 'Poster activated');
    } catch (err) {
      toast.error('Failed to update poster');
    }
  };

  const handleUpdatePosterDuration = async (posterId, seconds) => {
    const val = Number(seconds);
    if (isNaN(val) || val < 1) return;
    try {
      await updatePoster(restaurant.id, selectedSlideshowId, posterId, {
        duration: val
      });
    } catch (err) {
      console.error('Failed to update duration', err);
    }
  };

  const handleDeletePoster = async (poster) => {
    try {
      await deletePoster(restaurant.id, selectedSlideshowId, poster.id, poster.imageUrl);
      toast.success('Poster deleted');
    } catch (err) {
      toast.error('Failed to delete poster: ' + err.message);
    }
  };

  const handleMovePoster = async (index, direction) => {
    const newPosters = [...posters];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newPosters.length) return;

    // Swap
    const temp = newPosters[index];
    newPosters[index] = newPosters[targetIdx];
    newPosters[targetIdx] = temp;

    try {
      await reorderPosters(restaurant.id, selectedSlideshowId, newPosters);
    } catch (err) {
      toast.error('Failed to save new order');
    }
  };

  const copyDisplayUrl = () => {
    const url = `${window.location.origin}/display/slides/${restaurant?.id}/${selectedSlideshowId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(selectedSlideshowId);
    toast.success('TV Slideshow URL copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div>
          <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
            <Tv size={28} /> TV Poster Boards
          </h2>
          <p className="text-secondary text-caption1">
            Create slideshow screens and upload menu posters or offers for your Android TV displays.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {isCreatingScreen ? (
            <form onSubmit={handleCreateScreen} style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input 
                type="text" 
                placeholder="Screen name (e.g. Menu Board 1)" 
                className="form-input"
                style={{ width: '220px', height: '40px' }}
                value={newScreenName}
                onChange={e => setNewScreenName(e.target.value)}
                autoFocus
              />
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
              className="btn btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '40px' }}
              onClick={() => setIsCreatingScreen(true)}
            >
              <Plus size={16} /> New Screen Channel
            </button>
          )}
        </div>
      </div>

      {/* Screen Selector Dropdown */}
      <div className="card card-padded" style={{ marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>Active Screen:</span>
          {loadingSlideshows ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <select 
              className="form-select"
              style={{ width: '240px', fontWeight: 600 }}
              value={selectedSlideshowId}
              onChange={e => setSelectedSlideshowId(e.target.value)}
            >
              {slideshows.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        {selectedSlideshowId && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button 
              className="btn btn-secondary" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px', padding: '0 var(--space-4)' }}
              onClick={copyDisplayUrl}
            >
              {copiedId === selectedSlideshowId ? <Check size={16} color="var(--color-green)" /> : <Copy size={16} />}
              Copy Live TV URL
            </button>
            <a 
              href={`/display/slides/${restaurant?.id}/${selectedSlideshowId}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '38px', padding: '0 var(--space-4)', textDecoration: 'none' }}
            >
              <ExternalLink size={16} /> Open TV Screen
            </a>
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      {selectedSlideshowId && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-6)' }}>
          
          {/* Left Column: Posters List / Grid */}
          <div>
            {/* Upload Zone */}
            <div className="card card-padded" style={{ marginBottom: 'var(--space-6)' }}>
              <h3 className="text-title3" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={18} /> Add Poster or Menu
              </h3>

              {/* Method Selector Tabs */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                <button 
                  type="button" 
                  className={`btn ${uploadMethod === 'file' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ height: '36px', padding: '0 var(--space-4)', fontSize: '13px', borderRadius: 'var(--radius-md)' }}
                  onClick={() => setUploadMethod('file')}
                >
                  📁 Upload File
                </button>
                <button 
                  type="button" 
                  className={`btn ${uploadMethod === 'url' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ height: '36px', padding: '0 var(--space-4)', fontSize: '13px', borderRadius: 'var(--radius-md)' }}
                  onClick={() => setUploadMethod('url')}
                >
                  🔗 Use Image URL
                </button>
              </div>
              
              {/* Specification Note */}
              <div style={{ background: '#f8fafc', borderLeft: '4px solid var(--accent)', padding: 'var(--space-3)', borderRadius: '4px', marginBottom: 'var(--space-4)', fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <Info size={18} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Recommended Poster Specifications:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    <li>Resolution: <strong>1920 × 1080 px</strong> (Standard 1080p Landscape)</li>
                    <li>Aspect Ratio: <strong>16:9</strong> (prevents cropping/letterboxing on TV screen)</li>
                    <li>Formats: JPG, PNG, WebP — max size <strong>3 MB</strong> for best performance</li>
                  </ul>
                </div>
              </div>

              <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Poster Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Weekend Buffet Special" 
                      className="form-input"
                      value={uploadTitle}
                      onChange={e => setUploadTitle(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Slide Duration (seconds)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="300"
                      className="form-input"
                      value={uploadDuration}
                      onChange={e => setUploadDuration(e.target.value)}
                    />
                  </div>
                </div>

                {uploadMethod === 'file' ? (
                  <div style={{ border: '2px dashed #e2e8f0', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', textAlign: 'center', background: '#fafafa', cursor: 'pointer', position: 'relative' }}>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange}
                      ref={fileInputRef}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <Upload size={32} style={{ color: '#94a3b8' }} />
                      <span style={{ fontWeight: 600 }}>{selectedFile ? selectedFile.name : 'Click or Drag image file to select'}</span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Supports PNG, JPG, JPEG, WebP</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {/* Step-by-step guide */}
                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', fontSize: '13px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '10px', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📋 How to get a free image URL (3 easy steps)
                      </div>

                      {/* Service options */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
                        {[
                          { name: 'Postimg', url: 'https://postimages.org', desc: 'No signup needed', badge: '⭐ Recommended', color: '#22c55e' },
                          { name: 'ImgBB',  url: 'https://imgbb.com',      desc: 'Free account', badge: 'Simple UI', color: '#3b82f6' },
                          { name: 'Imgur',   url: 'https://imgur.com',      desc: 'No signup needed', badge: 'Popular', color: '#f97316' },
                        ].map(s => (
                          <a key={s.name} href={s.url} target="_blank" rel="noreferrer"
                            style={{ display: 'block', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '10px', textDecoration: 'none', color: 'inherit', transition: 'border-color .15s' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = s.color}
                            onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
                          >
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>{s.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{s.desc}</div>
                            <div style={{ fontSize: '11px', color: s.color, fontWeight: 600, marginTop: '4px' }}>{s.badge}</div>
                          </a>
                        ))}
                      </div>

                      {/* Steps */}
                      <ol style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#334155' }}>
                        <li><strong>Open</strong> one of the services above (click to open in new tab)</li>
                        <li><strong>Upload</strong> your poster image (1920×1080 px JPG/PNG recommended)</li>
                        <li>
                          <strong>Copy the direct image link</strong> — make sure it ends in <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>.jpg</code>, <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>.png</code> or <code style={{ background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>.webp</code>
                          <div style={{ marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', color: '#64748b' }}>
                            <strong>Postimg:</strong> After upload → right-click image → "Copy image address"<br/>
                            <strong>ImgBB:</strong> After upload → copy the "Direct link" field<br/>
                            <strong>Imgur:</strong> After upload → right-click image → "Copy image address"
                          </div>
                        </li>
                        <li><strong>Paste</strong> the link in the field below and click "Add Poster URL"</li>
                      </ol>
                    </div>

                    {/* URL input */}
                    <div className="form-group">
                      <label className="form-label">Image URL</label>
                      <input
                        type="url"
                        placeholder="e.g. https://i.postimg.cc/abc/poster.png"
                        className="form-input"
                        value={pastedUrl}
                        onChange={e => setPastedUrl(e.target.value)}
                      />
                      <span className="text-secondary text-caption2" style={{ marginTop: '4px', display: 'block' }}>
                        Must be a public direct link ending in .jpg, .png, or .webp
                      </span>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                  {uploadMethod === 'file' && selectedFile && (
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={() => { setSelectedFile(null); setUploadTitle(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    >
                      Clear Selection
                    </button>
                  )}
                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={uploadMethod === 'file' ? (!selectedFile || uploading) : (!pastedUrl.trim() || uploading)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {uploadMethod === 'file' ? 'Upload Poster' : 'Add Poster URL'}
                  </button>
                </div>
              </form>
            </div>

            {/* Poster List Card */}
            <div className="card card-padded">
              <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)' }}>Slideshow Playlist</h3>
              
              {loadingPosters ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-8)' }}>
                  <Loader2 size={32} className="animate-spin text-secondary" />
                </div>
              ) : posters.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: '#64748b' }}>
                  <Tv size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                  <p>No posters uploaded yet for this screen.</p>
                  <p style={{ fontSize: '13px', marginTop: '4px' }}>Upload an image above to populate your TV slideshow.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {posters.map((poster, index) => (
                    <div 
                      key={poster.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 'var(--space-4)', 
                        padding: 'var(--space-3)', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: 'var(--radius-md)',
                        background: poster.isActive ? '#fff' : '#f8fafc',
                        opacity: poster.isActive ? 1 : 0.8
                      }}
                    >
                      {/* Image Thumbnail */}
                      <div style={{ width: '80px', height: '45px', borderRadius: '4px', overflow: 'hidden', background: '#000', flexShrink: 0 }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
                          {/* Duration input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>Duration:</span>
                            <input 
                              type="number" 
                              min="1" 
                              style={{ width: '50px', height: '24px', padding: '0 4px', fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                              value={poster.duration || 6}
                              onChange={e => handleUpdatePosterDuration(poster.id, e.target.value)}
                            />
                            <span style={{ fontSize: '12px', color: '#64748b' }}>s</span>
                          </div>
                        </div>
                      </div>

                      {/* Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* Toggle Active */}
                        <button 
                          className={`btn btn-icon ${poster.isActive ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ width: '32px', height: '32px', borderRadius: '50%', padding: 0 }}
                          title={poster.isActive ? 'Deactivate' : 'Activate'}
                          onClick={() => handleTogglePosterActive(poster)}
                        >
                          {poster.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                        </button>

                        {/* Reorder Buttons */}
                        <button 
                          className="btn btn-secondary btn-icon"
                          style={{ width: '32px', height: '32px', padding: 0 }}
                          disabled={index === 0}
                          onClick={() => handleMovePoster(index, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button 
                          className="btn btn-secondary btn-icon"
                          style={{ width: '32px', height: '32px', padding: 0 }}
                          disabled={index === posters.length - 1}
                          onClick={() => handleMovePoster(index, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>

                        {/* Delete */}
                        <button 
                          className="btn btn-secondary btn-icon"
                          style={{ width: '32px', height: '32px', padding: 0, color: 'var(--color-red)' }}
                          onClick={() => handleDeletePoster(poster)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Screen Slideshow Settings */}
          <div>
            <div className="card card-padded" style={{ position: 'sticky', top: 'var(--space-6)' }}>
              <h3 className="text-title3" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={18} /> Screen Settings
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
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
                  <label className="form-label">Transition Style</label>
                  <select 
                    className="form-select"
                    value={slideshowSettings.transition}
                    onChange={e => setSlideshowSettings({ ...slideshowSettings, transition: e.target.value })}
                  >
                    <option value="kenburns">🎬 Ken Burns + Crossfade (Recommended)</option>
                    <option value="fade">💨 Smooth Fade</option>
                    <option value="slide">➡️ Slide Left</option>
                    <option value="zoom">🔍 Zoom In</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Default Slide Duration (seconds)</label>
                  <input 
                    type="number" 
                    min="1"
                    className="form-input"
                    value={slideshowSettings.defaultDuration}
                    onChange={e => setSlideshowSettings({ ...slideshowSettings, defaultDuration: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                  <button 
                    className="btn btn-primary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={handleSaveSettings}
                  >
                    <Save size={16} /> Save Screen Config
                  </button>

                  <button 
                    className="btn btn-secondary"
                    style={{ width: '100%', color: 'var(--color-red)', borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={handleDeleteScreen}
                  >
                    <Trash2 size={16} /> Delete Screen
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
