import { createContext } from 'react';
import type { KeyBind } from '../components/ui/KeyBindsModal';

export interface KeyBindsContextType {
  keybinds: KeyBind[];
  setKeybinds: (keybinds: KeyBind[]) => void;
}

export const KeyBindsContext = createContext<KeyBindsContextType | undefined>(undefined);