import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavigationItem } from '@/app/navigation/navigation.config';
import { useAppDispatch, useAppSelector } from '@/app/store/hooks';
import { closeNavigationTab, openNavigationTab } from '@/app/store/layout.slice';

interface NavigationTabsProps {
  navigationItems: NavigationItem[];
}

export function NavigationTabs({ navigationItems }: NavigationTabsProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const openTabs = useAppSelector((state) => state.layout.openTabs);
  const activePath = useAppSelector((state) => state.layout.activePath);

  const allowedPaths = useMemo(
    () => new Set(navigationItems.map((item) => item.path)),
    [navigationItems],
  );
  const visibleTabs = openTabs.filter((tab) => allowedPaths.has(tab.path));

  useEffect(() => {
    const currentItem = navigationItems.find((item) => item.path === location.pathname);
    if (!currentItem || currentItem.path === '/') return;
    if (
      activePath !== currentItem.path ||
      !openTabs.some((tab) => tab.path === currentItem.path && tab.label === currentItem.label)
    ) {
      dispatch(openNavigationTab({ path: currentItem.path, label: currentItem.label }));
    }
  }, [activePath, dispatch, location.pathname, navigationItems, openTabs]);

  if (visibleTabs.length === 0) {
    return <div className="truncate text-sm font-medium text-slate-500">Bảng điều khiển</div>;
  }

  const handleClose = (closingPath: string) => {
    const closingIndex = visibleTabs.findIndex((tab) => tab.path === closingPath);
    const remaining = visibleTabs.filter((tab) => tab.path !== closingPath);
    const nextPath = remaining[Math.max(0, closingIndex - 1)]?.path ?? '/';
    dispatch(closeNavigationTab(closingPath));
    if (location.pathname === closingPath) navigate(nextPath);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center overflow-x-auto" role="tablist">
      {visibleTabs.map((tab) => {
        const active = tab.path === location.pathname;
        return (
          <div
            key={tab.path}
            className={`group flex h-10 shrink-0 items-center border-b-2 px-3 text-sm transition-colors ${
              active
                ? 'border-admin-500 bg-slate-100 font-medium text-admin-500'
                : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="max-w-44 truncate"
              onClick={() => navigate(tab.path)}
            >
              {tab.label}
            </button>
            <button
              type="button"
              aria-label={`Đóng tab ${tab.label}`}
              className={`ml-2 grid size-5 place-items-center rounded text-base leading-none hover:bg-slate-200 ${
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
              }`}
              onClick={() => handleClose(tab.path)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
