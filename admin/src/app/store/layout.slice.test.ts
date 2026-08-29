import { describe, expect, it } from 'vitest';
import {
  closeNavigationTab,
  hydrateLayout,
  layoutSlice,
  openNavigationTab,
  toggleSidebar,
} from './layout.slice';

describe('layoutSlice', () => {
  it('hydrates and toggles the persisted sidebar preference', () => {
    const hydrated = layoutSlice.reducer(
      undefined,
      hydrateLayout({ sidebarCollapsed: true, openTabs: [], activePath: null }),
    );
    expect(hydrated.sidebarCollapsed).toBe(true);
    expect(layoutSlice.reducer(hydrated, toggleSidebar()).sidebarCollapsed).toBe(false);
  });

  it('opens, activates and closes navigation tabs predictably', () => {
    const withOrders = layoutSlice.reducer(
      undefined,
      openNavigationTab({ path: '/orders', label: 'Đơn hàng' }),
    );
    const withCustomers = layoutSlice.reducer(
      withOrders,
      openNavigationTab({ path: '/customers', label: 'Khách hàng' }),
    );

    expect(withCustomers.activePath).toBe('/customers');
    expect(withCustomers.openTabs).toHaveLength(2);

    const closed = layoutSlice.reducer(withCustomers, closeNavigationTab('/customers'));
    expect(closed.activePath).toBe('/orders');
    expect(closed.openTabs.map((tab) => tab.path)).toEqual(['/orders']);
  });
});
