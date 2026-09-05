import { AppstoreOutlined, CheckCircleOutlined, InboxOutlined } from '@ant-design/icons';
import { Button, Table, Tag } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Providers } from '@/app/providers';
import { ManagementPage } from '@/foundation/management';
import { AdminLayout } from './admin-layout';

const meta = {
  title: 'Layouts/AdminLayout',
  component: AdminLayout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Full Admin shell gồm header, navigation tabs, sidebar theo nhóm nghiệp vụ và vùng Outlet.',
      },
    },
  },
} satisfies Meta<typeof AdminLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

function InventoryReviewPage() {
  return (
    <ManagementPage
      eyebrow="Inventory"
      title="Tồn kho cơ bản"
      description="Story toàn màn để review khoảng cách, sidebar, header, tab và vùng nội dung."
      actions={<Button type="primary">Điều chỉnh tồn</Button>}
      metrics={[
        { key: 'sku', label: 'SKU có tồn', value: 86, icon: <AppstoreOutlined /> },
        { key: 'healthy', label: 'Tồn ổn định', value: 72, tone: 'green', icon: <CheckCircleOutlined /> },
        { key: 'low', label: 'Sắp hết', value: 14, tone: 'orange', icon: <InboxOutlined /> },
      ]}
    >
      <Table
        rowKey="sku"
        pagination={false}
        dataSource={[
          { sku: 'DCTD-RUN-X1', product: 'Máy chạy bộ DCTD Pro X1', warehouse: 'HCM-WH', available: 12, status: 'IN_STOCK' },
          { sku: 'DCTD-YOGA-01', product: 'Thảm yoga chống trượt', warehouse: 'HCM-WH', available: 4, status: 'LOW_STOCK' },
        ]}
        columns={[
          { title: 'SKU', dataIndex: 'sku' },
          { title: 'Sản phẩm', dataIndex: 'product' },
          { title: 'Kho', dataIndex: 'warehouse' },
          { title: 'Có thể bán', dataIndex: 'available', align: 'right' },
          { title: 'Trạng thái', dataIndex: 'status', render: (value) => <Tag color={value === 'IN_STOCK' ? 'green' : 'orange'}>{value === 'IN_STOCK' ? 'Còn hàng' : 'Sắp hết'}</Tag> },
        ]}
      />
    </ManagementPage>
  );
}

export const FullShell: Story = {
  render: () => (
    <Providers>
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/inventory" element={<InventoryReviewPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Providers>
  ),
};
