import {
  CKEditor,
  type CKEditorEventPayload,
} from 'ckeditor4-react';
import { Alert, Button, Input, Skeleton } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RichTextEditorProps } from './rich-text-editor';

const DEFAULT_EDITOR_URL = 'https://cdn.ckeditor.com/4.25.1-lts/full-all/ckeditor.js';

interface CKEditorInstanceLike {
  getData: () => string;
  setData: (html: string) => void;
  setReadOnly?: (readOnly: boolean) => void;
}

export function RichTextEditorImplementation({
  value,
  onChange,
  disabled = false,
  placeholder = 'Nhập nội dung...',
  editorUrl = DEFAULT_EDITOR_URL,
}: RichTextEditorProps) {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const editorRef = useRef<CKEditorInstanceLike | null>(null);
  const lastValueRef = useRef('');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setReady(false);
    setLoadingTimedOut(false);
    const timeout = window.setTimeout(() => setLoadingTimedOut(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [attempt, editorUrl]);

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

  useEffect(() => {
    const activeEditor = editorRef.current;
    const nextValue = value ?? '';
    if (
      activeEditor &&
      nextValue !== lastValueRef.current &&
      nextValue !== activeEditor.getData()
    ) {
      activeEditor.setData(nextValue);
      lastValueRef.current = nextValue;
    }
  }, [value]);

  return (
    <div
      className="dctd-rich-text-editor min-h-80"
      data-editor-state={disabled ? 'read-only' : 'editable'}
    >
      {!ready && !loadingTimedOut && <Skeleton active paragraph={{ rows: 7 }} title={false} />}
      {!ready && loadingTimedOut && (
        <div className="space-y-3">
          <Alert
            showIcon
            type="warning"
            message="Không tải được CKEditor 4"
            description="Editor tải quá 10 giây. Anh/chị vẫn có thể nhập HTML bên dưới hoặc thử tải lại."
            action={<Button onClick={() => setAttempt((current) => current + 1)}>Thử lại</Button>}
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
      <div className={ready ? undefined : 'h-0 overflow-hidden'} aria-busy={!ready}>
        <CKEditor
          key={attempt}
          editorUrl={editorUrl}
          initData={value ?? ''}
          readOnly={disabled}
          config={config}
          onInstanceReady={(event: CKEditorEventPayload<'instanceReady'>) => {
            const activeEditor = event.editor as unknown as CKEditorInstanceLike | null;
            const nextValue = value ?? '';
            editorRef.current = activeEditor;
            activeEditor?.setData(nextValue);
            lastValueRef.current = nextValue;
            setReady(true);
          }}
          onChange={(event: CKEditorEventPayload<'change'>) => {
            const activeEditor = event.editor as unknown as CKEditorInstanceLike | null;
            const html = activeEditor?.getData() ?? '';
            lastValueRef.current = html;
            onChangeRef.current?.(html);
          }}
        />
      </div>
    </div>
  );
}
