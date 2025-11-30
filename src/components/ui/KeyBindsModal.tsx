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
          className="fixed inset-0 z-50 keybind-modal-overlay flex items-center justify-center p-4 bg-black/50"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.90, y: -30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.90, y: -30 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="keybind-modal md-card w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl"
          >
            {/* Header */}
            <div className="keybind-modal-header sticky top-4 z-10 px-8 font-bold py-1 flex items-center justify-between gap-4">
              <div className="flex-1">
                <h1>Keyboard Shortcuts</h1>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="keybind-modal-close-btn flex-shrink-0 p-2 rounded-lg hover:bg-opacity-10 hover:bg-current active:bg-opacity-15 active:bg-current transition-colors duration-200"
                title="Close (Esc)"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="keybind-modal-content p-8 space-y-10">
              {sortedCategories.map((category) => {
                const binds = groupedBinds[category];
                const isGeneral = category === 'General';

                return (
                  <div key={category} className={isGeneral ? 'mb-8 pb-8 keybind-category-divider' : ''}>
                    <h3 className="keybind-category-header mb-5">
                      {category}
                    </h3>
                    <div className="grid gap-0 grid-cols-1 sm:grid-cols-2">
                      {binds.map((bind, idx) => (
                        <div
                          key={idx}
                          className="keybind-row group flex items-center gap-4 p-4 rounded-xl transition-all duration-150 cursor-default"
                        >
                          <div className="flex-shrink-0">
                            <kbd className="keybind-key">
                              {bind.key}
                            </kbd>
                          </div>
                          <span className="keybind-description flex-1 min-w-0 group-hover:text-primary/90">
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
