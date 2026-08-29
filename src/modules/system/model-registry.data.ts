export type ModelPriority = 'P0' | 'P1';

export interface BusinessModelDefinition {
  table: string;
  priority: ModelPriority;
}

export interface BusinessModuleDefinition {
  key: string;
  name: string;
  status: 'ACTIVE' | 'SCAFFOLDED';
  models: BusinessModelDefinition[];
}

const model = (table: string, priority: ModelPriority): BusinessModelDefinition => ({
  table,
  priority,
});

export const BUSINESS_MODEL_REGISTRY: BusinessModuleDefinition[] = [
  {
    key: 'organization',
    name: 'Tổ chức & chi nhánh',
    status: 'ACTIVE',
    models: [model('branches', 'P0'), model('warehouses', 'P0')],
  },
  {
    key: 'iam',
    name: 'Tài khoản, vai trò & audit',
    status: 'ACTIVE',
    models: [
      model('users', 'P0'),
      model('auth_sessions', 'P0'),
      model('roles', 'P0'),
      model('permissions', 'P0'),
      model('role_permissions', 'P0'),
      model('user_role_assignments', 'P0'),
      model('audit_logs', 'P0'),
    ],
  },
  {
    key: 'approval',
    name: 'Phê duyệt tác vụ nhạy cảm',
    status: 'SCAFFOLDED',
    models: [model('approval_requests', 'P1')],
  },
  {
    key: 'customer',
    name: 'Khách hàng',
    status: 'SCAFFOLDED',
    models: [model('customers', 'P0'), model('customer_addresses', 'P0')],
  },
  {
    key: 'catalog',
    name: 'Sản phẩm & combo',
    status: 'ACTIVE',
    models: [
      model('brands', 'P0'),
      model('categories', 'P0'),
      model('products', 'P0'),
      model('product_categories', 'P0'),
      model('product_variants', 'P0'),
      model('product_media', 'P0'),
      model('attributes', 'P1'),
      model('attribute_values', 'P1'),
      model('product_attribute_values', 'P1'),
      model('variant_attribute_values', 'P1'),
      model('product_bundles', 'P0'),
      model('bundle_items', 'P0'),
    ],
  },
  {
    key: 'review',
    name: 'Đánh giá & bình luận',
    status: 'ACTIVE',
    models: [
      model('product_reviews', 'P1'),
      model('product_review_media', 'P1'),
      model('product_review_comments', 'P1'),
    ],
  },
  {
    key: 'pricing',
    name: 'Giá bán',
    status: 'SCAFFOLDED',
    models: [model('product_prices', 'P0')],
  },
  {
    key: 'promotion',
    name: 'Flash sale',
    status: 'SCAFFOLDED',
    models: [
      model('flash_sale_campaigns', 'P1'),
      model('flash_sale_items', 'P1'),
      model('flash_sale_quota_reservations', 'P1'),
    ],
  },
  {
    key: 'inventory',
    name: 'Kho & tồn',
    status: 'ACTIVE',
    models: [
      model('inventory_balances', 'P0'),
      model('inventory_movements', 'P0'),
      model('inventory_reservations', 'P0'),
      model('stock_adjustments', 'P0'),
      model('stock_adjustment_items', 'P0'),
      model('stocktakes', 'P1'),
      model('stocktake_items', 'P1'),
      model('stock_transfers', 'P1'),
      model('stock_transfer_items', 'P1'),
    ],
  },
  {
    key: 'cart',
    name: 'Giỏ hàng',
    status: 'SCAFFOLDED',
    models: [model('carts', 'P0'), model('cart_items', 'P0')],
  },
  {
    key: 'order',
    name: 'Đơn hàng',
    status: 'SCAFFOLDED',
    models: [
      model('orders', 'P0'),
      model('order_items', 'P0'),
      model('order_addresses', 'P0'),
      model('order_status_history', 'P0'),
      model('order_item_components', 'P0'),
    ],
  },
  {
    key: 'payment',
    name: 'Thanh toán & hoàn tiền',
    status: 'SCAFFOLDED',
    models: [
      model('payments', 'P0'),
      model('payment_transactions', 'P0'),
      model('payment_evidences', 'P0'),
      model('refunds', 'P1'),
    ],
  },
  {
    key: 'fulfillment',
    name: 'Xử lý & giao đơn',
    status: 'SCAFFOLDED',
    models: [model('fulfillments', 'P0'), model('fulfillment_status_history', 'P0')],
  },
  {
    key: 'shipping',
    name: 'Vùng & phí giao hàng',
    status: 'SCAFFOLDED',
    models: [
      model('shipping_zones', 'P0'),
      model('shipping_zone_provinces', 'P0'),
      model('shipping_rates', 'P0'),
    ],
  },
  {
    key: 'return',
    name: 'Trả hàng theo sản phẩm',
    status: 'SCAFFOLDED',
    models: [
      model('return_policies', 'P1'),
      model('return_requests', 'P1'),
      model('return_items', 'P1'),
    ],
  },
  {
    key: 'cms',
    name: 'Trang, bài viết & banner',
    status: 'ACTIVE',
    models: [
      model('pages', 'P1'),
      model('posts', 'P1'),
      model('banners', 'P1'),
      model('content_categories', 'P1'),
      model('content_tags', 'P1'),
      model('post_categories', 'P1'),
      model('post_tags', 'P1'),
      model('post_products', 'P1'),
    ],
  },
  {
    key: 'notification',
    name: 'Thông báo',
    status: 'SCAFFOLDED',
    models: [model('notification_templates', 'P1'), model('notifications', 'P1')],
  },
  {
    key: 'platform',
    name: 'Nền tảng & tích hợp',
    status: 'SCAFFOLDED',
    models: [
      model('idempotency_keys', 'P0'),
      model('outbox_events', 'P0'),
      model('system_settings', 'P1'),
    ],
  },
  {
    key: 'media',
    name: 'Media bên thứ ba',
    status: 'SCAFFOLDED',
    models: [model('media_assets', 'P0'), model('media_usages', 'P1')],
  },
];
