import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Avatar, Button, Card, Input, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useDebounce } from 'use-debounce';
import { PermissionGate } from '@/core/auth/permissions';
import { useListAdminProducts } from '@/generated/api/catalog/catalog';
import { ProductFormDrawer } from './product-form-drawer';
import { ProductWorkflowDrawer } from './product-workflow-drawer';

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [debouncedSearch] = useDebounce(search.trim(), 350);
  const queryClient = useQueryClient();
  const query = useListAdminProducts({
    page: 1,
    limit: 20,
    search: debouncedSearch || undefined,
  });
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
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            Thêm sản phẩm
          </Button>
        </PermissionGate>
      </div>
      <Card>
        <div className="mb-5 flex flex-wrap gap-3">
          <Input.Search
            allowClear
            value={search}
            placeholder="Tên, SKU hoặc thương hiệu"
            className="max-w-md"
            onChange={(event) => setSearch(event.target.value)}
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
                  <Avatar shape="square" size={48} src={row.imageUrl ?? undefined}>
                    {row.name.slice(0, 1)}
                  </Avatar>
                  <div>
                    <strong>{row.name}</strong>
                    <div className="text-xs text-gray-500">
                      {row.productNo} · {row.brand ?? 'Chưa có brand'} · {row.primaryCategory ?? 'Chưa có danh mục'}
                    </div>
                  </div>
                </Space>
              ),
            },
            {
              title: 'Giá đã VAT',
              dataIndex: 'minPrice',
              align: 'right',
              render: (value: string | null | undefined) => (
                <strong>{value ? money.format(Number(value)) : 'Chưa có giá'}</strong>
              ),
            },
            {
              title: 'Loại',
              dataIndex: 'productType',
              align: 'center',
              render: (value: string) => (
                <Tag color={value === 'BUNDLE' ? 'purple' : 'default'}>
                  {value === 'BUNDLE' ? 'Combo' : 'Thường'}
                </Tag>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              align: 'center',
              render: (value: string) => (
                <Tag color={value === 'PUBLISHED' ? 'green' : value === 'DRAFT' ? 'blue' : 'default'}>{value}</Tag>
              ),
            },
            { title: 'Version', dataIndex: 'version', align: 'center' },
            {
              title: 'Thao tác',
              key: 'actions',
              align: 'right',
              render: (_, row) => (
                <Button icon={<EditOutlined />} onClick={() => setSelectedSlug(row.slug)}>
                  Chi tiết
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <ProductFormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={setSelectedSlug}
      />
      <ProductWorkflowDrawer slug={selectedSlug} onClose={() => setSelectedSlug(undefined)} />
    </div>
  );
}
