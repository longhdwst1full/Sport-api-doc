import { yupResolver } from '@hookform/resolvers/yup';
import { CalendarOutlined, DollarOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import {
  getGetAdminProductPriceTimelineQueryKey,
  useCreateAdminProductPrice,
  useGetAdminProductPriceTimeline,
  useReplaceAdminProductPrice,
} from '@/generated/api/catalog/catalog';
import type { ProductDetailDto, ProductPriceWindowDto } from '@/generated/api/catalog/models';
import { getApiErrorMessage } from '@/lib/api/error';
import { useCan } from '@/core/auth/permissions';

interface PriceFormValues {
  variantId: string;
  amount: string;
  startsAt: string;
  reason?: string;
}

const schema: yup.ObjectSchema<PriceFormValues> = yup.object({
  variantId: yup.string().uuid('SKU không hợp lệ').required('Chọn SKU'),
  amount: yup.string().trim().matches(/^(?=.*[1-9])\d+(?:\.\d{1,2})?$/, 'Giá phải lớn hơn 0').required('Nhập giá bán'),
  startsAt: yup.string().required('Chọn thời điểm áp dụng'),
  reason: yup.string().trim().max(500, 'Tối đa 500 ký tự').optional(),
});

const inputNow = () => {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
};

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export function ProductPricePanel({
  product,
  onChanged,
}: {
  product: ProductDetailDto;
  onChanged: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const canManage = useCan('catalog.price.manage');
  const queryClient = useQueryClient();
  const form = useForm<PriceFormValues>({
    resolver: yupResolver(schema),
    defaultValues: { variantId: product.variants[0]?.id ?? '', amount: '', startsAt: inputNow(), reason: '' },
  });
  const variantId = form.watch('variantId');
  const timeline = useGetAdminProductPriceTimeline(variantId, {
    query: { enabled: Boolean(variantId), retry: false },
  });

  const afterSaved = async () => {
    await Promise.all([
      onChanged(),
      queryClient.invalidateQueries({ queryKey: getGetAdminProductPriceTimelineQueryKey(variantId) }),
    ]);
    form.reset({ variantId, amount: '', startsAt: inputNow(), reason: '' });
    void message.success('Đã lưu lịch giá. Giá hiển thị đã bao gồm VAT.');
  };
  const createPrice = useCreateAdminProductPrice({
    mutation: { onSuccess: afterSaved, onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể tạo giá.')) },
  });
  const replacePrice = useReplaceAdminProductPrice({
    mutation: { onSuccess: afterSaved, onError: (error) => void message.error(getApiErrorMessage(error, 'Không thể thay giá.')) },
  });

  const openWindow = timeline.data?.upcoming.at(-1)
    ?? (timeline.data?.current?.endsAt ? undefined : timeline.data?.current);

  const submit = form.handleSubmit((values) => {
    const reference = openWindow ? Number(openWindow.amount) : undefined;
    const reduction = reference && reference > 0 ? (reference - Number(values.amount)) / reference : 0;
    if (reduction > 0.2 && !values.reason?.trim()) {
      form.setError('reason', { message: 'Bắt buộc nhập lý do khi giảm giá quá 20%' });
      return;
    }
    const startsAt = new Date(values.startsAt).toISOString();
    const run = () => openWindow
      ? replacePrice.mutateAsync({
          variantId: values.variantId,
          data: {
            amount: values.amount,
            startsAt,
            reason: values.reason?.trim() || undefined,
            expectedCurrentPriceId: openWindow.id,
            expectedCurrentPriceVersion: openWindow.version,
          },
        })
      : createPrice.mutateAsync({
          variantId: values.variantId,
          data: { amount: values.amount, startsAt, reason: values.reason?.trim() || undefined },
        });

    Modal.confirm({
      title: reduction > 0.2 ? 'Xác nhận giảm giá trên 20%' : 'Xác nhận lịch giá',
      content: reduction > 0.2
        ? `Giá giảm ${(reduction * 100).toFixed(1)}%. Lý do sẽ được lưu vào audit và không thể sửa lịch sử.`
        : 'Lịch giá cũ sẽ được giữ nguyên để truy vết; giá mới bắt đầu đúng thời điểm đã chọn.',
      okText: 'Xác nhận lưu',
      cancelText: 'Kiểm tra lại',
      okButtonProps: { danger: reduction > 0.2 },
      onOk: run,
    });
  });

  const priceColumns = [
    { title: 'Giá đã VAT', dataIndex: 'amount', render: (value: string) => <strong>{money.format(Number(value))}</strong> },
    { title: 'Bắt đầu', dataIndex: 'startsAt', render: (value: string) => dateTime.format(new Date(value)) },
    { title: 'Kết thúc', dataIndex: 'endsAt', render: (value?: string | null) => value ? dateTime.format(new Date(value)) : 'Không giới hạn' },
    { title: 'Trạng thái', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> },
  ];

  return (
    <Card className="border-emerald-100 bg-emerald-50/30" title={<Space><DollarOutlined /> Quản lý lịch giá</Space>}>
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        {canManage ? (
          <Form layout="vertical" onFinish={() => void submit()}>
          <Form.Item label="SKU" validateStatus={form.formState.errors.variantId ? 'error' : undefined} help={form.formState.errors.variantId?.message}>
            <Controller name="variantId" control={form.control} render={({ field }) => (
              <Select {...field} options={product.variants.map((variant) => ({ value: variant.id, label: `${variant.sku} — ${variant.name}` }))} />
            )} />
          </Form.Item>
          <Form.Item label="Giá bán đã VAT (VND)" validateStatus={form.formState.errors.amount ? 'error' : undefined} help={form.formState.errors.amount?.message}>
            <Controller name="amount" control={form.control} render={({ field }) => <Input {...field} inputMode="decimal" prefix="₫" />} />
          </Form.Item>
          <Form.Item label="Áp dụng từ" validateStatus={form.formState.errors.startsAt ? 'error' : undefined} help={form.formState.errors.startsAt?.message}>
            <Controller name="startsAt" control={form.control} render={({ field }) => <Input {...field} type="datetime-local" prefix={<CalendarOutlined />} />} />
          </Form.Item>
          <Form.Item label="Lý do / ghi chú" validateStatus={form.formState.errors.reason ? 'error' : undefined} help={form.formState.errors.reason?.message ?? 'Bắt buộc nếu giá giảm trên 20%.'}>
            <Controller name="reason" control={form.control} render={({ field }) => <Input.TextArea {...field} rows={3} maxLength={500} showCount />} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={createPrice.isPending || replacePrice.isPending} disabled={!variantId}>
            {openWindow ? 'Lập giá thay thế' : 'Tạo giá đầu tiên'}
          </Button>
        </Form>
        ) : (
            <Alert
              showIcon
              type="info"
              message="Chỉ xem lịch giá"
              description="Tài khoản này không có quyền tạo hoặc thay giá."
            />
        )}

        <div className="min-w-0 space-y-4">
          {timeline.isError && <Alert showIcon type="error" message="Không tải được lịch giá" description={getApiErrorMessage(timeline.error, 'Vui lòng thử lại.')} />}
          <div>
            <Typography.Title level={5}>Giá hiện tại</Typography.Title>
            {timeline.data?.current
              ? <Table<ProductPriceWindowDto> size="small" rowKey="id" pagination={false} dataSource={[timeline.data.current]} columns={priceColumns} />
              : <Typography.Text type="secondary">Chưa có giá đang hiệu lực.</Typography.Text>}
          </div>
          <div>
            <Typography.Title level={5}>Sắp áp dụng</Typography.Title>
            <Table<ProductPriceWindowDto> size="small" rowKey="id" loading={timeline.isPending} pagination={false} dataSource={timeline.data?.upcoming ?? []} columns={priceColumns} locale={{ emptyText: 'Chưa có giá tương lai' }} />
          </div>
          <div>
            <Typography.Title level={5}>Lịch sử bất biến</Typography.Title>
            <Table<ProductPriceWindowDto> size="small" rowKey="id" pagination={{ pageSize: 5, hideOnSinglePage: true }} dataSource={timeline.data?.history ?? []} columns={priceColumns} locale={{ emptyText: 'Chưa có lịch sử giá' }} />
          </div>
        </div>
      </div>
    </Card>
  );
}
