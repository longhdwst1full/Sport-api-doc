import { yupResolver } from '@hookform/resolvers/yup';
import { App, Button, Drawer, Form, Input, InputNumber } from 'antd';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import { useUpdateAdminProductVariant } from '@/generated/api/catalog/catalog';
import type { ProductVariantDto } from '@/generated/api/catalog/models';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api/error';
import { toUpdateVariantDto, toVariantEditValues, type VariantEditValues } from './variant-edit.mapper';

const schema: yup.ObjectSchema<VariantEditValues> = yup.object({
  name: yup.string().trim().required('Nhập tên phiên bản').max(255),
  barcode: yup.string().trim().max(64).defined(),
  weightGrams: yup.number().integer().min(0).required(),
  lengthMm: yup.number().integer().min(1).optional(),
  widthMm: yup.number().integer().min(1).optional(),
  heightMm: yup.number().integer().min(1).optional(),
});

export function VariantEditDrawer({
  variant,
  onClose,
  onUpdated,
}: {
  variant?: ProductVariantDto;
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<VariantEditValues>({ resolver: yupResolver(schema) });
  const update = useUpdateAdminProductVariant({
    mutation: {
      onSuccess: async () => {
        await onUpdated();
        void message.success('Đã cập nhật metadata SKU.');
        onClose();
      },
      onError: (error) => {
        Object.entries(getApiFieldErrors(error)).forEach(([field, fieldMessage]) => {
          if (field in schema.fields) setError(field as keyof VariantEditValues, { message: fieldMessage });
        });
        void message.error(getApiErrorMessage(error, 'Không thể cập nhật SKU.'));
      },
    },
  });

  useEffect(() => {
    if (!variant) return;
    reset(toVariantEditValues(variant));
  }, [reset, variant]);

  const submit = handleSubmit((values) => {
    if (!variant) return;
    update.mutate({
      variantId: variant.id,
      data: toUpdateVariantDto(values, variant.version),
    });
  });

  return (
    <Drawer
      open={Boolean(variant)}
      title={`Sửa SKU — ${variant?.sku ?? ''}`}
      width={520}
      destroyOnHidden
      onClose={onClose}
      footer={(
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={update.isPending} onClick={() => void submit()}>
            Lưu thay đổi
          </Button>
        </div>
      )}
    >
      <Form layout="vertical">
        <Form.Item label="SKU (không thể đổi)"><Input value={variant?.sku} disabled /></Form.Item>
        <Form.Item label="Tên phiên bản" validateStatus={errors.name ? 'error' : undefined} help={errors.name?.message}>
          <Controller name="name" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item label="Barcode" validateStatus={errors.barcode ? 'error' : undefined} help={errors.barcode?.message}>
          <Controller name="barcode" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <div className="grid grid-cols-2 gap-3">
          {([
            ['weightGrams', 'Khối lượng (g)', 0],
            ['lengthMm', 'Dài (mm)', 1],
            ['widthMm', 'Rộng (mm)', 1],
            ['heightMm', 'Cao (mm)', 1],
          ] as const).map(([name, label, min]) => (
            <Form.Item key={name} label={label} validateStatus={errors[name] ? 'error' : undefined} help={errors[name]?.message}>
              <Controller
                name={name}
                control={control}
                render={({ field }) => (
                  <InputNumber {...field} min={min} precision={0} className="w-full" onChange={(value) => field.onChange(value ?? undefined)} />
                )}
              />
            </Form.Item>
          ))}
        </div>
      </Form>
    </Drawer>
  );
}
