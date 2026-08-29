import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type LayoutState = {
  sidebarCollapsed: boolean;
};

const initialState: LayoutState = { sidebarCollapsed: false };

export const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    hydrateLayout: (state, action: PayloadAction<LayoutState>) => {
      state.sidebarCollapsed = action.payload.sidebarCollapsed;
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
  },
});

export const { hydrateLayout, toggleSidebar } = layoutSlice.actions;
