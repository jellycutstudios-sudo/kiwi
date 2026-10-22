import { useState, useRef } from 'react';
import { useMenuStore } from '../../stores/menuStore';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import {
  X, UploadCloud, Download, FileText, CheckCircle2, AlertTriangle,
  Layers, Utensils, RefreshCw, HelpCircle, ArrowRight, ShieldAlert, Sparkles, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  parseMenuCSV,
  generateMenuCSVTemplate,
  exportMenuToCSV
} from '../../utils/menuCsvParser';
import { formatCurrency } from '../../utils/formatCurrency';

export default function MenuCsvModal({ isOpen, onClose, restaurant }) {
  if (!isOpen) return null;

  const { categories, setCategories } = useMenuStore();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('import'); // 'import' | 'export' | 'guide'
  const [dragActive, setDragActive] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [importMode, setImportMode] = useState('merge'); // 'merge' | 'replace'
  const [previewSearch, setPreviewSearch] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Download official sample template
  const handleDownloadTemplate = () => {
    try {
      const csvContent = generateMenuCSVTemplate();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'dineos_menu_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Sample CSV template downloaded! Includes Chicken 65 options.', { icon: '📄' });
    } catch (err) {
      console.error('Error downloading template:', err);
      toast.error('Failed to download template: ' + err.message);
    }
  };

  // Export current active menu
  const handleExportMenu = () => {
    try {
      if (!categories || categories.length === 0) {
        toast.error('No menu items available to export!');
        return;
      }
      exportMenuToCSV(categories, restaurant?.name || 'Restaurant');
      toast.success('Menu exported successfully to CSV!', { icon: '📊' });
    } catch (err) {
      console.error('Error exporting menu:', err);
      toast.error('Failed to export menu: ' + err.message);
    }
  };

  // Read and parse file
  const handleFileProcess = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Please upload a valid .csv file');
      return;
    }

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const result = parseMenuCSV(text);
      setParsedData(result);
      if (result.errors && result.errors.length > 0) {
        toast.error(`Found ${result.errors.length} issue(s) in CSV. Review below.`, { icon: '⚠️' });
      } else {
        toast.success(`Successfully parsed ${result.totalItems} items across ${result.categories.length} categories!`, { icon: '✅' });
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read the file.');
    };
    reader.readAsText(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };

  // Execute bulk import to Firestore & local state
  const handleExecuteImport = async () => {
    if (!parsedData || !parsedData.categories || parsedData.categories.length === 0) {
      toast.error('No valid menu data to import!');
      return;
    }

    if (importMode === 'replace') {
      const confirmed = window.confirm(
        '⚠️ Are you sure you want to REPLACE the entire menu? This will remove all existing categories and items!'
      );
      if (!confirmed) return;
    }

    setIsProcessing(true);
    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    try {
      let finalCategories = [];

      if (importMode === 'replace') {
        // Mode 1: Replace entire menu
        if (!isLocalOnly && isOnline && restaurant?.id) {
          // Delete old categories from Firestore
          for (const oldCat of categories) {
            try {
              await deleteDoc(doc(db, 'restaurants', restaurant.id, 'menu', oldCat.id));
            } catch (err) {
              console.warn(`Could not delete old category ${oldCat.id}:`, err);
            }
          }
        }

        // Add each new category
        for (const cat of parsedData.categories) {
          let catId = cat.id;
          if (!isLocalOnly && isOnline && restaurant?.id) {
            try {
              const docRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'menu'), {
                name: cat.name,
                emoji: cat.emoji || '🍽️',
                items: cat.items || []
              });
              catId = docRef.id;
            } catch (err) {
              console.warn('Error syncing new category to Firestore:', err);
            }
          }
          finalCategories.push({
            ...cat,
            id: catId
          });
        }
      } else {
        // Mode 2: Merge / Append
        // Clone existing categories
        finalCategories = categories.map(c => ({
          ...c,
          items: Array.isArray(c.items) ? [...c.items] : []
        }));

        for (const newCat of parsedData.categories) {
          const existingIdx = finalCategories.findIndex(
            c => c.name.trim().toLowerCase() === newCat.name.trim().toLowerCase()
          );

          if (existingIdx >= 0) {
            // Append items to existing category
            const existingCat = finalCategories[existingIdx];
            const currentItems = existingCat.items || [];
            
            // Append new items (give them unique IDs)
            const updatedItems = [...currentItems, ...newCat.items];
            finalCategories[existingIdx] = {
              ...existingCat,
              items: updatedItems
            };

            if (!isLocalOnly && isOnline && restaurant?.id) {
              try {
                await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', existingCat.id), {
                  items: updatedItems
                });
              } catch (err) {
                console.warn(`Could not update category ${existingCat.id} in Firestore:`, err);
              }
            }
          } else {
            // Create brand new category
            let newCatId = newCat.id;
            if (!isLocalOnly && isOnline && restaurant?.id) {
              try {
                const docRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'menu'), {
                  name: newCat.name,
                  emoji: newCat.emoji || '🍽️',
                  items: newCat.items || []
                });
                newCatId = docRef.id;
              } catch (err) {
                console.warn('Error saving category to Firestore:', err);
              }
            }
            finalCategories.push({
              ...newCat,
              id: newCatId
            });
          }
        }
      }

      // Update local Zustand store & localStorage cache
      setCategories(finalCategories);
      try {
        localStorage.setItem('dineos_cached_menu', JSON.stringify(finalCategories));
      } catch (err) {
        console.warn('Local storage cache write failed:', err);
      }

      toast.success(
        `Successfully imported ${parsedData.totalItems} items!`,
        { icon: '🎉', duration: 4500 }
      );
      onClose();
    } catch (err) {
      console.error('Import execution error:', err);
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter preview items by search term
  const allPreviewItems = parsedData?.categories
    ? parsedData.categories.flatMap(c => (c.items || []).map(item => ({ ...item, categoryName: c.name, categoryEmoji: c.emoji })))
    : [];

  const filteredPreviewItems = previewSearch.trim()
    ? allPreviewItems.filter(i =>
        i.name.toLowerCase().includes(previewSearch.toLowerCase()) ||
        i.categoryName.toLowerCase().includes(previewSearch.toLowerCase()) ||
        (i.description || '').toLowerCase().includes(previewSearch.toLowerCase())
      )
    : allPreviewItems;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 'var(--z-modal)' }}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 920,
          width: '95vw',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-bg-elevated)',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(16,185,129,0.18))',
              border: '1px solid rgba(59,130,246,0.3)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UploadCloud size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: 'var(--color-label)' }}>
                Bulk Menu Import & Export (CSV)
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                Import dishes in bulk with full modifier variations (Dry/Gravy/Paste, sizes, & add-ons)
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-icon btn-sm"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{
          display: 'flex',
          background: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-separator-opaque)',
          padding: '4px 14px',
          gap: 6,
          flexShrink: 0
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: activeTab === 'import' ? 700 : 500,
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: activeTab === 'import' ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === 'import' ? 'var(--color-label)' : 'var(--color-label-secondary)',
              cursor: 'pointer',
              boxShadow: activeTab === 'import' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <UploadCloud size={15} /> Import Menu CSV
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: activeTab === 'export' ? 700 : 500,
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: activeTab === 'export' ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === 'export' ? 'var(--color-label)' : 'var(--color-label-secondary)',
              cursor: 'pointer',
              boxShadow: activeTab === 'export' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <Download size={15} /> Export Menu
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: activeTab === 'guide' ? 700 : 500,
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: activeTab === 'guide' ? 'var(--color-bg-elevated)' : 'transparent',
              color: activeTab === 'guide' ? 'var(--color-label)' : 'var(--color-label-secondary)',
              cursor: 'pointer',
              boxShadow: activeTab === 'guide' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <HelpCircle size={15} /> Format & Modifiers Guide
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'var(--color-bg-primary)' }}>
          {/* TAB 1: IMPORT */}
          {activeTab === 'import' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Template Download Banner */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(16,185,129,0.08))',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 'var(--radius-lg)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    background: 'var(--color-primary)',
                    color: '#fff',
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <FileText size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--color-label)' }}>
                      New to CSV import? Start with our template
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                      Pre-filled with starter dishes like Chicken 65 (Dry/Gravy/Paste), Paneer Tikka, and Pizzas.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleDownloadTemplate}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                >
                  <Download size={14} /> Download Sample Template (.csv)
                </button>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'var(--color-separator)'}`,
                  background: dragActive ? 'rgba(59,130,246,0.05)' : 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '30px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileInputChange}
                  style={{ display: 'none' }}
                />
                <div style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-separator)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  color: 'var(--color-primary)'
                }}>
                  <UploadCloud size={24} />
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-label)' }}>
                  {csvFileName ? `Selected: ${csvFileName}` : 'Click to upload or drag & drop CSV file'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: 4 }}>
                  Accepts standard comma-separated (.csv) files up to 10MB
                </div>
                {csvFileName && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={{ marginTop: 12, fontSize: '11.5px', padding: '4px 10px' }}
                  >
                    Choose Different File
                  </button>
                )}
              </div>

              {/* Parsed Preview Section */}
              {parsedData && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Summary Bar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                    background: 'var(--color-bg-secondary)',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-separator-opaque)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 600, color: 'var(--color-label)' }}>
                        <Utensils size={15} color="var(--color-primary)" />
                        <span>{parsedData.totalItems} Dishes</span>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 600, color: 'var(--color-label)' }}>
                        <Layers size={15} color="var(--color-accent)" />
                        <span>{parsedData.categories.length} Categories</span>
                      </div>
                      {parsedData.errors && parsedData.errors.length > 0 && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12.5px', fontWeight: 600, color: 'var(--color-danger)' }}>
                          <AlertTriangle size={14} />
                          <span>{parsedData.errors.length} Warning(s)</span>
                        </div>
                      )}
                    </div>

                    {/* Mode Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-label-secondary)' }}>Import Mode:</span>
                      <div style={{
                        display: 'flex',
                        background: 'var(--color-bg-primary)',
                        padding: '2px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-separator)'
                      }}>
                        <button
                          type="button"
                          onClick={() => setImportMode('merge')}
                          style={{
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: 'calc(var(--radius-md) - 2px)',
                            fontSize: '11.5px',
                            fontWeight: importMode === 'merge' ? 700 : 500,
                            background: importMode === 'merge' ? 'var(--color-primary)' : 'transparent',
                            color: importMode === 'merge' ? '#fff' : 'var(--color-label)',
                            cursor: 'pointer'
                          }}
                        >
                          Append / Merge (Safe)
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportMode('replace')}
                          style={{
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: 'calc(var(--radius-md) - 2px)',
                            fontSize: '11.5px',
                            fontWeight: importMode === 'replace' ? 700 : 500,
                            background: importMode === 'replace' ? 'var(--color-danger)' : 'transparent',
                            color: importMode === 'replace' ? '#fff' : 'var(--color-label)',
                            cursor: 'pointer'
                          }}
                        >
                          Replace Entire Menu
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Warnings Box if any */}
                  {parsedData.errors && parsedData.errors.length > 0 && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 14px',
                      fontSize: '12px',
                      color: 'var(--color-danger)'
                    }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Note about skipped rows:</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {parsedData.errors.slice(0, 5).map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                        {parsedData.errors.length > 5 && (
                          <li>...and {parsedData.errors.length - 5} more issues</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Filter & Live Preview Table */}
                  <div style={{
                    border: '1px solid var(--color-separator-opaque)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    background: 'var(--color-bg-elevated)'
                  }}>
                    <div style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--color-separator-opaque)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-bg-secondary)'
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-label)' }}>
                        Items Preview ({filteredPreviewItems.length} of {allPreviewItems.length})
                      </span>
                      <div style={{ position: 'relative', width: 220 }}>
                        <input
                          type="text"
                          placeholder="Filter preview items..."
                          value={previewSearch}
                          onChange={(e) => setPreviewSearch(e.target.value)}
                          style={{
                            width: '100%',
                            height: 28,
                            padding: '0 8px 0 26px',
                            fontSize: '12px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-separator)',
                            background: 'var(--color-bg-primary)',
                            color: 'var(--color-label)'
                          }}
                        />
                        <Filter size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-secondary)' }} />
                      </div>
                    </div>

                    <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator-opaque)', textAlign: 'left', color: 'var(--color-label-secondary)' }}>
                            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Category</th>
                            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Item Name</th>
                            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Price</th>
                            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Dietary</th>
                            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Station</th>
                            <th style={{ padding: '8px 12px', fontWeight: 600 }}>Options / Modifiers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPreviewItems.map((item, index) => {
                            const modCount = item.modifierGroups?.length || 0;
                            return (
                              <tr key={item.id || index} style={{ borderBottom: '1px solid var(--color-separator-opaque)' }}>
                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                                  <span style={{ marginRight: 4 }}>{item.categoryEmoji}</span>
                                  <span style={{ fontWeight: 600 }}>{item.categoryName}</span>
                                </td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-label)' }}>
                                  <span style={{ marginRight: 4 }}>{item.emoji}</span>
                                  {item.name}
                                  {item.isBestseller && <span style={{ marginLeft: 5, fontSize: '11px' }}>🔥</span>}
                                </td>
                                <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--color-accent)' }}>
                                  {formatCurrency(item.price)}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {item.dietary === 'veg' ? (
                                    <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.12)', color: '#10b981', fontWeight: 600, fontSize: '10.5px' }}>Veg</span>
                                  ) : (
                                    <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 600, fontSize: '10.5px' }}>Non-Veg</span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 12px', color: 'var(--color-label-secondary)' }}>
                                  {item.station || 'Kitchen'}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  {modCount > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      {item.modifierGroups.map((g, gi) => (
                                        <div key={gi} style={{ fontSize: '11px', color: 'var(--color-label)' }}>
                                          <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{g.name}: </span>
                                          <span style={{ color: 'var(--color-label-secondary)' }}>
                                            {g.options.map(o => `${o.name} (${o.priceAdd > 0 ? `+₹${o.priceAdd}` : '+₹0'})`).join(', ')}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--color-label-tertiary)', fontSize: '11px' }}>Standard</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXPORT */}
          {activeTab === 'export' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                border: '1px solid var(--color-separator-opaque)',
                textAlign: 'center'
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.12)',
                  color: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <Download size={28} />
                </div>
                <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: 'var(--color-label)' }}>
                  Export Menu to Spreadsheet
                </h4>
                <p style={{ margin: '0 auto 20px', maxWidth: 440, fontSize: '13px', color: 'var(--color-label-secondary)', lineHeight: 1.5 }}>
                  Download your entire restaurant menu as an RFC-compliant CSV file. This includes all categories, dishes, prices, barcodes, kitchen stations, and full modifier option configurations.
                </p>

                <div style={{
                  display: 'inline-flex',
                  gap: 16,
                  background: 'var(--color-bg-elevated)',
                  padding: '10px 18px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-separator)',
                  marginBottom: 20
                }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)', display: 'block' }}>Categories</span>
                    <strong style={{ fontSize: '15px', color: 'var(--color-label)' }}>{categories.length}</strong>
                  </div>
                  <div style={{ width: 1, background: 'var(--color-separator)' }} />
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)', display: 'block' }}>Total Dishes</span>
                    <strong style={{ fontSize: '15px', color: 'var(--color-label)' }}>
                      {categories.reduce((acc, c) => acc + (c.items?.length || 0), 0)}
                    </strong>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleExportMenu}
                    style={{ padding: '10px 22px', fontSize: '13.5px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    <Download size={16} /> Download Menu CSV
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: FORMAT GUIDE */}
          {activeTab === 'guide' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                border: '1px solid var(--color-separator-opaque)'
              }}>
                <h4 style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: 'var(--color-label)' }}>
                  CSV Columns Specification
                </h4>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--color-label-secondary)' }}>
                  Your CSV should contain the following column headers in the first row:
                </p>
                <div style={{
                  background: 'var(--color-bg-primary)',
                  padding: '10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-separator)',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  marginTop: 10,
                  overflowX: 'auto',
                  color: 'var(--color-label)'
                }}>
                  Category, Name, Price, Description, Emoji, Dietary, Station, Barcode, Unit, Available, Bestseller, Modifiers
                </div>
              </div>

              {/* Modifier Syntax Guide */}
              <div style={{
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '16px'
              }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: 'var(--color-primary)' }}>
                  Dish Options & Modifiers Syntax (e.g. Chicken 65)
                </h4>
                <p style={{ margin: '0 0 10px', fontSize: '12.5px', color: 'var(--color-label)', lineHeight: 1.5 }}>
                  You can specify multiple modifier groups using a pipe (<code style={{ background: 'var(--color-bg-elevated)', padding: '2px 5px', borderRadius: 4 }}>|</code>) separator. Each group defines its name followed by comma-separated choices with optional extra price in parentheses.
                </p>

                <div style={{
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-separator)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: 'var(--color-label)',
                  lineHeight: 1.6
                }}>
                  <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Example 1 (Chicken 65 Preparation & Portions):</div>
                  Preparation: Dry (+0), Gravy (+30), Paste (+40) | Portion: Half (+0), Full (+140)
                  <br /><br />
                  <div style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Example 2 (Pizza Crust & Addons):</div>
                  Crust: Hand Tossed (+0), Cheese Burst (+80) | Addons (multi): Extra Cheese (+50), Jalapenos (+30)
                </div>

                <div style={{ marginTop: 12, fontSize: '12px', color: 'var(--color-label-secondary)', lineHeight: 1.5 }}>
                  • <strong>Single Choice (Pick 1):</strong> Just specify the group name (e.g. <code>Preparation: ...</code>). The system requires exactly 1 choice.
                  <br />
                  • <strong>Multiple Choice:</strong> Add <code>(multi)</code> or <code>(optional)</code> to the group name (e.g. <code>Addons (multi): ...</code>). Customers can select any or none.
                </div>
              </div>

              {/* Download Sample button */}
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleDownloadTemplate}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
                >
                  <Download size={14} /> Download Sample Template with Examples (.csv)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 22px',
          borderTop: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-bg-elevated)',
          flexShrink: 0
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>

          {activeTab === 'import' && parsedData && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExecuteImport}
              disabled={isProcessing || !parsedData.categories || parsedData.categories.length === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
                padding: '9px 20px',
                background: importMode === 'replace' ? 'var(--color-danger)' : undefined
              }}
            >
              {isProcessing ? (
                <>
                  <RefreshCw size={15} className="spin" />
                  Importing Menu...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  {importMode === 'replace' ? `Replace All & Import ${parsedData.totalItems} Items` : `Merge & Import ${parsedData.totalItems} Items`}
                </>
              )}
            </button>
          )}

          {activeTab === 'export' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportMenu}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <Download size={15} /> Export Menu (.csv)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
