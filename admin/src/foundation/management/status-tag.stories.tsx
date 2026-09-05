import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusTag } from './status-tag';

const PRODUCT_STATUS = {
  DRAFT: { label: 'Bản nháp', color: 'gold' },
  PUBLISHED: { label: 'Đang bán', color: 'green' },
  ARCHIVED: { label: 'Đã lưu trữ', color: 'default' },
} as const;

const meta = {
  title: 'Foundation/Management/StatusTag',
  component: StatusTag,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StatusTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductStatuses: Story = {
  args: {
    status: 'DRAFT',
    presentations: PRODUCT_STATUS,
  },
  render: () => (
    <div className="flex gap-3">
      {Object.keys(PRODUCT_STATUS).map((status) => (
        <StatusTag
          key={status}
          status={status as keyof typeof PRODUCT_STATUS}
          presentations={PRODUCT_STATUS}
        />
      ))}
    </div>
  ),
};
