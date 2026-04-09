import { create } from "zustand";

type BuilderUiStoreState = {
  selectedNodeId: string;
  selectedEdgeId: string | null;
  showAdvancedBuilder: boolean;
  showAdvancedPalette: boolean;
  showBuilderSupport: boolean;
  setSelectedNodeId: (value: string) => void;
  setSelectedEdgeId: (value: string | null) => void;
  setShowAdvancedBuilder: (value: boolean) => void;
  setShowAdvancedPalette: (value: boolean) => void;
  setShowBuilderSupport: (value: boolean) => void;
  resetBuilderUi: () => void;
};

const DEFAULT_SELECTED_NODE = "node:trigger";

// STATE: Zustand for local builder/shell state
// SHARED BETWEEN PROTOTYPE AND LIVE
export const useBuilderUiStore = create<BuilderUiStoreState>((set) => ({
  selectedNodeId: DEFAULT_SELECTED_NODE,
  selectedEdgeId: null,
  showAdvancedBuilder: false,
  showAdvancedPalette: false,
  showBuilderSupport: false,
  setSelectedNodeId: (value) => set({ selectedNodeId: value }),
  setSelectedEdgeId: (value) => set({ selectedEdgeId: value }),
  setShowAdvancedBuilder: (value) => set({ showAdvancedBuilder: value }),
  setShowAdvancedPalette: (value) => set({ showAdvancedPalette: value }),
  setShowBuilderSupport: (value) => set({ showBuilderSupport: value }),
  resetBuilderUi: () =>
    set({
      selectedNodeId: DEFAULT_SELECTED_NODE,
      selectedEdgeId: null,
      showAdvancedBuilder: false,
      showAdvancedPalette: false,
      showBuilderSupport: false,
    }),
}));
