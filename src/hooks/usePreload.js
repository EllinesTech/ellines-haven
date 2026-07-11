/**
 * Smart preload hook that only preloads resources when they're actually going to be used
 * Helps avoid Chrome's "resource was preloaded but not used" warnings
 */

import { useEffect } from 'react';

/**
 * Preloads a resource only when the component that needs it is about to mount
 * @param {string} url - URL to preload
 * @param {string} as - Resource type ('script', 'image', 'style', etc.)
 * @param {string} type - MIME type (optional)
 * @param {boolean} enabled - Whether to actually preload (default: true)
 */
export function usePreload(url, as, type = null, enabled = true) {
  useEffect(() => {
    if (!enabled || !url) return;

    // Check if already preloaded or loaded
    const existing = document.querySelector(`link[href="${url}"]`) || 
                    document.querySelector(`script[src="${url}"]`);
    if (existing) return;

    // Create preload link
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = as;
    if (type) link.type = type;

    // Add to head
    document.head.appendChild(link);

    // Cleanup function to remove preload if component unmounts quickly
    return () => {
      // Only remove if it's still just a preload (not an actual resource)
      if (link.parentNode && link.rel === 'preload') {
        link.parentNode.removeChild(link);
      }
    };
  }, [url, as, type, enabled]);
}

/**
 * Preloads an image when the component mounts
 * @param {string} src - Image URL
 * @param {boolean} enabled - Whether to preload
 */
export function usePreloadImage(src, enabled = true) {
  usePreload(src, 'image', null, enabled);
}

/**
 * Preloads a script when the component mounts
 * @param {string} src - Script URL
 * @param {boolean} enabled - Whether to preload
 */
export function usePreloadScript(src, enabled = true) {
  usePreload(src, 'script', null, enabled);
}

/**
 * Remove any unused preloads to prevent Chrome warnings
 */
export function cleanupUnusedPreloads() {
  const preloads = document.querySelectorAll('link[rel="preload"]');
  preloads.forEach(link => {
    // Check if the resource has actually been used
    const url = link.href;
    const as = link.getAttribute('as');
    
    let isUsed = false;
    
    if (as === 'image') {
      // Check if any img elements are using this URL
      isUsed = document.querySelector(`img[src="${url}"]`) !== null;
    } else if (as === 'script') {
      // Check if any script elements are using this URL
      isUsed = document.querySelector(`script[src="${url}"]`) !== null;
    } else if (as === 'style') {
      // Check if any link stylesheets are using this URL
      isUsed = document.querySelector(`link[rel="stylesheet"][href="${url}"]`) !== null;
    }
    
    // Remove unused preloads after a delay (Chrome gives ~3 seconds before warning)
    if (!isUsed) {
      setTimeout(() => {
        if (link.parentNode && link.rel === 'preload') {
          // Double-check it's still unused
          let stillUnused = false;
          if (as === 'image') {
            stillUnused = !document.querySelector(`img[src="${url}"]`);
          } else if (as === 'script') {
            stillUnused = !document.querySelector(`script[src="${url}"]`);
          } else if (as === 'style') {
            stillUnused = !document.querySelector(`link[rel="stylesheet"][href="${url}"]`);
          }
          
          if (stillUnused) {
            link.parentNode.removeChild(link);
          }
        }
      }, 2000); // Remove after 2 seconds if still unused
    }
  });
}