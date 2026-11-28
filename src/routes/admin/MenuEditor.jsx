import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { useBusinessConfig } from '../../hooks/useBusinessConfig';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Plus, Edit2, Trash2, X, LayoutGrid, List, Search, ChevronDown, ChevronUp, ChevronsUpDown, Camera, ChevronRight, FileSpreadsheet, Languages, Sparkles, GripVertical, ArrowRight, ArrowUpDown, Check, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/formatCurrency';
import { getKitchenStations } from '../../utils/stations';
import MenuCsvModal from '../../components/admin/MenuCsvModal';
import { translateDishWithAI, batchTranslateDishesWithAI } from '../../services/aiMenuTranslator';
import { transliterateFood } from '../../utils/foodTransliteration';
import { getItemVisuals } from '../../utils/itemVisuals';
import ToggleSwitch from '../../components/shared/ToggleSwitch';
import { getCategoryChromaticColors, CHROMATIC_PALETTE } from '../../utils/categoryColors';
import { convertRecipeAmount, getCompatibleUnits } from '../../utils/inventoryUnits';

// Compress image client-side to a small base64 JPEG for inline storage
const compressImage = (file, maxDim = 400, quality = 0.82) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      } else {
        if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);
      try { resolve(canvas.toDataURL('image/jpeg', quality)); }
      catch (err) { reject(err); }
    };
    img.onerror = (err) => { URL.revokeObjectURL(objectUrl); reject(err); };
  });
};


// Use cryptographically random IDs — Date.now() is not unique under concurrent saves
const generateId = () => crypto.randomUUID();

export const isVegetarianItem = (item) => {
  if (item?.isVeg === true || item?.veg === true || item?.dietary === 'veg') return true;
  if (item?.isVeg === false || item?.veg === false || item?.dietary === 'non-veg') return false;
  const text = `${item?.name || ''} ${item?.description || ''}`.toLowerCase();
  if (/\b(chicken|mutton|beef|pork|fish|prawn|shrimp|crab|egg|meat|bacon|ham|duck|shawarma|keema|tikka|kabab|kebab)\b/.test(text) && !/\b(paneer|veg|soya|mushroom)\b/.test(text)) {
    return false;
  }
  return true;
};

export default function MenuEditor() {
  const { restaurant } = useAuthStore();
  const { categories, reorderCategories, reorderItems } = useMenuStore();
  const { terms } = useBusinessConfig();
  const [activeCat, setActiveCat] = useState('all');
  const [mobileViewTab, setMobileViewTab] = useState('items'); // 'items' | 'categories'

  const [showCatForm, setShowCatForm] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', emoji: '', color: '', taxRate: '', subCategories: [] });
  const [newSubCatInput, setNewSubCatInput] = useState('');
  const [itemForm, setItemForm] = useState({ name: '', categoryId: '', subCategory: '', mlName: '', hiName: '', price: '', description: '', emoji: '', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '', highMargin: false, isBestseller: false, code: '', barcode: '', unit: 'pcs', taxRate: '', packagingCharge: '', isVeg: true, dietary: 'veg' });
  const [editingPriceItemId, setEditingPriceItemId] = useState(null);
  const [editingPriceVal, setEditingPriceVal] = useState('');
  const [isAiTranslating, setIsAiTranslating] = useState(false);
  const [isBatchTranslating, setIsBatchTranslating] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const modalBodyRef = useRef(null);

  const switchTab = (tab) => {
    setActiveTab(tab);
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTop = 0;
    }
  };
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list' (default grid for tab/pos)
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [showPronunciation, setShowPronunciation] = useState(false);
  const [isAddingCustomStation, setIsAddingCustomStation] = useState(false);
  const [newCustomStation, setNewCustomStation] = useState('');
  const [draggedCatIndex, setDraggedCatIndex] = useState(null);
  const [dragOverCatIndex, setDragOverCatIndex] = useState(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [dragOverItemIndex, setDragOverItemIndex] = useState(null);

  const availableStations = useMemo(() => {
    const configured = getKitchenStations(restaurant);
    const current = itemForm.station;
    if (current && !configured.some(s => s.toLowerCase() === current.toLowerCase())) {
      return [...configured, current];
    }
    return configured;
  }, [restaurant, itemForm.station]);

  const handleCreateCustomStation = async () => {
    const clean = newCustomStation.trim();
    if (!clean) {
      setIsAddingCustomStation(false);
      return;
    }
    const currentStations = getKitchenStations(restaurant);
    const exists = currentStations.find(s => s.toLowerCase() === clean.toLowerCase());
    const stationName = exists || clean;

    setItemForm(f => ({ ...f, station: stationName }));
    setIsAddingCustomStation(false);
    setNewCustomStation('');

    if (!exists && restaurant?.id) {
      const updated = [...currentStations, clean];
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id), {
          'kitchenConfig.stations': updated
        });
        useAuthStore.setState(s => ({
          restaurant: {
            ...s.restaurant,
            kitchenConfig: {
              ...(s.restaurant?.kitchenConfig || {}),
              stations: updated
            }
          }
        }));
        toast.success(`Station "${clean}" added to kitchen stations!`);
      } catch (err) {
        console.warn('Could not save station to restaurant config:', err);
      }
    }
  };

  const openAddItemModal = (presetCatId = null) => {
    setIsAddingCustomStation(false);
    setNewCustomStation('');
    setEditItem(null);
    const defaultCatId = presetCatId || (activeCat && activeCat !== 'all' ? activeCat : (categories[0]?.id || ''));
    setItemForm({
      name: '',
      categoryId: defaultCatId,
      subCategory: '',
      mlName: '',
      hiName: '',
      price: '',
      description: '',
      emoji: '',
      available: true,
      modifierGroups: [],
      recipe: [],
      station: 'Kitchen',
      imageUrl: '',
      highMargin: false,
      isBestseller: false,
      code: '',
      barcode: '',
      unit: 'pcs',
      taxRate: '',
      packagingCharge: '',
      isVeg: true,
      dietary: 'veg'
    });
    setShowAdvancedDetails(false);
    setShowPronunciation(false);
    setActiveTab('general');
    setShowItemForm(true);
    setTimeout(() => { if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0; }, 0);
  };

  const openEditItemModal = (item) => {
    setIsAddingCustomStation(false);
    setNewCustomStation('');
    setEditItem(item);
    const isVegDefault = isVegetarianItem(item);
    const itemCatId = item.categoryId || categories.find(c => (c.items || []).some(i => i.id === item.id))?.id || (activeCat !== 'all' ? activeCat : (categories[0]?.id || ''));
    setItemForm({
      name: item.name,
      categoryId: itemCatId,
      subCategory: item.subCategory ?? '',
      mlName: item.mlName ?? item.name_ml ?? '',
      hiName: item.hiName ?? item.name_hi ?? '',
      price: item.price,
      description: item.description ?? '',
      emoji: item.emoji ?? '',
      available: item.available !== false,
      modifierGroups: item.modifierGroups ?? [],
      recipe: item.recipe ?? [],
      station: item.station ?? 'Kitchen',
      imageUrl: item.imageUrl ?? '',
      highMargin: item.highMargin || false,
      isBestseller: item.isBestseller || item.bestseller || false,
      code: item.code ?? '',
      barcode: item.barcode ?? '',
      unit: item.unit ?? 'pcs',
      taxRate: item.taxRate != null ? String(item.taxRate) : '',
      packagingCharge: item.packagingCharge != null ? String(item.packagingCharge) : '',
      isVeg: isVegDefault,
      dietary: item.dietary || (isVegDefault ? 'veg' : 'non-veg')
    });
    setShowAdvancedDetails(false);
    setShowPronunciation(false);
    setActiveTab('general');
    setShowItemForm(true);
    setTimeout(() => { if (modalBodyRef.current) modalBodyRef.current.scrollTop = 0; }, 0);
  };

  const moveCategory = async (fromIndex, direction) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= categories.length) return;
    const newCats = [...categories];
    const [moved] = newCats.splice(fromIndex, 1);
    newCats.splice(toIndex, 0, moved);
    if (typeof reorderCategories === 'function') {
      await reorderCategories(newCats, restaurant?.id);
    } else {
      useMenuStore.getState().setCategories(newCats);
    }
    toast.success(`Moved "${moved.name}" ${direction < 0 ? 'up' : 'down'}`);
  };

  const handleDragStart = (e, index) => {
    setDraggedCatIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCatIndex !== index) {
      setDragOverCatIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedCatIndex(null);
    setDragOverCatIndex(null);
  };

  const handleDrop = async (e, toIndex) => {
    e.preventDefault();
    if (draggedCatIndex === null || draggedCatIndex === toIndex) {
      setDraggedCatIndex(null);
      setDragOverCatIndex(null);
      return;
    }
    const newCats = [...categories];
    const [moved] = newCats.splice(draggedCatIndex, 1);
    newCats.splice(toIndex, 0, moved);
    setDraggedCatIndex(null);
    setDragOverCatIndex(null);
    if (typeof reorderCategories === 'function') {
      await reorderCategories(newCats, restaurant?.id);
    } else {
      useMenuStore.getState().setCategories(newCats);
    }
    toast.success(`Category "${moved.name}" moved! Order synced.`);
  };

  const reorderCategoryItems = async (catId, newItems) => {
    if (typeof reorderItems === 'function') {
      await reorderItems(catId, newItems, restaurant?.id);
    } else {
      const updatedCats = categories.map(c => c.id === catId ? { ...c, items: newItems } : c);
      useMenuStore.getState().setCategories(updatedCats);
      try {
        localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
        if (restaurant?.id) {
          localStorage.setItem(`dineos_cached_menu_${restaurant.id}`, JSON.stringify(updatedCats));
        }
      } catch (e) {
        console.debug('[MenuEditor] LocalStorage write deferred:', e);
      }
      if (restaurant?.id && !restaurant?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', catId), { items: newItems });
        } catch (e) {
          console.warn('[MenuEditor] Item order cloud sync deferred:', e?.message);
        }
      }
    }
  };

  const moveItem = async (index, direction) => {
    if (!activeCatData) return;
    const toIndex = index + direction;
    const items = [...(activeCatData.items || [])];
    if (toIndex < 0 || toIndex >= items.length) return;
    const [moved] = items.splice(index, 1);
    items.splice(toIndex, 0, moved);
    await reorderCategoryItems(activeCatData.id, items);
    toast.success(`Moved "${moved.name}" to position #${toIndex + 1}`);
  };

  const handleItemDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleItemDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverItemIndex !== index) {
      setDragOverItemIndex(index);
    }
  };

  const handleItemDragEnd = () => {
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
  };

  const handleItemDrop = async (e, toIndex) => {
    e.preventDefault();
    if (!activeCatData || draggedItemIndex === null || draggedItemIndex === toIndex) {
      setDraggedItemIndex(null);
      setDragOverItemIndex(null);
      return;
    }
    const items = [...(activeCatData.items || [])];
    const [moved] = items.splice(draggedItemIndex, 1);
    items.splice(toIndex, 0, moved);
    setDraggedItemIndex(null);
    setDragOverItemIndex(null);
    await reorderCategoryItems(activeCatData.id, items);
    toast.success(`Moved "${moved.name}" to position #${toIndex + 1}`);
  };

  const applyQuickSort = async (type) => {
    if (!activeCatData) return;
    const items = [...(activeCatData.items || [])];
    if (items.length <= 1) {
      toast('Category has fewer than 2 items to sort', { icon: 'ℹ️' });
      return;
    }
    if (type === 'alpha') {
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      toast.success('Sorted items alphabetically (A-Z)');
    } else if (type === 'bestseller') {
      items.sort((a, b) => {
        const aBest = Boolean(a.isBestseller || a.bestseller);
        const bBest = Boolean(b.isBestseller || b.bestseller);
        if (aBest && !bBest) return -1;
        if (!aBest && bBest) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      toast.success('Sorted: Bestsellers placed first 🔥');
    } else if (type === 'price-asc') {
      items.sort((a, b) => (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0));
      toast.success('Sorted by price (Low to High)');
    } else if (type === 'price-desc') {
      items.sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0));
      toast.success('Sorted by price (High to Low)');
    }
    await reorderCategoryItems(activeCatData.id, items);
  };

  const handleAiTranslateItem = async () => {
    if (!itemForm.name?.trim()) {
      toast.error('Enter dish name first');
      return;
    }
    setShowPronunciation(true);
    setIsAiTranslating(true);
    try {
      const res = await translateDishWithAI(itemForm.name, restaurant);
      setItemForm(f => ({
        ...f,
        mlName: res.ml || f.mlName,
        hiName: res.hi || f.hiName
      }));
      toast.success('Generated Malayalam & Hindi pronunciation script!');
    } catch {
      toast.error('Could not generate native names');
    } finally {
      setIsAiTranslating(false);
    }
  };

  const handleBatchAiTranslateCategory = async () => {
    const isAll = activeCat === 'all' || !activeCat;
    const cat = isAll ? null : categories.find(c => c.id === activeCat);
    const targetScopeItems = isAll
      ? categories.flatMap(c => c.items || [])
      : (cat?.items || []);

    if (targetScopeItems.length === 0) {
      toast.error('No items to translate');
      return;
    }
    const unpolishedItems = targetScopeItems.filter(i => !i.mlName || !i.hiName);
    const targetItems = unpolishedItems.length > 0 ? unpolishedItems : targetScopeItems;

    setIsBatchTranslating(true);
    const toastId = toast.loading(`Translating ${targetItems.length} dishes with AI...`);
    try {
      const names = targetItems.map(i => i.name);
      const translations = await batchTranslateDishesWithAI(names, restaurant);

      const updatedCats = categories.map(c => {
        if (!isAll && c.id !== activeCat) return c;
        const updatedItems = (c.items || []).map(item => {
          const tr = translations[item.name];
          if (tr) {
            return {
              ...item,
              mlName: tr.ml || item.mlName || transliterateFood(item.name, 'ml'),
              hiName: tr.hi || item.hiName || transliterateFood(item.name, 'hi')
            };
          }
          return item;
        });
        return { ...c, items: updatedItems };
      });

      useMenuStore.getState().setCategories(updatedCats);
      try {
        localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
      } catch { }

      if (restaurant?.id && !restaurant?.localStorageOnly && typeof navigator !== 'undefined' && navigator.onLine) {
        if (isAll) {
          await Promise.all(
            updatedCats.map(c => updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', c.id), { items: c.items }))
          );
        } else {
          const updatedCat = updatedCats.find(c => c.id === activeCat);
          if (updatedCat) {
            await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', activeCat), { items: updatedCat.items });
          }
        }
      }

      toast.success(`Updated ${targetItems.length} dishes with professional native script!`, { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error('Batch translation failed: ' + err.message, { id: toastId });
    } finally {
      setIsBatchTranslating(false);
    }
  };

  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const areAllGroupsCollapsed = (itemForm.modifierGroups ?? []).length > 0 &&
    (itemForm.modifierGroups ?? []).every(g => !!collapsedGroups[g.id]);

  const toggleCollapseAll = () => {
    if (areAllGroupsCollapsed) {
      setCollapsedGroups({});
    } else {
      const all = {};
      (itemForm.modifierGroups ?? []).forEach(g => { all[g.id] = true; });
      setCollapsedGroups(all);
    }
  };

  const getGroupSummary = (group) => {
    const count = group.options?.length ?? 0;
    if (count === 0) return 'No options';
    const prices = (group.options ?? []).map(o => o.priceAdd || 0);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const priceStr = minP === maxP
      ? (minP > 0 ? `+${formatCurrency(minP, restaurant?.currency)}` : 'Free')
      : `+${formatCurrency(minP, restaurant?.currency)} to +${formatCurrency(maxP, restaurant?.currency)}`;
    return `${count} ${count === 1 ? 'option' : 'options'} • ${priceStr}`;
  };

  // Quick 1-click preset templates for restaurant owners
  const addModifierPreset = (type) => {
    const timestamp = Date.now();
    let newGroup;
    if (type === 'portions') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Portion / Size',
        required: true,
        maxSelect: 1,
        options: [
          { id: `${timestamp}-opt-qtr`, name: 'Quarter', priceAdd: 0 },
          { id: `${timestamp}-opt-hlf`, name: 'Half', priceAdd: 0 },
          { id: `${timestamp}-opt-ful`, name: 'Full', priceAdd: 0 }
        ]
      };
    } else if (type === 'sizes') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Size',
        required: true,
        maxSelect: 1,
        options: [
          { id: `${timestamp}-opt-sml`, name: 'Small', priceAdd: 0 },
          { id: `${timestamp}-opt-med`, name: 'Medium', priceAdd: 0 },
          { id: `${timestamp}-opt-lrg`, name: 'Large', priceAdd: 0 }
        ]
      };
    } else if (type === 'spice') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Spice Level',
        required: true,
        maxSelect: 1,
        options: [
          { id: `${timestamp}-opt-mild`, name: 'Mild', priceAdd: 0 },
          { id: `${timestamp}-opt-med`, name: 'Medium', priceAdd: 0 },
          { id: `${timestamp}-opt-hot`, name: 'Extra Spicy', priceAdd: 0 }
        ]
      };
    } else if (type === 'addons') {
      newGroup = {
        id: timestamp.toString(),
        name: 'Add-ons & Extras',
        required: false,
        maxSelect: 5,
        options: [
          { id: `${timestamp}-opt-chz`, name: 'Extra Cheese', priceAdd: 0 },
          { id: `${timestamp}-opt-dip`, name: 'Garlic Dip / Mayo', priceAdd: 0 }
        ]
      };
    } else {
      newGroup = {
        id: timestamp.toString(),
        name: '',
        required: false,
        maxSelect: 1,
        options: [{ id: `${timestamp}-opt`, name: '', priceAdd: 0 }]
      };
    }
    setItemForm(f => ({ ...f, modifierGroups: [...(f.modifierGroups ?? []), newGroup] }));
    setCollapsedGroups(prev => ({ ...prev, [newGroup.id]: false }));
  };

  // One-time fetch for inventory (COGS recipe editing)
  useEffect(() => {
    if (!restaurant?.id) return;
    getDocs(collection(db, 'restaurants', restaurant.id, 'inventory'))
      .then(snap => {
        setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
      .catch(err => console.error('Error fetching inventory:', err));
  }, [restaurant?.id]);

  const openAddCategory = () => {
    setEditingCat(null);
    setNewSubCatInput('');
    setCatForm({ name: '', emoji: '', color: '', taxRate: '', subCategories: [] });
    setShowCatForm(true);
  };

  const openEditCategory = (cat) => {
    setEditingCat(cat);
    setNewSubCatInput('');
    const existingSubs = new Set(Array.isArray(cat.subCategories) ? cat.subCategories : []);
    if (Array.isArray(cat.items)) {
      cat.items.forEach(i => {
        if (i.subCategory && typeof i.subCategory === 'string' && i.subCategory.trim()) {
          existingSubs.add(i.subCategory.trim());
        }
      });
    }
    setCatForm({
      name: cat.name || '',
      emoji: cat.emoji || '🍽️',
      color: cat.color || '',
      taxRate: cat.taxRate != null ? String(cat.taxRate) : '',
      subCategories: Array.from(existingSubs)
    });
    setShowCatForm(true);
  };

  const handleAddSubCategoryToCat = () => {
    const raw = newSubCatInput.trim();
    if (!raw) return;
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    setCatForm(f => {
      const current = Array.isArray(f.subCategories) ? [...f.subCategories] : [];
      parts.forEach(p => {
        if (!current.some(c => c.toLowerCase() === p.toLowerCase())) {
          current.push(p);
        }
      });
      return { ...f, subCategories: current };
    });
    setNewSubCatInput('');
  };

  const handleRemoveSubCategoryFromCat = (indexToRemove) => {
    setCatForm(f => ({
      ...f,
      subCategories: (f.subCategories || []).filter((_, idx) => idx !== indexToRemove)
    }));
  };

  const saveCategory = async () => {
    const cleanName = catForm.name.trim();
    if (!cleanName) {
      toast.error('Category name is required');
      return;
    }

    // Guard: Prevent duplicate category names (case-insensitive)
    const isDuplicate = categories.some(c =>
      c.name.trim().toLowerCase() === cleanName.toLowerCase() &&
      (!editingCat || c.id !== editingCat.id)
    );
    if (isDuplicate) {
      toast.error(`A category named "${cleanName}" already exists.`);
      return;
    }

    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const parsedTaxRate = (catForm.taxRate !== '' && !isNaN(parseFloat(catForm.taxRate)))
      ? parseFloat(catForm.taxRate)
      : null;

    const cleanSubCategories = (catForm.subCategories || [])
      .map(s => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);

    const cleanColor = /^#[0-9A-Fa-f]{6}$/.test(catForm.color || '') ? catForm.color : null;

    if (editingCat) {
      const updatedCats = categories.map(c => c.id === editingCat.id ? {
        ...c,
        name: cleanName,
        emoji: catForm.emoji.trim() || '🍽️',
        color: cleanColor,
        subCategories: cleanSubCategories,
        ...(parsedTaxRate !== null ? { taxRate: parsedTaxRate } : { taxRate: undefined })
      } : c);
      useMenuStore.getState().setCategories(updatedCats);
      try {
        localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
      } catch { }

      if (!isLocalOnly && isOnline) {
        try {
          const updatePayload = {
            name: catForm.name.trim(),
            emoji: catForm.emoji.trim() || '🍽️',
            color: cleanColor,
            subCategories: cleanSubCategories,
          };
          if (parsedTaxRate !== null) {
            updatePayload.taxRate = parsedTaxRate;
          } else {
            updatePayload.taxRate = null;
          }
          await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', editingCat.id), updatePayload);
        } catch (e) {
          console.warn('[MenuEditor] Category cloud sync deferred:', e?.message);
        }
      }
      toast.success('Category updated!');
    } else {
      const newCatId = `cat_${Date.now()}`;
      const newCat = {
        id: newCatId,
        name: catForm.name.trim(),
        emoji: catForm.emoji.trim() || '🍽️',
        ...(cleanColor ? { color: cleanColor } : {}),
        subCategories: cleanSubCategories,
        ...(parsedTaxRate !== null ? { taxRate: parsedTaxRate } : {}),
        items: [],
      };
      const updatedCats = [...categories, newCat];
      useMenuStore.getState().setCategories(updatedCats);
      try {
        localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
      } catch { }

      if (!isLocalOnly && isOnline) {
        try {
          const docPayload = {
            name: catForm.name.trim(),
            emoji: catForm.emoji.trim() || '🍽️',
            ...(cleanColor ? { color: cleanColor } : {}),
            subCategories: cleanSubCategories,
            items: [],
          };
          if (parsedTaxRate !== null) {
            docPayload.taxRate = parsedTaxRate;
          }
          const docRef = await addDoc(collection(db, 'restaurants', restaurant.id, 'menu'), docPayload);
          // Update id with cloud id if available
          const finalCats = updatedCats.map(c => c.id === newCatId ? { ...c, id: docRef.id } : c);
          useMenuStore.getState().setCategories(finalCats);
        } catch (e) {
          console.warn('[MenuEditor] Add category cloud sync deferred:', e?.message);
        }
      }
      toast.success('Category added!');
    }
    setCatForm({ name: '', emoji: '', taxRate: '', subCategories: [] });
    setNewSubCatInput('');
    setEditingCat(null);
    setShowCatForm(false);
  };

  const deleteCategory = async (catId) => {
    if (!confirm('Delete this category and all its items?')) return;
    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const updatedCats = categories.filter(c => c.id !== catId);
    useMenuStore.getState().setCategories(updatedCats);
    try {
      localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
    } catch { }

    if (activeCat === catId) setActiveCat('all');

    if (!isLocalOnly && isOnline) {
      try {
        await deleteDoc(doc(db, 'restaurants', restaurant.id, 'menu', catId));
      } catch (e) {
        console.warn('[MenuEditor] Delete category cloud sync deferred:', e?.message);
      }
    }
    toast.success('Category deleted');
  };

  const saveItem = async () => {
    const cleanName = itemForm.name.trim();
    const parsedPrice = parseFloat(itemForm.price);
    if (!cleanName) {
      toast.error('Please enter an item name');
      return;
    }
    if (itemForm.price === '' || isNaN(parsedPrice) || parsedPrice < 0) {
      toast.error('Please enter a valid price (0 or higher)');
      return;
    }

    if (categories.length === 0) {
      toast.error('Please add a category first');
      return;
    }

    const targetCatId = itemForm.categoryId || (activeCat && activeCat !== 'all' ? activeCat : categories[0]?.id);
    const targetCat = categories.find(c => c.id === targetCatId);
    if (!targetCat) {
      toast.error('Please select a valid category for this item');
      return;
    }

    // Guard: Prevent duplicate item names in target category (case-insensitive)
    const isDuplicateItem = (targetCat.items || []).some(i =>
      i.name.trim().toLowerCase() === cleanName.toLowerCase() &&
      (!editItem || i.id !== editItem.id)
    );
    if (isDuplicateItem) {
      toast.error(`An item named "${cleanName}" already exists in ${targetCat.name}.`);
      return;
    }

    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const parsedTaxRate = (itemForm.taxRate !== '' && !isNaN(parseFloat(itemForm.taxRate)))
      ? parseFloat(itemForm.taxRate)
      : null;

    const isVeg = itemForm.isVeg !== false;

    const newItem = {
      id: editItem?.id ?? generateId(),
      name: cleanName,
      mlName: itemForm.mlName?.trim() || '',
      hiName: itemForm.hiName?.trim() || '',
      price: parsedPrice,
      description: itemForm.description.trim(),
      emoji: itemForm.emoji.trim() || '🍽️',
      available: itemForm.available,
      modifierGroups: itemForm.modifierGroups ?? [],
      recipe: itemForm.recipe ?? [],
      station: itemForm.station?.trim() || 'Kitchen',
      imageUrl: itemForm.imageUrl ?? '',
      highMargin: itemForm.highMargin || false,
      isBestseller: itemForm.isBestseller || false,
      code: itemForm.code?.trim().toUpperCase() || '',
      barcode: itemForm.barcode?.trim() ?? '',
      unit: itemForm.unit || 'pcs',
      isVeg: isVeg,
      dietary: isVeg ? 'veg' : 'non-veg',
      subCategory: itemForm.subCategory?.trim() || '',
      ...(itemForm.packagingCharge !== '' && !isNaN(parseFloat(itemForm.packagingCharge)) ? { packagingCharge: parseFloat(itemForm.packagingCharge) } : {}),
      ...(parsedTaxRate !== null ? { taxRate: parsedTaxRate } : {})
    };

    // Check if item was moved from a different category
    const origCat = editItem
      ? categories.find(c => (c.items || []).some(i => i.id === editItem.id))
      : null;

    let updatedCats;
    if (editItem && origCat && origCat.id !== targetCatId) {
      // Moved from origCat to targetCat
      updatedCats = categories.map(c => {
        if (c.id === origCat.id) {
          return { ...c, items: (c.items || []).filter(i => i.id !== editItem.id) };
        }
        if (c.id === targetCatId) {
          return { ...c, items: [...(c.items || []), newItem] };
        }
        return c;
      });
    } else {
      const items = editItem
        ? targetCat.items.map(i => i.id === editItem.id ? newItem : i)
        : [...(targetCat.items ?? []), newItem];
      updatedCats = categories.map(c => c.id === targetCatId ? { ...c, items } : c);
    }

    useMenuStore.getState().setCategories(updatedCats);
    try {
      localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
    } catch { }

    if (!isLocalOnly && isOnline) {
      try {
        if (editItem && origCat && origCat.id !== targetCatId) {
          const origRemaining = (origCat.items || []).filter(i => i.id !== editItem.id);
          const targetNewItems = [...(targetCat.items || []), newItem];
          await Promise.all([
            updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', origCat.id), { items: origRemaining }),
            updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', targetCatId), { items: targetNewItems })
          ]);
        } else {
          const items = editItem
            ? targetCat.items.map(i => i.id === editItem.id ? newItem : i)
            : [...(targetCat.items ?? []), newItem];
          await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', targetCatId), { items });
        }
      } catch (e) {
        console.warn('[MenuEditor] Item cloud sync deferred:', e?.message);
      }
    }

    setShowItemForm(false);
    setEditItem(null);
    setItemForm({ name: '', categoryId: '', price: '', description: '', emoji: '', available: true, modifierGroups: [], recipe: [], station: 'Kitchen', imageUrl: '', highMargin: false, isBestseller: false, code: '', barcode: '', unit: 'pcs', taxRate: '', packagingCharge: '', isVeg: true, dietary: 'veg' });
    toast.success(editItem ? (origCat && origCat.id !== targetCatId ? `Moved to ${targetCat.name}!` : 'Item updated!') : 'Item added!');
  };

  const deleteItem = async (catId, itemId) => {
    const targetCatId = catId || categories.find(c => (c.items || []).some(i => i.id === itemId))?.id;
    if (!targetCatId) return;
    const cat = categories.find(c => c.id === targetCatId);
    if (!cat) return;
    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const items = cat.items.filter(i => i.id !== itemId);
    const updatedCats = categories.map(c => c.id === targetCatId ? { ...c, items } : c);
    useMenuStore.getState().setCategories(updatedCats);
    try {
      localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
    } catch { }

    if (!isLocalOnly && isOnline) {
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', targetCatId), { items });
      } catch (e) {
        console.warn('[MenuEditor] Delete item cloud sync deferred:', e?.message);
      }
    }
    toast.success('Item removed');
  };

  const toggleAvailable = async (catId, item) => {
    const targetCatId = catId || item.categoryId || categories.find(c => (c.items || []).some(i => i.id === item.id))?.id;
    if (!targetCatId) return;
    const cat = categories.find(c => c.id === targetCatId);
    if (!cat) return;
    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const nextAvailable = item.available === false;
    const items = cat.items.map(i => i.id === item.id ? { ...i, available: nextAvailable } : i);
    const updatedCats = categories.map(c => c.id === targetCatId ? { ...c, items } : c);
    useMenuStore.getState().setCategories(updatedCats);
    try {
      localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
    } catch { }

    if (!isLocalOnly && isOnline) {
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', targetCatId), { items });
      } catch (e) {
        console.warn('[MenuEditor] Toggle availability cloud sync deferred:', e?.message);
      }

      // Auto-86 sync: push updated stock status to any connected delivery channels
      const hasDeliveryChannels = Object.values(restaurant?.deliveryIntegrations || {}).some(p => p?.enabled);
      if (hasDeliveryChannels) {
        try {
          const token = await auth.currentUser?.getIdToken?.();
          if (token) {
            const syncUrl = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/syncDeliveryMenu?restaurantId=${restaurant.id}`;
            fetch(syncUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => { });
          }
        } catch { }
      }
    }
    toast.success(nextAvailable ? `${item.name} is now Available` : `${item.name} marked Out of Stock`);
  };

  const quickUpdatePrice = async (catId, item, rawVal) => {
    setEditingPriceItemId(null);
    const parsed = parseFloat(rawVal);
    if (isNaN(parsed) || parsed < 0) return;
    const rounded = Math.round(parsed * 100) / 100;
    if (rounded === Number(item.price)) return;

    const targetCatId = catId || item.categoryId || categories.find(c => (c.items || []).some(i => i.id === item.id))?.id;
    if (!targetCatId) return;
    const cat = categories.find(c => c.id === targetCatId);
    if (!cat) return;

    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    const items = cat.items.map(i => i.id === item.id ? { ...i, price: rounded } : i);
    const updatedCats = categories.map(c => c.id === targetCatId ? { ...c, items } : c);
    useMenuStore.getState().setCategories(updatedCats);
    try {
      localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
    } catch { }

    if (!isLocalOnly && isOnline) {
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', targetCatId), { items });
      } catch (e) {
        console.warn('[MenuEditor] Quick price update cloud sync deferred:', e?.message);
      }
    }
    toast.success(`${item.name} updated to ${formatCurrency(rounded, restaurant?.currency ?? 'INR')}`);
  };

  const toggleBestseller = async (catId, item) => {
    const targetCatId = catId || item.categoryId || categories.find(c => (c.items || []).some(i => i.id === item.id))?.id;
    if (!targetCatId) return;
    const cat = categories.find(c => c.id === targetCatId);
    if (!cat) return;
    const isLocalOnly = Boolean(restaurant?.localStorageOnly);
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    const nextBestseller = !(item.isBestseller || item.bestseller);
    const items = cat.items.map(i => i.id === item.id ? { ...i, isBestseller: nextBestseller, bestseller: nextBestseller } : i);
    const updatedCats = categories.map(c => c.id === targetCatId ? { ...c, items } : c);
    useMenuStore.getState().setCategories(updatedCats);
    try {
      localStorage.setItem('dineos_cached_menu', JSON.stringify(updatedCats));
    } catch { }

    if (!isLocalOnly && isOnline) {
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id, 'menu', targetCatId), { items });
      } catch (e) {
        console.warn('[MenuEditor] Toggle bestseller cloud sync deferred:', e?.message);
      }
    }
    toast.success(nextBestseller ? `🔥 Marked ${item.name} as Bestseller` : `Removed Bestseller tag from ${item.name}`);
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    const toastId = toast.loading('Processing image...');
    try {
      // Compress inline — image stored as base64 in Firestore, bypassing Storage CORS
      const dataUrl = await compressImage(file, 400, 0.82);
      setItemForm(f => ({ ...f, imageUrl: dataUrl }));
      toast.success('Image ready! Save the item to apply.', { id: toastId });
    } catch (err) {
      console.error('[Image Error]', err);
      toast.error('Failed to process image: ' + err.message, { id: toastId });
    } finally {
      e.target.value = '';
      setUploadingImage(false);
    }
  };

  const allDishes = useMemo(() => {
    const list = [];
    (categories || []).forEach(cat => {
      (cat.items || []).forEach(item => {
        list.push({
          ...item,
          categoryId: cat.id,
          categoryName: cat.name,
          categoryEmoji: cat.emoji || '🍽️'
        });
      });
    });
    return list;
  }, [categories]);

  const isAllItems = activeCat === 'all' || !activeCat || (!categories.some(c => c.id === activeCat) && categories.length > 0);
  const activeCatId = isAllItems ? 'all' : activeCat;
  const activeCatData = isAllItems ? null : (categories.find(c => c.id === activeCatId) || null);

  const matchesQuery = (item, query) => {
    if (!query || !query.trim()) return true;
    const q = query.trim().toLowerCase();
    return Boolean(
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.barcode && item.barcode.toLowerCase().includes(q)) ||
      (item.mlName && item.mlName.toLowerCase().includes(q)) ||
      (item.hiName && item.hiName.toLowerCase().includes(q)) ||
      (item.station && item.station.toLowerCase().includes(q)) ||
      (item.categoryName && item.categoryName.toLowerCase().includes(q))
    );
  };

  const currentCategoryItems = useMemo(() => {
    if (isAllItems) {
      return allDishes;
    }
    if (!activeCatData) return [];
    return (activeCatData.items || []).map(item => ({
      ...item,
      categoryId: activeCatData.id,
      categoryName: activeCatData.name,
      categoryEmoji: activeCatData.emoji || '🍽️'
    }));
  }, [isAllItems, allDishes, activeCatData]);

  const filteredItems = useMemo(() => {
    return currentCategoryItems.filter(item => matchesQuery(item, searchQuery));
  }, [currentCategoryItems, searchQuery]);

  const otherCatMatches = useMemo(() => {
    if (isAllItems || !searchQuery.trim()) return [];
    return allDishes.filter(item => item.categoryId !== activeCatId && matchesQuery(item, searchQuery));
  }, [isAllItems, searchQuery, allDishes, activeCatId]);

  const displayItems = isReorderMode ? currentCategoryItems : filteredItems;

  const existingSubCategories = useMemo(() => {
    const targetCatId = itemForm.categoryId || (activeCat && activeCat !== 'all' ? activeCat : categories[0]?.id);
    const cat = categories.find(c => c.id === targetCatId);
    if (!cat) return [];
    const set = new Set();
    if (Array.isArray(cat.subCategories)) {
      cat.subCategories.forEach(s => {
        if (s && typeof s === 'string' && s.trim()) {
          set.add(s.trim());
        }
      });
    }
    if (Array.isArray(cat.items)) {
      cat.items.forEach(i => {
        if (i.subCategory && typeof i.subCategory === 'string' && i.subCategory.trim()) {
          set.add(i.subCategory.trim());
        }
      });
    }
    return Array.from(set);
  }, [categories, itemForm.categoryId, activeCat]);


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Top Header Bar with balanced Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div>
          <h2 className="text-title2" style={{ margin: 0, fontWeight: 'var(--weight-heavy)' }}>Menu Editor</h2>
          <p className="text-secondary text-caption1" style={{ margin: '2px 0 0 0' }}>
            {categories.length} {terms.categories?.toLowerCase() || 'categories'} · {categories.reduce((acc, c) => acc + (c.items?.length || 0), 0)} {terms.items?.toLowerCase() || 'items'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            id="menu-bulk-csv-btn"
            onClick={() => setShowCsvModal(true)}
            style={{ height: 36, padding: '0 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 'var(--radius-md)' }}
            title="Bulk Import / Export Menu via CSV"
          >
            <FileSpreadsheet size={14} /> Bulk CSV
          </button>
        </div>
      </div>

      {/* Mobile/Tablet Horizontal Segmented Control */}
      <div className="mobile-only" style={{ display: 'flex', gap: '4px', background: 'var(--color-bg-secondary)', padding: '3px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-separator)' }}>
        <button
          type="button"
          onClick={() => setMobileViewTab('items')}
          style={{
            flex: 1,
            height: 36,
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: mobileViewTab === 'items' ? 'var(--color-bg-elevated)' : 'transparent',
            color: mobileViewTab === 'items' ? 'var(--color-label)' : 'var(--color-label-secondary)',
            fontWeight: mobileViewTab === 'items' ? 700 : 500,
            fontSize: '12.5px',
            cursor: 'pointer',
            boxShadow: mobileViewTab === 'items' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <span>🍽️ Menu Items ({categories.reduce((acc, c) => acc + (c.items?.length || 0), 0)})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileViewTab('categories')}
          style={{
            flex: 1,
            height: 36,
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: mobileViewTab === 'categories' ? 'var(--color-bg-elevated)' : 'transparent',
            color: mobileViewTab === 'categories' ? 'var(--color-label)' : 'var(--color-label-secondary)',
            fontWeight: mobileViewTab === 'categories' ? 700 : 500,
            fontSize: '12.5px',
            cursor: 'pointer',
            boxShadow: mobileViewTab === 'categories' ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <span>📁 Categories ({categories.length})</span>
        </button>
      </div>

      <div className="menu-editor-layout">
        {/* Categories sidebar (Desktop standard view & Mobile categories management tab) */}
        <div className={`menu-editor-sidebar card ${mobileViewTab !== 'categories' ? 'desktop-only' : ''}`}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)' }}>
            <div>
              <span className="card-title" style={{ fontSize: '15px' }}>Categories</span>
              <p className="text-secondary mobile-only" style={{ margin: '2px 0 0', fontSize: '11.5px' }}>
                Tap category to browse items or use actions to edit
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              id="add-category-btn"
              onClick={openAddCategory}
              style={{ height: 32, padding: '0 12px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Add Category"
            >
              <Plus size={14} /> Add Category
            </button>
          </div>
          <div className="categories-list-container" style={{ padding: 'var(--space-2)' }}>
            {/* Pinned All Items in sidebar */}
            {(() => {
              const allColors = getCategoryChromaticColors('all');
              return (
                <div
                  id="cat-sidebar-all"
                  className={`menu-editor-cat-item ${isAllItems ? 'active' : ''}`}
                  onClick={() => { setActiveCat('all'); setIsReorderMode(false); setMobileViewTab('items'); }}
                  style={{
                    borderBottom: '1px solid var(--color-separator-opaque)',
                    borderLeft: `4px solid ${allColors.stripe}`,
                  }}
                >
                  <div className="cat-item-icon-box" style={{ background: isAllItems ? 'var(--color-accent)' : 'var(--color-fill)', color: isAllItems ? '#ffffff' : 'inherit' }}>
                    <span>🍽️</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="cat-item-name" style={{ fontWeight: 700 }}>
                        All Items
                      </span>
                      {isAllItems && (
                        <span className="badge badge-accent mobile-only" style={{ fontSize: '9.5px', padding: '1px 6px' }}>Active</span>
                      )}
                    </div>
                    <span className="cat-item-count">
                      {allDishes.length} total {terms.items?.toLowerCase() || 'items'}
                    </span>
                  </div>
                  <ChevronRight size={18} className="cat-item-chevron mobile-only" />
                </div>
              );
            })()}

            {categories.map((c, index) => {
              const isSelected = !isAllItems && activeCatId === c.id;
              const isDragging = draggedCatIndex === index;
              const isOver = dragOverCatIndex === index;
              const catColors = getCategoryChromaticColors(c, index);
              return (
                <div
                  key={c.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`menu-editor-cat-item ${isSelected ? 'active' : ''} ${isDragging ? 'is-dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                  onClick={() => { setActiveCat(c.id); setMobileViewTab('items'); }}
                  style={{
                    borderLeft: `4px solid ${catColors.stripe}`,
                  }}
                >
                  <span
                    className="cat-drag-handle"
                    title="Drag to reorder category"
                    onClick={(e) => e.stopPropagation()}
                    style={{ marginTop: 2 }}
                  >
                    <GripVertical size={14} />
                  </span>
                  <div className="cat-item-icon-box">
                    <span>{c.emoji || '🍽️'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {/* Line 1: Full-width Category Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span className="cat-item-name" style={{ flex: 1, minWidth: 0, fontSize: '13.5px', fontWeight: 650 }} title={c.name}>
                        {c.name}
                      </span>
                      {isSelected && (
                        <span className="badge badge-accent mobile-only" style={{ fontSize: '9.5px', padding: '1px 6px', flexShrink: 0 }}>Active</span>
                      )}
                    </div>

                    {/* Line 2: Count metadata on left & Quick actions on right */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', marginTop: '2px' }}>
                      <span className="cat-item-count" style={{ whiteSpace: 'nowrap' }}>
                        {c.items?.length ?? 0} {terms.items?.toLowerCase() || 'items'}
                      </span>
                      <div className="cat-item-actions" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => moveCategory(index, -1)}
                          disabled={index === 0}
                          className="cat-touch-action-btn reorder-btn"
                          title="Move category up"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategory(index, 1)}
                          disabled={index === categories.length - 1}
                          className="cat-touch-action-btn reorder-btn"
                          title="Move category down"
                        >
                          <ChevronDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditCategory(c)}
                          className="cat-touch-action-btn edit"
                          title="Edit category"
                          id={`edit-cat-${c.id}`}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(c.id)}
                          className="cat-touch-action-btn delete"
                          title="Delete category"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="cat-item-chevron mobile-only" />
                </div>
              );
            })}
            {categories.length === 0 ? (
              <div style={{ padding: 'var(--space-4)', color: 'var(--color-label-tertiary)', fontSize: 'var(--text-footnote)', textAlign: 'center' }}>
                No categories yet
              </div>
            ) : null}
          </div>
        </div>

        {/* Items panel */}
        <div className={`card ${mobileViewTab !== 'items' ? 'desktop-only' : ''}`} style={{ flex: 1 }}>
          {/* Desktop Card Header */}
          <div className="card-header desktop-only" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="card-title" style={{ margin: 0 }}>
                {isAllItems ? '🍽️ All Items' : `${activeCatData?.emoji || '🍽️'} ${activeCatData?.name ?? 'Select a category'}`}
              </span>
              <span className="badge badge-gray" style={{ fontSize: '11px', fontWeight: 600 }}>
                {isAllItems ? allDishes.length : (activeCatData?.items?.length ?? 0)} {terms.items?.toLowerCase() || 'items'}
              </span>
              {!isAllItems && activeCatData && (
                <button
                  type="button"
                  className="btn btn-secondary btn-icon"
                  onClick={() => openEditCategory(activeCatData)}
                  style={{ width: 28, height: 28, padding: 0 }}
                  title={`Edit ${activeCatData.name}`}
                  id="edit-active-cat-btn"
                >
                  <Edit2 size={13} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {categories.length > 0 && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder={isAllItems ? 'Search all items...' : `Search in ${activeCatData?.name || 'category'}...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="form-input"
                    style={{
                      paddingLeft: 28,
                      paddingRight: searchQuery ? 24 : 10,
                      height: 32,
                      fontSize: '12px',
                      width: 170,
                      borderRadius: 8
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: 6, background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* View Switcher Desktop */}
              <div style={{ display: 'inline-flex', background: 'var(--color-bg-secondary)', padding: '2px', borderRadius: '8px', border: '1px solid var(--color-separator)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 8px', height: 28, borderRadius: 6, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setViewMode('grid')}
                  title="Card Grid"
                >
                  <LayoutGrid size={13} />
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 8px', height: 28, borderRadius: 6, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setViewMode('list')}
                  title="List View"
                >
                  <List size={13} />
                </button>
              </div>

              {categories.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleBatchAiTranslateCategory}
                  disabled={isBatchTranslating}
                  title={isAllItems ? "Translate all unpolished dishes across entire menu using AI" : "Translate dishes in this category using AI"}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: 28 }}
                >
                  <Sparkles size={13} className={isBatchTranslating ? 'animate-spin' : ''} />
                  <span>{isBatchTranslating ? 'Translating…' : '✨ AI Polish'}</span>
                </button>
              )}

              {categories.length > 0 && !isAllItems && (
                <button
                  type="button"
                  className={`btn btn-sm ${isReorderMode ? 'btn-primary' : 'btn-secondary'}`}
                  id="reorder-items-btn"
                  onClick={() => setIsReorderMode(!isReorderMode)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    height: 28,
                    fontWeight: isReorderMode ? 700 : 500
                  }}
                  title={isReorderMode ? "Finish arranging items" : "Rearrange item display order for POS terminal"}
                >
                  {isReorderMode ? (
                    <>
                      <Check size={13} />
                      <span>✓ Done</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpDown size={13} />
                      <span>⇄ Reorder</span>
                    </>
                  )}
                </button>
              )}

              {categories.length > 0 && isAllItems && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  id="reorder-items-btn"
                  onClick={() => {
                    if (categories[0]?.id) {
                      setActiveCat(categories[0].id);
                      setIsReorderMode(true);
                      toast.success(`Arranging items for "${categories[0].name}"`);
                    }
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: 28 }}
                  title="Rearrange item display order for POS terminal"
                >
                  <ArrowUpDown size={13} />
                  <span>⇄ Reorder</span>
                </button>
              )}

              {categories.length > 0 && (
                <button className="btn btn-primary btn-sm" id="add-item-btn" onClick={() => openAddItemModal(isAllItems ? null : activeCatId)}>
                  <Plus size={14} /> Add {terms.item || 'Item'}
                </button>
              )}
            </div>
          </div>

          {/* Mobile & Tablet Clean Category Switcher Strip (hidden on desktop where sidebar is present) */}
          <div className="no-scrollbar touch-scroll-x mobile-only" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 14px',
            borderBottom: '1px solid var(--color-separator-opaque)',
            background: 'var(--color-bg-secondary)'
          }}>
            {/* Pinned All Items Pill */}
            <button
              type="button"
              id="cat-mobile-strip-all"
              onClick={() => { setActiveCat('all'); setIsReorderMode(false); setMobileViewTab('items'); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                minHeight: '36px',
                borderRadius: 'var(--radius-sm, 8px)',
                fontSize: '12.5px',
                fontWeight: isAllItems ? 700 : 500,
                border: isAllItems ? '1px solid var(--color-accent)' : '1px solid var(--color-separator-opaque)',
                background: isAllItems ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                color: isAllItems ? '#ffffff' : 'var(--color-label)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: isAllItems ? '0 2px 8px rgba(16,185,129,0.3)' : 'none'
              }}
            >
              <span>🍽️</span>
              <span>All Items</span>
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: isAllItems ? 'rgba(255,255,255,0.25)' : 'var(--color-fill)',
                color: isAllItems ? '#ffffff' : 'var(--color-label-tertiary)'
              }}>
                {allDishes.length}
              </span>
            </button>

            {categories.map(c => {
              const isSelected = !isAllItems && activeCatId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setActiveCat(c.id); setMobileViewTab('items'); }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    minHeight: '36px',
                    borderRadius: 'var(--radius-sm, 8px)',
                    fontSize: '12.5px',
                    fontWeight: isSelected ? 700 : 500,
                    border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--color-separator-opaque)',
                    background: isSelected ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                    color: isSelected ? '#ffffff' : 'var(--color-label)',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: isSelected ? '0 2px 8px rgba(16,185,129,0.3)' : 'none'
                  }}
                >
                  <span>{c.emoji}</span>
                  <span>{c.name}</span>
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--color-fill)',
                    color: isSelected ? '#ffffff' : 'var(--color-label-tertiary)'
                  }}>
                    {c.items?.length ?? 0}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={openAddCategory}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                minHeight: '36px',
                borderRadius: 'var(--radius-sm, 8px)',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px dashed var(--color-separator)',
                background: 'transparent',
                color: 'var(--color-accent)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Plus size={13} /> New Category
            </button>
          </div>

          {/* Mobile Clean 2-Row Toolbar */}
          <div className="mobile-only" style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-separator-opaque)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Row 1: Active Category Info & Edit / Add Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: '18px', flexShrink: 0 }}>{isAllItems ? '🍽️' : (activeCatData?.emoji || '🍽️')}</span>
                <span style={{ fontWeight: 700, fontSize: '15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {isAllItems ? 'All Items' : (activeCatData?.name ?? 'Select category')}
                </span>
                <span className="badge badge-gray" style={{ fontSize: '10px', padding: '2px 6px', flexShrink: 0 }}>
                  {isAllItems ? allDishes.length : (activeCatData?.items?.length ?? 0)} {terms.items?.toLowerCase() || 'items'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {!isAllItems && activeCatData && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openEditCategory(activeCatData)}
                    style={{ height: 30, padding: '0 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    title={`Edit ${activeCatData.name}`}
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                )}
                {categories.length > 0 && (
                  <button
                    type="button"
                    className={`btn btn-sm ${isReorderMode ? 'btn-primary' : 'btn-secondary'}`}
                    id="mobile-toolbar-reorder-btn"
                    onClick={() => {
                      if (!isReorderMode && isAllItems && categories[0]?.id) {
                        setActiveCat(categories[0].id);
                        toast.success(`Arranging items for "${categories[0].name}"`);
                      }
                      setIsReorderMode(!isReorderMode);
                    }}
                    style={{
                      height: 30,
                      padding: '0 10px',
                      fontSize: '11.5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: isReorderMode ? 700 : 500
                    }}
                    title={isReorderMode ? "Finish arranging items" : "Rearrange item display order for POS terminal"}
                  >
                    {isReorderMode ? <Check size={12} /> : <ArrowUpDown size={12} />}
                    <span>{isReorderMode ? 'Done' : 'Reorder'}</span>
                  </button>
                )}
                {categories.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    id="mobile-toolbar-add-item-btn"
                    onClick={() => openAddItemModal(isAllItems ? null : activeCatId)}
                    style={{ height: 30, padding: '0 10px', fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                  >
                    <Plus size={13} /> Add {terms.item || 'Item'}
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Search input + View switcher side-by-side (100% balanced, no wrapping!) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: 12, color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder={isAllItems ? 'Search all items...' : `Search in ${activeCatData?.name || 'items'}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{
                    paddingLeft: 34,
                    paddingRight: searchQuery ? 30 : 12,
                    height: 36,
                    fontSize: '13px',
                    width: '100%',
                    borderRadius: 'var(--radius-md)'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 4 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'inline-flex', background: 'var(--color-bg-secondary)', padding: '2px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 10px', height: 32, borderRadius: 'var(--radius-sm)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setViewMode('grid')}
                  title="Card Grid"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 10px', height: 32, borderRadius: 'var(--radius-sm)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => setViewMode('list')}
                  title="List View"
                >
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>

          <div>
            {/* Cross-Category Search Match Banner */}
            {otherCatMatches.length > 0 && (
              <div className="menu-editor-global-search-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Search size={14} style={{ color: 'var(--color-accent)' }} />
                  <span>
                    Found <strong>{otherCatMatches.length}</strong> more in other categories:
                  </span>
                  <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                    {Array.from(new Set(otherCatMatches.map(m => m.categoryId))).map(cId => {
                      const matchCat = categories.find(c => c.id === cId);
                      const count = otherCatMatches.filter(m => m.categoryId === cId).length;
                      return (
                        <button
                          key={cId}
                          type="button"
                          className="badge badge-gray"
                          onClick={() => setActiveCat(cId)}
                          style={{ cursor: 'pointer', border: '1px solid var(--color-separator)' }}
                          title={`Switch to ${matchCat?.name}`}
                        >
                          {matchCat?.emoji} {matchCat?.name} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ height: 28, fontSize: '11.5px', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  onClick={() => setActiveCat('all')}
                >
                  <span>View All in Catalog</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            )}

            {/* Reorder Mode Banner & Quick Sort Presets */}
            {isReorderMode && activeCatData && (
              <div className="item-reorder-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>⇄</span>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-label)' }}>
                        Arranging {activeCatData?.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                        Order sets terminal button layout (Position #1 is top-left key)
                      </div>
                    </div>
                  </div>

                  <div className="item-reorder-presets">
                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-label-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Quick Sort:
                    </span>
                    <button
                      type="button"
                      id="sort-alpha-btn"
                      className="item-reorder-preset-btn"
                      onClick={() => applyQuickSort('alpha')}
                      title="Sort alphabetically A to Z"
                    >
                      <span>🔤 A → Z</span>
                    </button>
                    <button
                      type="button"
                      id="sort-bestseller-btn"
                      className="item-reorder-preset-btn"
                      onClick={() => applyQuickSort('bestseller')}
                      title="Place Bestsellers at the top"
                    >
                      <span>🔥 Bestsellers First</span>
                    </button>
                    <button
                      type="button"
                      id="sort-price-asc-btn"
                      className="item-reorder-preset-btn"
                      onClick={() => applyQuickSort('price-asc')}
                      title="Sort price low to high"
                    >
                      <span>💰 Price: Low → High</span>
                    </button>
                    <button
                      type="button"
                      id="sort-price-desc-btn"
                      className="item-reorder-preset-btn"
                      onClick={() => applyQuickSort('price-desc')}
                      title="Sort price high to low"
                    >
                      <span>💎 Price: High → Low</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  id="done-reorder-btn"
                  onClick={() => {
                    setIsReorderMode(false);
                    toast.success('Arrangement saved!');
                  }}
                  style={{ height: 30, padding: '0 14px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Check size={14} /> Done Arranging
                </button>
              </div>
            )}

            {currentCategoryItems.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                <div style={{ fontSize: 32 }}>🍽️</div>
                <div style={{ marginTop: 'var(--space-2)' }}>
                  {isAllItems ? 'No items in menu yet' : `No ${terms.items?.toLowerCase() || 'items'} in this ${terms.category?.toLowerCase() || 'category'}`}
                </div>
                {categories.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => openAddItemModal(isAllItems ? null : activeCatId)}
                    style={{ marginTop: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Plus size={14} /> Add First {terms.item || 'Item'}
                  </button>
                )}
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-label-tertiary)' }}>
                <div style={{ fontSize: 28 }}>🔍</div>
                <div style={{ marginTop: 'var(--space-2)' }}>No items match "{searchQuery}"</div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setSearchQuery('')}>Clear search</button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="menu-editor-grid">
                {displayItems.map((item, index) => {
                  const isDragging = draggedItemIndex === index;
                  const isOver = dragOverItemIndex === index;
                  return (
                    <div
                      key={item.id}
                      draggable={isReorderMode}
                      onDragStart={isReorderMode ? (e) => handleItemDragStart(e, index) : undefined}
                      onDragOver={isReorderMode ? (e) => handleItemDragOver(e, index) : undefined}
                      onDragEnd={isReorderMode ? handleItemDragEnd : undefined}
                      onDrop={isReorderMode ? (e) => handleItemDrop(e, index) : undefined}
                      className={`menu-editor-card ${item.available === false ? 'unavailable' : ''} ${isReorderMode ? 'is-reordering' : ''} ${isDragging ? 'is-dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                      onClick={() => {
                        if (isReorderMode) return;
                        openEditItemModal(item);
                      }}
                    >
                      {/* Reorder Top Control Bar */}
                      {isReorderMode && (
                        <div className="item-reorder-card-bar" onClick={(e) => e.stopPropagation()}>
                          <span className="item-pos-badge" title="Terminal button slot position">
                            #{index + 1}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--color-label-tertiary)', fontSize: '11px', fontWeight: 600 }}>
                            <GripVertical size={13} />
                            <span>Drag</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button
                              type="button"
                              className="item-shift-btn"
                              onClick={() => moveItem(index, -1)}
                              disabled={index === 0}
                              title="Move item left / earlier"
                            >
                              <ChevronLeft size={13} />
                            </button>
                            <button
                              type="button"
                              className="item-shift-btn"
                              onClick={() => moveItem(index, 1)}
                              disabled={index === displayItems.length - 1}
                              title="Move item right / later"
                            >
                              <ChevronRight size={13} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Media container */}
                      <div className="menu-editor-card-media">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="menu-editor-card-img" />
                        ) : (() => {
                          const visuals = getItemVisuals(item);
                          return (
                            <div
                              className="menu-editor-card-emoji-placeholder"
                              data-palette={visuals.palette}
                              style={{
                                background: visuals.bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <span
                                className="dish-monogram-text"
                                style={{
                                  color: visuals.color,
                                  fontSize: 28,
                                  fontWeight: 800,
                                  letterSpacing: '-0.02em',
                                  lineHeight: 1
                                }}
                              >
                                {visuals.monogram}
                              </span>
                            </div>
                          );
                        })()}

                        {/* Top floating badges — Clean 1-click Availability + active highlights only */}
                        <div className="menu-editor-card-top-badges">
                          <button
                            type="button"
                            className={`badge ${item.available !== false ? 'badge-green' : 'badge-red'}`}
                            style={{
                              cursor: 'pointer',
                              border: 'none',
                              backdropFilter: 'blur(6px)',
                              padding: '3px 8px',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAvailable(item.categoryId || activeCatId, item);
                            }}
                            title="1-Click Toggle Availability (Available / Out of Stock)"
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.available !== false ? '#34d399' : '#f87171' }} />
                            {item.available !== false ? 'Available' : 'Out of Stock'}
                          </button>

                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {item.highMargin && (
                              <span className="menu-editor-pill-badge star" title="High Margin">⭐</span>
                            )}
                            {(item.isBestseller || item.bestseller) && (
                              <button
                                type="button"
                                className="menu-editor-pill-badge"
                                style={{
                                  background: 'rgba(217, 119, 6, 0.9)',
                                  color: '#fff',
                                  border: '1px solid rgba(251, 191, 36, 0.5)',
                                  cursor: 'pointer',
                                  padding: '3px 7px'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleBestseller(item.categoryId || activeCatId, item);
                                }}
                                title="Bestseller (tap to remove)"
                              >
                                🔥 Best
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="menu-editor-card-body">
                        {((isAllItems && item.categoryName) || item.subCategory) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                            {isAllItems && item.categoryName && (
                              <button
                                type="button"
                                className="menu-editor-cat-badge"
                                style={{ margin: 0 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCat(item.categoryId);
                                }}
                                title={`Filter by ${item.categoryName}`}
                              >
                                <span>{item.categoryName}</span>
                              </button>
                            )}
                            {item.subCategory && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  background: 'rgba(59, 130, 246, 0.14)',
                                  color: '#60a5fa',
                                  border: '1px solid rgba(59, 130, 246, 0.28)',
                                  padding: '2px 6px',
                                  borderRadius: '5px'
                                }}
                              >
                                {item.subCategory}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="menu-editor-card-title-row" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span
                            className={isVegetarianItem(item) ? "food-badge-veg" : "food-badge-nonveg"}
                            title={isVegetarianItem(item) ? "Vegetarian" : "Non-Vegetarian"}
                            style={{ flexShrink: 0 }}
                          />
                          <h4 className="menu-editor-card-title">{item.name}</h4>
                        </div>

                        {item.description && (
                          <p className="menu-editor-card-desc">{item.description}</p>
                        )}

                        {item.modifierGroups?.length > 0 && (
                          <div className="menu-editor-card-modifiers">
                            <span>⚡ {item.modifierGroups.length} {item.modifierGroups.length === 1 ? 'Portion' : 'Portions'}</span>
                          </div>
                        )}
                      </div>

                      {/* Footer: Price & Actions */}
                      <div className="menu-editor-card-footer" onClick={(e) => e.stopPropagation()}>
                        <div className="menu-editor-card-price">
                          {editingPriceItemId === item.id ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              autoFocus
                              value={editingPriceVal}
                              onChange={e => setEditingPriceVal(e.target.value)}
                              onFocus={e => e.target.select()}
                              onBlur={() => quickUpdatePrice(item.categoryId || activeCatId, item, editingPriceVal)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  quickUpdatePrice(item.categoryId || activeCatId, item, editingPriceVal);
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setEditingPriceItemId(null);
                                }
                              }}
                              aria-label={`Quick edit price for ${item.name}`}
                              style={{
                                width: 82,
                                height: 28,
                                padding: '0 6px',
                                fontSize: 13.5,
                                fontWeight: 800,
                                borderRadius: 6,
                                border: '1.5px solid #34d399',
                                background: 'var(--color-bg)',
                                color: '#34d399',
                                outline: 'none'
                              }}
                            />
                          ) : item.modifierGroups?.length > 0 && parseFloat(item.price) === 0 ? (
                            (() => {
                              const allPrices = item.modifierGroups.flatMap(g => g.options?.map(o => o.priceAdd) || []).filter(p => p > 0);
                              const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
                              return `From ${formatCurrency(minPrice, restaurant?.currency ?? 'INR')}`;
                            })()
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPriceItemId(item.id);
                                setEditingPriceVal(String(item.price ?? 0));
                              }}
                              title="Click to quick-edit price"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '2px 4px',
                                marginLeft: -4,
                                borderRadius: 6,
                                color: 'inherit',
                                font: 'inherit',
                                cursor: 'text',
                                display: 'inline-flex',
                                alignItems: 'baseline',
                                gap: 2
                              }}
                            >
                              <span>{formatCurrency(item.price, restaurant?.currency ?? 'INR')}</span>
                              {item.unit && item.unit !== 'pcs' && (
                                <span style={{ fontSize: '10.5px', color: 'var(--color-label-tertiary)', fontWeight: 'normal' }}> /{item.unit}</span>
                              )}
                            </button>
                          )}
                        </div>

                        <div className="menu-editor-card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-icon btn-sm menu-editor-action-btn"
                            onClick={() => openEditItemModal(item)}
                            id={`edit-item-${item.id}`}
                            title="Edit item"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon btn-sm menu-editor-action-btn delete"
                            onClick={() => deleteItem(item.categoryId || activeCatId, item.id)}
                            id={`delete-item-${item.id}`}
                            title="Delete item"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                {displayItems.map((item, index) => {
                  const isDragging = draggedItemIndex === index;
                  const isOver = dragOverItemIndex === index;
                  return (
                    <div
                      key={item.id}
                      draggable={isReorderMode}
                      onDragStart={isReorderMode ? (e) => handleItemDragStart(e, index) : undefined}
                      onDragOver={isReorderMode ? (e) => handleItemDragOver(e, index) : undefined}
                      onDragEnd={isReorderMode ? handleItemDragEnd : undefined}
                      onDrop={isReorderMode ? (e) => handleItemDrop(e, index) : undefined}
                      className={`menu-item-row ${isReorderMode ? 'is-reordering' : ''} ${isDragging ? 'is-dragging' : ''} ${isOver ? 'drag-over' : ''}`}
                      style={{ opacity: item.available === false ? 0.5 : 1 }}
                    >
                      {isReorderMode && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 6 }} onClick={e => e.stopPropagation()}>
                          <GripVertical size={15} style={{ color: 'var(--color-label-tertiary)', cursor: 'grab' }} />
                          <span className="item-pos-badge" style={{ fontSize: '10.5px', padding: '1px 6px' }}>#{index + 1}</span>
                        </div>
                      )}
                      {item.imageUrl ? (
                        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1.5px solid var(--color-separator)', flexShrink: 0 }}>
                          <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ) : (() => {
                        const visuals = getItemVisuals(item);
                        return (
                          <div
                            className="dish-monogram-badge"
                            data-palette={visuals.palette}
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 'var(--radius-md)',
                              overflow: 'hidden',
                              border: `1.5px solid ${visuals.border}`,
                              background: visuals.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <span className="dish-monogram-text" style={{ color: visuals.color, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>
                              {visuals.monogram}
                            </span>
                          </div>
                        );
                      })()}
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span
                            className={isVegetarianItem(item) ? "food-badge-veg" : "food-badge-nonveg"}
                            title={isVegetarianItem(item) ? "Vegetarian" : "Non-Vegetarian"}
                            style={{ flexShrink: 0 }}
                          />
                          <span>{item.name}</span>
                          {isAllItems && item.categoryName && (
                            <button
                              type="button"
                              className="menu-editor-cat-badge"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCat(item.categoryId);
                              }}
                              title={`Filter by ${item.categoryName}`}
                              style={{ margin: 0 }}
                            >
                              <span>{item.categoryEmoji || '🍽️'}</span>
                              <span>{item.categoryName}</span>
                            </button>
                          )}
                          {item.highMargin && <span title="High Margin">⭐</span>}
                          {(item.isBestseller || item.bestseller) && <span title="Bestseller">🔥</span>}
                          {item.barcode && <span style={{ fontSize: '10.5px', color: 'var(--color-label-tertiary)', background: 'var(--color-bg-secondary)', padding: '1px 5px', borderRadius: '4px' }}>🏷️ {item.barcode}</span>}
                          {item.modifierGroups?.length > 0 && (
                            <span style={{ fontSize: '10.5px', color: 'var(--color-accent)', background: 'var(--color-accent-light, rgba(0,122,255,0.08))', border: '1px solid var(--color-accent)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              ⚡ {item.modifierGroups.length} {item.modifierGroups.length === 1 ? 'Portion/Size' : 'Portions/Modifiers'}
                            </span>
                          )}
                        </div>
                        {item.description && <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', marginTop: 2 }}>{item.description}</div>}
                      </div>

                      <div className="menu-item-meta-actions">
                        <div style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-accent)', minWidth: 80, textAlign: 'right', fontSize: 'var(--text-subhead)' }}>
                          {item.modifierGroups?.length > 0 && parseFloat(item.price) === 0 ? (
                            (() => {
                              const allPrices = item.modifierGroups.flatMap(g => g.options?.map(o => o.priceAdd) || []).filter(p => p > 0);
                              const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
                              return `From ${formatCurrency(minPrice, restaurant?.currency ?? 'INR')}`;
                            })()
                          ) : (
                            formatCurrency(item.price, restaurant?.currency ?? 'INR')
                          )}
                          {item.unit && item.unit !== 'pcs' && <span style={{ fontSize: '10px', color: 'var(--color-label-tertiary)', fontWeight: 'normal' }}> /{item.unit}</span>}
                        </div>
                        <div className="menu-item-actions">
                          {isReorderMode && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 4 }} onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                className="cat-touch-action-btn reorder-btn"
                                onClick={() => moveItem(index, -1)}
                                disabled={index === 0}
                                title="Move item up"
                              >
                                <ChevronUp size={12} />
                              </button>
                              <button
                                type="button"
                                className="cat-touch-action-btn reorder-btn"
                                onClick={() => moveItem(index, 1)}
                                disabled={index === displayItems.length - 1}
                                title="Move item down"
                              >
                                <ChevronDown size={12} />
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => toggleAvailable(item.categoryId || activeCatId, item)}
                            className={`badge ${item.available !== false ? 'badge-green' : 'badge-gray'}`}
                            style={{ cursor: 'pointer', border: 'none', fontFamily: 'var(--font-family)' }}
                            title="Toggle availability"
                          >
                            {item.available !== false ? 'Available' : 'Unavailable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBestseller(item.categoryId || activeCatId, item)}
                            className={`badge ${item.isBestseller || item.bestseller ? 'badge-yellow' : 'badge-gray'}`}
                            style={{ cursor: 'pointer', border: 'none', fontFamily: 'var(--font-family)', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                            title={item.isBestseller || item.bestseller ? 'Remove Bestseller' : 'Mark as Bestseller'}
                          >
                            <span>🔥</span>
                            <span>{item.isBestseller || item.bestseller ? 'Bestseller' : 'Best'}</span>
                          </button>
                          <button className="btn btn-secondary btn-icon btn-sm" onClick={() => openEditItemModal(item)} id={`edit-item-${item.id}`}>
                            <Edit2 size={12} />
                          </button>
                          <button className="btn btn-icon btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteItem(item.categoryId || activeCatId, item.id)} id={`delete-item-${item.id}`}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit Category Modal */}
      {showCatForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatForm(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingCat ? 'Edit Category' : 'Add Category'}</h2>
              <button className="btn btn-secondary btn-icon" onClick={() => setShowCatForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Category Name</label>
                <input id="cat-name-input" className="form-input" placeholder="e.g. Starters" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0 }}>Category Color</label>
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                    {catForm.color ? 'Custom' : 'Auto Palette'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setCatForm(f => ({ ...f, color: '' }))}
                    style={{
                      height: 30,
                      padding: '0 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      border: !catForm.color ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                      background: !catForm.color ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
                      color: !catForm.color ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    Auto
                  </button>
                  {CHROMATIC_PALETTE.map(p => {
                    const isPicked = (catForm.color || '').toLowerCase() === p.stripe.toLowerCase();
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setCatForm(f => ({ ...f, color: p.stripe }))}
                        title={p.id}
                        aria-label={`Select ${p.id} color`}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: p.stripe,
                          border: isPicked ? '2.5px solid #ffffff' : '2px solid transparent',
                          boxShadow: isPicked ? `0 0 0 2px ${p.stripe}` : 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        {isPicked && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Tax Rate Override (%)</label>
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                    {restaurant?.taxConfig?.rate != null ? `Store Default: ${restaurant.taxConfig.rate}%` : 'Optional'}
                  </span>
                </div>
                <input
                  id="cat-tax-rate-input"
                  className="form-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder={`Inherit store (${restaurant?.taxConfig?.rate ?? 0}%) or enter e.g. 0, 5, 20`}
                  value={catForm.taxRate}
                  onChange={e => setCatForm(f => ({ ...f, taxRate: e.target.value }))}
                />
                <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: '4px', display: 'block' }}>
                  Leave empty to inherit restaurant tax rate. Enter 0 for zero-rated / tax-exempt items in this category.
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">Sub-Categories (Optional)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="cat-subcat-input"
                    className="form-input"
                    placeholder="e.g. Mocktails, Cocktails (Press Enter)"
                    value={newSubCatInput}
                    onChange={e => setNewSubCatInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        handleAddSubCategoryToCat();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAddSubCategoryToCat}
                    style={{ whiteSpace: 'nowrap', padding: '0 12px' }}
                  >
                    + Add
                  </button>
                </div>
                {catForm.subCategories?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                    {catForm.subCategories.map((sub, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          background: 'var(--color-bg-secondary, rgba(255,255,255,0.06))',
                          border: '1px solid var(--color-separator, rgba(255,255,255,0.1))',
                          color: 'var(--color-label-primary)'
                        }}
                      >
                        {sub}
                        <button
                          type="button"
                          onClick={() => handleRemoveSubCategoryFromCat(idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-label-tertiary)',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            lineHeight: 1
                          }}
                          title={`Remove ${sub}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: '4px', display: 'block' }}>
                  Predefine subcategories like &quot;Mocktails&quot;, &quot;Cocktails&quot; for 1-tap dish tagging.
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCatForm(false)}>Cancel</button>
              <button className="btn btn-primary" id="save-category-btn" onClick={saveCategory}>{editingCat ? 'Save Changes' : 'Add Category'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showItemForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowItemForm(false)}>
          <div className="modal modal-unified-editor">
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>{itemForm.emoji || '🍽️'}</span>
                <div>
                  <h2 className="modal-title" style={{ margin: 0, fontSize: '17px' }}>
                    {editItem ? `Edit: ${editItem.name || 'Item'}` : `Add New ${terms.item || 'Item'}`}
                  </h2>
                  <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                    {(() => {
                      const selectedCat = categories.find(c => c.id === itemForm.categoryId);
                      return selectedCat ? `${selectedCat.emoji || '🍽️'} ${selectedCat.name}` : (activeCatData ? `${activeCatData.emoji} ${activeCatData.name}` : 'Menu Item');
                    })()}
                  </span>
                </div>
              </div>
              <button
                className="btn btn-secondary btn-icon"
                id="close-item-modal-btn"
                onClick={() => setShowItemForm(false)}
                title="Close"
                style={{ width: 42, height: 42, minWidth: 42, minHeight: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Segmented Pill Tab Bar */}
            <div className="modal-tabs-segmented-wrapper">
              <div className="modal-tabs-segmented">
                <button
                  type="button"
                  className={`modal-tab-segmented-btn ${activeTab === 'general' ? 'active' : ''}`}
                  onClick={() => switchTab('general')}
                >
                  General Info
                </button>
                <button
                  type="button"
                  className={`modal-tab-segmented-btn ${activeTab === 'modifiers' ? 'active' : ''}`}
                  onClick={() => switchTab('modifiers')}
                >
                  Portions & Add-ons
                  {(itemForm.modifierGroups?.length ?? 0) > 0 && (
                    <span className="modal-tab-badge">{itemForm.modifierGroups.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`modal-tab-segmented-btn ${activeTab === 'recipe' ? 'active' : ''}`}
                  onClick={() => switchTab('recipe')}
                >
                  Recipe & COGS
                  {(itemForm.recipe?.length ?? 0) > 0 && (
                    <span className="modal-tab-badge">{itemForm.recipe.length}</span>
                  )}
                </button>
              </div>
            </div>

            {/* Tab 1: General Info (Ergonomically Organized for Touch & POS Terminals) */}
            {activeTab === 'general' && (
              <div className="modal-body" ref={modalBodyRef} style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                {/* 1. Item Name Hero & Availability Toggle */}
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="form-label" style={{ fontWeight: 700, margin: 0, fontSize: '12.5px' }}>Item Name</label>
                    <button
                      type="button"
                      onClick={() => setItemForm(f => ({ ...f, available: !f.available }))}
                      className={`item-status-toggle-pill ${itemForm.available ? 'is-available' : 'is-sold-out'}`}
                      title="Click to toggle availability"
                    >
                      <span className="status-dot" />
                      <span className="status-text">{itemForm.available ? 'Available' : 'Sold Out'}</span>
                    </button>
                  </div>
                  <input
                    id="item-name-input"
                    className="form-input"
                    placeholder="e.g. Grilled Chicken"
                    value={itemForm.name}
                    onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))}
                    style={{ height: 46, fontSize: '15px', borderRadius: '10px' }}
                  />
                </div>

                {/* 2. Core Essentials: Price & Category */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Price */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 800, margin: '0 0 6px 0', fontSize: '12px' }}>
                      Price ({restaurant?.currency ?? 'INR'})
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: 14, fontSize: '16px', fontWeight: 800, color: '#38bdf8', pointerEvents: 'none' }}>
                        {restaurant?.currency === 'INR' ? '₹' : (restaurant?.currency ?? '$')}
                      </span>
                      <input
                        id="item-price-input"
                        className="form-input"
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0.00"
                        value={itemForm.price}
                        onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))}
                        style={{ paddingLeft: 30, height: 46, fontSize: '15px', fontWeight: 600, borderRadius: '10px' }}
                      />
                    </div>
                  </div>

                  {/* Category */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, margin: '0 0 6px 0', fontSize: '12px' }}>Category</label>
                    <select
                      id="item-category-select"
                      className="form-select"
                      value={itemForm.categoryId || (categories[0]?.id ?? '')}
                      onChange={e => setItemForm(f => ({ ...f, categoryId: e.target.value }))}
                      style={{ height: 46, fontSize: '14px', borderRadius: '10px' }}
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.emoji || '🍽️'} {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Routing & Tagging: Kitchen Station & Sub-Category */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Kitchen Station */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label className="form-label" style={{ fontWeight: 700, margin: 0, fontSize: '12px' }}>Kitchen Station</label>
                      {!isAddingCustomStation && (
                        <button
                          type="button"
                          onClick={() => setIsAddingCustomStation(true)}
                          style={{
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.28)',
                            color: 'var(--color-accent, #10b981)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            touchAction: 'manipulation'
                          }}
                        >
                          + Custom
                        </button>
                      )}
                    </div>
                    {isAddingCustomStation ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ height: 46, padding: '0 12px', fontSize: '13.5px', flex: 1, borderRadius: '10px' }}
                          placeholder="e.g. Pizza Oven, Bar"
                          value={newCustomStation}
                          onChange={e => setNewCustomStation(e.target.value)}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleCreateCustomStation();
                            } else if (e.key === 'Escape') {
                              setIsAddingCustomStation(false);
                              setNewCustomStation('');
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          style={{ height: 46, padding: '0 14px', flexShrink: 0, borderRadius: '10px' }}
                          onClick={handleCreateCustomStation}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ height: 46, padding: '0 10px', flexShrink: 0, borderRadius: '10px' }}
                          onClick={() => {
                            setIsAddingCustomStation(false);
                            setNewCustomStation('');
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <select
                        id="item-station-select"
                        className="form-select"
                        value={itemForm.station ?? 'Kitchen'}
                        onChange={e => {
                          if (e.target.value === '__add_custom__') {
                            setIsAddingCustomStation(true);
                          } else {
                            setItemForm(f => ({ ...f, station: e.target.value }));
                          }
                        }}
                        style={{ height: 46, padding: '0 12px', fontSize: '14px', borderRadius: '10px' }}
                      >
                        {availableStations.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                        <option value="__add_custom__">+ Add Custom Station...</option>
                      </select>
                    )}
                  </div>

                  {/* Sub-Category (Optional) */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontWeight: 700, margin: '0 0 6px 0', fontSize: '12px' }}>
                      Sub-Category (Optional)
                    </label>
                    <input
                      id="item-subcategory-input"
                      className="form-input"
                      placeholder="e.g. Mocktails, Indian, etc."
                      value={itemForm.subCategory || ''}
                      onChange={e => setItemForm(f => ({ ...f, subCategory: e.target.value }))}
                      list="existing-subcategories-list"
                      style={{ height: 46, fontSize: '13.5px', borderRadius: '10px' }}
                    />
                    <datalist id="existing-subcategories-list">
                      {existingSubCategories.map((sub, sIdx) => (
                        <option key={sIdx} value={sub} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Sub-Category Touch Chips (if predefined subcategories exist) */}
                {existingSubCategories.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -4 }}>
                    {existingSubCategories.map((sub, sIdx) => {
                      const isSelected = (itemForm.subCategory || '').trim().toLowerCase() === sub.trim().toLowerCase();
                      return (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => setItemForm(f => ({ ...f, subCategory: isSelected ? '' : sub }))}
                          style={{
                            border: isSelected ? '2px solid #10b981' : '1.5px solid rgba(255, 255, 255, 0.24)',
                            background: isSelected ? 'rgba(16, 185, 129, 0.25)' : '#182030',
                            color: isSelected ? '#34d399' : '#cbd5e1',
                            fontWeight: isSelected ? 800 : 600,
                            fontSize: '12px',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            minHeight: '32px',
                            cursor: 'pointer',
                            touchAction: 'manipulation',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {isSelected ? '✓ ' : '+ '}{sub}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 4. Food Type (Dietary: Veg / Non-Veg Toggle Switch) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', color: '#f1f5f9', letterSpacing: '0.05em', margin: 0 }}>
                      Food Type (Dietary)
                    </label>
                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: itemForm.isVeg ? '#34d399' : '#f87171' }}>
                      {itemForm.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                    </span>
                  </div>

                  <div
                    id="item-dietary-toggle-card"
                    onClick={() => setItemForm(f => ({ ...f, isVeg: !f.isVeg, dietary: !f.isVeg ? 'veg' : 'non-veg' }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      touchAction: 'manipulation',
                      background: itemForm.isVeg ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                      border: itemForm.isVeg ? '2px solid #10b981' : '2px solid #ef4444',
                      boxShadow: itemForm.isVeg ? '0 0 16px rgba(16, 185, 129, 0.22)' : '0 0 16px rgba(239, 68, 68, 0.22)',
                      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        className={itemForm.isVeg ? 'food-badge-veg' : 'food-badge-nonveg'}
                        style={{ width: 22, height: 22, flexShrink: 0 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: itemForm.isVeg ? '#34d399' : '#f87171' }}>
                          {itemForm.isVeg ? 'Vegetarian (Veg)' : 'Non-Vegetarian'}
                        </span>
                        <span style={{ fontSize: '11px', color: itemForm.isVeg ? '#a7f3d0' : '#fca5a5' }}>
                          {itemForm.isVeg ? 'Pure veg dish • Green dot shown to customers & kitchen' : 'Contains meat/egg • Red triangle shown to customers & kitchen'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                      <ToggleSwitch
                        id="item-veg-toggle-switch"
                        className="dietary-toggle-switch"
                        size="md"
                        checked={itemForm.isVeg}
                        onChange={e => setItemForm(f => ({ ...f, isVeg: e.target.checked, dietary: e.target.checked ? 'veg' : 'non-veg' }))}
                        title={itemForm.isVeg ? 'Switch to Non-Vegetarian' : 'Switch to Vegetarian'}
                      />
                    </div>
                  </div>

                  {/* Hidden buttons for backward compatibility with existing tests */}
                  <button
                    type="button"
                    id="item-veg-toggle"
                    style={{ display: 'none' }}
                    onClick={() => setItemForm(f => ({ ...f, isVeg: true, dietary: 'veg' }))}
                  />
                  <button
                    type="button"
                    id="item-nonveg-toggle"
                    style={{ display: 'none' }}
                    onClick={() => setItemForm(f => ({ ...f, isVeg: false, dietary: 'non-veg' }))}
                  />
                </div>

                {/* 5. Highlights & Badges Section (Touch-friendly 44px buttons) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', color: '#f1f5f9', letterSpacing: '0.05em', margin: 0 }}>
                    Badges & Highlights
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setItemForm(f => ({ ...f, highMargin: !f.highMargin }))}
                      className={`high-margin-chip ${itemForm.highMargin ? 'is-active' : ''}`}
                      style={{ height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', borderRadius: '10px', touchAction: 'manipulation' }}
                    >
                      <span style={{ fontSize: '15px' }}>⭐</span>
                      <span>High Margin</span>
                    </button>

                    <button
                      type="button"
                      id="item-bestseller-toggle"
                      onClick={() => setItemForm(f => ({ ...f, isBestseller: !f.isBestseller }))}
                      className={`bestseller-chip ${itemForm.isBestseller ? 'is-active' : ''}`}
                      style={{ height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', borderRadius: '10px', touchAction: 'manipulation' }}
                    >
                      <span style={{ fontSize: '15px' }}>🔥</span>
                      <span>Bestseller</span>
                    </button>
                  </div>
                </div>

                {/* 6. Photo & Emoji Card (High-Contrast Deck) */}
                <div
                  className="item-editor-media-deck"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '14px',
                    background: '#0a0d15',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1.5px solid rgba(255, 255, 255, 0.22)'
                  }}
                >
                  {/* Photo Uploader (Left) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                    {itemForm.imageUrl ? (
                      <div style={{ position: 'relative', width: 52, height: 52, borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--color-separator)', flexShrink: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
                        <img src={itemForm.imageUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => setItemForm(f => ({ ...f, imageUrl: '' }))}
                          style={{
                            position: 'absolute', top: 3, right: 3,
                            background: 'rgba(239, 68, 68, 0.95)', color: '#fff',
                            border: 'none', borderRadius: '50%',
                            width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, cursor: 'pointer', fontWeight: 'bold',
                            touchAction: 'manipulation'
                          }}
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: '10px', border: '1.5px dashed rgba(255, 255, 255, 0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: '#05070c', flexShrink: 0 }}>
                        📷
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                      <input
                        type="file"
                        accept="image/*"
                        id="item-image-file"
                        onChange={handleImageChange}
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => document.getElementById('item-image-file').click()}
                        disabled={uploadingImage}
                        style={{ height: 38, padding: '0 14px', fontSize: '12px', fontWeight: 700, background: '#232c40', color: '#ffffff', border: '1.5px solid rgba(255, 255, 255, 0.25)', display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: '8px', touchAction: 'manipulation' }}
                      >
                        <Camera size={14} />
                        <span>{uploadingImage ? 'Optimizing...' : (itemForm.imageUrl ? 'Change Photo' : 'Upload Photo')}</span>
                      </button>
                      <span style={{ fontSize: '10.5px', color: '#94a3b8', lineHeight: 1 }}>
                        Auto-compressed
                      </span>
                    </div>
                  </div>

                  {/* Vertical Divider */}
                  <div style={{ width: 1, height: 40, background: 'rgba(255, 255, 255, 0.16)', flexShrink: 0 }} />

                  {/* Emoji input (Right) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#f1f5f9' }}>Emoji</span>
                    <input
                      id="item-emoji-input"
                      className="form-input"
                      placeholder="🍽️"
                      value={itemForm.emoji}
                      onChange={e => setItemForm(f => ({ ...f, emoji: e.target.value }))}
                      style={{ width: 48, height: 44, textAlign: 'center', fontSize: 20, padding: '0 4px', borderRadius: '10px' }}
                    />
                  </div>
                </div>

                {/* 7. Waiter Local Language Display & AI Translator (Collapsible Deck) */}
                <div
                  className="pronunciation-script-card"
                  style={{
                    background: '#0a0d15',
                    border: '1.5px solid rgba(255, 255, 255, 0.22)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s ease'
                  }}
                >
                  <div
                    id="toggle-waiter-pronunciation-btn"
                    onClick={() => setShowPronunciation(p => !p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      minHeight: 44,
                      cursor: 'pointer',
                      userSelect: 'none',
                      touchAction: 'manipulation',
                      background: showPronunciation ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                      transition: 'background 0.15s ease'
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowPronunciation(p => !p); } }}
                    title={showPronunciation ? 'Click to collapse pronunciation script' : 'Click to expand pronunciation script'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#94a3b8',
                        transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: showPronunciation ? 'rotate(180deg)' : 'rotate(0deg)'
                      }}>
                        <ChevronDown size={14} />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <Languages size={15} style={{ color: '#38bdf8' }} />
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>
                          Waiter Pronunciation Script
                        </span>
                      </div>
                      {(itemForm.mlName || itemForm.hiName) ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <span style={{
                            fontSize: '9.5px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: 'rgba(56, 189, 248, 0.2)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56, 189, 248, 0.45)',
                            letterSpacing: '0.02em',
                            flexShrink: 0
                          }}>
                            Configured
                          </span>
                          {!showPronunciation && (
                            <span style={{
                              fontSize: '11px',
                              color: '#cbd5e1',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {[itemForm.mlName, itemForm.hiName].filter(Boolean).join(' • ')}
                            </span>
                          )}
                        </div>
                      ) : (
                        !showPronunciation && (
                          <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                            (Auto-generated)
                          </span>
                        )
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPronunciation(true);
                          handleAiTranslateItem();
                        }}
                        disabled={isAiTranslating || !itemForm.name?.trim()}
                        className="btn btn-ghost"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '4px 10px',
                          minHeight: 32,
                          fontSize: '11.5px',
                          fontWeight: 700,
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.15)',
                          borderRadius: '8px',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          cursor: itemForm.name?.trim() ? 'pointer' : 'not-allowed',
                          opacity: itemForm.name?.trim() ? 1 : 0.6,
                          touchAction: 'manipulation'
                        }}
                        title="Generate native phonetic transliterations using AI"
                      >
                        <Sparkles size={12} className={isAiTranslating ? 'animate-spin' : ''} />
                        <span>{isAiTranslating ? 'Translating…' : '✨ AI Polish'}</span>
                      </button>
                    </div>
                  </div>

                  {showPronunciation && (
                    <div style={{
                      padding: '10px 14px 12px 14px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.14)',
                      animation: 'fadeInAccordion 0.18s ease-out'
                    }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', display: 'block', fontWeight: 700 }}>
                          🌴 Malayalam (മലയാളം)
                        </label>
                        <input
                          className="form-input"
                          placeholder={itemForm.name ? transliterateFood(itemForm.name, 'ml') : 'ഗാർലിക് ചിക്കൻ'}
                          value={itemForm.mlName || ''}
                          onChange={e => setItemForm(f => ({ ...f, mlName: e.target.value }))}
                          style={{ height: 40, fontSize: '13px', borderRadius: '8px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', display: 'block', fontWeight: 700 }}>
                          🇮🇳 Hindi (हिंदी)
                        </label>
                        <input
                          className="form-input"
                          placeholder={itemForm.name ? transliterateFood(itemForm.name, 'hi') : 'गार्लिक चिकन'}
                          value={itemForm.hiName || ''}
                          onChange={e => setItemForm(f => ({ ...f, hiName: e.target.value }))}
                          style={{ height: 40, fontSize: '13px', borderRadius: '8px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 8. Collapsible Optional Details (SKU, Tax, Unit, Description) */}
                <div className="optional-details-wrapper">
                  <button
                    type="button"
                    id="toggle-optional-details-btn"
                    className="optional-details-toggle-btn"
                    onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
                    style={{ minHeight: 44, padding: '10px 14px', touchAction: 'manipulation' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {showAdvancedDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#f8fafc' }}>{showAdvancedDetails ? 'Hide Optional Details' : 'Optional Details (SKU, Tax, Description)'}</span>
                    </span>
                    {(itemForm.code || itemForm.barcode || itemForm.description || itemForm.taxRate !== '' || itemForm.packagingCharge !== '' || (itemForm.unit && itemForm.unit !== 'pcs')) && (
                      <span className="optional-details-configured-badge" style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.45)', fontWeight: 800 }}>Configured</span>
                    )}
                  </button>

                  {showAdvancedDetails && (
                    <div className="optional-details-content">
                      {/* Tax Rate Override Row */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <label className="form-label" style={{ fontSize: '11px', fontWeight: 700, margin: 0 }}>
                            Tax Rate Override (%)
                          </label>
                          <span style={{ fontSize: '10.5px', color: 'var(--color-label-tertiary)' }}>
                            {activeCatData?.taxRate != null
                              ? `Inherits Category: ${activeCatData.taxRate}%`
                              : `Inherits Store: ${restaurant?.taxConfig?.rate ?? 0}%`}
                          </span>
                        </div>
                        <input
                          id="item-tax-rate-input"
                          className="form-input"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder={`Inherit (${activeCatData?.taxRate ?? restaurant?.taxConfig?.rate ?? 0}%) or enter 0 for Zero-Rated`}
                          value={itemForm.taxRate ?? ''}
                          onChange={e => setItemForm(f => ({ ...f, taxRate: e.target.value }))}
                          style={{ height: 44, padding: '0 12px', fontSize: '13.5px', borderRadius: '10px' }}
                        />
                        <span style={{ fontSize: '10.5px', color: 'var(--color-label-tertiary)', marginTop: '4px', display: 'block' }}>
                          Leave blank to inherit category/store tax. Set to 0 for tax-exempt / zero-rated items.
                        </span>
                      </div>

                      {/* Short Code, Barcode & Container Fee Row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>POS Short Code</label>
                          <input
                            id="item-shortcode-input"
                            className="form-input"
                            placeholder="e.g. 101 or MD"
                            value={itemForm.code ?? ''}
                            onChange={e => setItemForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                            style={{ height: 44, padding: '0 12px', fontSize: '13.5px', borderRadius: '10px' }}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Barcode / SKU</label>
                          <input
                            id="item-barcode-input"
                            className="form-input"
                            placeholder="e.g. SKU-101"
                            value={itemForm.barcode ?? ''}
                            onChange={e => setItemForm(f => ({ ...f, barcode: e.target.value }))}
                            style={{ height: 44, padding: '0 12px', fontSize: '13.5px', borderRadius: '10px' }}
                          />
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Parcel / Box Fee</label>
                          <input
                            id="item-packaging-charge-input"
                            type="number"
                            min="0"
                            step="0.5"
                            className="form-input"
                            placeholder="e.g. 10"
                            value={itemForm.packagingCharge ?? ''}
                            onChange={e => setItemForm(f => ({ ...f, packagingCharge: e.target.value }))}
                            style={{ height: 44, padding: '0 12px', fontSize: '13.5px', borderRadius: '10px' }}
                          />
                        </div>
                      </div>

                      {/* Unit of Measure */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Unit of Measure</label>
                        <select
                          id="item-unit-select"
                          className="form-select"
                          value={itemForm.unit ?? 'pcs'}
                          onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))}
                          style={{ height: 44, padding: '0 12px', fontSize: '13.5px', borderRadius: '10px' }}
                        >
                          <option value="pcs">Pieces (pcs)</option>
                          <option value="kg">Kilogram (kg)</option>
                          <option value="g">Gram (g)</option>
                          <option value="pack">Pack / Box</option>
                          <option value="portion">Portion</option>
                          <option value="hour">Hour / Session</option>
                        </select>
                      </div>

                      {/* Description */}
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px', fontWeight: 700 }}>Description</label>
                        <textarea
                          id="item-desc-input"
                          className="form-input"
                          placeholder="Describe taste, ingredients, or allergens..."
                          value={itemForm.description}
                          onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))}
                          rows={2}
                          style={{ resize: 'none', padding: '10px 12px', height: 'auto', fontSize: '13px', fontFamily: 'inherit', borderRadius: '10px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Portions & Add-ons */}
            {activeTab === 'modifiers' && (
              <div className="modal-body" ref={modalBodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {/* Header with Title + Expand/Collapse All + Add Group */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '14.5px', color: 'var(--color-label)' }}>
                      Portions, Sizes & Add-ons
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>
                      Configure portion sizes, spice levels, toppings, or sauce choices.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {(itemForm.modifierGroups ?? []).length > 1 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={toggleCollapseAll}
                        style={{ height: 30, padding: '0 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <ChevronsUpDown size={12} />
                        {areAllGroupsCollapsed ? 'Expand All' : 'Collapse All'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => addModifierPreset('custom')}
                      style={{ height: 30, padding: '0 12px', fontSize: '11.5px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      <Plus size={13} /> Custom Group
                    </button>
                  </div>
                </div>

                {/* Structured Quick Template Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-label-secondary)', letterSpacing: '0.5px' }}>
                      ⚡ 1-Click Quick Presets
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>Tap to instantly add template</span>
                  </div>
                  <div className="modifier-presets-grid">
                    <button type="button" className="modifier-preset-card" onClick={() => addModifierPreset('portions')}>
                      <div className="preset-card-top">
                        <span style={{ fontSize: '18px' }}>🍗</span>
                        <span>Portions</span>
                      </div>
                      <span className="preset-card-desc">Quarter · Half · Full</span>
                    </button>
                    <button type="button" className="modifier-preset-card" onClick={() => addModifierPreset('sizes')}>
                      <div className="preset-card-top">
                        <span style={{ fontSize: '18px' }}>📏</span>
                        <span>Sizes</span>
                      </div>
                      <span className="preset-card-desc">Small · Med · Large</span>
                    </button>
                    <button type="button" className="modifier-preset-card" onClick={() => addModifierPreset('spice')}>
                      <div className="preset-card-top">
                        <span style={{ fontSize: '18px' }}>🌶️</span>
                        <span>Spice Level</span>
                      </div>
                      <span className="preset-card-desc">Mild · Med · Hot</span>
                    </button>
                    <button type="button" className="modifier-preset-card" onClick={() => addModifierPreset('addons')}>
                      <div className="preset-card-top">
                        <span style={{ fontSize: '18px' }}>🧀</span>
                        <span>Add-ons</span>
                      </div>
                      <span className="preset-card-desc">Extras & Sides</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Modifier Groups List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(itemForm.modifierGroups ?? []).map((group, gIdx) => {
                    const isPortionType = group.required && group.maxSelect === 1;
                    const basePriceNum = parseFloat(itemForm.price) || 0;
                    const isCollapsed = !!collapsedGroups[group.id];

                    return (
                      <div
                        key={group.id}
                        className={`modifier-group-accordion-card ${isCollapsed ? 'is-collapsed' : ''}`}
                      >
                        {/* Accordion Header */}
                        <div
                          className="modifier-group-accordion-header"
                          onClick={() => toggleGroupCollapse(group.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <div className="modifier-group-index-badge">
                              {gIdx + 1}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--color-label)' }}>
                                {group.name?.trim() || `Group #${gIdx + 1}`}
                              </span>

                              <span className={`modifier-type-badge ${isPortionType ? 'portion' : 'addon'}`}>
                                {isPortionType ? '🎯 Portion (Pick 1)' : '➕ Optional Extras'}
                              </span>

                              {isCollapsed && (
                                <span style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)' }}>
                                  ({getGroupSummary(group)})
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapse(group.id)}
                              className="modifier-group-action-btn"
                              title={isCollapsed ? 'Expand Group' : 'Collapse Group'}
                            >
                              {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const updated = itemForm.modifierGroups.filter((_, idx) => idx !== gIdx);
                                setItemForm(f => ({ ...f, modifierGroups: updated }));
                              }}
                              className="modifier-group-action-btn btn-delete-group"
                              title="Delete group"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Accordion Body (Only shown when expanded) */}
                        {!isCollapsed && (
                          <div className="modifier-group-accordion-body">
                            {/* Group Name input + Segmented Type Switcher */}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 180 }}>
                                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', marginBottom: 3 }}>
                                  Group Label
                                </label>
                                <input
                                  className="form-input"
                                  placeholder="e.g. Portion / Size or Choice of Dip"
                                  value={group.name}
                                  onChange={e => {
                                    const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, name: e.target.value } : g);
                                    setItemForm(f => ({ ...f, modifierGroups: updated }));
                                  }}
                                  style={{ height: 32, padding: '2px 8px', fontSize: 12.5, fontWeight: 600 }}
                                />
                              </div>

                              <div>
                                <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', marginBottom: 3 }}>
                                  Selection Rule
                                </label>
                                <div className="modifier-rule-segmented">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: true, maxSelect: 1 } : g);
                                      setItemForm(f => ({ ...f, modifierGroups: updated }));
                                    }}
                                    className={`modifier-rule-btn ${isPortionType ? 'active portion' : ''}`}
                                  >
                                    🎯 Portion (Pick 1)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, required: false, maxSelect: Math.max(g.options?.length || 1, 3) } : g);
                                      setItemForm(f => ({ ...f, modifierGroups: updated }));
                                    }}
                                    className={`modifier-rule-btn ${!isPortionType ? 'active extra' : ''}`}
                                  >
                                    ➕ Optional Extras
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Behavior Info Row */}
                            <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {isPortionType ? (
                                <span style={{ color: '#10b981', fontWeight: 600 }}>
                                  ✓ Required: Cashier must select exactly 1 portion before ordering.
                                </span>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>Optional selections allowed. Max items selectable:</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={group.maxSelect}
                                    onChange={e => {
                                      const val = parseInt(e.target.value) || 1;
                                      const updated = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, maxSelect: val } : g);
                                      setItemForm(f => ({ ...f, modifierGroups: updated }));
                                    }}
                                    style={{ width: 44, height: 22, textAlign: 'center', fontSize: 11, padding: '0 2px' }}
                                    className="form-input"
                                  />
                                </div>
                              )}
                            </div>

                            {/* Options Table Header */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: basePriceNum > 0 ? '1fr 90px 100px 28px' : '1fr 100px 28px', gap: 8, alignItems: 'center', padding: '0 2px' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                                  Option / Size Name
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                                  Price Added
                                </span>
                                {basePriceNum > 0 && (
                                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-label-tertiary)', letterSpacing: '0.4px' }}>
                                    Total Price
                                  </span>
                                )}
                                <span />
                              </div>

                              {/* Options List */}
                              {group.options.map((opt, oIdx) => {
                                const finalPrice = basePriceNum + (opt.priceAdd || 0);

                                return (
                                  <div key={opt.id} style={{ display: 'grid', gridTemplateColumns: basePriceNum > 0 ? '1fr 90px 100px 28px' : '1fr 100px 28px', gap: 8, alignItems: 'center' }}>
                                    <input
                                      className="form-input"
                                      placeholder="e.g. Regular, Quarter, Extra Cheese"
                                      value={opt.name}
                                      onChange={e => {
                                        const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, name: e.target.value } : o);
                                        const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                        setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                      }}
                                      style={{ height: 32, padding: '2px 8px', fontSize: 12 }}
                                    />

                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                      <span style={{ position: 'absolute', left: 8, fontSize: 11, color: 'var(--color-label-tertiary)' }}>+</span>
                                      <input
                                        className="form-input"
                                        type="number"
                                        placeholder="0"
                                        style={{ width: '100%', height: 32, paddingLeft: 18, fontSize: 12 }}
                                        value={opt.priceAdd === 0 ? '' : opt.priceAdd}
                                        onChange={e => {
                                          const val = parseFloat(e.target.value) || 0;
                                          const updatedOpts = group.options.map((o, idx) => idx === oIdx ? { ...o, priceAdd: val } : o);
                                          const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                          setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                        }}
                                      />
                                    </div>

                                    {basePriceNum > 0 && (
                                      <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '2px 8px',
                                        background: 'var(--color-bg)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--color-separator)',
                                        fontSize: 11.5,
                                        fontWeight: 600,
                                        color: 'var(--color-accent)',
                                        height: 32,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {formatCurrency(finalPrice, restaurant?.currency ?? 'INR')}
                                      </div>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updatedOpts = group.options.filter((_, idx) => idx !== oIdx);
                                        const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                        setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                      }}
                                      style={{ background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                                      title="Delete option"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                );
                              })}

                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => {
                                  const newOpt = { id: Date.now().toString() + '-opt-' + Math.random(), name: '', priceAdd: 0 };
                                  const updatedOpts = [...group.options, newOpt];
                                  const updatedGroups = itemForm.modifierGroups.map((g, idx) => idx === gIdx ? { ...g, options: updatedOpts } : g);
                                  setItemForm(f => ({ ...f, modifierGroups: updatedGroups }));
                                }}
                                style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', marginTop: 2, border: '1px dashed var(--color-separator)', borderRadius: 'var(--radius-md)' }}
                              >
                                + Add Option / Size
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {(!itemForm.modifierGroups || itemForm.modifierGroups.length === 0) && (
                    <div className="modifier-empty-state">
                      <div style={{ fontSize: 28, marginBottom: 2 }}>🍽️</div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--color-label)' }}>
                        No Modifiers or Sizes Configured
                      </div>
                      <span style={{ maxWidth: 360, lineHeight: 1.45, fontSize: 12, color: 'var(--color-label-secondary)' }}>
                        This item sells as a standard single portion. Pick a quick preset above (Portions, Sizes, Add-ons) or tap Custom Group to offer extras.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 3: Recipe & COGS */}
            {activeTab === 'recipe' && (
              <div className="modal-body" ref={modalBodyRef} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-2)' }}>
                  <div>
                    <h3 style={{ margin: 0, fontWeight: 700, fontSize: '14.5px', color: 'var(--color-label)' }}>
                      Recipe & Stock Deductions
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--color-label-secondary)' }}>
                      Connect menu items to inventory ingredients to calculate margins and auto-deduct stock.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (inventory.length === 0) {
                        toast.error('Add ingredients to inventory first');
                        return;
                      }
                      const newRecipeItem = {
                        ingredientId: inventory[0].id,
                        amount: 1,
                        unit: inventory[0].unit || 'pcs',
                        stockUnit: inventory[0].unit || 'pcs'
                      };
                      setItemForm(f => ({ ...f, recipe: [...(f.recipe ?? []), newRecipeItem] }));
                    }}
                    style={{ padding: '6px 12px', fontSize: 'var(--text-caption1)' }}
                  >
                    + Add Ingredient
                  </button>
                </div>

                {/* Calculations Card Dashboard */}
                {(() => {
                  const itemPrice = parseFloat(itemForm.price) || 0;
                  const recipeCost = (itemForm.recipe ?? []).reduce((sum, ri) => {
                    const ing = inventory.find(i => i.id === ri.ingredientId);
                    if (!ing) return sum;
                    const stockAmt = convertRecipeAmount(ri.amount, ri.unit || ing.unit, ing.unit);
                    return sum + (ing.cost * stockAmt);
                  }, 0);
                  const profitVal = itemPrice - recipeCost;
                  const marginPct = itemPrice > 0 ? (profitVal / itemPrice) * 100 : 0;

                  // Margin safety color styling
                  let marginColor = '#ef4444'; // Red for low margin
                  let marginBg = 'rgba(239,68,68,0.1)';
                  if (marginPct >= 70) {
                    marginColor = '#10b981'; // Green for high margin
                    marginBg = 'rgba(16,185,129,0.1)';
                  } else if (marginPct >= 50) {
                    marginColor = '#6366f1'; // Indigo for moderate margin
                    marginBg = 'rgba(99,102,241,0.1)';
                  } else if (marginPct >= 30) {
                    marginColor = '#f59e0b'; // Orange for warning margin
                    marginBg = 'rgba(245,158,11,0.1)';
                  }

                  return (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--color-separator)',
                      overflow: 'hidden'
                    }}>
                      <div style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'center', borderRight: '1px solid var(--color-separator)' }}>
                        <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--color-label-tertiary)', marginBottom: 4 }}>Cost of Goods</div>
                        <div style={{ fontWeight: '800', fontSize: 16, color: 'var(--color-label)' }}>
                          {formatCurrency(recipeCost, restaurant?.currency)}
                        </div>
                      </div>
                      <div style={{ padding: 'var(--space-3) var(--space-2)', textAlign: 'center', borderRight: '1px solid var(--color-separator)' }}>
                        <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--color-label-tertiary)', marginBottom: 4 }}>Net Profit</div>
                        <div style={{ fontWeight: '800', fontSize: 16, color: profitVal >= 0 ? 'var(--color-label)' : '#ef4444' }}>
                          {formatCurrency(profitVal, restaurant?.currency)}
                        </div>
                      </div>
                      <div style={{
                        padding: 'var(--space-3) var(--space-2)',
                        textAlign: 'center',
                        background: marginBg,
                        transition: 'all 0.2s ease'
                      }}>
                        <div style={{ fontSize: 9.5, textTransform: 'uppercase', fontWeight: 'bold', color: marginColor, marginBottom: 4 }}>Margin</div>
                        <div style={{
                          fontWeight: '800',
                          fontSize: 16,
                          color: marginColor
                        }}>
                          {marginPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Recipe Ingredients Inputs */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {(itemForm.recipe ?? []).map((recipeItem, rIdx) => {
                    const matchedIng = inventory.find(i => i.id === recipeItem.ingredientId);
                    const compatibleUnits = getCompatibleUnits(matchedIng?.unit);
                    const activeRecipeUnit = recipeItem.unit && compatibleUnits.includes(recipeItem.unit)
                      ? recipeItem.unit
                      : (matchedIng?.unit ?? '');

                    return (
                      <div key={rIdx} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
                        <select
                          className="form-select"
                          value={recipeItem.ingredientId}
                          onChange={e => {
                            const nextIng = inventory.find(i => i.id === e.target.value);
                            const nextUnit = nextIng?.unit || 'pcs';
                            const updated = itemForm.recipe.map((ri, idx) => idx === rIdx ? { ...ri, ingredientId: e.target.value, unit: nextUnit, stockUnit: nextUnit } : ri);
                            setItemForm(f => ({ ...f, recipe: updated }));
                          }}
                          style={{ flex: 1.5, height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)' }}
                        >
                          {inventory.map(ing => (
                            <option key={ing.id} value={ing.id}>{ing.name} ({ing.unit})</option>
                          ))}
                        </select>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', flex: 1 }}>
                          <input
                            className="form-input"
                            type="number"
                            min={0.001}
                            step={0.001}
                            placeholder="Amount"
                            value={recipeItem.amount}
                            onChange={e => {
                              const updated = itemForm.recipe.map((ri, idx) => idx === rIdx ? { ...ri, amount: parseFloat(e.target.value) || 0, stockUnit: matchedIng?.unit || ri.stockUnit } : ri);
                              setItemForm(f => ({ ...f, recipe: updated }));
                            }}
                            style={{ width: '100%', height: 32, padding: '4px var(--space-2)', fontSize: 'var(--text-footnote)', textAlign: 'right' }}
                          />
                          {compatibleUnits.length > 1 ? (
                            <select
                              className="form-select"
                              value={activeRecipeUnit}
                              onChange={e => {
                                const updated = itemForm.recipe.map((ri, idx) => idx === rIdx ? { ...ri, unit: e.target.value, stockUnit: matchedIng?.unit || ri.stockUnit } : ri);
                                setItemForm(f => ({ ...f, recipe: updated }));
                              }}
                              style={{ width: 58, height: 32, padding: '2px 4px', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)' }}
                            >
                              {compatibleUnits.map(u => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', minWidth: 28, paddingLeft: 4, fontWeight: 'var(--weight-semibold)' }}>
                              {matchedIng?.unit ?? ''}
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const updated = itemForm.recipe.filter((_, idx) => idx !== rIdx);
                            setItemForm(f => ({ ...f, recipe: updated }));
                          }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    );
                  })}

                  {(!itemForm.recipe || itemForm.recipe.length === 0) && (
                    <div style={{
                      fontSize: 'var(--text-footnote)',
                      color: 'var(--color-label-tertiary)',
                      textAlign: 'center',
                      padding: 'var(--space-5) var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1.5px dashed var(--color-separator)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-2)'
                    }}>
                      <div style={{ fontSize: 24 }}>🥦</div>
                      <span style={{ fontWeight: 'var(--weight-semibold)' }}>No recipe ingredients configured</span>
                      <span>Add ingredients from your inventory to track food costs and auto-deduct stock levels.</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Modal Footer (Sticky) */}
            <div className="modal-footer" style={{ padding: '14px 24px', gap: '12px' }}>
              <button
                className="btn btn-secondary"
                id="cancel-item-btn"
                onClick={() => setShowItemForm(false)}
                style={{ height: 44, padding: '0 22px', fontSize: '13.5px', fontWeight: 600, borderRadius: '10px', touchAction: 'manipulation' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                id="save-item-btn"
                onClick={saveItem}
                style={{ height: 44, padding: '0 26px', fontSize: '13.5px', fontWeight: 700, borderRadius: '10px', touchAction: 'manipulation' }}
              >
                {editItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV Import/Export Modal */}
      <MenuCsvModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        restaurant={restaurant}
      />
    </div>
  );
}
