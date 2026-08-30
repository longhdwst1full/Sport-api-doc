import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, InputNumber, Select } from 'antd';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import {
  getListInventoryBalancesQueryKey,
  useCreateStockAdjustment,
} from '@/generated/api/inventory/inventory';
import type { InventoryBalanceDto } from '@/generated/api/inventory/models';
import { getApiErrorMessage } from '@/lib/api/error';

interface StockAdjustmentValues {
  warehouseCode: string;
  sku: string;
  quantityDelta: number;
  reason: string;
}

const schema: yup.ObjectSchema<StockAdjustmentValues> = yup.object({
  warehouseCode: yup.string().trim().required('Chọn kho'),
  sku: yup.string().trim().required('Chọn SKU'),
  quantityDelta: yup.number().integer('Số lượng phải là số nguyên').notOneOf([0], 'Số lượng thay đổi phải khác 0').required(),
  reason: yup.string().trim().min(5, 'Lý do cần ít nhất 5 ký tự').required('Nhập lý do điều chỉnh'),
});

export function StockAdjustmentDrawer({
  open,
  balances,
  onClose,
}: {
  open: boolean;
  balances: InventoryBalanceDto[];
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(crypto.randomUUID());
  const form = useForm<StockAdjustmentValues>({
    resolver: yupResolver(schema),
    defaultValues: { warehouseCode: '', sku: '', quantityDelta: 0, reason: '' },
  });
  const warehouseCode = form.watch('warehouseCode');
  const mutation = useCreateStockAdjustment({
    request: { headers: { 'Idempotency-Key': idempotencyKey.current } },
    mutation: {
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: getListInventoryBalancesQueryKey() });
        void message.success(`Đã ghi phiếu ${result.adjustmentNo}.`);
        onClose();
      },
      onError: (error) =>
        void message.error(getApiErrorMessage(error, 'Không thể điều chỉnh tồn kho.')),
    },
  });
  const warehouses = [...new Set(balances.map((item) => item.warehouseCode))];
  const skus = balances.filter(
    (item) => !warehouseCode || item.warehouseCode === warehouseCode,
  );
  const submit = form.handleSubmit((values) => {
    mutation.mutate({
      data: {
        warehouseCode: values.warehouseCode,
        reason: values.reason,
        items: [{ sku: values.sku, quantityDelta: values.quantityDelta }],
      },
    });
  });

  return (
    <Drawer
      title="Điều chỉnh tồn kho"
      width={520}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={<Button type="primary" loading={mutation.isPending} onClick={() => void submit()}>Ghi điều chỉnh</Button>}
    >
      <Form layout="vertical" onFinish={() => void submit()}>
        <Form.Item label="Kho" validateStatus={form.formState.errors.warehouseCode ? 'error' : undefined} help={form.formState.errors.warehouseCode?.message}>
          <Controller
            name="warehouseCode"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                options={warehouses.map((value) => ({ value, label: value }))}
                onChange={(value) => {
                  field.onChange(value);
                  form.setValue('sku', '');
                }}
              />
            )}
          />
        </Form.Item>
        <Form.Item label="SKU" validateStatus={form.formState.errors.sku ? 'error' : undefined} help={form.formState.errors.sku?.message}>
          <Controller
            name="sku"
            control={form.control}
            render={({ field }) => (
              <Select
                {...field}
                showSearch
                optionFilterProp="label"
                options={skus.map((item) => ({ value: item.sku, label: `${item.sku} — ${item.productName}` }))}
              />
            )}
          />
        </Form.Item>
        <Form.Item label="Số lượng thay đổi" extra="Dùng số dương để nhập thêm, số âm để giảm tồn." validateStatus={form.formState.errors.quantityDelta ? 'error' : undefined} help={form.formState.errors.quantityDelta?.message}>
          <Controller name="quantityDelta" control={form.control} render={({ field }) => <InputNumber {...field} precision={0} className="w-full" />} />
        </Form.Item>
        <Form.Item label="Lý do" validateStatus={form.formState.errors.reason ? 'error' : undefined} help={form.formState.errors.reason?.message}>
          <Controller name="reason" control={form.control} render={({ field }) => <Input.TextArea {...field} rows={4} />} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
