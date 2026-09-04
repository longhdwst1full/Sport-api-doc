import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, Select } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useDebounce } from 'use-debounce';
import * as yup from 'yup';
import {
  getListAdminProductsQueryKey,
  useCreateAdminProduct,
  useSearchActiveAdminBrands,
  useSearchActiveAdminCategories,
  useUpdateAdminProduct,
} from '@/generated/api/catalog/catalog';
import {
  CreateProductDtoProductType,
  type ProductDetailDto,
  type CreateProductDtoProductType as ProductType,
} from '@/generated/api/catalog/models';
import { RichTextEditor } from '@/foundation/inputs/rich-text-editor';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api/error';
import { createProductSlug } from './product-slug';

interface ProductFormValues {
  productType: ProductType;
  productNo: string;
  name: string;
  slug: string;
  brandId?: string;
  categoryIds: string[];
  primaryCategoryId: string;
  shortDescription?: string;
  description?: string;
}

const schema: yup.ObjectSchema<ProductFormValues> = yup.object({
  productType: yup
    .mixed<ProductType>()
    .oneOf(Object.values(CreateProductDtoProductType))
    .required('Chọn loại sản phẩm'),
  productNo: yup.string().trim().matches(/^[A-Z0-9-]+$/, 'Chỉ dùng chữ hoa, số và dấu gạch ngang').required('Nhập mã sản phẩm'),
  name: yup.string().trim().required('Nhập tên sản phẩm'),
  slug: yup.string().trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug không hợp lệ').required('Nhập slug'),
  brandId: yup.string().uuid('Thương hiệu không hợp lệ').optional(),
  categoryIds: yup.array().of(yup.string().uuid('Danh mục không hợp lệ').required()).min(1, 'Chọn ít nhất một danh mục').required(),
  primaryCategoryId: yup
    .string()
    .uuid('Danh mục chính không hợp lệ')
    .required('Chọn danh mục chính')
    .test('selected-category', 'Danh mục chính phải nằm trong danh mục đã chọn', function (value) {
      return Boolean(value && (this.parent.categoryIds ?? []).includes(value));
    }),
  shortDescription: yup.string().trim().optional(),
  description: yup.string().trim().optional(),
});

const defaults: ProductFormValues = {
  productType: CreateProductDtoProductType.STANDARD,
  productNo: '', name: '', slug: '', brandId: undefined, categoryIds: [], primaryCategoryId: '', shortDescription: '', description: '',
};

export function ProductFormDrawer({
  open,
  onClose,
  onCreated,
  product,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (slug: string) => void;
  product?: ProductDetailDto;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [brandSearch, setBrandSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const slugManuallyEditedRef = useRef(false);
  const [debouncedBrand] = useDebounce(brandSearch.trim(), 300);
  const [debouncedCategory] = useDebounce(categorySearch.trim(), 300);
  const form = useForm<ProductFormValues>({ resolver: yupResolver(schema), defaultValues: defaults });
  const watchedName = useWatch({ control: form.control, name: 'name' });
  const watchedProductNo = useWatch({ control: form.control, name: 'productNo' });
  const isEdit = Boolean(product);
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
      onError: (error) => handleError(error, 'Không thể tạo sản phẩm.'),
    },
  });
  const updateProduct = useUpdateAdminProduct({
    mutation: {
      onSuccess: async (updated) => {
        await queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
        void message.success('Đã cập nhật thông tin sản phẩm.');
        onClose();
        onCreated?.(updated.slug);
      },
      onError: (error) => handleError(error, 'Không thể cập nhật sản phẩm.'),
    },
  });

  function handleError(error: unknown, fallback: string) {
    Object.entries(getApiFieldErrors(error)).forEach(([field, fieldMessage]) => {
      if (field in schema.fields) {
        form.setError(field as keyof ProductFormValues, { message: fieldMessage });
      }
    });
    void message.error(getApiErrorMessage(error, fallback));
  }

  useEffect(() => {
    if (!open) return;
    slugManuallyEditedRef.current = false;
    form.reset(product ? {
      productType: product.productType,
      productNo: product.productNo,
      name: product.name,
      slug: product.slug,
      brandId: product.brandId ?? undefined,
      categoryIds: product.categoryIds,
      primaryCategoryId: product.primaryCategoryId ?? product.categoryIds[0] ?? '',
      shortDescription: product.shortDescription ?? '',
      description: product.description ?? '',
    } : defaults);
  }, [form, open, product]);

  useEffect(() => {
    if (!open || product || slugManuallyEditedRef.current) return;
    form.setValue('slug', createProductSlug(watchedName, watchedProductNo), {
      shouldDirty: false,
      shouldValidate: Boolean(form.formState.errors.slug),
    });
  }, [form, open, product, watchedName, watchedProductNo]);

  const submit = form.handleSubmit((values) => {
    const fields = {
      productType: values.productType,
      productNo: values.productNo.trim(),
      name: values.name.trim(),
      slug: values.slug.trim(),
      shortDescription: values.shortDescription?.trim() || undefined,
      description: values.description?.trim() || undefined,
      categoryIds: values.categoryIds,
      primaryCategoryId: values.primaryCategoryId,
    };
    if (product) {
      updateProduct.mutate({
        id: product.id,
        data: {
          ...fields,
          brandId: values.brandId ?? null,
          shortDescription: values.shortDescription?.trim() || null,
          description: values.description?.trim() || null,
          expectedVersion: product.version,
        },
      });
    } else {
      createProduct.mutate({
        data: { ...fields, ...(values.brandId ? { brandId: values.brandId } : {}) },
      });
    }
  });

  const textField = (name: 'productNo' | 'name', label: string) => (
    <Form.Item label={label} required validateStatus={form.formState.errors[name] ? 'error' : undefined} help={form.formState.errors[name]?.message}>
      <Controller name={name} control={form.control} render={({ field }) => <Input {...field} />} />
    </Form.Item>
  );

  return (
    <Drawer
      title={isEdit ? 'Sửa thông tin sản phẩm' : 'Tạo sản phẩm nháp (SPU)'}
      width={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={(
        <Button
          type="primary"
          loading={createProduct.isPending || updateProduct.isPending}
          onClick={() => void submit()}
        >
          {isEdit ? 'Lưu thay đổi' : 'Tạo bản nháp'}
        </Button>
      )}
    >
      <Form layout="vertical" onFinish={() => void submit()}>
        <Form.Item
          label="Loại sản phẩm"
          required
          validateStatus={form.formState.errors.productType ? 'error' : undefined}
          help={form.formState.errors.productType?.message}
          extra="STANDARD là sản phẩm thường; BUNDLE là combo cố định và mỗi SKU combo phải khai báo thành phần trước khi publish."
        >
          <Controller
            name="productType"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                disabled={Boolean(product?.variants.length)}
                options={[
                  { value: CreateProductDtoProductType.STANDARD, label: 'Sản phẩm thường' },
                  { value: CreateProductDtoProductType.BUNDLE, label: 'Combo cố định' },
                ]}
              />
            )}
          />
        </Form.Item>
        <div className="grid gap-4 sm:grid-cols-2">
          {textField('productNo', 'Mã sản phẩm')}
          <Form.Item
            label="Slug"
            required
            validateStatus={form.formState.errors.slug ? 'error' : undefined}
            help={form.formState.errors.slug?.message}
            extra={product ? 'Slug hiện tại có thể ảnh hưởng URL sản phẩm.' : 'Tự tạo từ tên và mã sản phẩm; có thể chỉnh thủ công.'}
          >
            <Controller
              name="slug"
              control={form.control}
              render={({ field }) => (
                <Input
                  {...field}
                  onChange={(event) => {
                    slugManuallyEditedRef.current = true;
                    field.onChange(event);
                  }}
                  addonAfter={!product ? (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => {
                        slugManuallyEditedRef.current = false;
                        form.setValue('slug', createProductSlug(watchedName, watchedProductNo), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    >
                      Tạo lại
                    </Button>
                  ) : undefined}
                />
              )}
            />
          </Form.Item>
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
                  options={[
                    ...(product?.brandId && product.brand
                      ? [{ value: product.brandId, label: product.brand }]
                      : []),
                    ...(brands.data?.items ?? []).map((item) => ({ value: item.id, label: `${item.code} — ${item.label}` })),
                  ].filter((item, index, items) => items.findIndex(({ value }) => value === item.value) === index)}
                />
              )}
            />
          </Form.Item>
          <Form.Item label="Danh mục" required validateStatus={form.formState.errors.categoryIds ? 'error' : undefined} help={form.formState.errors.categoryIds?.message}>
            <Controller
              name="categoryIds"
              control={form.control}
              render={({ field }) => (
                <Select
                  {...field}
                  mode="multiple"
                  showSearch
                  filterOption={false}
                  onSearch={setCategorySearch}
                  loading={categories.isFetching}
                  options={[
                    ...(product?.categories ?? []).map((category) => ({ value: category.id, label: category.name })),
                    ...(categories.data?.items ?? []).map((item) => ({ value: item.id, label: `${item.code} — ${item.label}` })),
                  ].filter((item, index, items) => items.findIndex(({ value }) => value === item.value) === index)}
                />
              )}
            />
          </Form.Item>
        </div>
        <Form.Item
          label="Danh mục chính"
          required
          validateStatus={form.formState.errors.primaryCategoryId ? 'error' : undefined}
          help={form.formState.errors.primaryCategoryId?.message}
        >
          <Controller
            name="primaryCategoryId"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                options={form.watch('categoryIds').map((categoryId) => ({
                  value: categoryId,
                  label: product?.categories.find(({ id }) => id === categoryId)?.name
                    ?? categories.data?.items.find(({ id }) => id === categoryId)?.label
                    ?? categoryId,
                }))}
                placeholder="Chọn trong danh mục đã gán"
              />
            )}
          />
        </Form.Item>
        <Form.Item label="Mô tả ngắn">
          <Controller name="shortDescription" control={form.control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item
          label="Mô tả chi tiết (CKEditor 4)"
          extra="Có thể định dạng nội dung và chèn ảnh bằng công cụ Image tích hợp sẵn của CKEditor 4."
        >
          <Controller
            name="description"
            control={form.control}
            render={({ field }) => (
              <RichTextEditor
                value={field.value}
                onChange={field.onChange}
                placeholder="Nhập mô tả, thông số và hướng dẫn sử dụng sản phẩm..."
              />
            )}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
