import { UploadOutlined } from '@ant-design/icons';
import { App, Button, Image, Input, Space, Upload } from 'antd';
import { useState } from 'react';
import { uploadImage } from '@/lib/media/upload-image';

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}

export function ImageUploadField({ value, onChange, disabled }: ImageUploadFieldProps) {
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);

  return (
    <Space.Compact block>
      {value ? <Image width={40} height={32} src={value} className="object-cover" /> : null}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="URL ảnh sau khi upload"
        disabled={disabled || uploading}
      />
      <Upload
        accept="image/jpeg,image/png,image/webp,image/avif"
        showUploadList={false}
        disabled={disabled || uploading}
        customRequest={({ file, onError, onSuccess }) => {
          if (!(file instanceof File)) {
            onError?.(new Error('Tệp tải lên không hợp lệ.'));
            return;
          }
          setUploading(true);
          void uploadImage(file)
            .then((asset) => {
              onChange(asset.secureUrl);
              onSuccess?.(asset);
              void message.success('Đã tải ảnh lên Cloudinary');
            })
            .catch((error: unknown) => {
              const uploadError = error instanceof Error ? error : new Error('Upload ảnh thất bại.');
              onError?.(uploadError);
              void message.error(uploadError.message);
            })
            .finally(() => setUploading(false));
        }}
      >
        <Button icon={<UploadOutlined />} loading={uploading}>
          Upload
        </Button>
      </Upload>
    </Space.Compact>
  );
}
