import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '@/layouts/admin-layout';

const DashboardPage = lazy(() =>
  import('@/features/dashboard/dashboard-page').then((module) => ({
    default: module.DashboardPage,
  })),
);
const ProductsPage = lazy(() =>
  import('@/features/products/products-page').then((module) => ({ default: module.ProductsPage })),
);
const InventoryPage = lazy(() =>
  import('@/features/inventory/inventory-page').then((module) => ({
    default: module.InventoryPage,
  })),
);
const ContentPage = lazy(() =>
  import('@/features/content/content-page').then((module) => ({ default: module.ContentPage })),
);
const ReviewsPage = lazy(() =>
  import('@/features/reviews/reviews-page').then((module) => ({ default: module.ReviewsPage })),
);
const ModulePlaceholderPage = lazy(() =>
  import('@/features/shared/module-placeholder-page').then((module) => ({
    default: module.ModulePlaceholderPage,
  })),
);

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="content" element={<ContentPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route
          path="orders"
          element={<ModulePlaceholderPage moduleKey="order" title="Đơn hàng" />}
        />
        <Route
          path="customers"
          element={<ModulePlaceholderPage moduleKey="customer" title="Khách hàng" />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
