import { create } from "zustand";

type UiStoreState = {
  quickSwitchOpen: boolean;
  quickSwitchQuery: string;
  setQuickSwitchOpen: (value: boolean) => void;
  setQuickSwitchQuery: (value: string) => void;
};

// STATE: Zustand for local UI state
// SHARED BETWEEN PROTOTYPE AND LIVE
export const useUiStore = create<UiStoreState>((set) => ({
  quickSwitchOpen: false,
  quickSwitchQuery: "",
  setQuickSwitchOpen: (value) => set({ quickSwitchOpen: value }),
  setQuickSwitchQuery: (value) => set({ quickSwitchQuery: value }),
}));
