import { select, takeEvery } from 'redux-saga/effects';
import {
  closeNavigationTab,
  openNavigationTab,
  setSidebarCollapsed,
  toggleSidebar,
  type LayoutState,
  type NavigationTab,
} from './layout.slice';
import type { RootState } from './store';

const LAYOUT_STORAGE_KEY = 'dctd-admin-layout-v2';

function* persistLayout() {
  const layout: LayoutState = yield select((state: RootState) => state.layout);
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function isNavigationTab(value: unknown): value is NavigationTab {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof value.path === 'string' &&
    'label' in value &&
    typeof value.label === 'string'
  );
}

export function readPersistedLayout(): LayoutState | undefined {
  try {
    const value = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!value) return undefined;
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'sidebarCollapsed' in parsed &&
      typeof parsed.sidebarCollapsed === 'boolean' &&
      'openTabs' in parsed &&
      Array.isArray(parsed.openTabs) &&
      parsed.openTabs.every(isNavigationTab) &&
      'activePath' in parsed &&
      (typeof parsed.activePath === 'string' || parsed.activePath === null)
    ) {
      return {
        sidebarCollapsed: parsed.sidebarCollapsed,
        openTabs: parsed.openTabs.slice(0, 12),
        activePath: parsed.activePath,
      };
    }
  } catch {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  }
  return undefined;
}

export function* rootSaga() {
  yield takeEvery(
    [toggleSidebar.type, setSidebarCollapsed.type, openNavigationTab.type, closeNavigationTab.type],
    persistLayout,
  );
}
