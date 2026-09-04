// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditorImplementation } from './rich-text-editor-implementation';

const { useCKEditorMock } = vi.hoisted(() => ({
  useCKEditorMock: vi.fn((options: {
    config?: Record<string, unknown>;
    subscribeTo?: string[];
  }) => {
    void options;
    return {
      editor: undefined,
      error: true,
      loading: false,
      status: undefined,
    };
  }),
}));

vi.mock('ckeditor4-react', () => ({
  CKEditorEventAction: {
    beforeLoad: '__CKE__beforeLoad',
    change: '__CKE__change',
    instanceReady: '__CKE__instanceReady',
  },
  useCKEditor: useCKEditorMock,
}));

describe('RichTextEditorImplementation', () => {
  it('keeps content editable through the HTML fallback when CKEditor CDN fails', () => {
    const onChange = vi.fn();

    render(
      <RichTextEditorImplementation
        value="<p>Nội dung ban đầu</p>"
        onChange={onChange}
      />,
    );

    expect(screen.getByText('Không tải được CKEditor 4')).toBeTruthy();
    const fallback = screen.getByRole('textbox', {
      name: 'Nội dung HTML dự phòng',
    }) as HTMLTextAreaElement;
    expect(fallback.value).toBe('<p>Nội dung ban đầu</p>');

    fireEvent.change(fallback, { target: { value: '<p>Nội dung mới</p>' } });
    expect(onChange).toHaveBeenCalledWith('<p>Nội dung mới</p>');
    expect(screen.getByRole('button', { name: 'Thử lại' }).hasAttribute('disabled')).toBe(false);
  });

  it('uses CKEditor built-in configuration without the custom Cloudinary plugin', () => {
    render(<RichTextEditorImplementation value="" />);

    const options = useCKEditorMock.mock.calls.at(-1)?.[0];
    expect(options?.config).not.toHaveProperty('dctdUploadImage');
    expect(options?.config).not.toHaveProperty('extraPlugins');
    expect(options?.subscribeTo).toEqual(['instanceReady', 'change']);
  });
});
