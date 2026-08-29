import { Alert, Skeleton } from 'antd';
import { lazy, Suspense } from 'react';

export type RichTextImageUploader = (file: File, signal: AbortSignal) => Promise<string>;

export interface RichTextEditorProps {
  value?: string | null;
  onChange?: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  uploadImage?: RichTextImageUploader;
}

const RichTextEditorImplementation = lazy(() =>
  import('./rich-text-editor-implementation').then((module) => ({
    default: module.RichTextEditorImplementation,
  })),
);

export function RichTextEditor(props: RichTextEditorProps) {
  const licenseKey = import.meta.env.VITE_CKEDITOR_LICENSE_KEY?.trim();

  if (!licenseKey) {
    return (
      <Alert
        showIcon
        type="warning"
        message="Chưa cấu hình giấy phép CKEditor 5"
        description="Thêm VITE_CKEDITOR_LICENSE_KEY vào môi trường admin. Không dùng khóa GPL nếu sản phẩm không phát hành theo GPL."
      />
    );
  }

  return (
    <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
      <RichTextEditorImplementation {...props} licenseKey={licenseKey} />
    </Suspense>
  );
}
