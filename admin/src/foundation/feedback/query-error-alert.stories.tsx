import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryErrorAlert } from './query-error-alert';

const meta = {
  title: 'Foundation/Feedback/QueryErrorAlert',
  component: QueryErrorAlert,
  parameters: { layout: 'centered' },
  decorators: [(Story) => <div className="w-[680px] max-w-full"><Story /></div>],
} satisfies Meta<typeof QueryErrorAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recoverable: Story = {
  args: {
    error: new Error('Dịch vụ tạm thời không phản hồi.'),
    retry: () => undefined,
  },
};

export const WithoutRetry: Story = {
  args: { error: new Error('Không thể tải dữ liệu.') },
};
