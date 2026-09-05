import { atom } from 'jotai';

// Internal to the FloatingPanel module: a shared registry of every panel that
// is currently minimized, so a single global FloatingPanelDock can render one
// restore chip per entry. Not re-exported from the module's public index.ts —
// only useFloatingPanel (producer) and FloatingPanelDock (consumer) read it.
export type MinimizedFloatingPanelEntry = {
  // storageKey doubles as the registry key -- it's already guaranteed unique
  // per panel type (see useFloatingPanel's UseFloatingPanelParams).
  key: string;
  title: string;
  onRestore: () => void;
};

export const minimizedFloatingPanelsAtom = atom<MinimizedFloatingPanelEntry[]>(
  [],
);
