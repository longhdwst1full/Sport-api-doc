import {
  CKEditorEventAction,
  type CKEditorEventPayload,
  useCKEditor,
} from 'ckeditor4-react';
import { Alert, Button, Input, Skeleton } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RichTextEditorProps } from './rich-text-editor';

const DEFAULT_EDITOR_URL = 'https://cdn.ckeditor.com/4.25.1-lts/full-all/ckeditor.js';

interface CKEditorInstanceLike {
  getData: () => string;
  setData: (html: string) => void;
  setReadOnly?: (readOnly: boolean) => void;
}

export function RichTextEditorImplementation({
  ...props
}: RichTextEditorProps) {
  const [attempt, setAttempt] = useState(0);

  return (
    <RichTextEditorRuntime
      key={attempt}
      {...props}
      onRetry={() => setAttempt((current) => current + 1)}
    />
  );
}

function RichTextEditorRuntime({
  value,
  onChange,
  disabled = false,
  placeholder = 'Nhập nội dung...',
  editorUrl = DEFAULT_EDITOR_URL,
  onRetry,
}: RichTextEditorProps & { onRetry: () => void }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const lastValueRef = useRef('');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const config = useMemo(
    () => ({
      skin: 'moono-lisa',
      height: '320px',
      readOnly: disabled,
      versionCheck: false,
      removePlugins: 'exportpdf',
      entities: false,
      basicEntities: false,
      allowedContent: true,
      enterMode: 2,
      shiftEnterMode: 1,
      fillEmptyBlocks: false,
      pasteFilter: null,
      editorplaceholder: placeholder,
      font_names:
        'Arial/Arial, Helvetica, sans-serif;' +
        'Comic Sans MS/Comic Sans MS, cursive;' +
        'Courier New/Courier New, Courier, monospace;' +
        'Georgia/Georgia, serif;' +
        'Lucida Sans Unicode/Lucida Sans Unicode, Lucida Grande, sans-serif;' +
        'Tahoma/Tahoma, Geneva, sans-serif;' +
        'Times New Roman/Times New Roman, Times, serif;' +
        'Trebuchet MS/Trebuchet MS, Helvetica, sans-serif;' +
        'Verdana/Verdana, Geneva, sans-serif;' +
        'SVN-Poppins/SVN-Poppins, sans-serif;',
    }),
    [disabled, placeholder],
  );

  const dispatchEvent = useCallback(
    ({ type, payload }: { type: string; payload: unknown }) => {
      if (type === CKEditorEventAction.instanceReady) {
        const event = payload as CKEditorEventPayload<'instanceReady'>;
        const activeEditor = event.editor as unknown as CKEditorInstanceLike | null;
        const nextValue = value ?? '';
        activeEditor?.setData(nextValue);
        lastValueRef.current = nextValue;
        return;
      }
      if (type === CKEditorEventAction.change) {
        const event = payload as CKEditorEventPayload<'change'>;
        const activeEditor = event.editor as unknown as CKEditorInstanceLike | null;
        const html = activeEditor?.getData() ?? '';
        lastValueRef.current = html;
        onChangeRef.current?.(html);
      }
    },
    [value],
  );

  const { editor, error, loading, status } = useCKEditor({
    config,
    dispatchEvent,
    editorUrl,
    element,
    initContent: value ?? '',
    subscribeTo: ['instanceReady', 'change'],
  });

  useEffect(() => {
    const activeEditor = editor as unknown as CKEditorInstanceLike | undefined;
    const nextValue = value ?? '';
    if (
      activeEditor &&
      status === 'ready' &&
      nextValue !== lastValueRef.current &&
      nextValue !== activeEditor.getData()
    ) {
      activeEditor.setData(nextValue);
      lastValueRef.current = nextValue;
    }
  }, [editor, status, value]);

  useEffect(() => {
    const activeEditor = editor as unknown as CKEditorInstanceLike | undefined;
    if (activeEditor && status === 'ready') activeEditor.setReadOnly?.(disabled);
  }, [disabled, editor, status]);

  const ready = status === 'ready';

  return (
    <div
      className="dctd-rich-text-editor min-h-80"
      data-editor-state={disabled ? 'read-only' : 'editable'}
    >
      {!error && !ready && <Skeleton active paragraph={{ rows: 7 }} title={false} />}
      {error && (
        <div className="space-y-3">
          <Alert
            showIcon
            type="warning"
            message="Không tải được CKEditor 4"
            description="Có thể CDN đang bị chặn hoặc mất kết nối. Anh/chị vẫn có thể nhập HTML bên dưới và thử tải lại editor."
            action={<Button onClick={onRetry}>Thử lại</Button>}
          />
          <Input.TextArea
            aria-label="Nội dung HTML dự phòng"
            disabled={disabled}
            rows={12}
            value={value ?? ''}
            onChange={(event) => onChangeRef.current?.(event.target.value)}
            placeholder={placeholder}
          />
        </div>
      )}
      {!error && <div ref={setElement} aria-busy={loading || !ready} />}
    </div>
  );
}
