import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  Alignment,
  Autoformat,
  BlockQuote,
  Bold,
  ClassicEditor,
  Essentials,
  FileRepository,
  Heading,
  Image,
  ImageCaption,
  ImageResize,
  ImageStyle,
  ImageToolbar,
  ImageUpload,
  Italic,
  Link,
  LinkImage,
  List,
  Paragraph,
  PasteFromOffice,
  Strikethrough,
  Table,
  TableToolbar,
  Underline,
  type Editor,
} from 'ckeditor5';
import { useEffect, useMemo, useRef } from 'react';
import type { RichTextEditorProps } from './rich-text-editor';
import { RichTextUploadAdapter } from './rich-text-upload-adapter';
import 'ckeditor5/ckeditor5.css';

interface RichTextEditorImplementationProps extends RichTextEditorProps {
  licenseKey: string;
}

export function RichTextEditorImplementation({
  value,
  onChange,
  disabled = false,
  placeholder = 'Nhập nội dung...',
  uploadImage,
  licenseKey,
}: RichTextEditorImplementationProps) {
  const editorRef = useRef<Editor | null>(null);
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
      licenseKey,
      placeholder,
      plugins: [
        Essentials,
        Autoformat,
        Paragraph,
        Heading,
        Bold,
        Italic,
        Underline,
        Strikethrough,
        Link,
        List,
        Alignment,
        BlockQuote,
        Table,
        TableToolbar,
        Image,
        ImageUpload,
        ImageToolbar,
        ImageCaption,
        ImageStyle,
        ImageResize,
        LinkImage,
        PasteFromOffice,
      ],
      toolbar: {
        items: [
          'undo',
          'redo',
          '|',
          'heading',
          '|',
          'bold',
          'italic',
          'underline',
          'strikethrough',
          '|',
          'link',
          'bulletedList',
          'numberedList',
          '|',
          'alignment',
          'blockQuote',
          'insertTable',
          ...(uploadImage ? ['uploadImage'] : []),
        ],
        shouldNotGroupWhenFull: false,
      },
      link: {
        addTargetToExternalLinks: true,
        defaultProtocol: 'https://',
      },
      image: {
        toolbar: [
          'toggleImageCaption',
          'imageTextAlternative',
          '|',
          'imageStyle:inline',
          'imageStyle:wrapText',
          'imageStyle:breakText',
          '|',
          'resizeImage',
          'linkImage',
        ],
      },
      table: {
        contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells'],
      },
      extraPlugins: uploadImage
        ? [
            (editor: Editor) => {
              editor.plugins.get(FileRepository).createUploadAdapter = (loader) =>
                new RichTextUploadAdapter(loader, uploadImage);
            },
          ]
        : [],
    }),
    [licenseKey, placeholder, uploadImage],
  );

  return (
    <div className="dctd-rich-text-editor" data-editor-state={disabled ? 'read-only' : 'editable'}>
      <CKEditor
        editor={ClassicEditor}
        data={value ?? ''}
        config={config}
        disabled={disabled}
        onReady={(editor) => {
          editorRef.current = editor;
          lastValueRef.current = editor.getData();
        }}
        onAfterDestroy={() => {
          editorRef.current = null;
        }}
        onChange={(_, editor) => {
          const html = editor.getData();
          lastValueRef.current = html;
          onChange?.(html);
        }}
      />
    </div>
  );
}
