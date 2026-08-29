import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "@/layouts/admin-layout";
import { PermissionRoute } from "@/core/auth/permission-route";

const DashboardPage = lazy(() =>
  import("@/features/dashboard/dashboard-page").then((module) => ({
    default: module.DashboardPage,
  })),
);
const ProductsPage = lazy(() =>
  import("@/features/products/products-page").then((module) => ({
    default: module.ProductsPage,
  })),
);
const InventoryPage = lazy(() =>
  import("@/features/inventory/inventory-page").then((module) => ({
    default: module.InventoryPage,
  })),
);
const ContentPage = lazy(() =>
  import("@/features/content/content-page").then((module) => ({
    default: module.ContentPage,
  })),
);
const ReviewsPage = lazy(() =>
  import("@/features/reviews/reviews-page").then((module) => ({
    default: module.ReviewsPage,
  })),
);
const OrdersPage = lazy(() =>
  import("@/features/orders/orders-page").then((module) => ({
    default: module.OrdersPage,
  })),
);
const CustomersPage = lazy(() =>
  import("@/features/customers/customers-page").then((module) => ({
    default: module.CustomersPage,
  })),
);
const OrganizationPage = lazy(() =>
  import("@/features/organization/organization-page").then((module) => ({
    default: module.OrganizationPage,
  })),
);
const AccessPage = lazy(() =>
  import("@/features/access/access-page").then((module) => ({
    default: module.AccessPage,
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
              <OrdersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="customers"
          element={
            <PermissionRoute permission="customer.view">
              <CustomersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="organization"
          element={
            <PermissionRoute permission="organization.view">
              <OrganizationPage />
            </PermissionRoute>
          }
        />
        <Route
          path="access"
          element={
            <PermissionRoute permission="iam.user.view">
              <AccessPage />
            </PermissionRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
