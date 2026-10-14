import { lazy } from 'react';

/**
 * Resilient lazy loader that catches stale chunk 404 errors when a new app version
 * is deployed, automatically reloading the browser once to fetch the latest bundles.
 */
export function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = typeof window !== 'undefined'
      ? JSON.parse(window.sessionStorage.getItem('dineos_chunk_reload') || 'false')
      : false;

    try {
      const component = await componentImport();
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('dineos_chunk_reload', 'false');
      }
      return component;
    } catch (error) {
      const isChunkError = error?.message?.includes('dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.name === 'ChunkLoadError';

      if (!pageHasAlreadyBeenForceRefreshed && isChunkError && typeof window !== 'undefined') {
        window.sessionStorage.setItem('dineos_chunk_reload', 'true');
        window.location.reload();
        return { default: () => null };
      }
      throw error;
    }
  });
}
