/**
 * Smart POS Search Engine
 * Designed for busy restaurant cashiers (desktop keyboard & touchscreen):
 * - Multi-word unordered matching ("fries truffle" -> "Truffle Parmesan Fries")
 * - Kitchen initials / short-code matching ("ccb" -> "Classic Cheeseburger", "sc" -> "Spaghetti Carbonara")
 * - Subcategory, tag, SKU & category search
 * - Bounded 1-typo tolerance ("mozzarela" -> "Mozzarella Sticks")
 * - Relevance ranking with sales-velocity tie-breaking
 */

/**
 * Extract smart dietary filter keywords from a search query.
 * @param {string} rawQuery
 * @returns {{ effectiveDietary: 'veg'|'non-veg'|'bestseller'|null, cleanQuery: string }}
 */
export function extractDietaryFromQuery(rawQuery) {
  let query = String(rawQuery || '').trim().toLowerCase();
  let effectiveDietary = null;

  if (/\b(non[\s-]?veg|nv)\b/i.test(query)) {
    effectiveDietary = 'non-veg';
    query = query.replace(/\b(non[\s-]?veg|nv)\b/gi, '').trim();
  } else if (/\b(pure[\s-]?veg|vegetarian|veg)\b/i.test(query)) {
    effectiveDietary = 'veg';
    query = query.replace(/\b(pure[\s-]?veg|vegetarian|veg)\b/gi, '').trim();
  } else if (/\b(bestseller|popular|favorite|trending)\b/i.test(query)) {
    effectiveDietary = 'bestseller';
    query = query.replace(/\b(bestseller|popular|favorite|trending)\b/gi, '').trim();
  }

  return { effectiveDietary, cleanQuery: query.replace(/\s+/g, ' ').trim() };
}

/**
 * Parses Indian counter short-code multiplier queries in the single POS search bar:
 * - "101*3" -> { cleanQuery: "101", qty: 3 }   (standard shortCode * qty)
 * - "ccb*2" -> { cleanQuery: "ccb", qty: 2 }
 * - "3*ccb" -> { cleanQuery: "ccb", qty: 3 }   (qty * textCode when left is digits and right has letters)
 * - "2x paneer tikka" or "3x101" -> { cleanQuery: "...", qty: 2|3 }
 */
export function parsePosSearchQuery(rawQuery) {
  const { effectiveDietary, cleanQuery: dietClean } = extractDietaryFromQuery(rawQuery);
  let query = dietClean;
  let qty = 1;

  // Match "qty x query" / "qtyx query" (e.g. "2x paneer tikka", "3x 101")
  const explicitX = query.match(/^(\d{1,3})\s*x\s*(.+)$/i);
  if (explicitX && (/\s/.test(query) || /^\d{1,3}x\d+/i.test(query))) {
    const parsedQty = parseInt(explicitX[1], 10);
    if (parsedQty > 0 && parsedQty <= 999) {
      return { effectiveDietary, cleanQuery: explicitX[2].trim(), qty: parsedQty };
    }
  }

  // Match "query * qty" (standard POS syntax: "101*3", "ccb * 4")
  const trailingMult = query.match(/^(.+?)\s*\*\s*(\d{1,3})$/);
  if (trailingMult) {
    const parsedQty = parseInt(trailingMult[2], 10);
    if (parsedQty > 0 && parsedQty <= 999) {
      return { effectiveDietary, cleanQuery: trailingMult[1].trim(), qty: parsedQty };
    }
  }

  // Match "qty * textQuery" when right side is non-numeric (e.g. "3*ccb", "2*masala")
  const leadingMult = query.match(/^(\d{1,3})\s*\*\s*([^\d\s].*)$/);
  if (leadingMult) {
    const parsedQty = parseInt(leadingMult[1], 10);
    if (parsedQty > 0 && parsedQty <= 999) {
      return { effectiveDietary, cleanQuery: leadingMult[2].trim(), qty: parsedQty };
    }
  }

  return { effectiveDietary, cleanQuery: query, qty };
}

/**
 * Fast O(n) check whether two lowercase words are within 1 edit
 * (1 substitution, 1 insertion/deletion, or 1 adjacent transposition).
 */
function isWithinOneTypo(a, b) {
  if (!a || !b) return false;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return false;
  if (a === b) return true;

  if (lenA === lenB) {
    let diffs = 0;
    for (let i = 0; i < lenA; i++) {
      if (a[i] !== b[i]) {
        // Adjacent transposition check
        if (
          diffs === 0 &&
          i + 1 < lenA &&
          a[i] === b[i + 1] &&
          a[i + 1] === b[i]
        ) {
          i++; // skip swapped pair
          diffs++;
          continue;
        }
        diffs++;
        if (diffs > 1) return false;
      }
    }
    return diffs <= 1;
  }

  // Length differs by 1: check 1 insertion/deletion
  const shorter = lenA < lenB ? a : b;
  const longer = lenA < lenB ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      if (skipped) return false;
      skipped = true;
      j++;
    }
  }
  return true;
}

/**
 * Score how well a menu item matches a normalized search query.
 * @param {object} item
 * @param {string} cleanQuery - lowercase trimmed query
 * @param {Record<string, number>} [itemSalesMap]
 * @returns {number} 0 if no match; >0 relevance score otherwise
 */
export function scoreMenuItemMatch(item, cleanQuery, itemSalesMap = {}) {
  if (!item || !cleanQuery) return 0;

  const name = (item.name || '').toLowerCase();
  const code = (item.code || '').toLowerCase();
  const sku = (item.sku || '').toLowerCase();
  const catName = (item.categoryName || '').toLowerCase();
  const subCat = (item.subCategory || '').toLowerCase();
  const tagsStr = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : '';

  let baseScore = 0;

  // 1. Exact / Prefix / Substring on primary identifiers
  if (name === cleanQuery || code === cleanQuery || sku === cleanQuery) {
    baseScore = 1000;
  } else if (name.startsWith(cleanQuery) || code.startsWith(cleanQuery) || sku.startsWith(cleanQuery)) {
    baseScore = 850;
  } else {
    const nameWords = name.split(/[\s\-_/&]+/).filter(Boolean);
    if (nameWords.some(w => w.startsWith(cleanQuery))) {
      baseScore = 720;
    } else if (name.includes(cleanQuery) || code.includes(cleanQuery) || sku.includes(cleanQuery)) {
      baseScore = 620;
    } else if (subCat.includes(cleanQuery) || catName.includes(cleanQuery) || tagsStr.includes(cleanQuery)) {
      baseScore = 440;
    }
  }

  // 2. Kitchen Initials / Acronym match (e.g. "ccb" -> "Classic Cheeseburger")
  if (baseScore === 0 && cleanQuery.length >= 2 && /^[a-z0-9]+$/.test(cleanQuery)) {
    const nameWords = name.split(/[\s\-_/&]+/).filter(Boolean);
    if (nameWords.length >= 2) {
      const initials = nameWords.map(w => w[0]).join('');
      if (initials === cleanQuery) {
        baseScore = 540;
      } else if (initials.startsWith(cleanQuery)) {
        baseScore = 460;
      }
    }
  }

  // 3. Multi-token unordered & 1-typo fuzzy matching
  if (baseScore === 0) {
    const tokens = cleanQuery.split(/\s+/).filter(Boolean);
    const searchable = `${name} ${code} ${sku} ${subCat} ${catName} ${tagsStr}`;
    const allWords = searchable.split(/[\s\-_/&,]+/).filter(Boolean);

    let allExact = true;
    let allFuzzy = true;
    let allInName = true;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (!name.includes(tok)) allInName = false;
      if (searchable.includes(tok)) continue;

      allExact = false;
      // Bounded 1-typo tolerance for tokens >= 4 chars
      if (tok.length >= 4 && allWords.some(w => w.length >= 4 && isWithinOneTypo(tok, w.slice(0, tok.length + 1)) || (w.length >= 4 && isWithinOneTypo(tok, w)))) {
        continue;
      }
      allFuzzy = false;
      break;
    }

    if (allExact && tokens.length > 0) {
      baseScore = allInName ? 580 : 480;
    } else if (allFuzzy && tokens.length > 0) {
      baseScore = 340;
    }
  }

  if (baseScore === 0) return 0;

  // Sales-velocity tie-breaker so popular items rank higher on equal matches
  const nameKey = name.trim();
  const sales = (itemSalesMap[item.id] || 0) + (itemSalesMap[nameKey] || 0);
  return baseScore + Math.min(40, sales);
}
