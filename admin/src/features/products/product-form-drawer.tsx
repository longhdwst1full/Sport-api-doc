import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, Select } from 'antd';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useDebounce } from 'use-debounce';
import * as yup from 'yup';
import {
  getListAdminProductsQueryKey,
  useCreateAdminProduct,
  useSearchActiveAdminBrands,
  useSearchActiveAdminCategories,
} from '@/generated/api/catalog/catalog';
import { getApiErrorMessage } from '@/lib/api/error';

interface ProductFormValues {
  productNo: string;
  name: string;
  slug: string;
  brandId?: string;
  categoryId: string;
  shortDescription?: string;
  description?: string;
}

const schema: yup.ObjectSchema<ProductFormValues> = yup.object({
  productNo: yup.string().trim().matches(/^[A-Z0-9-]+$/, 'Chỉ dùng chữ hoa, số và dấu gạch ngang').required('Nhập mã sản phẩm'),
  name: yup.string().trim().required('Nhập tên sản phẩm'),
  slug: yup.string().trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug không hợp lệ').required('Nhập slug'),
  brandId: yup.string().uuid('Thương hiệu không hợp lệ').optional(),
  categoryId: yup.string().uuid('Danh mục không hợp lệ').required('Chọn danh mục chính'),
  shortDescription: yup.string().trim().optional(),
  description: yup.string().trim().optional(),
});

const defaults: ProductFormValues = {
  productNo: '', name: '', slug: '', brandId: undefined, categoryId: '', shortDescription: '', description: '',
};

export function ProductFormDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (slug: string) => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [brandSearch, setBrandSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [debouncedBrand] = useDebounce(brandSearch.trim(), 300);
  const [debouncedCategory] = useDebounce(categorySearch.trim(), 300);
  const form = useForm<ProductFormValues>({ resolver: yupResolver(schema), defaultValues: defaults });
  const brands = useSearchActiveAdminBrands(
    { search: debouncedBrand || undefined, page: 1, limit: 20 },
    { query: { enabled: open } },
  );
  const categories = useSearchActiveAdminCategories(
    { search: debouncedCategory || undefined, page: 1, limit: 20 },
    { query: { enabled: open } },
  );
  const createProduct = useCreateAdminProduct({
    mutation: {
      onSuccess: async (product) => {
        await queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
        void message.success('Đã tạo SPU ở trạng thái nháp. Tiếp theo thêm SKU và giá trước khi publish.');
        form.reset(defaults);
        onClose();
        onCreated?.(product.slug);
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể tạo sản phẩm.')),
    },
  });

  const submit = form.handleSubmit((values) => {
    createProduct.mutate({
      data: {
        productNo: values.productNo,
        name: values.name,
        slug: values.slug,
        ...(values.brandId ? { brandId: values.brandId } : {}),
        ...(values.shortDescription ? { shortDescription: values.shortDescription } : {}),
        ...(values.description ? { description: values.description } : {}),
        categoryIds: [values.categoryId],
        primaryCategoryId: values.categoryId,
      },
    });
  });

  const textField = (name: 'productNo' | 'name' | 'slug', label: string) => (
    <Form.Item label={label} validateStatus={form.formState.errors[name] ? 'error' : undefined} help={form.formState.errors[name]?.message}>
      <Controller name={name} control={form.control} render={({ field }) => <Input {...field} />} />
    </Form.Item>
  );

  return (
    <Drawer
      title="Tạo sản phẩm nháp (SPU)"
      width={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={<Button type="primary" loading={createProduct.isPending} onClick={() => void submit()}>Tạo bản nháp</Button>}
    >
      <Form layout="vertical" onFinish={() => void submit()}>
        <div className="grid gap-4 sm:grid-cols-2">
          {textField('productNo', 'Mã sản phẩm')}
          {textField('slug', 'Slug')}
        </div>
        {textField('name', 'Tên sản phẩm')}
        <div className="grid gap-4 sm:grid-cols-2">
          <Form.Item label="Thương hiệu" validateStatus={form.formState.errors.brandId ? 'error' : undefined} help={form.formState.errors.brandId?.message}>
            <Controller
              name="brandId"
              control={form.control}
              render={({ field }) => (
                <Select
                  {...field}
                  allowClear
                  showSearch
                  filterOption={false}
                  onSearch={setBrandSearch}
                  loading={brands.isFetching}
                  options={(brands.data?.items ?? []).map((item) => ({ value: item.id, label: `${item.code} — ${item.label}` }))}
                />
              )}
            />
          </Form.Item>
          <Form.Item label="Danh mục chính" validateStatus={form.formState.errors.categoryId ? 'error' : undefined} help={form.formState.errors.categoryId?.message}>
            <Controller
              name="categoryId"
              control={form.control}
              render={({ field }) => (
                <Select
                  {...field}
                  showSearch
                  filterOption={false}
                  onSearch={setCategorySearch}
                  loading={categories.isFetching}
                  options={(categories.data?.items ?? []).map((item) => ({ value: item.id, label: `${item.code} — ${item.label}` }))}
                />
              )}
            />
          </Form.Item>
        </div>
        <Form.Item label="Mô tả ngắn">
          <Controller name="shortDescription" control={form.control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Mô tả chi tiết">
          <Controller name="description" control={form.control} render={({ field }) => <Input.TextArea {...field} rows={6} />} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
