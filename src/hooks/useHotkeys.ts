import { useEffect } from "react";

type HotkeyHandler = (event: KeyboardEvent) => void;
type HotkeyMap = Record<string, HotkeyHandler>;

/**
 * Custom hook for handling keyboard shortcuts
 * @param map - Object mapping key combinations to handler functions
 * @param disable - Whether to disable hotkeys
 * @example
 * useHotkeys({
 *   'ctrl+s': (e) => { e.preventDefault(); save(); },
 *   'escape': () => closeModal(),
 *   'enter': () => submitForm()
 * });
 */
export function useHotkeys(map: HotkeyMap, disable?: boolean): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (disable) return; // used to disable the keybinds when the search modal is up

      const targetTag = (event.target as HTMLElement)?.tagName;
      // Ignore typing shortcuts inside inputs/textareas except Enter and Escape
      if (
        (targetTag === "INPUT" || targetTag === "TEXTAREA") &&
        !["Enter", "Escape"].includes(event.key)
      )
        return;

      // Handle complex key combinations
      let keyCombo = "";
      if (event.altKey) keyCombo += "alt+";
      if (event.ctrlKey) keyCombo += "ctrl+";
      if (event.shiftKey) keyCombo += "shift+";

      const key = event.key.toLowerCase();
      if (key === "arrowleft") keyCombo += "arrowleft";
      else if (key === "arrowright") keyCombo += "arrowright";
      else if (key === "arrowup") keyCombo += "arrowup";
      else if (key === "arrowdown") keyCombo += "arrowdown";
      else keyCombo += key;

      if (map[keyCombo]) {
        map[keyCombo](event);
        return;
      }

      // Only fallback to simple key if NO modifier keys are pressed
      if (
        !event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.metaKey &&
        map[key]
      ) {
        map[key](event);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map, disable]);
}
