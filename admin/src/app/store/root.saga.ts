import { select, takeEvery } from 'redux-saga/effects';
import { toggleSidebar } from './layout.slice';
import type { RootState } from './store';

const LAYOUT_STORAGE_KEY = 'dctd-admin-layout-v1';

function* persistLayout() {
  const sidebarCollapsed: boolean = yield select(
    (state: RootState) => state.layout.sidebarCollapsed,
  );
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarCollapsed }));
}

export function readPersistedLayout(): { sidebarCollapsed: boolean } | undefined {
  try {
    const value = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!value) return undefined;
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'sidebarCollapsed' in parsed &&
      typeof parsed.sidebarCollapsed === 'boolean'
    ) {
      return { sidebarCollapsed: parsed.sidebarCollapsed };
    }
  } catch {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  }
  return undefined;
}

export function* rootSaga() {
  yield takeEvery(toggleSidebar.type, persistLayout);
}
