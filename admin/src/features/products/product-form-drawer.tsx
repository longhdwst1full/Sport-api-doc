import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, InputNumber, Switch } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import {
  getListAdminProductsQueryKey,
  useCreateAdminProduct,
} from '@/generated/api/admin-products/admin-products';

type ProductFormValues = {
  name: string;
  slug: string;
  sku: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  imageUrl: string;
  availableQuantity: number;
  tags: string;
  published: boolean;
};

const productSchema: yup.ObjectSchema<ProductFormValues> = yup.object({
  name: yup.string().trim().required('Nhập tên sản phẩm'),
  slug: yup
    .string()
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug chỉ gồm chữ thường, số và dấu gạch ngang')
    .required('Nhập slug'),
  sku: yup.string().trim().required('Nhập SKU'),
  brand: yup.string().trim().required('Nhập thương hiệu'),
  category: yup.string().trim().required('Nhập danh mục'),
  description: yup.string().trim().required('Nhập mô tả'),
  price: yup.number().typeError('Giá phải là số').min(0, 'Giá không được âm').required(),
  imageUrl: yup.string().trim().url('URL ảnh chưa hợp lệ').required('Nhập URL ảnh'),
  availableQuantity: yup
    .number()
    .typeError('Tồn kho phải là số')
    .integer('Tồn kho phải là số nguyên')
    .min(0, 'Tồn kho không được âm')
    .required(),
  tags: yup.string().defined(),
  published: yup.boolean().defined(),
});

const defaultValues: ProductFormValues = {
  name: '',
  slug: '',
  sku: '',
  brand: '',
  category: '',
  description: '',
  price: 0,
  imageUrl: '',
  availableQuantity: 0,
  tags: '',
  published: false,
};

export function ProductFormDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductFormValues>({ resolver: yupResolver(productSchema), defaultValues });
  const createProduct = useCreateAdminProduct({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
        void message.success('Đã tạo sản phẩm');
        reset(defaultValues);
        onClose();
      },
      onError: () => void message.error('Không thể tạo sản phẩm. Vui lòng kiểm tra lại dữ liệu.'),
    },
  });

  const submit = handleSubmit((values) => {
    createProduct.mutate({
      data: {
        ...values,
        tags: values.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
    });
  });

  const textField = (name: keyof ProductFormValues, label: string, placeholder?: string) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Form.Item
          label={label}
          validateStatus={errors[name] ? 'error' : undefined}
          help={errors[name]?.message}
        >
          <Input {...field} value={String(field.value)} placeholder={placeholder} />
        </Form.Item>
      )}
    />
  );

  return (
    <Drawer
      title="Thêm sản phẩm"
      width={640}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={createProduct.isPending} onClick={() => void submit()}>
          Lưu sản phẩm
        </Button>
      }
    >
      <Form layout="vertical" onFinish={() => void submit()}>
        {textField('name', 'Tên sản phẩm')}
        <div className="grid gap-4 sm:grid-cols-2">
          {textField('slug', 'Slug', 'ta-tay-cao-su')}
          {textField('sku', 'SKU', 'DCTD-DB-001')}
          {textField('brand', 'Thương hiệu')}
          {textField('category', 'Danh mục')}
        </div>
        <Controller
          name="description"
          control={control}
          render={({ field }) => (
            <Form.Item
              label="Mô tả"
              validateStatus={errors.description ? 'error' : undefined}
              help={errors.description?.message}
            >
              <Input.TextArea {...field} rows={4} />
            </Form.Item>
          )}
        />
        {textField('imageUrl', 'URL ảnh')}
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="price"
            control={control}
            render={({ field }) => (
              <Form.Item
                label="Giá đã gồm VAT"
                validateStatus={errors.price ? 'error' : undefined}
                help={errors.price?.message}
              >
                <InputNumber {...field} min={0} className="w-full" />
              </Form.Item>
            )}
          />
          <Controller
            name="availableQuantity"
            control={control}
            render={({ field }) => (
              <Form.Item
                label="Tồn khả dụng"
                validateStatus={errors.availableQuantity ? 'error' : undefined}
                help={errors.availableQuantity?.message}
              >
                <InputNumber {...field} min={0} precision={0} className="w-full" />
              </Form.Item>
            )}
          />
        </div>
        {textField('tags', 'Tags', 'home-gym, strength')}
        <Controller
          name="published"
          control={control}
          render={({ field }) => (
            <Form.Item label="Xuất bản ngay">
              <Switch checked={field.value} onChange={field.onChange} />
            </Form.Item>
          )}
        />
      </Form>
    </Drawer>
  );
}
