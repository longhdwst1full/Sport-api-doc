import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Drawer, Empty, Form, Input, Modal, Select, Skeleton, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useDebounce } from 'use-debounce';
import * as yup from 'yup';
import { PermissionGate } from '@/core/auth/permissions';
import {
  getGetAdminProductQueryKey,
  getListAdminProductsQueryKey,
  useArchiveAdminProduct,
  useArchiveAdminProductVariant,
  useCreateAdminProductBundle,
  useCreateAdminProductPrice,
  useCreateAdminProductVariant,
  useGetAdminProduct,
  usePublishAdminProduct,
  useReactivateAdminProduct,
  useReactivateAdminProductVariant,
  useReplaceAdminProductPrice,
  useSearchActiveAdminProductVariants,
} from '@/generated/api/catalog/catalog';
import type { ProductVariantDto } from '@/generated/api/catalog/models';
import { getApiErrorMessage } from '@/lib/api/error';
import { buildPriceCommand, isProductPublishReady } from './product-workflow.policy';

interface VariantFormValues {
  sku: string;
  name: string;
  barcode?: string;
}

interface PriceFormValues {
  variantId: string;
  amount: string;
  startsAt: string;
}

interface BundleFormValues {
  bundleVariantId: string;
  items: Array<{ componentVariantId: string; quantity: number }>;
}

const variantSchema: yup.ObjectSchema<VariantFormValues> = yup.object({
  sku: yup.string().trim().required('Nhập SKU').max(64, 'Tối đa 64 ký tự'),
  name: yup.string().trim().required('Nhập tên phiên bản').max(255, 'Tối đa 255 ký tự'),
  barcode: yup.string().trim().max(64, 'Tối đa 64 ký tự').optional(),
});

const priceSchema: yup.ObjectSchema<PriceFormValues> = yup.object({
  variantId: yup.string().uuid('SKU không hợp lệ').required('Chọn SKU'),
  amount: yup.string().trim().matches(/^(?=.*[1-9])\d+(?:\.\d{1,2})?$/, 'Giá phải lớn hơn 0 và có tối đa 2 số lẻ').required('Nhập giá bán'),
  startsAt: yup.string().required('Chọn thời điểm áp dụng'),
});

const bundleSchema: yup.ObjectSchema<BundleFormValues> = yup.object({
  bundleVariantId: yup.string().uuid('SKU combo không hợp lệ').required('Chọn SKU combo'),
  items: yup
    .array()
    .of(
      yup.object({
        componentVariantId: yup.string().uuid('SKU thành phần không hợp lệ').required('Chọn SKU thành phần'),
        quantity: yup.number().integer('Số lượng phải là số nguyên').min(1, 'Tối thiểu 1').required(),
      }),
    )
    .min(1, 'Combo cần ít nhất một thành phần')
    .required(),
});

const nowForInput = () => {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
};

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

export function ProductWorkflowDrawer({ slug, onClose }: { slug?: string; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [componentSearch, setComponentSearch] = useState('');
  const [debouncedComponentSearch] = useDebounce(componentSearch.trim(), 300);
  const detail = useGetAdminProduct(slug ?? '', { query: { enabled: Boolean(slug) } });
  const variantForm = useForm<VariantFormValues>({
    resolver: yupResolver(variantSchema),
    defaultValues: { sku: '', name: '', barcode: '' },
  });
  const priceForm = useForm<PriceFormValues>({
    resolver: yupResolver(priceSchema),
    defaultValues: { variantId: '', amount: '', startsAt: nowForInput() },
  });
  const bundleForm = useForm<BundleFormValues>({
    resolver: yupResolver(bundleSchema),
    defaultValues: {
      bundleVariantId: '',
      items: [{ componentVariantId: '', quantity: 1 }],
    },
  });
  const bundleItems = useFieldArray({ control: bundleForm.control, name: 'items' });
  const componentOptions = useSearchActiveAdminProductVariants(
    { search: debouncedComponentSearch || undefined, page: 1, limit: 20 },
    { query: { enabled: Boolean(slug) } },
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetAdminProductQueryKey(slug) }),
      queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }),
    ]);
  };

  const createVariant = useCreateAdminProductVariant({
    mutation: {
      onSuccess: async () => {
        await refresh();
        variantForm.reset({ sku: '', name: '', barcode: '' });
        void message.success('Đã thêm SKU.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể thêm SKU.')),
    },
  });

  const createPrice = useCreateAdminProductPrice({
    mutation: {
      onSuccess: async () => {
        await refresh();
        priceForm.reset({ variantId: '', amount: '', startsAt: nowForInput() });
        void message.success('Đã thêm giá bán đã bao gồm VAT.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể thêm giá bán.')),
    },
  });

  const replacePrice = useReplaceAdminProductPrice({
    mutation: {
      onSuccess: async () => {
        await refresh();
        priceForm.reset({ variantId: '', amount: '', startsAt: nowForInput() });
        void message.success('Đã đóng giá cũ và áp dụng giá thay thế trong cùng giao dịch.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể thay giá bán.')),
    },
  });

  const createBundle = useCreateAdminProductBundle({
    mutation: {
      onSuccess: async () => {
        await refresh();
        bundleForm.reset({
          bundleVariantId: '',
          items: [{ componentVariantId: '', quantity: 1 }],
        });
        void message.success('Đã lưu thành phần combo cho SKU.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể tạo combo.')),
    },
  });

  const publish = usePublishAdminProduct({
    mutation: {
      onSuccess: async () => {
        await refresh();
        void message.success('Sản phẩm đã được publish ra storefront.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể publish sản phẩm.')),
    },
  });

  const archiveProduct = useArchiveAdminProduct({
    mutation: {
      onSuccess: async () => {
        await refresh();
        void message.success('Đã archive; sản phẩm không còn hiển thị trên storefront.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể archive sản phẩm.')),
    },
  });

  const reactivateProduct = useReactivateAdminProduct({
    mutation: {
      onSuccess: async () => {
        await refresh();
        void message.success('Đã đưa sản phẩm về DRAFT để kiểm tra trước khi publish lại.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể khôi phục sản phẩm.')),
    },
  });

  const archiveVariant = useArchiveAdminProductVariant({
    mutation: {
      onSuccess: async () => {
        await refresh();
        void message.success('Đã archive SKU.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể archive SKU.')),
    },
  });

  const reactivateVariant = useReactivateAdminProductVariant({
    mutation: {
      onSuccess: async () => {
        await refresh();
        void message.success('Đã kích hoạt lại SKU.');
      },
      onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể kích hoạt lại SKU.')),
    },
  });

  const product = detail.data;
  const canPublish = product ? isProductPublishReady(product) : false;

  const submitVariant = variantForm.handleSubmit((values) => {
    if (!product) return;
    createVariant.mutate({
      id: product.id,
      data: { sku: values.sku, name: values.name, ...(values.barcode ? { barcode: values.barcode } : {}) },
    });
  });

  const submitPrice = priceForm.handleSubmit((values) => {
    if (!product) return;
    const command = buildPriceCommand(product, values);
    if (command.kind === 'replace') replacePrice.mutate(command);
    else createPrice.mutate(command);
  });

  const submitBundle = bundleForm.handleSubmit((values) => {
    if (!product) return;
    createBundle.mutate({ id: product.id, data: values });
  });

  const confirmPublish = () => {
    if (!product) return;
    Modal.confirm({
      title: `Publish “${product.name}”?`,
      content: 'Sản phẩm sẽ hiển thị công khai với giá đã bao gồm VAT. Version hiện tại sẽ được kiểm tra để tránh ghi đè thay đổi của người khác.',
      okText: 'Publish',
      cancelText: 'Hủy',
      onOk: () => publish.mutateAsync({ id: product.id, data: { expectedVersion: product.version } }),
    });
  };

  const confirmProductLifecycle = () => {
    if (!product) return;
    const isArchived = product.status === 'ARCHIVED';
    const isCombo = product.productType === 'BUNDLE';
    Modal.confirm({
      title: isArchived
        ? `Khôi phục “${product.name}” về DRAFT?`
        : `Archive ${isCombo ? 'combo' : 'sản phẩm'} “${product.name}”?`,
      content: isArchived
        ? 'Sản phẩm chưa hiển thị lại ngay. Cần kiểm tra SKU, giá và publish lại.'
        : 'Sản phẩm sẽ ẩn ngay khỏi storefront và chặn giao dịch mới. Đơn hàng lịch sử không bị thay đổi.',
      okText: isArchived ? 'Khôi phục về DRAFT' : 'Archive',
      okButtonProps: { danger: !isArchived },
      cancelText: 'Hủy',
      onOk: () => isArchived
        ? reactivateProduct.mutateAsync({ id: product.id, data: { expectedVersion: product.version } })
        : archiveProduct.mutateAsync({ id: product.id, data: { expectedVersion: product.version } }),
    });
  };

  const confirmVariantLifecycle = (variant: ProductVariantDto) => {
    const isActive = variant.status === 'ACTIVE';
    Modal.confirm({
      title: `${isActive ? 'Archive' : 'Kích hoạt lại'} SKU “${variant.sku}”?`,
      content: isActive
        ? 'SKU sẽ không còn được bán mới. Nếu SKU đang là thành phần của combo published, backend sẽ từ chối để tránh combo mất thành phần.'
        : 'SKU chỉ được kích hoạt lại khi Product chưa bị archive.',
      okText: isActive ? 'Archive SKU' : 'Kích hoạt lại',
      okButtonProps: { danger: isActive },
      cancelText: 'Hủy',
      onOk: () => isActive
        ? archiveVariant.mutateAsync({ variantId: variant.id, data: { expectedVersion: variant.version } })
        : reactivateVariant.mutateAsync({ variantId: variant.id, data: { expectedVersion: variant.version } }),
    });
  };

  return (
    <Drawer title="Hoàn thiện sản phẩm" width={760} open={Boolean(slug)} onClose={onClose} destroyOnHidden>
      {detail.isPending ? <Skeleton active /> : detail.isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được sản phẩm"
          description={getApiErrorMessage(detail.error, 'Vui lòng thử lại.')}
          action={<Button onClick={() => void detail.refetch()}>Thử lại</Button>}
        />
      ) : !product ? <Empty description="Không tìm thấy sản phẩm" /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>{product.name}</Typography.Title>
              <Typography.Text type="secondary">{product.productNo} · {product.productType} · version {product.version}</Typography.Text>
            </div>
            <Space>
              <Tag color={product.status === 'PUBLISHED' ? 'green' : 'blue'}>{product.status}</Tag>
              <PermissionGate permission="catalog.product.publish">
                {product.status === 'DRAFT' && (
                  <Button type="primary" disabled={!canPublish} loading={publish.isPending} onClick={confirmPublish}>Publish</Button>
                )}
                <Button
                  danger={product.status !== 'ARCHIVED'}
                  loading={archiveProduct.isPending || reactivateProduct.isPending}
                  onClick={confirmProductLifecycle}
                >
                  {product.status === 'ARCHIVED' ? 'Khôi phục về DRAFT' : 'Archive'}
                </Button>
              </PermissionGate>
            </Space>
          </div>

          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Thương hiệu">{product.brand ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Danh mục">{product.primaryCategory ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="Loại">{product.productType === 'BUNDLE' ? 'Combo cố định' : 'Sản phẩm thường'}</Descriptions.Item>
            <Descriptions.Item label="Giá thấp nhất">{product.minPrice ? money.format(Number(product.minPrice)) : 'Chưa có'}</Descriptions.Item>
            <Descriptions.Item label="Slug">{product.slug}</Descriptions.Item>
          </Descriptions>

          {!canPublish && product.status === 'DRAFT' && (
            <Alert
              type="info"
              showIcon
              message={product.productType === 'BUNDLE'
                ? 'Mọi SKU ACTIVE của combo phải có giá hiệu lực và danh sách thành phần hợp lệ trước khi publish.'
                : 'Cần ít nhất một SKU ACTIVE có giá hiệu lực trước khi publish.'}
            />
          )}

          <div>
            <Typography.Title level={5}>SKU và giá hiện tại</Typography.Title>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={product.variants}
              locale={{ emptyText: 'Chưa có SKU' }}
              columns={[
                { title: 'SKU', dataIndex: 'sku' },
                { title: 'Tên phiên bản', dataIndex: 'name' },
                { title: 'Barcode', dataIndex: 'barcode', render: (value?: string) => value ?? '—' },
                { title: 'Trạng thái', dataIndex: 'status', render: (value: string) => <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>{value}</Tag> },
                { title: 'Giá đã VAT', dataIndex: 'effectivePrice', align: 'right', render: (value?: string | null) => value ? money.format(Number(value)) : 'Chưa có giá' },
                {
                  title: 'Combo',
                  key: 'bundle',
                  render: (_, variant) => variant.bundle
                    ? `${variant.bundle.components.length} thành phần`
                    : '—',
                },
                {
                  title: 'Thao tác',
                  key: 'actions',
                  align: 'right',
                  render: (_, variant) => (
                    <PermissionGate permission="catalog.product.manage">
                      <Button
                        type="link"
                        danger={variant.status === 'ACTIVE'}
                        loading={archiveVariant.isPending || reactivateVariant.isPending}
                        onClick={() => confirmVariantLifecycle(variant)}
                      >
                        {variant.status === 'ACTIVE' ? 'Archive' : 'Kích hoạt'}
                      </Button>
                    </PermissionGate>
                  ),
                },
              ]}
            />
          </div>

          {product.status === 'DRAFT' && (
            <PermissionGate permission="catalog.product.manage">
              <div className="grid gap-6 lg:grid-cols-2">
                <Form layout="vertical" onFinish={() => void submitVariant()}>
                  <Typography.Title level={5}>Thêm SKU</Typography.Title>
                  <Form.Item label="SKU" validateStatus={variantForm.formState.errors.sku ? 'error' : undefined} help={variantForm.formState.errors.sku?.message}>
                    <Controller name="sku" control={variantForm.control} render={({ field }) => <Input {...field} />} />
                  </Form.Item>
                  <Form.Item label="Tên phiên bản" validateStatus={variantForm.formState.errors.name ? 'error' : undefined} help={variantForm.formState.errors.name?.message}>
                    <Controller name="name" control={variantForm.control} render={({ field }) => <Input {...field} />} />
                  </Form.Item>
                  <Form.Item label="Barcode (không bắt buộc)" validateStatus={variantForm.formState.errors.barcode ? 'error' : undefined} help={variantForm.formState.errors.barcode?.message}>
                    <Controller name="barcode" control={variantForm.control} render={({ field }) => <Input {...field} />} />
                  </Form.Item>
                  <Button htmlType="submit" loading={createVariant.isPending}>Thêm SKU</Button>
                </Form>

                <Form layout="vertical" onFinish={() => void submitPrice()}>
                  <Typography.Title level={5}>Thêm giá hiệu lực</Typography.Title>
                  <Form.Item label="SKU" validateStatus={priceForm.formState.errors.variantId ? 'error' : undefined} help={priceForm.formState.errors.variantId?.message}>
                    <Controller name="variantId" control={priceForm.control} render={({ field }) => <Select {...field} options={product.variants.map((variant) => ({ value: variant.id, label: `${variant.sku} — ${variant.name}` }))} />} />
                  </Form.Item>
                  <Form.Item label="Giá bán đã VAT (VND)" validateStatus={priceForm.formState.errors.amount ? 'error' : undefined} help={priceForm.formState.errors.amount?.message}>
                    <Controller name="amount" control={priceForm.control} render={({ field }) => <Input {...field} inputMode="decimal" />} />
                  </Form.Item>
                  <Form.Item label="Áp dụng từ" validateStatus={priceForm.formState.errors.startsAt ? 'error' : undefined} help={priceForm.formState.errors.startsAt?.message}>
                    <Controller name="startsAt" control={priceForm.control} render={({ field }) => <Input {...field} type="datetime-local" />} />
                  </Form.Item>
                  <Button
                    htmlType="submit"
                    loading={createPrice.isPending || replacePrice.isPending}
                    disabled={product.variants.length === 0}
                  >
                    {product.variants.find(({ id }) => id === priceForm.watch('variantId'))?.effectivePrice
                      ? 'Thay giá'
                      : 'Thêm giá'}
                  </Button>
                </Form>
              </div>
            </PermissionGate>
          )}

          {product.status === 'DRAFT' && product.productType === 'BUNDLE' && (
            <PermissionGate permission="catalog.product.manage">
              <Form layout="vertical" onFinish={() => void submitBundle()}>
                <Typography.Title level={5}>Khai báo thành phần combo theo SKU</Typography.Title>
                <Form.Item
                  label="SKU combo"
                  validateStatus={bundleForm.formState.errors.bundleVariantId ? 'error' : undefined}
                  help={bundleForm.formState.errors.bundleVariantId?.message}
                >
                  <Controller
                    name="bundleVariantId"
                    control={bundleForm.control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        options={product.variants
                          .filter((variant) => variant.status === 'ACTIVE' && !variant.bundle)
                          .map((variant) => ({ value: variant.id, label: `${variant.sku} — ${variant.name}` }))}
                      />
                    )}
                  />
                </Form.Item>
                <div className="space-y-3">
                  {bundleItems.fields.map((item, index) => (
                    <div key={item.id} className="grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[1fr_140px_auto]">
                      <Form.Item
                        label={`Thành phần ${index + 1}`}
                        validateStatus={bundleForm.formState.errors.items?.[index]?.componentVariantId ? 'error' : undefined}
                        help={bundleForm.formState.errors.items?.[index]?.componentVariantId?.message}
                        style={{ marginBottom: 0 }}
                      >
                        <Controller
                          name={`items.${index}.componentVariantId`}
                          control={bundleForm.control}
                          render={({ field }) => (
                            <Select
                              {...field}
                              showSearch
                              filterOption={false}
                              onSearch={setComponentSearch}
                              loading={componentOptions.isFetching}
                              options={(componentOptions.data?.items ?? []).map((option) => ({
                                value: option.id,
                                label: `${option.code} — ${option.label}`,
                              }))}
                            />
                          )}
                        />
                      </Form.Item>
                      <Form.Item
                        label="Số lượng"
                        validateStatus={bundleForm.formState.errors.items?.[index]?.quantity ? 'error' : undefined}
                        help={bundleForm.formState.errors.items?.[index]?.quantity?.message}
                        style={{ marginBottom: 0 }}
                      >
                        <Controller
                          name={`items.${index}.quantity`}
                          control={bundleForm.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              type="number"
                              min={1}
                              onChange={(event) => field.onChange(Number(event.target.value))}
                            />
                          )}
                        />
                      </Form.Item>
                      <Button
                        htmlType="button"
                        danger
                        disabled={bundleItems.fields.length === 1}
                        onClick={() => bundleItems.remove(index)}
                      >
                        Xóa
                      </Button>
                    </div>
                  ))}
                </div>
                <Space className="mt-3">
                  <Button htmlType="button" onClick={() => bundleItems.append({ componentVariantId: '', quantity: 1 })}>
                    Thêm thành phần
                  </Button>
                  <Button type="primary" htmlType="submit" loading={createBundle.isPending}>
                    Lưu combo
                  </Button>
                </Space>
              </Form>
            </PermissionGate>
          )}
        </div>
      )}
    </Drawer>
  );
}
