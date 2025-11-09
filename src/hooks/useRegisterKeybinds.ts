import { useEffect } from 'react';
import { useKeyBindsContext } from './useKeyBindsContext';
import type { KeyBind } from '../components/ui/KeyBindsModal';

/**
 * Hook to register keybinds for a component
 * Automatically sets them in the global keybinds context
 * @param keybinds - Array of keybinds to register
 */
export function useRegisterKeybinds(keybinds: KeyBind[]) {
  const { setKeybinds } = useKeyBindsContext();

  useEffect(() => {
    setKeybinds(keybinds);
  }, [keybinds, setKeybinds]);
}