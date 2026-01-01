import { useEffect, useRef } from 'react';
import { useKeyBindsContext } from './useKeyBindsContext';
import type { KeyBind } from '../components/ui/KeyBindsModal';

/**
 * Hook to register keybinds for a component
 * Automatically sets them in the global keybinds context
 * @param keybinds - Array of keybinds to register
 */
export function useRegisterKeybinds(keybinds: readonly KeyBind[]) {
  const { setKeybinds } = useKeyBindsContext();
  const prevKeybindsRef = useRef<readonly KeyBind[]>([]);

  useEffect(() => {
    // Check if keybinds actually changed to prevent infinite loops
    const hasChanged = keybinds.length !== prevKeybindsRef.current.length ||
      keybinds.some((kb, i) => kb.key !== prevKeybindsRef.current[i]?.key);

    if (hasChanged) {
      setKeybinds([...keybinds]);
      prevKeybindsRef.current = keybinds;
    }

    // Cleanup when component unmounts or keybinds change
    return () => {
      // If we're unmounting, we might want to clear them, 
      // but usually the next component will set its own.
    };
  }, [keybinds, setKeybinds]);
}