import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface KeyBind {
  key: string;
  description: string;
  category?: string;
}

interface KeyBindsModalProps {
  keybinds: KeyBind[];
}

export function KeyBindsModal({ keybinds }: KeyBindsModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const isInputFocused = () => {
      const activeElement = document.activeElement;
      return (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      );
    };

    const handleKeyPress = (event: KeyboardEvent) => {
      if ((event.key === 'k' || event.key === 'K') && !isInputFocused()) {
        event.preventDefault();
        setIsOpen(!isOpen);
      }

      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen]);

  // Group keybinds by category and sort
  const categoryOrder = ['General', 'Navigation', 'Ticket', 'Status', 'Search'];

  const groupedBinds = keybinds.reduce(
    (acc, bind) => {
      const category = bind.category || 'General';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(bind);
      return acc;
    },
    {} as Record<string, KeyBind[]>
  );

  const sortedCategories = Object.keys(groupedBinds).sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-lg flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.90, y: -30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.90, y: -30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="md-card w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-surface px-8 py-6 border-b border-outline/20 flex items-center justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-on-surface">Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-surface-dim active:bg-surface-dim/80 transition-colors duration-200 text-outline hover:text-on-surface"
                title="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-8 space-y-10 bg-surface">
              {sortedCategories.map((category) => {
                const binds = groupedBinds[category];
                const isGeneral = category === 'General';
                
                return (
                  <div key={category} className={isGeneral ? 'mb-8 pb-8 border-b border-outline/20' : ''}>
                    <h3 className="text-xs font-bold text-primary uppercase tracking-widest mb-5 opacity-80">
                      {category}
                    </h3>
                    <div className="grid gap-3 grid-cols-2">
                      {binds.map((bind, idx) => (
                        <div
                          key={idx}
                          className="group flex items-center gap-4 p-4 rounded-xl hover:bg-surface-dim/60 active:bg-surface-dim transition-all duration-150 cursor-default"
                        >
                          <div className="flex-shrink-0">
                            <kbd className="px-3.5 py-2 rounded-lg bg-white/5 text-white text-sm font-mono font-bold tracking-tight whitespace-nowrap shadow-sm">
                              {bind.key}
                            </kbd>
                          </div>
                          <span className="text-sm text-on-surface font-medium group-hover:text-primary/90 flex-1 min-w-0 transition-colors duration-150">
                            {bind.description}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}