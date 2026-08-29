import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '@/layouts/admin-layout';
import { PermissionRoute } from '@/core/auth/permission-route';

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
        <Route
          index
          element={
            <PermissionRoute permission="system.module.view">
              <DashboardPage />
            </PermissionRoute>
          }
        />
        <Route
          path="products"
          element={
            <PermissionRoute permission="catalog.product.view">
              <ProductsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="inventory"
          element={
            <PermissionRoute permission="inventory.stock.view">
              <InventoryPage />
            </PermissionRoute>
          }
        />
        <Route
          path="content"
          element={
            <PermissionRoute permission="content.post.view">
              <ContentPage />
            </PermissionRoute>
          }
        />
        <Route
          path="reviews"
          element={
            <PermissionRoute permission="review.moderate">
              <ReviewsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="orders"
          element={
            <PermissionRoute permission="order.view">
              <ModulePlaceholderPage moduleKey="order" title="Đơn hàng" />
            </PermissionRoute>
          }
        />
        <Route
          path="customers"
          element={
            <PermissionRoute permission="customer.view">
              <ModulePlaceholderPage moduleKey="customer" title="Khách hàng" />
            </PermissionRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
