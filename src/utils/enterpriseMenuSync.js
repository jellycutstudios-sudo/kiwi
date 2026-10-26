/**
 * Enterprise Menu Sync & Franchise Multi-Store Engine
 * Powers master menu inheritance, localized pricing adjustments,
 * global 86'ing across outlets, and enterprise hierarchy permissions.
 */

export const ENTERPRISE_ROLES = {
  franchise_owner: {
    id: 'franchise_owner',
    title: 'Franchise Owner / Executive HQ',
    description: 'Full unconstrained access to all branches, group P&L, master menu pushes, and franchise settings.',
    badgeColor: '#8b5cf6',
    permissions: [
      'view_all_stores',
      'manage_all_menus',
      'push_master_menu',
      'view_group_analytics',
      'manage_franchise_staff',
      'manage_billing',
      'export_financials',
      'global_86'
    ]
  },
  regional_manager: {
    id: 'regional_manager',
    title: 'Regional Area Manager',
    description: 'Oversees multiple assigned branches in a city or territory, audits inventory, and approves localized menu pricing.',
    badgeColor: '#3b82f6',
    permissions: [
      'view_assigned_stores',
      'push_master_menu',
      'view_group_analytics',
      'manage_branch_inventory',
      'approve_discounts',
      'global_86'
    ]
  },
  store_manager: {
    id: 'store_manager',
    title: 'General Store Manager',
    description: 'Runs daily operations, manages local staff schedules, till shifts, and local table configurations for a single branch.',
    badgeColor: '#10b981',
    permissions: [
      'view_store',
      'edit_local_menu',
      'view_store_analytics',
      'manage_store_staff',
      'void_orders',
      'manage_cash_drawer'
    ]
  },
  cashier: {
    id: 'cashier',
    title: 'POS Cashier & Table Server',
    description: 'Takes orders, operates stationary POS register and pocket handheld mobile mode, processes customer payments.',
    badgeColor: '#64748b',
    permissions: [
      'pos_register',
      'handheld_mode',
      'take_orders',
      'print_bills',
      'tableside_pay'
    ]
  }
};

/**
 * Checks whether a given role has a specific enterprise permission
 */
export function checkEnterprisePermission(roleId, permissionKey) {
  if (!roleId || !ENTERPRISE_ROLES[roleId]) return false;
  return ENTERPRISE_ROLES[roleId].permissions.includes(permissionKey);
}

/**
 * Calculates a branch-specific localized price based on adjustment rules
 * @param {number} basePrice - The source dish price
 * @param {Object} adjustment - Adjustment parameters: { type: 'percent'|'fixed', value: number, roundTo?: number }
 * @param {Object} explicitOverrides - Map of { itemId: customPrice }
 * @param {string} itemId - The ID of the item
 * @returns {number} The calculated localized price
 */
export function calculateLocalizedPrice(basePrice, adjustment = null, explicitOverrides = {}, itemId = null) {
  const numBase = Number(basePrice) || 0;

  // 1. Check for explicit fixed item override first
  if (itemId && explicitOverrides && explicitOverrides[itemId] !== undefined) {
    const override = Number(explicitOverrides[itemId]);
    if (!isNaN(override) && override >= 0) {
      return Math.round(override * 100) / 100;
    }
  }

  // 2. If no adjustment rule, return original base price
  if (!adjustment || !adjustment.value) {
    return Math.round(numBase * 100) / 100;
  }

  const { type = 'percent', value = 0, roundTo = null } = adjustment;
  let adjusted = numBase;

  if (type === 'percent') {
    // E.g. value = 10 for +10% airport/prime markup, or -5 for discount
    adjusted = numBase * (1 + (Number(value) / 100));
  } else if (type === 'fixed') {
    // E.g. value = 2 for +$2 flat surcharge
    adjusted = numBase + Number(value);
  }

  // Ensure non-negative
  adjusted = Math.max(0, adjusted);

  // Smart rounding if configured (e.g., nearest 0.50 or 1.00)
  if (roundTo && roundTo > 0) {
    adjusted = Math.round(adjusted / roundTo) * roundTo;
  }

  return Math.round(adjusted * 100) / 100;
}

/**
 * Prepares master menu categories and items with localized prices for a target branch
 * @param {Array} masterCategories - Array of category documents from master outlet
 * @param {Object} branchConfig - { adjustment: { type, value }, explicitOverrides: {} }
 * @returns {Array} Cloned and localized categories payload
 */
export function prepareMasterMenuPayload(masterCategories = [], branchConfig = {}) {
  if (!Array.isArray(masterCategories)) return [];

  const { adjustment = null, explicitOverrides = {} } = branchConfig;

  return masterCategories.map(cat => ({
    name: cat.name || 'Category',
    emoji: cat.emoji || '🍽️',
    taxRate: cat.taxRate ?? null,
    sortOrder: cat.sortOrder ?? 0,
    items: (cat.items || []).map(item => {
      const localizedPrice = calculateLocalizedPrice(
        item.price,
        adjustment,
        explicitOverrides,
        item.id
      );

      return {
        ...item,
        price: localizedPrice,
        masterBasePrice: item.price,
        isMasterInherited: true,
        lastSyncedAt: new Date().toISOString()
      };
    })
  }));
}

/**
 * Toggles an item's availability across multiple outlets (Global 86'ing)
 * @param {Array} outletsCategories - Array of category arrays from multiple branches
 * @param {string} targetItemName - Name of the item to 86 or restore
 * @param {boolean} available - true for in-stock, false for 86'd
 * @returns {Object} { affectedBranches, totalItemsUpdated }
 */
export function applyGlobal86(outletsCategories = [], targetItemName, available = false) {
  if (!targetItemName) return { affectedBranches: 0, totalItemsUpdated: 0 };

  const normTarget = targetItemName.trim().toLowerCase();
  let affectedBranches = 0;
  let totalItemsUpdated = 0;

  const updatedOutlets = outletsCategories.map(branchCats => {
    let branchUpdated = false;
    const newCats = branchCats.map(cat => {
      const newItems = (cat.items || []).map(item => {
        if (item.name && item.name.trim().toLowerCase() === normTarget) {
          totalItemsUpdated++;
          branchUpdated = true;
          return { ...item, available: Boolean(available), eightySixedAt: available ? null : new Date().toISOString() };
        }
        return item;
      });
      return { ...cat, items: newItems };
    });

    if (branchUpdated) affectedBranches++;
    return newCats;
  });

  return {
    affectedBranches,
    totalItemsUpdated,
    updatedOutlets
  };
}
