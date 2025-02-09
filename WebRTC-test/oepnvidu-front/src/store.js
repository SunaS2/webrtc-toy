import { create } from "zustand";

export const useBattleStore = create((set) => ({
  battleInfo: null,
  setBattleInfo: (info) => set({ battleInfo: info }),
  clearBattleInfo: () => set({ battleInfo: null }),
}));
