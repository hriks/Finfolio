import { create } from 'zustand';

interface ScanState {
  scanning: boolean;
  start: () => void;
  stop: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  scanning: false,
  start: () => set({ scanning: true }),
  stop: () => set({ scanning: false }),
}));
