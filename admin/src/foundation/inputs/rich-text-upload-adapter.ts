import type { FileLoader, UploadAdapter, UploadResponse } from 'ckeditor5';
import type { RichTextImageUploader } from './rich-text-editor';

export class RichTextUploadAdapter implements UploadAdapter {
  private readonly abortController = new AbortController();

  constructor(
    private readonly loader: FileLoader,
    private readonly uploadImage: RichTextImageUploader,
  ) {}

  async upload(): Promise<UploadResponse> {
    const file = await this.loader.file;
    if (!file) {
      throw new Error('Không tìm thấy tệp ảnh để tải lên.');
    }

    const url = await this.uploadImage(file, this.abortController.signal);
    return { default: url };
  }

  abort() {
    this.abortController.abort();
  }
}
