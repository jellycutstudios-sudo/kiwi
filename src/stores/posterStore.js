import { create } from 'zustand';
import { 
  collection, doc, onSnapshot, addDoc, updateDoc, 
  deleteDoc, writeBatch, serverTimestamp, getDocs
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';

export const usePosterStore = create((set, get) => {
  let slideshowsUnsub = null;
  let postersUnsub = null;
  let currentRestaurantId = null;
  let currentSlideshowId = null;

  return {
    slideshows: [],
    posters: [],
    loadingSlideshows: false,
    loadingPosters: false,
    uploadProgress: {}, // filename -> progress percentage

    // Subscribe to all slideshow screens of a restaurant
    subscribeSlideshows: (restaurantId) => {
      if (!restaurantId) return () => {};
      if (currentRestaurantId === restaurantId && slideshowsUnsub) return;

      if (slideshowsUnsub) {
        slideshowsUnsub();
      }

      set({ loadingSlideshows: true });
      currentRestaurantId = restaurantId;

      const q = collection(db, 'restaurants', restaurantId, 'slideshows');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // Ensure we always have at least a default slideshow if none exists
          if (list.length === 0) {
            // Create default slideshow automatically
            get().addSlideshow(restaurantId, 'Main Board', { transition: 'kenburns', defaultDuration: 6 });
          }
          set({ slideshows: list, loadingSlideshows: false });
        },
        (err) => {
          console.error('[posterStore] Slideshows sub error:', err);
          set({ loadingSlideshows: false });
        }
      );

      slideshowsUnsub = unsub;
      return () => {
        if (slideshowsUnsub) {
          slideshowsUnsub();
          slideshowsUnsub = null;
        }
        set({ slideshows: [] });
      };
    },

    // Subscribe to posters of a specific slideshow screen
    subscribePosters: (restaurantId, slideshowId) => {
      if (!restaurantId || !slideshowId) return () => {};
      if (currentRestaurantId === restaurantId && currentSlideshowId === slideshowId && postersUnsub) return;

      if (postersUnsub) {
        postersUnsub();
      }

      set({ loadingPosters: true });
      currentRestaurantId = restaurantId;
      currentSlideshowId = slideshowId;

      const q = collection(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters');
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          // Sort client-side by 'order' ascending
          list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          set({ posters: list, loadingPosters: false });
        },
        (err) => {
          console.error('[posterStore] Posters sub error:', err);
          set({ loadingPosters: false });
        }
      );

      postersUnsub = unsub;
      return () => {
        if (postersUnsub) {
          postersUnsub();
          postersUnsub = null;
        }
        set({ posters: [] });
      };
    },

    // Add a new slideshow channel
    addSlideshow: async (restaurantId, name, config = {}) => {
      if (!restaurantId || !name) return null;
      try {
        const docRef = await addDoc(collection(db, 'restaurants', restaurantId, 'slideshows'), {
          name,
          transition: config.transition || 'kenburns', // kenburns, fade, slide, zoom
          defaultDuration: config.defaultDuration || 6,
          createdAt: serverTimestamp()
        });
        return docRef.id;
      } catch (e) {
        console.error('[posterStore] Add slideshow failed:', e);
        throw e;
      }
    },

    // Update slideshow configuration
    updateSlideshow: async (restaurantId, slideshowId, updates) => {
      if (!restaurantId || !slideshowId) return;
      try {
        const docRef = doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId);
        await updateDoc(docRef, updates);
      } catch (e) {
        console.error('[posterStore] Update slideshow failed:', e);
        throw e;
      }
    },

    // Delete a slideshow and all its poster documents
    deleteSlideshow: async (restaurantId, slideshowId) => {
      if (!restaurantId || !slideshowId) return;
      try {
        const postersRef = collection(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters');
        const snap = await getDocs(postersRef);
        
        // Delete all storage images and Firestore documents
        const deletePromises = snap.docs.map(d => {
          const data = d.data();
          if (data.imageUrl) {
            return get().deletePoster(restaurantId, slideshowId, d.id, data.imageUrl);
          }
          return deleteDoc(doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters', d.id));
        });
        await Promise.all(deletePromises);

        // Delete slideshow document
        await deleteDoc(doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId));
      } catch (e) {
        console.error('[posterStore] Delete slideshow failed:', e);
        throw e;
      }
    },

    // Upload a poster image and save the record in Firestore
    // Uses the same canvas+base64+uploadString approach as the Menu Editor (proven to work)
    uploadPoster: async (restaurantId, slideshowId, file, title, duration) => {
      if (!restaurantId || !slideshowId || !file) throw new Error('Missing arguments');

      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `menuImages/${restaurantId}/${fileName}`);

      // Compress image to base64 using canvas (same as MenuEditor, preserving high quality for TV)
      const base64Data = await new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          const canvas = document.createElement('canvas');
          // Keep full 1920x1080 max for TV posters, higher quality than menu thumbnails
          let { width, height } = img;
          const MAX_DIM = 1920;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.9)); // 0.9 quality for TV displays
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = (err) => {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        };
      });

      // Upload base64 to Firebase Storage
      await uploadString(storageRef, base64Data, 'data_url');
      const downloadUrl = await getDownloadURL(storageRef);

      // Calculate next order value
      const currentPosters = get().posters;
      const maxOrder = currentPosters.reduce((max, p) => (p.order > max ? p.order : max), -1);
      const nextOrder = maxOrder + 1;

      // Save Firestore doc
      await addDoc(collection(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters'), {
        title: title || file.name,
        imageUrl: downloadUrl,
        storagePath: `menuImages/${restaurantId}/${fileName}`,
        order: nextOrder,
        isActive: true,
        duration: duration || 6,
        createdAt: serverTimestamp()
      });
    },

    // Add a poster directly via an external image URL
    addPosterLink: async (restaurantId, slideshowId, title, imageUrl, duration) => {
      if (!restaurantId || !slideshowId || !imageUrl) throw new Error('Missing arguments');
      try {
        const currentPosters = get().posters;
        const maxOrder = currentPosters.reduce((max, p) => (p.order > max ? p.order : max), -1);
        const nextOrder = maxOrder + 1;

        await addDoc(collection(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters'), {
          title: title || 'Pasted Slide',
          imageUrl,
          storagePath: null, // No Storage file for link-based slides
          order: nextOrder,
          isActive: true,
          duration: duration || 6,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.error('[posterStore] Direct add poster link failed:', e);
        throw e;
      }
    },

    // Update poster configurations (active status, duration, name)
    updatePoster: async (restaurantId, slideshowId, posterId, updates) => {
      if (!restaurantId || !slideshowId || !posterId) return;
      try {
        const docRef = doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters', posterId);
        await updateDoc(docRef, updates);
      } catch (e) {
        console.error('[posterStore] Update poster failed:', e);
        throw e;
      }
    },

    // Delete a poster doc and delete its image from Firebase Storage
    deletePoster: async (restaurantId, slideshowId, posterId, imageUrl) => {
      if (!restaurantId || !slideshowId || !posterId) return;
      try {
        // Delete Firestore document first
        await deleteDoc(doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters', posterId));

        // Attempt to delete from Firebase Storage if URL is valid and is a Firebase Storage image
        if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
          try {
            const fileRef = ref(storage, imageUrl);
            await deleteObject(fileRef);
          } catch (storageErr) {
            console.warn('[posterStore] Could not delete file from Storage (it might already be deleted):', storageErr);
          }
        }
      } catch (e) {
        console.error('[posterStore] Delete poster failed:', e);
        throw e;
      }
    },

    // Reorder posters using a Firestore transaction/batch
    reorderPosters: async (restaurantId, slideshowId, orderedPosters) => {
      if (!restaurantId || !slideshowId || !orderedPosters) return;
      try {
        const batch = writeBatch(db);
        orderedPosters.forEach((poster, idx) => {
          const docRef = doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters', poster.id);
          batch.update(docRef, { order: idx });
        });
        await batch.commit();
      } catch (e) {
        console.error('[posterStore] Reorder posters failed:', e);
        throw e;
      }
    }
  };
});
