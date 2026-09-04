// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RichTextEditorImplementation } from './rich-text-editor-implementation';

const { ckEditorMock } = vi.hoisted(() => ({
  ckEditorMock: vi.fn((options: {
    config?: Record<string, unknown>;
    editorUrl?: string;
    initData?: string;
  }) => {
    void options;
    return null;
  }),
}));

vi.mock('ckeditor4-react', () => ({
  CKEditor: ckEditorMock,
}));

describe('RichTextEditorImplementation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps content editable through the HTML fallback when CKEditor loading times out', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();

    render(
      <RichTextEditorImplementation
        value="<p>Nội dung ban đầu</p>"
        onChange={onChange}
      />,
    );

    act(() => vi.advanceTimersByTime(10_000));
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

    const options = ckEditorMock.mock.calls.at(-1)?.[0];
    expect(options?.config).not.toHaveProperty('dctdUploadImage');
    expect(options?.config).not.toHaveProperty('extraPlugins');
    expect(options?.editorUrl).toBe('https://cdn.ckeditor.com/4.25.1-lts/full-all/ckeditor.js');
  });
});
