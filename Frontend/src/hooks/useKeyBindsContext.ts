import { useContext } from 'react';
import { KeyBindsContext } from '../contexts/KeyBindsContext';

export function useKeyBindsContext() {
  const context = useContext(KeyBindsContext);
  if (context === undefined) {
    throw new Error('useKeyBindsContext must be used within KeyBindsProvider');
  }
  return context;
}