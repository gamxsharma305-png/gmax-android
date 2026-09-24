import { create } from "zustand";

export type TabId = "home" | "search" | "history" | "library";
export type Overlay = "none" | "nowplaying" | "settings";

type UiState = {
  tab: TabId;
  overlay: Overlay;
  setTab: (tab: TabId) => void;
  openNowPlaying: () => void;
  openSettings: () => void;
  closeOverlay: () => void;
};

export const useUi = create<UiState>((set) => ({
  tab: "home",
  overlay: "none",
  setTab: (tab) => set({ tab, overlay: "none" }),
  openNowPlaying: () => set({ overlay: "nowplaying" }),
  openSettings: () => set({ overlay: "settings" }),
  closeOverlay: () => set({ overlay: "none" }),
}));
