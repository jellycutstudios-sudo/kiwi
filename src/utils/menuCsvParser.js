/**
 * Menu CSV Parser & Exporter Utility for DineOS
 * Supports bulk importing and exporting dishes with category assignment,
 * pricing, dietary flags, stations, and full modifier groups/options (e.g. Chicken 65: Dry / Gravy / Paste).
 */

/**
 * Parses a standard RFC-4180 CSV text into an array of row objects
 */
export function parseCSVToRows(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const clean = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses modifier string syntax:
 * Example: "Preparation: Dry (+0), Gravy (+30), Paste (+40) | Portion: Half (+0), Full (+140)"
 */
export function parseModifierGroupsString(modifiersStr) {
  if (!modifiersStr || typeof modifiersStr !== 'string') return [];
  const trimmed = modifiersStr.trim();
  if (!trimmed) return [];

  // Split multiple groups separated by pipe (|) or double semicolons (;;) or newlines
  const groupChunks = trimmed.split(/\||;;|\n/).map(c => c.trim()).filter(Boolean);
  const modifierGroups = [];

  groupChunks.forEach((chunk, gIdx) => {
    let groupName = `Option ${gIdx + 1}`;
    let optionsPart = chunk;

    // Check if format is "GroupName: Option 1, Option 2"
    if (chunk.includes(':')) {
      const colonIdx = chunk.indexOf(':');
      groupName = chunk.slice(0, colonIdx).trim();
      optionsPart = chunk.slice(colonIdx + 1).trim();
    } else {
      // Chunk without colon is malformed, skip
      return;
    }

    // Determine type: Required (Pick 1) vs Optional (Multiple)
    const lowerName = groupName.toLowerCase();
    const isSingleChoice = 
      /preparation|style|size|portion|crust|base|flavor|type|choice|pick\s*1|required/i.test(lowerName) &&
      !/add-?ons?|extras?|toppings?|optional|multi/i.test(lowerName);

    // Strip indicator tags from group name e.g. "Addons (multi)" -> "Addons"
    const cleanGroupName = groupName.replace(/\s*\((multi|optional|required|pick\s*\d+)\)/gi, '').trim();

    // Split options separated by comma
    const optionChunks = optionsPart.split(/,(?![^(]*\))/).map(o => o.trim()).filter(Boolean);
    const options = [];

    optionChunks.forEach((optStr, oIdx) => {
      // Formats: "Gravy (+30)", "Gravy (30)", "Gravy:30", "Gravy +30", "Gravy"
      let name = optStr;
      let priceAdd = 0;

      // Match (+X) or (X) at end
      const priceMatchParen = optStr.match(/\(\s*([+-]?\s*[\d.]+)\s*\)$/);
      if (priceMatchParen) {
        name = optStr.replace(priceMatchParen[0], '').trim();
        priceAdd = parseFloat(priceMatchParen[1].replace(/\+/g, '').trim()) || 0;
      } else {
        const priceMatchColon = optStr.match(/[:+]\s*([\d.]+)$/);
        if (priceMatchColon) {
          name = optStr.replace(priceMatchColon[0], '').trim();
          priceAdd = parseFloat(priceMatchColon[1].trim()) || 0;
        }
      }

      if (name) {
        options.push({
          id: `opt-${Date.now()}-${gIdx}-${oIdx}-${Math.random().toString(36).substr(2, 4)}`,
          name: name.trim(),
          priceAdd: Math.max(0, priceAdd)
        });
      }
    });

    if (options.length > 0) {
      modifierGroups.push({
        id: `mod-${Date.now()}-${gIdx}-${Math.random().toString(36).substr(2, 4)}`,
        name: cleanGroupName || groupName,
        required: isSingleChoice,
        minSelect: isSingleChoice ? 1 : 0,
        maxSelect: isSingleChoice ? 1 : options.length,
        options
      });
    }
  });

  return modifierGroups;
}

/**
 * Normalizes an arbitrary header string to standard column keys
 */
function normalizeHeaderKey(header) {
  const h = (header || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['category', 'cat', 'categoryname', 'section'].includes(h)) return 'category';
  if (['itemname', 'name', 'dish', 'dishname', 'item', 'title'].includes(h)) return 'name';
  if (['price', 'cost', 'rate', 'itemprice', 'baseprice'].includes(h)) return 'price';
  if (['dietary', 'diet', 'veg', 'vegnonveg', 'isveg'].includes(h)) return 'dietary';
  if (['description', 'desc', 'details', 'about'].includes(h)) return 'description';
  if (['modifiers', 'modifier', 'options', 'variations', 'variants', 'addon', 'addons'].includes(h)) return 'modifiers';
  if (['station', 'kitchenstation', 'printstation', 'route'].includes(h)) return 'station';
  if (['bestseller', 'popular', 'featured', 'isbestseller'].includes(h)) return 'bestseller';
  if (['available', 'instock', 'active'].includes(h)) return 'available';
  if (['barcode', 'sku', 'code'].includes(h)) return 'barcode';
  if (['unit', 'uom'].includes(h)) return 'unit';
  if (['emoji', 'icon'].includes(h)) return 'emoji';
  if (['image', 'imageurl', 'photo'].includes(h)) return 'imageUrl';

  // Explicit option columns
  if (h.startsWith('option1choices') || h.startsWith('option1options')) return 'option1Choices';
  if (h.startsWith('option1name')) return 'option1Name';
  if (h.startsWith('option1required') || h.startsWith('option1type')) return 'option1Required';

  if (h.startsWith('option2choices') || h.startsWith('option2options')) return 'option2Choices';
  if (h.startsWith('option2name')) return 'option2Name';
  if (h.startsWith('option2required') || h.startsWith('option2type')) return 'option2Required';

  return header;
}

/**
 * Parses full Menu CSV text and returns structured categories and items
 */
export function parseMenuCSV(csvText) {
  const rows = parseCSVToRows(csvText);
  if (rows.length < 2) {
    return {
      success: false,
      error: 'CSV file is empty or missing headers.',
      items: [],
      categories: [],
      errors: []
    };
  }

  const rawHeaders = rows[0];
  const headerKeys = rawHeaders.map(normalizeHeaderKey);

  const categoryIdx = headerKeys.indexOf('category');
  const nameIdx = headerKeys.indexOf('name');
  const priceIdx = headerKeys.indexOf('price');
  const descIdx = headerKeys.indexOf('description');
  const dietaryIdx = headerKeys.indexOf('dietary');
  const modifiersIdx = headerKeys.indexOf('modifiers');
  const stationIdx = headerKeys.indexOf('station');
  const bestsellerIdx = headerKeys.indexOf('bestseller');
  const availableIdx = headerKeys.indexOf('available');
  const barcodeIdx = headerKeys.indexOf('barcode');
  const unitIdx = headerKeys.indexOf('unit');
  const emojiIdx = headerKeys.indexOf('emoji');
  const imageIdx = headerKeys.indexOf('imageUrl');

  // Explicit option columns indices
  const opt1NameIdx = headerKeys.indexOf('option1Name');
  const opt1ChoicesIdx = headerKeys.indexOf('option1Choices');
  const opt1ReqIdx = headerKeys.indexOf('option1Required');

  const opt2NameIdx = headerKeys.indexOf('option2Name');
  const opt2ChoicesIdx = headerKeys.indexOf('option2Choices');
  const opt2ReqIdx = headerKeys.indexOf('option2Required');

  if (nameIdx === -1 || priceIdx === -1) {
    return {
      success: false,
      error: 'CSV must contain at least "Item Name" and "Price" columns.',
      items: [],
      categories: [],
      errors: []
    };
  }

  const parsedItems = [];
  const errors = [];
  const categoryMap = new Map(); // Category Name -> Items array

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNumber = r + 1;

    const rawName = row[nameIdx] || '';
    const rawPrice = row[priceIdx] || '';
    const rawCategory = categoryIdx !== -1 ? (row[categoryIdx] || 'General') : 'General';

    if (!rawName.trim()) {
      if (rawPrice || (row[categoryIdx] && row[categoryIdx].trim())) {
        errors.push(`Row ${rowNumber}: Missing item name.`);
      }
      continue; // Skip blank lines
    }

    const price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, ''));
    if (isNaN(price) || price < 0) {
      errors.push(`Row ${rowNumber} ("${rawName}"): Invalid price "${rawPrice}". Must be a number.`);
      continue;
    }

    const categoryName = rawCategory.trim() || 'General';
    const description = descIdx !== -1 ? (row[descIdx] || '').trim() : '';

    // Dietary determination
    let isVeg = null;
    let dietary = null;
    if (dietaryIdx !== -1 && row[dietaryIdx]) {
      const d = row[dietaryIdx].toLowerCase().trim();
      if (['veg', 'vegetarian', 'yes', 'true', '1'].includes(d)) {
        isVeg = true;
        dietary = 'veg';
      } else if (['non-veg', 'nonveg', 'non vegetarian', 'no', 'false', '0'].includes(d)) {
        isVeg = false;
        dietary = 'non-veg';
      }
    }

    // Modifiers / Options
    let modifierGroups = [];
    if (modifiersIdx !== -1 && row[modifiersIdx]) {
      modifierGroups = parseModifierGroupsString(row[modifiersIdx]);
    }

    // Check if explicit option columns were used
    if (opt1ChoicesIdx !== -1 && row[opt1ChoicesIdx]) {
      const opt1Name = (opt1NameIdx !== -1 && row[opt1NameIdx]) ? row[opt1NameIdx].trim() : 'Option 1';
      const isReq = opt1ReqIdx !== -1 ? /yes|true|required|pick\s*1/i.test(row[opt1ReqIdx] || '') : true;
      const parsedExplicit = parseModifierGroupsString(`${opt1Name}: ${row[opt1ChoicesIdx]}`);
      if (parsedExplicit[0]) {
        parsedExplicit[0].required = isReq;
        parsedExplicit[0].minSelect = isReq ? 1 : 0;
        parsedExplicit[0].maxSelect = isReq ? 1 : parsedExplicit[0].options.length;
        modifierGroups.push(parsedExplicit[0]);
      }
    }

    if (opt2ChoicesIdx !== -1 && row[opt2ChoicesIdx]) {
      const opt2Name = (opt2NameIdx !== -1 && row[opt2NameIdx]) ? row[opt2NameIdx].trim() : 'Option 2';
      const isReq = opt2ReqIdx !== -1 ? /yes|true|required|pick\s*1/i.test(row[opt2ReqIdx] || '') : false;
      const parsedExplicit2 = parseModifierGroupsString(`${opt2Name}: ${row[opt2ChoicesIdx]}`);
      if (parsedExplicit2[0]) {
        parsedExplicit2[0].required = isReq;
        parsedExplicit2[0].minSelect = isReq ? 1 : 0;
        parsedExplicit2[0].maxSelect = isReq ? 1 : parsedExplicit2[0].options.length;
        modifierGroups.push(parsedExplicit2[0]);
      }
    }

    // Other fields
    const station = stationIdx !== -1 ? (row[stationIdx] || 'Kitchen').trim() : 'Kitchen';
    const bestseller = bestsellerIdx !== -1 ? /yes|true|1|hot|popular/i.test(row[bestsellerIdx] || '') : false;
    const available = availableIdx !== -1 ? !/no|false|0|out/i.test(row[availableIdx] || '') : true;
    const barcode = barcodeIdx !== -1 ? (row[barcodeIdx] || '').trim() : '';
    const unit = unitIdx !== -1 ? (row[unitIdx] || 'pcs').trim() : 'pcs';
    const emoji = emojiIdx !== -1 && row[emojiIdx] ? row[emojiIdx].trim() : '';
    const imageUrl = imageIdx !== -1 ? (row[imageIdx] || '').trim() : '';

    const itemObj = {
      id: `item-${Date.now()}-${r}-${Math.random().toString(36).substr(2, 5)}`,
      name: rawName.trim(),
      price: price,
      categoryName: categoryName,
      description: description,
      isVeg: isVeg,
      dietary: dietary,
      station: station,
      isBestseller: bestseller,
      bestseller: bestseller,
      available: available,
      barcode: barcode,
      unit: unit,
      emoji: emoji,
      imageUrl: imageUrl,
      modifierGroups: modifierGroups
    };

    parsedItems.push(itemObj);

    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, []);
    }
    categoryMap.get(categoryName).push(itemObj);
  }

  // Build category objects
  const parsedCategories = Array.from(categoryMap.entries()).map(([catName, catItems], idx) => {
    // Derive category emoji heuristic
    let catEmoji = '🍽️';
    const lower = catName.toLowerCase();
    if (lower.includes('starter') || lower.includes('appetizer')) catEmoji = '🥟';
    else if (lower.includes('pizza')) catEmoji = '🍕';
    else if (lower.includes('burger')) catEmoji = '🍔';
    else if (lower.includes('biryani') || lower.includes('rice')) catEmoji = '🍚';
    else if (lower.includes('pasta') || lower.includes('noodle')) catEmoji = '🍝';
    else if (lower.includes('drink') || lower.includes('beverage') || lower.includes('coffee') || lower.includes('tea')) catEmoji = '🥤';
    else if (lower.includes('dessert') || lower.includes('sweet') || lower.includes('ice cream')) catEmoji = '🍰';
    else if (lower.includes('roll') || lower.includes('wrap') || lower.includes('shawarma')) catEmoji = '🌯';
    else if (lower.includes('curry') || lower.includes('main')) catEmoji = '🍛';

    return {
      id: `cat-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      name: catName,
      emoji: catEmoji,
      order: idx + 1,
      items: catItems
    };
  });

  return {
    success: errors.length === 0,
    items: parsedItems,
    totalItems: parsedItems.length,
    categories: parsedCategories,
    errors: errors,
    totalRows: rows.length - 1
  };
}

/**
 * Generates ready-to-use sample CSV template text pre-filled with diverse dish examples
 * including Chicken 65 with Preparation & Portion options.
 */
export function generateMenuCSVTemplate() {
  const headers = [
    'Category',
    'Item Name',
    'Price',
    'Dietary',
    'Modifiers / Options',
    'Description',
    'Station',
    'Bestseller'
  ];

  const sampleRows = [
    [
      'Starters',
      'Chicken 65',
      '240',
      'non-veg',
      'Preparation: Dry (+0), Gravy (+30), Paste (+40) | Portion: Half (+0), Full (+140)',
      'Crisp fried chicken cubes tossed in spicy tempering with curry leaves',
      'Kitchen',
      'yes'
    ],
    [
      'Starters',
      'Paneer Tikka',
      '210',
      'veg',
      'Preparation: Dry (+0), Malai (+30) | Spice: Mild (+0), Spicy (+0)',
      'Charred marinated cottage cheese cubes with bell peppers',
      'Kitchen',
      'yes'
    ],
    [
      'Main Course',
      'Butter Chicken',
      '340',
      'non-veg',
      'Portion: Half (+0), Full (+160)',
      'Tender chicken in velvety makhani tomato butter gravy',
      'Kitchen',
      'yes'
    ],
    [
      'Pizzas',
      'Margherita Pizza',
      '260',
      'veg',
      'Size: Regular (+0), Medium (+150), Large (+280) | Crust: Thin Crust (+0), Cheese Burst (+60)',
      'San Marzano tomato sauce, fresh mozzarella, extra virgin olive oil',
      'Kitchen',
      'no'
    ],
    [
      'Beverages',
      'Cold Coffee',
      '120',
      'veg',
      'Milk: Regular (+0), Almond (+30), Oat (+40) | Add-ons: Vanilla Ice Cream (+30), Hazelnut Shot (+20)',
      'Chilled blended brew with espresso and ice cream',
      'Bar',
      'yes'
    ]
  ];

  const escapeCSV = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...sampleRows.map(row => row.map(escapeCSV).join(','))
  ];

  return csvLines.join('\n');
}

/**
 * Exports current restaurant menu categories to CSV format
 */
export function exportMenuToCSV(categories = [], restaurantName = 'menu') {
  const headers = [
    'Category',
    'Item Name',
    'Price',
    'Dietary',
    'Modifiers / Options',
    'Description',
    'Station',
    'Bestseller',
    'Available',
    'Barcode'
  ];

  const escapeCSV = (val) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = [];

  categories.forEach(cat => {
    const catName = cat.name || 'General';
    (cat.items || []).forEach(item => {
      // Serialize modifier groups to string
      let modStr = '';
      if (Array.isArray(item.modifierGroups) && item.modifierGroups.length > 0) {
        modStr = item.modifierGroups.map(g => {
          const opts = (g.options || []).map(o => {
            const add = parseFloat(o.priceAdd) || 0;
            return add > 0 ? `${o.name} (+${add})` : `${o.name} (+0)`;
          }).join(', ');
          return `${g.name}: ${opts}`;
        }).join(' | ');
      }

      const dietaryVal = item.dietary || (item.isVeg === true ? 'veg' : (item.isVeg === false ? 'non-veg' : ''));
      const isBest = item.isBestseller || item.bestseller ? 'yes' : 'no';
      const isAvail = item.available !== false ? 'yes' : 'no';

      rows.push([
        catName,
        item.name || '',
        item.price ?? 0,
        dietaryVal,
        modStr,
        item.description || '',
        item.station || 'Kitchen',
        isBest,
        isAvail,
        item.barcode || ''
      ]);
    });
  });

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map(r => r.map(escapeCSV).join(','))
  ].join('\n');

  // Trigger download in browser if environment supports it
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.createElement) {
    try {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const cleanName = restaurantName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      link.setAttribute('download', `${cleanName}_menu_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('DOM download trigger failed:', e);
    }
  }

  return csvContent;
}
