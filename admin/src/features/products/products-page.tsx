import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Input, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { PermissionGate } from '@/core/auth/permissions';
import { useListAdminProducts } from '@/generated/api/admin-products/admin-products';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const query = useListAdminProducts({ page: 1, limit: 20, search: search || undefined });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Text type="secondary">CATALOG</Typography.Text>
          <Typography.Title level={2} style={{ margin: '4px 0 0' }}>
            Sản phẩm
          </Typography.Title>
        </div>
        <PermissionGate permission="catalog.product.manage">
          <Button type="primary" size="large" icon={<PlusOutlined />}>
            Thêm sản phẩm
          </Button>
        </PermissionGate>
      </div>
      <Card>
        <div className="mb-5 flex flex-wrap gap-3">
          <Input.Search
            allowClear
            placeholder="Tên, SKU hoặc thương hiệu"
            className="max-w-md"
            onSearch={setSearch}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void queryClient.invalidateQueries()}>
            Làm mới
          </Button>
        </div>
        <Table
          rowKey="id"
          loading={query.isPending}
          dataSource={query.data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: 'Sản phẩm',
              dataIndex: 'name',
              render: (_, row) => (
                <Space>
                  <Avatar shape="square" size={48} src={row.imageUrl} />
                  <div>
                    <strong>{row.name}</strong>
                    <div className="text-xs text-gray-500">
                      {row.brand} · {row.category}
                    </div>
                  </div>
                </Space>
              ),
            },
            {
              title: 'Giá đã VAT',
              dataIndex: 'price',
              align: 'right',
              render: (value) => <strong>{money.format(value)}</strong>,
            },
            {
              title: 'Tồn',
              dataIndex: 'available',
              align: 'center',
              render: (value) => (value ? <Tag color="green">Còn hàng</Tag> : <Tag>Hết hàng</Tag>),
            },
            { title: 'Đánh giá', dataIndex: 'rating', align: 'center' },
          ]}
        />
      </Card>
    </div>
  );
}
