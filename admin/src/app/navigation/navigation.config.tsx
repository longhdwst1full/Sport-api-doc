import {
  AppstoreOutlined,
  CommentOutlined,
  DashboardOutlined,
  FileTextOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface NavigationItem {
  path: string;
  label: string;
  icon: ReactNode;
  permission?: string;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { path: '/', label: 'Tổng quan', icon: <DashboardOutlined />, permission: 'system.module.view' },
  {
    path: '/products',
    label: 'Sản phẩm',
    icon: <AppstoreOutlined />,
    permission: 'catalog.product.view',
  },
  {
    path: '/inventory',
    label: 'Kho hàng',
    icon: <InboxOutlined />,
    permission: 'inventory.stock.view',
  },
  { path: '/orders', label: 'Đơn hàng', icon: <ShoppingCartOutlined />, permission: 'order.view' },
  {
    path: '/customers',
    label: 'Khách hàng',
    icon: <TeamOutlined />,
    permission: 'customer.view',
  },
  { path: '/reviews', label: 'Đánh giá', icon: <CommentOutlined />, permission: 'review.moderate' },
  {
    path: '/content',
    label: 'Nội dung',
    icon: <FileTextOutlined />,
    permission: 'content.post.view',
  },
];
