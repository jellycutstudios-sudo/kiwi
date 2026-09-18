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
          orientation: config.orientation || 'landscape', // landscape | portrait
          fitMode: config.fitMode || 'contain', // contain | cover
          transition: config.transition || 'kenburns', // kenburns, fade, slide, zoom, none
          transitionSpeed: config.transitionSpeed ?? 1.2,
          defaultDuration: config.defaultDuration || 6,
          shuffle: config.shuffle ?? false,
          showProgressBar: config.showProgressBar ?? true,
          showClock: config.showClock ?? false,
          showTicker: config.showTicker ?? false,
          tickerText: config.tickerText || '',
          wifiInfo: config.wifiInfo || { show: false, ssid: '', password: '' },
          showBranding: config.showBranding ?? true,
          backgroundColor: config.backgroundColor || '#000000',
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

    // Send a remote command to live TV screens (identify, reload, etc.)
    sendRemoteTvCommand: async (restaurantId, slideshowId, command) => {
      if (!restaurantId || !slideshowId || !command) return;
      try {
        const docRef = doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId);
        await updateDoc(docRef, {
          remoteCommand: {
            ...command,
            timestamp: Date.now()
          }
        });
      } catch (e) {
        console.error('[posterStore] Remote TV command failed:', e);
        throw e;
      }
    },

    // Delete a slideshow and all its poster documents
    deleteSlideshow: async (restaurantId, slideshowId) => {
      if (!restaurantId || !slideshowId) return;
      try {
        const postersRef = collection(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters');
        const snap = await getDocs(postersRef);
        
        // Delete all poster documents
        const deletePromises = snap.docs.map(d => {
          const data = d.data();
          return get().deletePoster(restaurantId, slideshowId, d.id, data.imageUrl, data.groupId, false);
        });
        await Promise.all(deletePromises);

        // Delete slideshow document
        await deleteDoc(doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId));
      } catch (e) {
        console.error('[posterStore] Delete slideshow failed:', e);
        throw e;
      }
    },

    // Compress an image file to high quality 1080p JPEG base64
    compressPosterImage: async (file) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          const canvas = document.createElement('canvas');
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
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = (err) => {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        };
      });
    },

    // Upload a poster image and save record(s) in Firestore for 1 or multiple target screens
    uploadPoster: async (restaurantId, targetSlideshowIds, file, title, duration) => {
      if (!restaurantId || !targetSlideshowIds || !file) throw new Error('Missing arguments');
      const targetIds = Array.isArray(targetSlideshowIds) ? targetSlideshowIds : [targetSlideshowIds];
      if (targetIds.length === 0) throw new Error('No target TV screens selected');

      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `menuImages/${restaurantId}/${fileName}`);

      // Compress once
      const base64Data = await get().compressPosterImage(file);

      // Upload once to Firebase Storage
      await uploadString(storageRef, base64Data, 'data_url');
      const downloadUrl = await getDownloadURL(storageRef);

      const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const posterTitle = title || file.name.split('.')[0].replace(/[-_]/g, ' ');

      // Save document to each target slideshow
      const addPromises = targetIds.map(async (sId) => {
        const postersRef = collection(db, 'restaurants', restaurantId, 'slideshows', sId, 'posters');
        const snap = await getDocs(postersRef);
        const maxOrder = snap.docs.reduce((max, d) => {
          const ord = d.data().order ?? 0;
          return ord > max ? ord : max;
        }, -1);
        const nextOrder = maxOrder + 1;

        return addDoc(postersRef, {
          title: posterTitle,
          imageUrl: downloadUrl,
          storagePath: `menuImages/${restaurantId}/${fileName}`,
          order: nextOrder,
          isActive: true,
          duration: Number(duration) || 6,
          groupId,
          createdAt: serverTimestamp()
        });
      });

      await Promise.all(addPromises);
    },

    // Batch upload multiple poster files across 1 or multiple target screens
    uploadMultiplePosters: async (restaurantId, targetSlideshowIds, files, defaultDuration, onProgress) => {
      if (!restaurantId || !targetSlideshowIds || !files || files.length === 0) return;
      const targetIds = Array.isArray(targetSlideshowIds) ? targetSlideshowIds : [targetSlideshowIds];
      if (targetIds.length === 0) throw new Error('No target TV screens selected');

      const total = files.length;
      for (let i = 0; i < total; i++) {
        const file = files[i];
        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            fileName: file.name,
            percent: Math.round(((i) / total) * 100)
          });
        }

        const fileName = `${Date.now()}_${i}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = ref(storage, `menuImages/${restaurantId}/${fileName}`);

        const base64Data = await get().compressPosterImage(file);
        await uploadString(storageRef, base64Data, 'data_url');
        const downloadUrl = await getDownloadURL(storageRef);

        const groupId = `grp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`;
        const posterTitle = file.name.split('.')[0].replace(/[-_]/g, ' ');

        const addPromises = targetIds.map(async (sId) => {
          const postersRef = collection(db, 'restaurants', restaurantId, 'slideshows', sId, 'posters');
          const snap = await getDocs(postersRef);
          const maxOrder = snap.docs.reduce((max, d) => {
            const ord = d.data().order ?? 0;
            return ord > max ? ord : max;
          }, -1);
          const nextOrder = maxOrder + 1;

          return addDoc(postersRef, {
            title: posterTitle,
            imageUrl: downloadUrl,
            storagePath: `menuImages/${restaurantId}/${fileName}`,
            order: nextOrder,
            isActive: true,
            duration: Number(defaultDuration) || 6,
            groupId,
            createdAt: serverTimestamp()
          });
        });

        await Promise.all(addPromises);
      }

      if (onProgress) {
        onProgress({ current: total, total, fileName: 'Done', percent: 100 });
      }
    },

    // Add a poster directly via an external image URL to 1 or multiple screens
    addPosterLink: async (restaurantId, targetSlideshowIds, title, imageUrl, duration) => {
      if (!restaurantId || !targetSlideshowIds || !imageUrl) throw new Error('Missing arguments');
      const targetIds = Array.isArray(targetSlideshowIds) ? targetSlideshowIds : [targetSlideshowIds];
      if (targetIds.length === 0) throw new Error('No target TV screens selected');

      try {
        const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        const addPromises = targetIds.map(async (sId) => {
          const postersRef = collection(db, 'restaurants', restaurantId, 'slideshows', sId, 'posters');
          const snap = await getDocs(postersRef);
          const maxOrder = snap.docs.reduce((max, d) => {
            const ord = d.data().order ?? 0;
            return ord > max ? ord : max;
          }, -1);
          const nextOrder = maxOrder + 1;

          return addDoc(postersRef, {
            title: title || 'Pasted Slide',
            imageUrl,
            storagePath: null,
            order: nextOrder,
            isActive: true,
            duration: Number(duration) || 6,
            groupId,
            createdAt: serverTimestamp()
          });
        });

        await Promise.all(addPromises);
      } catch (e) {
        console.error('[posterStore] Add poster link failed:', e);
        throw e;
      }
    },

    // Assign / Sync an existing poster to multiple TV screens without re-uploading
    assignPosterToScreens: async (restaurantId, poster, selectedScreenIds) => {
      if (!restaurantId || !poster || !selectedScreenIds) return;
      const allScreens = get().slideshows;
      const targetIds = new Set(selectedScreenIds);
      const groupId = poster.groupId || `grp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      for (const screen of allScreens) {
        const sId = screen.id;
        const postersRef = collection(db, 'restaurants', restaurantId, 'slideshows', sId, 'posters');
        const snap = await getDocs(postersRef);
        const existingDoc = snap.docs.find(d => {
          const data = d.data();
          return (poster.groupId && data.groupId === poster.groupId) || data.imageUrl === poster.imageUrl;
        });

        if (targetIds.has(sId)) {
          // Should be assigned to this screen
          if (!existingDoc) {
            const maxOrder = snap.docs.reduce((max, d) => {
              const ord = d.data().order ?? 0;
              return ord > max ? ord : max;
            }, -1);
            await addDoc(postersRef, {
              title: poster.title || 'Poster Slide',
              imageUrl: poster.imageUrl,
              storagePath: poster.storagePath || null,
              order: maxOrder + 1,
              isActive: poster.isActive ?? true,
              duration: Number(poster.duration) || 6,
              groupId,
              createdAt: serverTimestamp()
            });
          }
        } else {
          // Should not be assigned to this screen
          if (existingDoc) {
            await deleteDoc(doc(db, 'restaurants', restaurantId, 'slideshows', sId, 'posters', existingDoc.id));
          }
        }
      }
    },

    // Clone all posters from one screen to another
    cloneSlideshowPosters: async (restaurantId, sourceSlideshowId, targetSlideshowId) => {
      if (!restaurantId || !sourceSlideshowId || !targetSlideshowId) return;
      try {
        const srcRef = collection(db, 'restaurants', restaurantId, 'slideshows', sourceSlideshowId, 'posters');
        const srcSnap = await getDocs(srcRef);
        const destRef = collection(db, 'restaurants', restaurantId, 'slideshows', targetSlideshowId, 'posters');
        const destSnap = await getDocs(destRef);

        let currentMax = destSnap.docs.reduce((max, d) => {
          const ord = d.data().order ?? 0;
          return ord > max ? ord : max;
        }, -1);

        const addPromises = srcSnap.docs.map(docSnap => {
          const data = docSnap.data();
          currentMax += 1;
          return addDoc(destRef, {
            ...data,
            order: currentMax,
            createdAt: serverTimestamp()
          });
        });

        await Promise.all(addPromises);
      } catch (e) {
        console.error('[posterStore] Clone posters failed:', e);
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

    // Bulk update posters on a specific screen
    bulkUpdatePosters: async (restaurantId, slideshowId, posterIds, updates) => {
      if (!restaurantId || !slideshowId || !posterIds || posterIds.length === 0) return;
      try {
        const batch = writeBatch(db);
        posterIds.forEach(id => {
          const docRef = doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters', id);
          batch.update(docRef, updates);
        });
        await batch.commit();
      } catch (e) {
        console.error('[posterStore] Bulk update failed:', e);
        throw e;
      }
    },

    // Bulk delete posters on a specific screen
    bulkDeletePosters: async (restaurantId, slideshowId, postersList) => {
      if (!restaurantId || !slideshowId || !postersList || postersList.length === 0) return;
      try {
        const promises = postersList.map(p => get().deletePoster(restaurantId, slideshowId, p.id, p.imageUrl, p.groupId, false));
        await Promise.all(promises);
      } catch (e) {
        console.error('[posterStore] Bulk delete failed:', e);
        throw e;
      }
    },

    // Delete a poster doc (either on this screen only or across all screens)
    deletePoster: async (restaurantId, slideshowId, posterId, imageUrl, groupId, deleteAllScreens = false) => {
      if (!restaurantId || !slideshowId || !posterId) return;
      try {
        if (deleteAllScreens && (groupId || imageUrl)) {
          // Delete from all slideshows
          const allScreens = get().slideshows;
          for (const s of allScreens) {
            const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'slideshows', s.id, 'posters'));
            for (const d of snap.docs) {
              const data = d.data();
              if ((groupId && data.groupId === groupId) || data.imageUrl === imageUrl) {
                await deleteDoc(doc(db, 'restaurants', restaurantId, 'slideshows', s.id, 'posters', d.id));
              }
            }
          }
        } else {
          // Delete document from this specific screen only
          await deleteDoc(doc(db, 'restaurants', restaurantId, 'slideshows', slideshowId, 'posters', posterId));
        }

        // Delete from Firebase Storage only if no other screen or poster still uses this image
        if (imageUrl && imageUrl.includes('firebasestorage.googleapis.com')) {
          let stillInUse = false;
          const allScreens = get().slideshows;
          for (const s of allScreens) {
            const snap = await getDocs(collection(db, 'restaurants', restaurantId, 'slideshows', s.id, 'posters'));
            if (snap.docs.some(d => d.data().imageUrl === imageUrl && d.id !== posterId)) {
              stillInUse = true;
              break;
            }
          }

          if (!stillInUse) {
            try {
              const fileRef = ref(storage, imageUrl);
              await deleteObject(fileRef);
            } catch (storageErr) {
              console.warn('[posterStore] Could not delete file from Storage:', storageErr);
            }
          }
        }
      } catch (e) {
        console.error('[posterStore] Delete poster failed:', e);
        throw e;
      }
    },

    // Reorder posters using a Firestore batch
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
