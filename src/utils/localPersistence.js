/**
 * Local Data Persistence & Zero-Cloud Sovereignty Utility
 * Ensures offline/local-only data is eviction-proof, redundant, and exportable.
 */

export const LOCAL_STORAGE_KEYS = [
  'dineos_offline_order_queue',
  'dineos_settings_tab',
  'dineos_last_active_shift',
  'dineos_table_layout_cache',
  'dineos_offline_ledger',
];

/**
 * Check if the browser has granted persistent storage (eviction-proof)
 */
export async function getStorageProtectionStatus() {
  const result = {
    supported: false,
    persisted: false,
    usageBytes: 0,
    quotaBytes: 0,
    usageFormatted: '0 MB',
  };

  if (typeof navigator === 'undefined' || !navigator.storage) {
    return result;
  }

  result.supported = true;

  try {
    if (typeof navigator.storage.persisted === 'function') {
      result.persisted = await navigator.storage.persisted();
      if (!result.persisted && typeof navigator.storage.persist === 'function') {
        result.persisted = await navigator.storage.persist();
      }
    }

    if (typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      result.usageBytes = estimate.usage || 0;
      result.quotaBytes = estimate.quota || 0;
      const mb = (result.usageBytes / (1024 * 1024)).toFixed(1);
      result.usageFormatted = `${mb} MB`;
    }
  } catch (err) {
    console.warn('Could not inspect storage estimate:', err);
  }

  return result;
}

/**
 * Export complete local database (Orders, Settings, Cached Menus, Tables) into a portable JSON file
 */
export function exportLocalStoreBackup(restaurant = {}) {
  const backup = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    restaurantId: restaurant?.id || 'local_store',
    restaurantName: restaurant?.name || 'Local Restaurant',
    localStorage: {},
    system: 'DineOS Local-Only Data Sovereignty'
  };

  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('dineos_') || key.startsWith('firebase:'))) {
        try {
          const val = localStorage.getItem(key);
          backup.localStorage[key] = val;
        } catch {}
      }
    }
  }

  const jsonString = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (restaurant?.name || 'store').toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `dineos_local_backup_${safeName}_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { ok: true, filename: a.download };
}

/**
 * Restore an exported JSON backup file into local browser storage
 */
export function restoreLocalStoreBackup(jsonContent) {
  try {
    const data = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    if (!data || !data.localStorage) {
      throw new Error('Invalid DineOS backup file: missing localStorage payload.');
    }

    if (typeof localStorage === 'undefined') {
      throw new Error('Local storage is not supported in this environment.');
    }

    let restoredCount = 0;
    Object.entries(data.localStorage).forEach(([key, value]) => {
      if (key && typeof value === 'string') {
        localStorage.setItem(key, value);
        restoredCount++;
      }
    });

    return { ok: true, restoredCount };
  } catch (err) {
    console.error('Failed to restore local backup:', err);
    return { ok: false, error: err.message };
  }
}
