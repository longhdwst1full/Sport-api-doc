import { DeleteOutlined, DownOutlined, EditOutlined, StarOutlined, UpOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Form, Image, Input, Modal, Select, Space, Table, Tag, Upload } from 'antd';
import { useEffect, useState } from 'react';
import {
  useArchiveAdminProductMedia,
  useAttachAdminProductMedia,
  useReorderAdminProductMedia,
  useUpdateAdminProductMedia,
} from '@/generated/api/catalog/catalog';
import type { ProductDetailDto, ProductMediaDto } from '@/generated/api/catalog/models';
import { uploadImage } from '@/lib/media/upload-image';
import { getApiErrorMessage } from '@/lib/api/error';
import { reorderProductMedia } from './product-media.policy';

export function ProductMediaPanel({
  product,
  onChanged,
}: {
  product: ProductDetailDto;
  onChanged: () => Promise<void>;
}) {
  const { message, modal } = App.useApp();
  const [targetVariantId, setTargetVariantId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<ProductMediaDto>();
  const [altText, setAltText] = useState('');

  useEffect(() => setAltText(editing?.altText ?? ''), [editing]);
  const mutationError = (error: unknown, fallback: string) =>
    void message.error(getApiErrorMessage(error, fallback));
  const mutationSuccess = async (text: string) => {
    await onChanged();
    void message.success(text);
  };

  const attach = useAttachAdminProductMedia({
    mutation: {
      onSuccess: () => mutationSuccess('Đã gắn ảnh vào sản phẩm.'),
      onError: (error) => mutationError(error, 'Không thể gắn ảnh.'),
    },
  });
  const update = useUpdateAdminProductMedia({
    mutation: {
      onSuccess: async () => {
        setEditing(undefined);
        await mutationSuccess('Đã cập nhật ảnh.');
      },
      onError: (error) => mutationError(error, 'Không thể cập nhật ảnh.'),
    },
  });
  const reorder = useReorderAdminProductMedia({
    mutation: {
      onSuccess: () => mutationSuccess('Đã cập nhật thứ tự ảnh.'),
      onError: (error) => mutationError(error, 'Không thể sắp xếp ảnh.'),
    },
  });
  const archive = useArchiveAdminProductMedia({
    mutation: {
      onSuccess: () => mutationSuccess('Đã gỡ ảnh khỏi sản phẩm; asset Cloudinary vẫn được giữ.'),
      onError: (error) => mutationError(error, 'Không thể gỡ ảnh.'),
    },
  });
  const pending = attach.isPending || update.isPending || reorder.isPending || archive.isPending;

  const move = (index: number, direction: -1 | 1) => {
    const items = reorderProductMedia(product.media, index, direction);
    if (!items) return;
    reorder.mutate({
      id: product.id,
      data: {
        expectedProductVersion: product.version,
        items,
      },
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Form.Item label="Gắn cho" style={{ marginBottom: 0, minWidth: 260 }}>
          <Select
            allowClear
            value={targetVariantId}
            onChange={setTargetVariantId}
            placeholder="Toàn sản phẩm"
            options={product.variants.map((variant) => ({ value: variant.id, label: `${variant.sku} — ${variant.name}` }))}
          />
        </Form.Item>
        <Upload
          accept="image/jpeg,image/png,image/webp,image/avif"
          showUploadList={false}
          disabled={pending || uploading || product.status === 'ARCHIVED'}
          customRequest={({ file, onError, onSuccess }) => {
            if (!(file instanceof File)) return onError?.(new Error('Tệp không hợp lệ'));
            setUploading(true);
            void uploadImage(file)
              .then(async (asset) => {
                await attach.mutateAsync({
                  id: product.id,
                  data: {
                    mediaAssetId: asset.id,
                    variantId: targetVariantId,
                    altText: product.name,
                    isPrimary: product.media.length === 0,
                    expectedProductVersion: product.version,
                  },
                });
                onSuccess?.(asset);
              })
              .catch((error: unknown) => onError?.(error instanceof Error ? error : new Error('Upload thất bại')))
              .finally(() => setUploading(false));
          }}
        >
          <Button type="primary" icon={<UploadOutlined />} loading={uploading || attach.isPending}>
            Upload và gắn ảnh
          </Button>
        </Upload>
      </div>

      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={product.media}
        locale={{ emptyText: 'Chưa có ảnh sản phẩm' }}
        columns={[
          { title: 'Ảnh', width: 74, render: (_, row) => <Image width={52} height={52} className="object-cover" src={row.thumbnailUrl ?? row.secureUrl} /> },
          { title: 'Alt text', dataIndex: 'altText', render: (value) => value || '—' },
          {
            title: 'Phạm vi',
            dataIndex: 'variantId',
            render: (variantId) => variantId
              ? product.variants.find(({ id }) => id === variantId)?.sku ?? 'SKU không tồn tại'
              : 'Toàn sản phẩm',
          },
          { title: 'Ảnh chính', dataIndex: 'isPrimary', align: 'center', render: (value) => value ? <Tag color="gold">Chính</Tag> : '—' },
          {
            title: 'Thứ tự',
            width: 110,
            render: (_, row, index) => (
              <Space size={0}>
                <Button type="text" icon={<UpOutlined />} disabled={pending || index === 0} onClick={() => move(index, -1)} />
                <Button type="text" icon={<DownOutlined />} disabled={pending || index === product.media.length - 1} onClick={() => move(index, 1)} />
              </Space>
            ),
          },
          {
            title: 'Thao tác',
            width: 210,
            align: 'right',
            render: (_, row) => (
              <Space size={0}>
                <Button type="link" icon={<EditOutlined />} disabled={pending} onClick={() => setEditing(row)}>Sửa</Button>
                {!row.isPrimary && (
                  <Button
                    type="link"
                    icon={<StarOutlined />}
                    disabled={pending}
                    onClick={() => update.mutate({
                      id: product.id,
                      mediaId: row.id,
                      data: { isPrimary: true, expectedProductVersion: product.version },
                    })}
                  >Ảnh chính</Button>
                )}
                <Button
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={pending}
                  onClick={() => modal.confirm({
                    title: 'Gỡ ảnh khỏi sản phẩm?',
                    content: 'Liên kết sẽ chuyển INACTIVE; file Cloudinary và metadata asset không bị xóa.',
                    okText: 'Gỡ ảnh',
                    okButtonProps: { danger: true },
                    cancelText: 'Hủy',
                    onOk: () => archive.mutateAsync({
                      id: product.id,
                      mediaId: row.id,
                      data: { expectedProductVersion: product.version },
                    }),
                  })}
                >Gỡ</Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={Boolean(editing)}
        title="Sửa alt text ảnh"
        okText="Lưu"
        cancelText="Hủy"
        confirmLoading={update.isPending}
        onCancel={() => setEditing(undefined)}
        onOk={() => editing && update.mutate({
          id: product.id,
          mediaId: editing.id,
          data: { altText: altText.trim() || null, expectedProductVersion: product.version },
        })}
      >
        <Input value={altText} maxLength={500} onChange={(event) => setAltText(event.target.value)} placeholder="Mô tả nội dung ảnh cho SEO và accessibility" />
      </Modal>
    </div>
  );
}
