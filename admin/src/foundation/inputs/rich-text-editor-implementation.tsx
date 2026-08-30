import {
  CKEditor,
  type CKEditorEventHandlerProp,
  type CKEditorEventPayload,
} from 'ckeditor4-react';
import { useEffect, useMemo, useRef } from 'react';
import type { RichTextEditorProps, RichTextImageUploader } from './rich-text-editor';

const DCTD_IMAGE_UPLOAD_PLUGIN = 'dctdimageupload';
const DEFAULT_EDITOR_URL = 'https://cdn.ckeditor.com/4.25.1-lts/full-all/ckeditor.js';

interface CKEditorInstanceLike {
  config: Record<string, unknown>;
  getData: () => string;
  setData: (html: string) => void;
  insertHtml: (html: string) => void;
  addCommand: (name: string, command: { exec: (editor: CKEditorInstanceLike) => void }) => void;
  ui: {
    addButton: (
      name: string,
      definition: { label: string; command: string; toolbar: string },
    ) => void;
  };
  showNotification?: (message: string, type: 'success' | 'warning') => void;
}

interface CKEditorNamespaceLike {
  plugins: {
    registered?: Record<string, unknown>;
    add: (name: string, definition: { init: (editor: CKEditorInstanceLike) => void }) => void;
  };
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&"'<>]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;',
      '<': '&lt;',
      '>': '&gt;',
    };
    return entities[character] ?? character;
  });
}

function registerImageUploadPlugin(namespaceValue: unknown): void {
  const namespace = namespaceValue as CKEditorNamespaceLike;
  if (namespace.plugins.registered?.[DCTD_IMAGE_UPLOAD_PLUGIN]) return;

  namespace.plugins.add(DCTD_IMAGE_UPLOAD_PLUGIN, {
    init(editor) {
      editor.addCommand('dctdImageUpload', {
        exec(activeEditor) {
          const uploadImage = activeEditor.config.dctdUploadImage;
          if (typeof uploadImage !== 'function') return;

          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/jpeg,image/png,image/webp,image/avif';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const abortController = new AbortController();
            activeEditor.showNotification?.('Đang tải ảnh lên...', 'warning');
            void (uploadImage as RichTextImageUploader)(file, abortController.signal)
              .then((url) => {
                activeEditor.insertHtml(
                  `<img src="${escapeHtmlAttribute(url)}" alt="" />`,
                );
                activeEditor.showNotification?.('Đã tải ảnh lên Cloudinary', 'success');
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Upload ảnh thất bại.';
                activeEditor.showNotification?.(message, 'warning');
              });
          };
          input.click();
        },
      });
      editor.ui.addButton('DctdImageUpload', {
        label: 'Tải ảnh lên Cloudinary',
        command: 'dctdImageUpload',
        toolbar: 'insert,10',
      });
    },
  });
}

export function RichTextEditorImplementation({
  value,
  onChange,
  disabled = false,
  placeholder = 'Nhập nội dung...',
  uploadImage,
  editorUrl = DEFAULT_EDITOR_URL,
}: RichTextEditorProps) {
  const editorRef = useRef<CKEditorInstanceLike | null>(null);
  const lastValueRef = useRef('');

  useEffect(() => {
    const editor = editorRef.current;
    const nextValue = value ?? '';
    if (editor && nextValue !== lastValueRef.current && nextValue !== editor.getData()) {
      editor.setData(nextValue);
      lastValueRef.current = nextValue;
    }
  }, [value]);

  const config = useMemo(
    () => ({
      skin: 'moono-lisa',
      height: '320px',
      versionCheck: false,
      removePlugins: 'exportpdf',
      extraPlugins: uploadImage ? DCTD_IMAGE_UPLOAD_PLUGIN : '',
      dctdUploadImage: uploadImage,
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
        'Courier New/Courier New, Courier, monospace;' +
        'Georgia/Georgia, serif;' +
        'Tahoma/Tahoma, Geneva, sans-serif;' +
        'Times New Roman/Times New Roman, Times, serif;' +
        'Trebuchet MS/Trebuchet MS, Helvetica, sans-serif;' +
        'Verdana/Verdana, Geneva, sans-serif;' +
        'SVN-Poppins/SVN-Poppins, sans-serif;',
    }),
    [placeholder, uploadImage],
  );

  const onInstanceReady = (event: CKEditorEventPayload<'instanceReady'>) => {
    const editor = event.editor as unknown as CKEditorInstanceLike | null;
    editorRef.current = editor;
    if (!editor) return;
    const nextValue = value ?? '';
    editor.setData(nextValue);
    lastValueRef.current = nextValue;
  };

  const onEditorChange = (event: CKEditorEventPayload<'change'>) => {
    const editor = event.editor as unknown as CKEditorInstanceLike | null;
    const html = editor?.getData() ?? '';
    lastValueRef.current = html;
    onChange?.(html);
  };

  return (
    <div className="dctd-rich-text-editor" data-editor-state={disabled ? 'read-only' : 'editable'}>
      <CKEditor<CKEditorEventHandlerProp>
        editorUrl={editorUrl}
        initData={value ?? ''}
        readOnly={disabled}
        config={config}
        onBeforeLoad={registerImageUploadPlugin}
        onInstanceReady={onInstanceReady}
        onChange={onEditorChange}
        onDestroy={() => {
          editorRef.current = null;
        }}
      />
    </div>
  );
}
