import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Drawer, Form, Input, Select } from 'antd';
import { useState } from 'react';
import {
  getListAdminPostsQueryKey,
  useCreateAdminPost,
} from '@/generated/api/content/content';
import {
  CreateContentPostDtoPostType,
  type CreateContentPostDtoPostType as PostType,
} from '@/generated/api/content/models/createContentPostDtoPostType';
import { ImageUploadField } from '@/features/media/image-upload-field';
import { RichTextEditor } from '@/foundation/inputs/rich-text-editor';
import { getApiErrorMessage } from '@/lib/api/error';
import { uploadImage } from '@/lib/media/upload-image';

const uploadRichTextImage = async (file: File, signal: AbortSignal) =>
  (await uploadImage(file, signal)).secureUrl;

export function ContentEditorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [postType, setPostType] = useState<PostType>(CreateContentPostDtoPostType.NEWS);
  const [excerpt, setExcerpt] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [relatedProducts, setRelatedProducts] = useState('');
  const [body, setBody] = useState('');
  const createPost = useCreateAdminPost({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdminPostsQueryKey() });
        void message.success('Đã tạo và xuất bản bài viết');
        setTitle('');
        setSlug('');
        setExcerpt('');
        setCoverUrl('');
        setRelatedProducts('');
        setBody('');
        onClose();
      },
      onError: (error) =>
        void message.error(
          getApiErrorMessage(error, 'Không thể tạo bài viết. Vui lòng kiểm tra lại.'),
        ),
    },
  });

  const submit = () => {
    if (!title.trim() || !slug.trim() || !excerpt.trim() || !coverUrl.trim() || !body.trim()) {
      void message.warning('Điền đủ tiêu đề, slug, mô tả, ảnh và nội dung.');
      return;
    }
    createPost.mutate({
      data: {
        title: title.trim(),
        slug: slug.trim(),
        postType,
        excerpt: excerpt.trim(),
        coverUrl: coverUrl.trim(),
        body,
        relatedProductSlugs: relatedProducts
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      },
    });
  };

  return (
    <Drawer
      title="Soạn bài viết"
      width={820}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button
          type="primary"
          loading={createPost.isPending}
          onClick={submit}
        >
          Tạo và xuất bản
        </Button>
      }
    >
      <Form layout="vertical">
        <Form.Item label="Tiêu đề" required>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Form.Item>
        <div className="grid gap-4 sm:grid-cols-2">
          <Form.Item label="Slug" required>
            <Input value={slug} onChange={(event) => setSlug(event.target.value)} />
          </Form.Item>
          <Form.Item label="Loại bài viết" required>
            <Select
              value={postType}
              onChange={setPostType}
              options={Object.values(CreateContentPostDtoPostType).map((value) => ({
                value,
                label: value.replaceAll('_', ' '),
              }))}
            />
          </Form.Item>
        </div>
        <Form.Item label="Mô tả ngắn" required>
          <Input.TextArea
            rows={2}
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
          />
        </Form.Item>
        <Form.Item label="Ảnh bìa" required>
          <ImageUploadField value={coverUrl} onChange={setCoverUrl} />
        </Form.Item>
        <Form.Item label="Slug sản phẩm liên quan" extra="Phân tách bằng dấu phẩy">
          <Input
            value={relatedProducts}
            onChange={(event) => setRelatedProducts(event.target.value)}
          />
        </Form.Item>
        <Form.Item label="Nội dung" required>
          <RichTextEditor
            value={body}
            onChange={setBody}
            uploadImage={uploadRichTextImage}
            placeholder="Soạn nội dung bài viết..."
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
