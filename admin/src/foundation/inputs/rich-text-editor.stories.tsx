import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { RichTextEditor } from './rich-text-editor';

const SAMPLE_DESCRIPTION = `
  <h2>Máy chạy bộ DCTD Pro X1</h2>
  <p>Thiết kế gọn cho gia đình, hỗ trợ bài tập đi bộ và chạy bộ hằng ngày.</p>
  <ul>
    <li>Động cơ vận hành êm</li>
    <li>Màn hình theo dõi thời gian và quãng đường</li>
    <li>Khung máy bảo hành theo chính sách sản phẩm</li>
  </ul>
`;

const meta = {
  title: 'Foundation/Inputs/RichTextEditor',
  component: RichTextEditor,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'CKEditor 4 được lazy-load từ CDN bằng scriptUrl. Story cần kết nối Internet để tải editor; HTML được đồng bộ lại khi dữ liệu API về sau lúc editor khởi tạo.',
      },
    },
  },
  argTypes: {
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
    editorUrl: { control: 'text' },
    onChange: { action: 'content changed' },
  },
} satisfies Meta<typeof RichTextEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  args: {
    value: '<p>Bắt đầu nhập mô tả sản phẩm...</p>',
    disabled: false,
    placeholder: 'Nhập nội dung...',
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value ?? '');
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <RichTextEditor {...args} value={value} onChange={setValue} />
        <details className="rounded-xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold">HTML hiện tại</summary>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-slate-600">{value}</pre>
        </details>
      </div>
    );
  },
};

export const ExistingProductContent: Story = {
  args: { value: SAMPLE_DESCRIPTION },
};

export const ReadOnly: Story = {
  args: { value: SAMPLE_DESCRIPTION, disabled: true },
};
