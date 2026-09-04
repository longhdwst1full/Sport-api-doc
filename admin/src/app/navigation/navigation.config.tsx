import {
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  CommentOutlined,
  DashboardOutlined,
  FileTextOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

export interface NavigationItem {
  path: string;
  label: string;
  icon: ReactNode;
  group: 'overview' | 'sales' | 'catalog' | 'operations' | 'experience' | 'organization' | 'system';
  permission?: string;
}

export const NAVIGATION_GROUP_LABELS: Record<NavigationItem['group'], string> = {
  overview: 'Tổng quan',
  sales: 'Bán hàng',
  catalog: 'Sản phẩm & danh mục',
  operations: 'Kho & vận hành',
  experience: 'Nội dung & trải nghiệm',
  organization: 'Tổ chức',
  system: 'Quản trị hệ thống',
};

export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    path: '/',
    label: 'Bảng điều khiển',
    group: 'overview',
    icon: <DashboardOutlined />,
    permission: 'system.module.view',
  },
  {
    path: '/orders',
    label: 'Đơn hàng',
    group: 'sales',
    icon: <ShoppingCartOutlined />,
    permission: 'order.view',
  },
  {
    path: '/customers',
    label: 'Khách hàng',
    group: 'sales',
    icon: <TeamOutlined />,
    permission: 'customer.view',
  },
  {
    path: '/products',
    label: 'Sản phẩm',
    group: 'catalog',
    icon: <AppstoreOutlined />,
    permission: 'catalog.product.view',
  },
  {
    path: '/catalog-masters',
    label: 'Thương hiệu & danh mục',
    group: 'catalog',
    icon: <TagsOutlined />,
    permission: 'catalog.brand.view',
  },
  {
    path: '/inventory',
    label: 'Kho hàng',
    group: 'operations',
    icon: <InboxOutlined />,
    permission: 'inventory.stock.view',
  },
  {
    path: '/reviews',
    label: 'Đánh giá',
    group: 'experience',
    icon: <CommentOutlined />,
    permission: 'review.moderate',
  },
  {
    path: '/content',
    label: 'Nội dung',
    group: 'experience',
    icon: <FileTextOutlined />,
    permission: 'content.post.view',
  },
  {
    path: '/organization',
    label: 'Chi nhánh & kho',
    group: 'organization',
    icon: <BankOutlined />,
    permission: 'org.branch.view',
  },
  {
    path: '/access',
    label: 'Người dùng & quyền',
    group: 'system',
    icon: <SafetyCertificateOutlined />,
    permission: 'iam.user.view',
  },
  {
    path: '/audit',
    label: 'Nhật ký hệ thống',
    group: 'system',
    icon: <AuditOutlined />,
    permission: 'iam.audit.view',
  },
];
