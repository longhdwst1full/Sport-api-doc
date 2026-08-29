import type { FileLoader } from 'ckeditor5';
import { describe, expect, it, vi } from 'vitest';
import { RichTextUploadAdapter } from './rich-text-upload-adapter';

function loaderWith(file: File | null): FileLoader {
  return { file: Promise.resolve(file) } as FileLoader;
}

describe('RichTextUploadAdapter', () => {
  it('maps the uploaded image URL to the CKEditor default response', async () => {
    const file = new File(['image'], 'product.webp', { type: 'image/webp' });
    const uploadImage = vi.fn().mockResolvedValue('https://cdn.example.com/product.webp');
    const adapter = new RichTextUploadAdapter(loaderWith(file), uploadImage);

    await expect(adapter.upload()).resolves.toEqual({
      default: 'https://cdn.example.com/product.webp',
    });
    expect(uploadImage).toHaveBeenCalledWith(file, expect.any(AbortSignal));
  });

  it('fails clearly when CKEditor does not provide a file', async () => {
    const adapter = new RichTextUploadAdapter(loaderWith(null), vi.fn());

    await expect(adapter.upload()).rejects.toThrow('Không tìm thấy tệp ảnh để tải lên.');
  });

  it('aborts the active upload signal', async () => {
    const file = new File(['image'], 'product.png', { type: 'image/png' });
    let uploadSignal: AbortSignal | undefined;
    const adapter = new RichTextUploadAdapter(loaderWith(file), async (_, signal) => {
      uploadSignal = signal;
      return 'https://cdn.example.com/product.png';
    });

    await adapter.upload();
    adapter.abort();

    expect(uploadSignal?.aborted).toBe(true);
  });
});
