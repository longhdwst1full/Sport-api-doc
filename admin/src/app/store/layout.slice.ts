import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface NavigationTab {
  path: string;
  label: string;
}

export interface LayoutState {
  sidebarCollapsed: boolean;
  openTabs: NavigationTab[];
  activePath: string | null;
}

const initialState: LayoutState = { sidebarCollapsed: false, openTabs: [], activePath: null };

export const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    hydrateLayout: (state, action: PayloadAction<LayoutState>) => {
      state.sidebarCollapsed = action.payload.sidebarCollapsed;
      state.openTabs = action.payload.openTabs;
      state.activePath = action.payload.activePath;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    openNavigationTab: (state, action: PayloadAction<NavigationTab>) => {
      const tab = action.payload;
      const existing = state.openTabs.find((item) => item.path === tab.path);
      if (existing) {
        existing.label = tab.label;
      } else {
        state.openTabs.push(tab);
      }
      state.activePath = tab.path;
    },
    closeNavigationTab: (state, action: PayloadAction<string>) => {
      const closingIndex = state.openTabs.findIndex((item) => item.path === action.payload);
      if (closingIndex < 0) return;

      state.openTabs.splice(closingIndex, 1);
      if (state.activePath !== action.payload) return;

      state.activePath =
        state.openTabs[Math.max(0, closingIndex - 1)]?.path ?? state.openTabs[0]?.path ?? null;
    },
  },
});

export const {
  closeNavigationTab,
  hydrateLayout,
  openNavigationTab,
  setSidebarCollapsed,
  toggleSidebar,
} = layoutSlice.actions;
