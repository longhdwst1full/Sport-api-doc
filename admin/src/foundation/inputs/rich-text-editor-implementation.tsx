import { CKEditor, type CKEditorEventPayload } from 'ckeditor4-react';
import { useEffect, useMemo, useRef } from 'react';
import type { RichTextEditorProps } from './rich-text-editor';

const DEFAULT_EDITOR_URL = 'https://cdn.ckeditor.com/4.25.1-lts/full-all/ckeditor.js';

interface CKEditorInstanceLike {
  getData: () => string;
  setData: (html: string) => void;
}

export function RichTextEditorImplementation({
  value,
  onChange,
  disabled = false,
  placeholder = 'Nhập nội dung...',
  editorUrl = DEFAULT_EDITOR_URL,
}: RichTextEditorProps) {
  const editorRef = useRef<CKEditorInstanceLike | null>(null);
  const lastValueRef = useRef('');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const nextValue = value ?? '';
    if (!editorRef.current || nextValue === lastValueRef.current) return;
    try {
      editorRef.current.setData(nextValue);
      lastValueRef.current = nextValue;
    } catch {
      // CKEditor can reject setData briefly while an instance is being replaced.
    }
  }, [value]);

  const config = useMemo(
    () => ({
      skin: 'moono-lisa',
      height: '320px',
      versionCheck: false,
      removePlugins: ['ExportPdf'],
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
    [placeholder],
  );

  return (
    <div
      className="dctd-rich-text-editor"
      data-editor-state={disabled ? 'read-only' : 'editable'}
    >
      <CKEditor
        scriptUrl={editorUrl}
        data={value ?? ''}
        readOnly={disabled}
        config={config}
        onInstanceReady={(event: CKEditorEventPayload<'instanceReady'>) => {
          const editor = event.editor as unknown as CKEditorInstanceLike | null;
          const nextValue = value ?? '';
          editorRef.current = editor;
          try {
            editor?.setData(nextValue);
            lastValueRef.current = nextValue;
          } catch {
            // Keep the form usable if CKEditor is still finalizing its editable area.
          }
        }}
        onChange={(event: CKEditorEventPayload<'change'>) => {
          const editor = event.editor as unknown as CKEditorInstanceLike | null;
          const html = editor?.getData() ?? '';
          lastValueRef.current = html;
          onChangeRef.current?.(html);
        }}
      />
    </div>
  );
}
