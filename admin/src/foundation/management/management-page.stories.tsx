import {
  AppstoreOutlined,
  CheckCircleOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Space, Table, Tag } from 'antd';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ManagementPage } from './management-page';

const rows = [
  { id: '1', sku: 'DCTD-RUN-X1', name: 'Máy chạy bộ DCTD Pro X1', stock: 12, status: 'ACTIVE' },
  { id: '2', sku: 'DCTD-YOGA-01', name: 'Thảm yoga chống trượt', stock: 4, status: 'ACTIVE' },
  { id: '3', sku: 'DCTD-COMBO-01', name: 'Combo Home Gym', stock: 0, status: 'DRAFT' },
];

const meta = {
  title: 'Foundation/Management/ManagementPage',
  component: ManagementPage,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="min-h-screen bg-slate-50 p-8"><Story /></div>],
} satisfies Meta<typeof ManagementPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductManagement: Story = {
  args: {
    eyebrow: 'Catalog',
    title: 'Quản lý sản phẩm',
    description: 'Quản lý SPU, SKU, combo, giá và nội dung hiển thị trên Storefront.',
    dataNotice: 'Dữ liệu minh họa dùng để review component và layout, không gọi API.',
    actions: <Button type="primary">Thêm sản phẩm</Button>,
    metrics: [
      { key: 'all', label: 'Tổng sản phẩm', value: 128, icon: <AppstoreOutlined /> },
      { key: 'active', label: 'Đang bán', value: 103, tone: 'green', icon: <CheckCircleOutlined /> },
      { key: 'stock', label: 'Sắp hết hàng', value: 8, tone: 'orange', icon: <InboxOutlined /> },
      { key: 'draft', label: 'Cần hoàn thiện', value: 17, tone: 'red', icon: <WarningOutlined /> },
    ],
    filters: (
      <Space wrap>
        <Input.Search placeholder="Tìm tên, mã sản phẩm hoặc SKU" className="w-80" />
        <Select placeholder="Trạng thái" className="w-40" options={[{ value: 'ACTIVE', label: 'Đang bán' }, { value: 'DRAFT', label: 'Bản nháp' }]} />
      </Space>
    ),
    children: (
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: 'SKU', dataIndex: 'sku' },
          { title: 'Sản phẩm', dataIndex: 'name' },
          { title: 'Tồn có thể bán', dataIndex: 'stock', align: 'right' },
          { title: 'Trạng thái', dataIndex: 'status', render: (value) => <Tag color={value === 'ACTIVE' ? 'green' : 'gold'}>{value === 'ACTIVE' ? 'Đang bán' : 'Bản nháp'}</Tag> },
          { title: 'Thao tác', render: () => <Button type="link">Chi tiết</Button> },
        ]}
      />
    ),
  },
};

export const EmptyState: Story = {
  args: {
    eyebrow: 'Catalog',
    title: 'Quản lý sản phẩm',
    description: 'Trạng thái chưa có dữ liệu.',
    actions: <Button type="primary">Thêm sản phẩm đầu tiên</Button>,
    children: <div className="py-16 text-center text-slate-500">Chưa có sản phẩm.</div>,
  },
};
