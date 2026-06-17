const admin = require('firebase-admin');

/**
 * Helper to fetch complete menu from Firestore
 */
async function getRestaurantMenu(restaurantId) {
  const db = admin.firestore();
  const menuSnap = await db.collection('restaurants').doc(restaurantId).collection('menu').get();
  
  const menu = [];
  menuSnap.forEach(doc => {
    menu.push({
      id: doc.id,
      ...doc.data()
    });
  });
  return menu;
}

/**
 * Helper to fetch platform-specific overrides
 */
async function getPlatformOverrides(restaurantId, platform) {
  const db = admin.firestore();
  const itemsSnap = await db.collection('restaurants').doc(restaurantId)
    .collection('deliverySettings').doc(platform).collection('items').get();
  
  const categoriesSnap = await db.collection('restaurants').doc(restaurantId)
    .collection('deliverySettings').doc(platform).collection('categories').get();
  
  const items = {};
  itemsSnap.forEach(doc => {
    items[doc.id] = doc.data();
  });

  const categories = {};
  categoriesSnap.forEach(doc => {
    categories[doc.id] = doc.data();
  });

  return { items, categories };
}

/**
 * Format menu to Uber Eats Catalog format
 */
function formatForUberEats(menu, overrides) {
  const itemOverrides = overrides && overrides.items ? overrides.items : (overrides || {});
  const categoryOverrides = overrides && overrides.categories ? overrides.categories : {};

  const activeCategories = menu.filter(cat => {
    const catOverride = categoryOverrides[cat.id];
    return !catOverride || catOverride.available !== false;
  });

  const categories = activeCategories.map(cat => {
    const items = (cat.items || [])
      .filter(item => {
        // filter out items marked as unavailable on this platform
        const override = itemOverrides[item.id];
        if (override && override.available === false) return false;
        return item.available !== false;
      })
      .map(item => ({
        id: item.id,
        title: { translations: { en: item.name } },
        description: { translations: { en: item.description || '' } },
        price_info: {
          price: Math.round(item.price * 100), // Uber Eats uses cents
          currency_code: 'INR'
        },
        image_url: ''
      }));

    return {
      id: cat.id,
      title: { translations: { en: cat.name } },
      entities: items.map(item => ({
        id: item.id,
        type: 'ITEM'
      })),
      items // Store actual items here for ease of serialization
    };
  });

  // Flatten items list for Uber catalog representation
  const allItems = categories.flatMap(cat => cat.items);

  return {
    catalog: {
      categories: categories.map(cat => ({
        id: cat.id,
        title: cat.title,
        entities: cat.entities
      })),
      items: allItems.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        price_info: item.price_info
      }))
    }
  };
}

/**
 * Format menu to Zomato Menu format
 */
function formatForZomato(menu, overrides) {
  const itemOverrides = overrides && overrides.items ? overrides.items : (overrides || {});
  const categoryOverrides = overrides && overrides.categories ? overrides.categories : {};

  const activeCategories = menu.filter(cat => {
    const catOverride = categoryOverrides[cat.id];
    return !catOverride || catOverride.available !== false;
  });

  return {
    categories: activeCategories.map(cat => ({
      category_id: cat.id,
      category_name: cat.name,
      items: (cat.items || [])
        .filter(item => {
          const override = itemOverrides[item.id];
          if (override && override.available === false) return false;
          return item.available !== false;
        })
        .map(item => ({
          item_id: item.id,
          name: item.name,
          price: item.price,
          description: item.description || '',
          in_stock: true
        }))
    }))
  };
}

/**
 * Format menu to Swiggy Menu format
 */
function formatForSwiggy(menu, overrides) {
  const itemOverrides = overrides && overrides.items ? overrides.items : (overrides || {});
  const categoryOverrides = overrides && overrides.categories ? overrides.categories : {};

  const activeCategories = menu.filter(cat => {
    const catOverride = categoryOverrides[cat.id];
    return !catOverride || catOverride.available !== false;
  });

  return {
    menu: {
      categories: activeCategories.map(cat => ({
        id: cat.id,
        name: cat.name,
        items: (cat.items || [])
          .filter(item => {
            const override = itemOverrides[item.id];
            if (override && override.available === false) return false;
            return item.available !== false;
          })
          .map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            description: item.description || '',
            status: 'available'
          }))
      }))
    }
  };
}

/**
 * Format menu to Deliveroo Menu format
 */
function formatForDeliveroo(menu, overrides) {
  const itemOverrides = overrides && overrides.items ? overrides.items : (overrides || {});
  const categoryOverrides = overrides && overrides.categories ? overrides.categories : {};

  const activeCategories = menu.filter(cat => {
    const catOverride = categoryOverrides[cat.id];
    return !catOverride || catOverride.available !== false;
  });

  return {
    categories: activeCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      items: (cat.items || [])
        .filter(item => {
          const override = itemOverrides[item.id];
          if (override && override.available === false) return false;
          return item.available !== false;
        })
        .map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          description: item.description || '',
          available: true
        }))
    }))
  };
}

/**
 * Perform actual sync request for a given platform
 */
async function syncPlatformMenu(restaurantId, platform, config, menu, overrides) {
  const db = admin.firestore();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const syncLogRef = db.collection('restaurants').doc(restaurantId)
    .collection('deliverySync').doc(platform).collection('logs').doc(timestamp);

  let payload = null;
  let url = '';
  let headers = {};
  let method = 'POST';

  try {
    switch (platform) {
      case 'ubereats':
        payload = formatForUberEats(menu, overrides);
        url = `https://api.uber.com/v1/stores/${config.storeId}/catalog`;
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.accessToken || 'MOCK_TOKEN'}`
        };
        method = 'PUT';
        break;
      case 'zomato':
        payload = formatForZomato(menu, overrides);
        url = 'https://api.zomato.com/v1/menu/sync';
        headers = {
          'Content-Type': 'application/json',
          'x-zomato-api-key': config.apiKey,
          'restaurant-id': config.restaurantId
        };
        break;
      case 'swiggy':
        payload = formatForSwiggy(menu, overrides);
        url = 'https://api.swiggy.com/v1/menu/sync';
        headers = {
          'Content-Type': 'application/json',
          'x-swiggy-api-key': config.apiKey,
          'restaurant-id': config.restaurantId
        };
        break;
      case 'deliveroo':
        payload = formatForDeliveroo(menu, overrides);
        url = 'https://api.deliveroo.com/v1/menu/sync';
        headers = {
          'Content-Type': 'application/json',
          'x-deliveroo-api-key': config.apiKey,
          'restaurant-id': config.restaurantId
        };
        break;
      default:
        throw new Error('Unsupported platform: ' + platform);
    }

    // Check if configuration credentials are placeholder or empty
    const isMock = !config || 
                   (platform === 'ubereats' && (!config.clientId || config.clientId.includes('client_id_'))) ||
                   (platform !== 'ubereats' && (!config.apiKey || config.apiKey.includes('api_key_')));

    let itemsCount = menu.reduce((sum, cat) => sum + (cat.items?.length || 0), 0);

    if (isMock) {
      console.log(`[MOCK SYNC] Simulating menu sync for ${platform} at restaurant ${restaurantId}. Payload items: ${itemsCount}`);
      // Write mock log
      await syncLogRef.set({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: 'success',
        itemsSynced: itemsCount,
        details: 'Simulated sync successful (Sandbox Mode).'
      });
      return { success: true, platform, itemsSynced: itemsCount, simulated: true };
    }

    // Perform actual API Call via Fetch
    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned HTTP ${response.status}: ${errorText}`);
    }

    await syncLogRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'success',
      itemsSynced: itemsCount,
      details: 'Sync successful.'
    });

    return { success: true, platform, itemsSynced: itemsCount, simulated: false };

  } catch (error) {
    console.error(`Error syncing menu for ${platform} at restaurant ${restaurantId}:`, error);
    await syncLogRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: 'failed',
      error: error.message
    });
    return { success: false, platform, error: error.message };
  }
}

/**
 * Main function to sync menu for all active platforms
 */
async function syncAllEnabledPlatforms(restaurantId, targetPlatform = null) {
  const db = admin.firestore();
  const restDoc = await db.collection('restaurants').doc(restaurantId).get();
  
  if (!restDoc.exists) {
    throw new Error('Restaurant not found: ' + restaurantId);
  }

  const data = restDoc.data();
  const integrations = data.deliveryIntegrations || {};
  let activePlatforms = Object.keys(integrations).filter(platform => integrations[platform].enabled === true);

  if (targetPlatform) {
    if (!activePlatforms.includes(targetPlatform)) {
      throw new Error(`Platform ${targetPlatform} is not enabled or supported.`);
    }
    activePlatforms = [targetPlatform];
  }

  if (activePlatforms.length === 0) {
    return { message: 'No active delivery integrations found.', synced: [] };
  }

  const menu = await getRestaurantMenu(restaurantId);
  const results = [];

  for (const platform of activePlatforms) {
    const overrides = await getPlatformOverrides(restaurantId, platform);
    const result = await syncPlatformMenu(restaurantId, platform, integrations[platform], menu, overrides);
    results.push(result);
  }

  return { message: 'Sync complete.', results };
}

module.exports = {
  syncAllEnabledPlatforms,
  syncPlatformMenu,
  formatForUberEats,
  formatForZomato,
  formatForSwiggy,
  formatForDeliveroo
};

