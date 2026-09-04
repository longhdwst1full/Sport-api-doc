import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, InputNumber, Select } from 'antd';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import {
  getListAdminBrandsQueryKey,
  getListAdminCategoriesQueryKey,
  useCreateAdminBrand,
  useCreateAdminCategory,
  useUpdateAdminBrand,
  useUpdateAdminCategory,
} from '@/generated/api/catalog/catalog';
import type { BrandDto, CategoryDto } from '@/generated/api/catalog/models';
import { getApiErrorMessage } from '@/lib/api/error';

interface BrandFormValues {
  code: string;
  name: string;
  slug: string;
  description?: string;
}

interface CategoryFormValues extends BrandFormValues {
  parentId?: string;
  sortOrder: number;
}

const codeRule = /^[A-Z0-9-]+$/;
const slugRule = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const brandSchema: yup.ObjectSchema<BrandFormValues> = yup.object({
  code: yup.string().trim().matches(codeRule, 'Chỉ dùng chữ hoa, số và dấu gạch ngang').required('Nhập mã'),
  name: yup.string().trim().max(255).required('Nhập tên'),
  slug: yup.string().trim().matches(slugRule, 'Slug không hợp lệ').required('Nhập slug'),
  description: yup.string().trim().optional(),
});

const categorySchema: yup.ObjectSchema<CategoryFormValues> = brandSchema.shape({
  parentId: yup.string().uuid('Danh mục cha không hợp lệ').optional(),
  sortOrder: yup.number().integer().min(0).required(),
});

const brandDefaults: BrandFormValues = { code: '', name: '', slug: '', description: '' };
const categoryDefaults: CategoryFormValues = { ...brandDefaults, parentId: undefined, sortOrder: 0 };

function FieldError({ message }: { message?: string }) {
  return message ? <span>{message}</span> : null;
}

export function BrandFormDrawer({
  open,
  brand,
  onClose,
}: {
  open: boolean;
  brand?: BrandDto;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const form = useForm<BrandFormValues>({ resolver: yupResolver(brandSchema), defaultValues: brandDefaults });
  const complete = async (label: string) => {
    await queryClient.invalidateQueries({ queryKey: getListAdminBrandsQueryKey() });
    void message.success(label);
    onClose();
  };
  const create = useCreateAdminBrand({
    mutation: {
      onSuccess: () => complete('Đã tạo thương hiệu.'),
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể tạo thương hiệu.')),
    },
  });
  const update = useUpdateAdminBrand({
    mutation: {
      onSuccess: () => complete('Đã cập nhật thương hiệu.'),
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể cập nhật thương hiệu.')),
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      brand
        ? { code: brand.code, name: brand.name, slug: brand.slug, description: brand.description ?? '' }
        : brandDefaults,
    );
  }, [brand, form, open]);

  const submit = form.handleSubmit((values) => {
    if (brand) {
      update.mutate({
        id: brand.id,
        data: {
          name: values.name,
          slug: values.slug,
          ...(values.description ? { description: values.description } : {}),
          expectedVersion: brand.version,
        },
      });
      return;
    }
    create.mutate({ data: values });
  });
  const pending = create.isPending || update.isPending;

  return (
    <Drawer
      title={brand ? 'Cập nhật thương hiệu' : 'Thêm thương hiệu'}
      width={520}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={<Button type="primary" loading={pending} onClick={() => void submit()}>Lưu</Button>}
    >
      <Form layout="vertical" onFinish={() => void submit()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Form.Item label="Mã" required validateStatus={form.formState.errors.code ? 'error' : undefined} help={<FieldError message={form.formState.errors.code?.message} />}>
            <Controller name="code" control={form.control} render={({ field }) => <Input {...field} disabled={Boolean(brand)} />} />
          </Form.Item>
          <Form.Item label="Slug" required validateStatus={form.formState.errors.slug ? 'error' : undefined} help={<FieldError message={form.formState.errors.slug?.message} />}>
            <Controller name="slug" control={form.control} render={({ field }) => <Input {...field} />} />
          </Form.Item>
        </div>
        <Form.Item label="Tên thương hiệu" required validateStatus={form.formState.errors.name ? 'error' : undefined} help={<FieldError message={form.formState.errors.name?.message} />}>
          <Controller name="name" control={form.control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Mô tả">
          <Controller name="description" control={form.control} render={({ field }) => <Input.TextArea {...field} rows={4} />} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export function CategoryFormDrawer({
  open,
  category,
  categories,
  onClose,
}: {
  open: boolean;
  category?: CategoryDto;
  categories: CategoryDto[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const form = useForm<CategoryFormValues>({ resolver: yupResolver(categorySchema), defaultValues: categoryDefaults });
  const complete = async (label: string) => {
    await queryClient.invalidateQueries({ queryKey: getListAdminCategoriesQueryKey() });
    void message.success(label);
    onClose();
  };
  const create = useCreateAdminCategory({
    mutation: {
      onSuccess: () => complete('Đã tạo danh mục.'),
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể tạo danh mục.')),
    },
  });
  const update = useUpdateAdminCategory({
    mutation: {
      onSuccess: () => complete('Đã cập nhật danh mục.'),
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể cập nhật danh mục.')),
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      category
        ? {
            code: category.code,
            name: category.name,
            slug: category.slug,
            description: category.description ?? '',
            parentId: category.parentId,
            sortOrder: category.sortOrder,
          }
        : categoryDefaults,
    );
  }, [category, form, open]);

  const submit = form.handleSubmit((values) => {
    if (category) {
      update.mutate({
        id: category.id,
        data: {
          name: values.name,
          slug: values.slug,
          ...(values.description ? { description: values.description } : {}),
          sortOrder: values.sortOrder,
          expectedVersion: category.version,
        },
      });
      return;
    }
    create.mutate({
      data: {
        code: values.code,
        name: values.name,
        slug: values.slug,
        ...(values.description ? { description: values.description } : {}),
        ...(values.parentId ? { parentId: values.parentId } : {}),
        sortOrder: values.sortOrder,
      },
    });
  });
  const pending = create.isPending || update.isPending;

  return (
    <Drawer
      title={category ? 'Cập nhật danh mục' : 'Thêm danh mục'}
      width={560}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={<Button type="primary" loading={pending} onClick={() => void submit()}>Lưu</Button>}
    >
      <Form layout="vertical" onFinish={() => void submit()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Form.Item label="Mã" required validateStatus={form.formState.errors.code ? 'error' : undefined} help={<FieldError message={form.formState.errors.code?.message} />}>
            <Controller name="code" control={form.control} render={({ field }) => <Input {...field} disabled={Boolean(category)} />} />
          </Form.Item>
          <Form.Item label="Slug" required validateStatus={form.formState.errors.slug ? 'error' : undefined} help={<FieldError message={form.formState.errors.slug?.message} />}>
            <Controller name="slug" control={form.control} render={({ field }) => <Input {...field} />} />
          </Form.Item>
        </div>
        <Form.Item label="Tên danh mục" required validateStatus={form.formState.errors.name ? 'error' : undefined} help={<FieldError message={form.formState.errors.name?.message} />}>
          <Controller name="name" control={form.control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        {!category && (
          <Form.Item label="Danh mục cha" help="Quan hệ cha không đổi sau khi tạo để bảo toàn path.">
            <Controller
              name="parentId"
              control={form.control}
              render={({ field }) => (
                <Select
                  {...field}
                  allowClear
                  options={categories.filter((item) => item.status === 'ACTIVE').map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` }))}
                />
              )}
            />
          </Form.Item>
        )}
        <Form.Item label="Thứ tự" required>
          <Controller name="sortOrder" control={form.control} render={({ field }) => <InputNumber {...field} min={0} className="w-full" />} />
        </Form.Item>
        <Form.Item label="Mô tả">
          <Controller name="description" control={form.control} render={({ field }) => <Input.TextArea {...field} rows={4} />} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
