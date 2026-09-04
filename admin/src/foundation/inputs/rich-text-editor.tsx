import { Skeleton } from 'antd';
import { lazy, Suspense } from 'react';

export interface RichTextEditorProps {
  value?: string | null;
  onChange?: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  editorUrl?: string;
}

const RichTextEditorImplementation = lazy(() =>
  import('./rich-text-editor-implementation').then((module) => ({
    default: module.RichTextEditorImplementation,
  })),
);

export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
      <RichTextEditorImplementation {...props} />
    </Suspense>
  );
}
