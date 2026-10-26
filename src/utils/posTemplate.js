import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

export const POS_TEMPLATES = {
  MODERN_GRID: 'modern_grid',
  BISTRO_SIDEBAR: 'bistro_sidebar',
  CATEGORY_FIRST: 'category_first'
};

const STORAGE_KEY = 'dineos_pos_template';

export function getEffectivePosTemplate(restaurant) {
  // 1. Primary Source of Truth: Saved Restaurant Configuration (Admin Settings)
  if (restaurant?.posTemplate && Object.values(POS_TEMPLATES).includes(restaurant.posTemplate)) {
    return restaurant.posTemplate;
  }
  // 2. Secondary: Cached local selection if offline
  if (typeof localStorage !== 'undefined') {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local && Object.values(POS_TEMPLATES).includes(local)) {
      return local;
    }
  }
  // 3. Default fallback
  return POS_TEMPLATES.MODERN_GRID;
}

export function usePosTemplate() {
  const restaurant = useAuthStore(s => s.restaurant);
  const [template, setTemplate] = useState(() => getEffectivePosTemplate(restaurant));

  // Keep state reactively in sync whenever restaurant.posTemplate updates in authStore / Firestore
  useEffect(() => {
    if (restaurant?.posTemplate && Object.values(POS_TEMPLATES).includes(restaurant.posTemplate)) {
      setTemplate(restaurant.posTemplate);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, restaurant.posTemplate);
      }
    }
  }, [restaurant?.posTemplate]);

  // Also listen for immediate runtime events dispatched within the same session
  useEffect(() => {
    const handleTemplateChange = (e) => {
      if (e.detail?.template && Object.values(POS_TEMPLATES).includes(e.detail.template)) {
        setTemplate(e.detail.template);
      }
    };
    window.addEventListener('dineos:pos-template-changed', handleTemplateChange);
    return () => window.removeEventListener('dineos:pos-template-changed', handleTemplateChange);
  }, []);

  const switchTemplate = async (newTemplate, syncToAdmin = true) => {
    if (!Object.values(POS_TEMPLATES).includes(newTemplate)) return;

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newTemplate);
    }
    setTemplate(newTemplate);
    window.dispatchEvent(new CustomEvent('dineos:pos-template-changed', {
      detail: { template: newTemplate }
    }));

    if (syncToAdmin && restaurant?.id) {
      try {
        await updateDoc(doc(db, 'restaurants', restaurant.id), {
          posTemplate: newTemplate
        });
        useAuthStore.setState({ restaurant: { ...restaurant, posTemplate: newTemplate } });
      } catch (e) {
        console.warn('Could not sync posTemplate to restaurant doc:', e);
      }
    }

    const templateNames = {
      [POS_TEMPLATES.MODERN_GRID]: 'Template 1: Modern Grid',
      [POS_TEMPLATES.BISTRO_SIDEBAR]: 'Template 2: Left Category Sidebar',
      [POS_TEMPLATES.CATEGORY_FIRST]: 'Template 3: Hybrid Category Cards'
    };
    const templateName = templateNames[newTemplate] || 'Modern Grid';
    toast.success(`Active POS template: ${templateName}`, { id: 'pos-template-switch', duration: 2500 });
  };

  return {
    template,
    setTemplate: switchTemplate,
    isBistro: template === POS_TEMPLATES.BISTRO_SIDEBAR,
    isModern: template === POS_TEMPLATES.MODERN_GRID,
    isCategoryFirst: template === POS_TEMPLATES.CATEGORY_FIRST
  };
}
