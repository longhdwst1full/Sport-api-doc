import { describe, expect, it } from 'vitest';
import { hydrateLayout, layoutSlice, toggleSidebar } from './layout.slice';

describe('layoutSlice', () => {
  it('hydrates and toggles the persisted sidebar preference', () => {
    const hydrated = layoutSlice.reducer(undefined, hydrateLayout({ sidebarCollapsed: true }));
    expect(hydrated.sidebarCollapsed).toBe(true);
    expect(layoutSlice.reducer(hydrated, toggleSidebar()).sidebarCollapsed).toBe(false);
  });
});
