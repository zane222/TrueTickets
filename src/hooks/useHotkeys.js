import { useEffect } from 'react';

/**
 * Custom hook for handling keyboard shortcuts
 * @param {Object} map - Object mapping key combinations to handler functions
 * @example
 * useHotkeys({
 *   'ctrl+s': (e) => { e.preventDefault(); save(); },
 *   'escape': () => closeModal(),
 *   'enter': () => submitForm()
 * });
 */
export function useHotkeys(map) {
  useEffect(() => {
    function onKey(event) {
      const targetTag = (event.target || {}).tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
      
      // Handle complex key combinations
      let keyCombo = '';
      if (event.altKey) keyCombo += 'alt+';
      if (event.ctrlKey) keyCombo += 'ctrl+';
      if (event.shiftKey) keyCombo += 'shift+';
      
      const key = event.key.toLowerCase();
      if (key === 'arrowleft') keyCombo += 'arrowleft';
      else if (key === 'arrowright') keyCombo += 'arrowright';
      else if (key === 'arrowup') keyCombo += 'arrowup';
      else if (key === 'arrowdown') keyCombo += 'arrowdown';
      else keyCombo += key;
      
      if (map[keyCombo]) {
        map[keyCombo](event);
        return;
      }
      
      // Only fallback to simple key if NO modifier keys are pressed
      if (!event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey && map[key]) {
        map[key](event);
      }
    }
    
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map]);
}
