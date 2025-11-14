import { useState, ReactNode, useMemo } from 'react';
import { KeyBindsContext } from '../contexts/KeyBindsContext';
import type { KeyBind } from './ui/KeyBindsModal';

export function KeyBindsProvider({ children }: { children: ReactNode }) {
  const [keybinds, setKeybinds] = useState<KeyBind[]>([
    {
      key: 'K',
      description: 'Show keyboard shortcuts',
      category: 'General',
    },
    {
      key: 'ESC',
      description: 'Close modal or dialog',
      category: 'General',
    },
  ]);

  const value = useMemo(() => ({ keybinds, setKeybinds }), [keybinds]);

  return (
    <KeyBindsContext.Provider value={value}>
      {children}
    </KeyBindsContext.Provider>
  );
}