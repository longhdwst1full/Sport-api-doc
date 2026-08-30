import { EditOutlined, PlusOutlined, PoweroffOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Input, Popconfirm, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { PermissionGate } from '@/core/auth/permissions';
import { QueryErrorAlert } from '@/foundation/feedback/query-error-alert';
import {
  getListAdminBrandsQueryKey,
  getListAdminCategoriesQueryKey,
  useActivateAdminBrand,
  useActivateAdminCategory,
  useDeactivateAdminBrand,
  useDeactivateAdminCategory,
  useListAdminBrands,
  useListAdminCategories,
} from '@/generated/api/catalog/catalog';
import type { BrandDto, CategoryDto } from '@/generated/api/catalog/models';
import { getApiErrorMessage } from '@/lib/api/error';
import { BrandFormDrawer, CategoryFormDrawer } from './master-data-form-drawers';
import { filterCatalogMasters } from './catalog-masters.mapper';

export function CatalogMastersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'brands' | 'categories'>('brands');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search.trim(), 250);
  const [brandDrawerOpen, setBrandDrawerOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<BrandDto>();
  const [selectedCategory, setSelectedCategory] = useState<CategoryDto>();
  const brandsQuery = useListAdminBrands();
  const categoriesQuery = useListAdminCategories();
  const brands = useMemo(
    () =>
      filterCatalogMasters(brandsQuery.data?.items ?? [], debouncedSearch),
    [brandsQuery.data?.items, debouncedSearch],
  );
  const categories = useMemo(
    () =>
      filterCatalogMasters(categoriesQuery.data?.items ?? [], debouncedSearch),
    [categoriesQuery.data?.items, debouncedSearch],
  );
  const refreshBrands = () => queryClient.invalidateQueries({ queryKey: getListAdminBrandsQueryKey() });
  const refreshCategories = () => queryClient.invalidateQueries({ queryKey: getListAdminCategoriesQueryKey() });

  const brandLifecycleOptions = {
    mutation: {
      onSuccess: async () => {
        await refreshBrands();
        void message.success('Đã cập nhật trạng thái thương hiệu.');
      },
      onError: (error: unknown) => void message.error(getApiErrorMessage(error, 'Không thể cập nhật trạng thái.')),
    },
  };
  const activateBrand = useActivateAdminBrand(brandLifecycleOptions);
  const deactivateBrand = useDeactivateAdminBrand(brandLifecycleOptions);
  const categoryLifecycleOptions = {
    mutation: {
      onSuccess: async () => {
        await refreshCategories();
        void message.success('Đã cập nhật trạng thái danh mục.');
      },
      onError: (error: unknown) => void message.error(getApiErrorMessage(error, 'Không thể cập nhật trạng thái.')),
    },
  };
  const activateCategory = useActivateAdminCategory(categoryLifecycleOptions);
  const deactivateCategory = useDeactivateAdminCategory(categoryLifecycleOptions);

  const openCreate = () => {
    if (tab === 'brands') {
      setSelectedBrand(undefined);
      setBrandDrawerOpen(true);
    } else {
      setSelectedCategory(undefined);
      setCategoryDrawerOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Text type="secondary">CATALOG MASTER DATA</Typography.Text>
          <Typography.Title level={2} className="!mb-0 !mt-1">Thương hiệu & danh mục</Typography.Title>
          <Typography.Paragraph type="secondary" className="!mb-0 !mt-2">
            Mã định danh không đổi sau khi tạo. Xóa nghiệp vụ được thay bằng ngừng hoạt động.
          </Typography.Paragraph>
        </div>
        <PermissionGate permission={tab === 'brands' ? 'catalog.brand.manage' : 'catalog.category.manage'}>
          <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
            {tab === 'brands' ? 'Thêm thương hiệu' : 'Thêm danh mục'}
          </Button>
        </PermissionGate>
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Input.Search
            allowClear
            className="max-w-md"
            value={search}
            placeholder="Tìm theo mã, tên hoặc slug"
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void (tab === 'brands' ? brandsQuery.refetch() : categoriesQuery.refetch())}
          >
            Làm mới
          </Button>
        </div>
        <Tabs
          activeKey={tab}
          onChange={(key) => setTab(key as typeof tab)}
          items={[
            {
              key: 'brands',
              label: `Thương hiệu (${brandsQuery.data?.total ?? 0})`,
              children: brandsQuery.isError ? (
                <QueryErrorAlert error={brandsQuery.error} retry={() => void brandsQuery.refetch()} />
              ) : (
                <Table
                  rowKey="id"
                  loading={brandsQuery.isPending}
                  dataSource={brands}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  columns={[
                    { title: 'Mã', dataIndex: 'code', width: 140, render: (value) => <Typography.Text code>{value}</Typography.Text> },
                    { title: 'Tên', dataIndex: 'name', render: (value) => <strong>{value}</strong> },
                    { title: 'Slug', dataIndex: 'slug' },
                    { title: 'Trạng thái', dataIndex: 'status', width: 150, render: (value) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value}</Tag> },
                    {
                      title: 'Thao tác',
                      key: 'actions',
                      width: 230,
                      align: 'right',
                      render: (_, row: BrandDto) => (
                        <PermissionGate permission="catalog.brand.manage">
                          <Space>
                            <Button icon={<EditOutlined />} onClick={() => { setSelectedBrand(row); setBrandDrawerOpen(true); }}>Sửa</Button>
                            <Popconfirm
                              title={row.status === 'ACTIVE' ? 'Ngừng thương hiệu?' : 'Kích hoạt thương hiệu?'}
                              description="Thao tác dùng version hiện tại và có thể bị từ chối nếu dữ liệu vừa thay đổi."
                              onConfirm={() => row.status === 'ACTIVE'
                                ? deactivateBrand.mutate({ id: row.id, data: { expectedVersion: row.version } })
                                : activateBrand.mutate({ id: row.id, data: { expectedVersion: row.version } })}
                            >
                              <Button danger={row.status === 'ACTIVE'} icon={<PoweroffOutlined />}>
                                {row.status === 'ACTIVE' ? 'Ngừng' : 'Bật'}
                              </Button>
                            </Popconfirm>
                          </Space>
                        </PermissionGate>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'categories',
              label: `Danh mục (${categoriesQuery.data?.total ?? 0})`,
              children: categoriesQuery.isError ? (
                <QueryErrorAlert error={categoriesQuery.error} retry={() => void categoriesQuery.refetch()} />
              ) : (
                <Table
                  rowKey="id"
                  loading={categoriesQuery.isPending}
                  dataSource={categories}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  columns={[
                    { title: 'Mã', dataIndex: 'code', width: 140, render: (value) => <Typography.Text code>{value}</Typography.Text> },
                    { title: 'Tên', dataIndex: 'name', render: (value, row) => <div style={{ paddingLeft: row.depth * 18 }}><strong>{value}</strong><div className="text-xs text-slate-500">/{row.slug}</div></div> },
                    { title: 'Cấp', dataIndex: 'depth', width: 90, align: 'center' },
                    { title: 'Thứ tự', dataIndex: 'sortOrder', width: 100, align: 'center' },
                    { title: 'Trạng thái', dataIndex: 'status', width: 150, render: (value) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value}</Tag> },
                    {
                      title: 'Thao tác',
                      key: 'actions',
                      width: 230,
                      align: 'right',
                      render: (_, row: CategoryDto) => (
                        <PermissionGate permission="catalog.category.manage">
                          <Space>
                            <Button icon={<EditOutlined />} onClick={() => { setSelectedCategory(row); setCategoryDrawerOpen(true); }}>Sửa</Button>
                            <Popconfirm
                              title={row.status === 'ACTIVE' ? 'Ngừng danh mục?' : 'Kích hoạt danh mục?'}
                              description="Cần tắt danh mục con trước khi tắt danh mục cha."
                              onConfirm={() => row.status === 'ACTIVE'
                                ? deactivateCategory.mutate({ id: row.id, data: { expectedVersion: row.version } })
                                : activateCategory.mutate({ id: row.id, data: { expectedVersion: row.version } })}
                            >
                              <Button danger={row.status === 'ACTIVE'} icon={<PoweroffOutlined />}>
                                {row.status === 'ACTIVE' ? 'Ngừng' : 'Bật'}
                              </Button>
                            </Popconfirm>
                          </Space>
                        </PermissionGate>
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>
      <BrandFormDrawer open={brandDrawerOpen} brand={selectedBrand} onClose={() => setBrandDrawerOpen(false)} />
      <CategoryFormDrawer open={categoryDrawerOpen} category={selectedCategory} categories={categoriesQuery.data?.items ?? []} onClose={() => setCategoryDrawerOpen(false)} />
    </div>
  );
}
