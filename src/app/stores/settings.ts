import { create } from 'zustand';
import { readSettings, writeSettings, type AppSettings } from '../services';

interface SettingsState {
  settings: AppSettings;
  refresh: () => void;
  update: (patch: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: readSettingsSafe(),
  refresh: () => set({ settings: readSettingsSafe() }),
  update: (patch) => {
    const next = writeSettingsSafe(patch);
    set({ settings: next });
  },
}));

function readSettingsSafe(): AppSettings {
  try {
    return readSettings();
  } catch {
    return { onboardingComplete: false };
  }
}

function writeSettingsSafe(patch: Partial<AppSettings>): AppSettings {
  try {
    return writeSettings(patch);
  } catch {
    return { ...readSettingsSafe(), ...patch };
  }
}
