// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditorImplementation } from './rich-text-editor-implementation';

interface MockEditorOptions {
  config?: Record<string, unknown>;
  data?: string;
  onChange?: (event: { editor: { getData: () => string } }) => void;
  onInstanceReady?: (event: {
    editor: { getData: () => string; setData: (html: string) => void };
  }) => void;
  readOnly?: boolean;
  scriptUrl?: string;
}

const { ckEditorMock } = vi.hoisted(() => ({
  ckEditorMock: vi.fn((options: MockEditorOptions) => {
    void options;
    return null;
  }),
}));

vi.mock('ckeditor4-react', () => ({
  CKEditor: ckEditorMock,
}));

describe('RichTextEditorImplementation', () => {
  it('uses the supported CKEditor props and built-in upload configuration from admin-client', () => {
    render(<RichTextEditorImplementation value="<p>Nội dung ban đầu</p>" />);

    const options = ckEditorMock.mock.calls.at(-1)?.[0];
    expect(options?.scriptUrl).toBe('https://cdn.ckeditor.com/4.25.1-lts/full-all/ckeditor.js');
    expect(options?.data).toBe('<p>Nội dung ban đầu</p>');
    expect(options?.config).not.toHaveProperty('dctdUploadImage');
    expect(options?.config).not.toHaveProperty('extraPlugins');
    expect(options?.config).toMatchObject({
      allowedContent: true,
      removePlugins: ['ExportPdf'],
      versionCheck: false,
    });
  });

  it('hydrates fetched HTML when the editor is ready and when the value changes', () => {
    const setData = vi.fn();
    const { rerender } = render(
      <RichTextEditorImplementation value="<p>Nội dung ban đầu</p>" />,
    );
    const options = ckEditorMock.mock.calls.at(-1)?.[0];

    act(() => {
      options?.onInstanceReady?.({
        editor: { getData: () => '', setData },
      });
    });
    expect(setData).toHaveBeenLastCalledWith('<p>Nội dung ban đầu</p>');

    rerender(<RichTextEditorImplementation value="<p>Nội dung cập nhật</p>" />);
    expect(setData).toHaveBeenLastCalledWith('<p>Nội dung cập nhật</p>');
  });

  it('returns the latest HTML from CKEditor to the form', () => {
    const onChange = vi.fn();
    render(<RichTextEditorImplementation value="" onChange={onChange} />);
    const options = ckEditorMock.mock.calls.at(-1)?.[0];

    act(() => {
      options?.onChange?.({ editor: { getData: () => '<p>Nội dung mới</p>' } });
    });

    expect(onChange).toHaveBeenCalledWith('<p>Nội dung mới</p>');
  });
});
