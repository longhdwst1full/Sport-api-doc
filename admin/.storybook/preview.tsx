import type { Preview } from '@storybook/react-vite';
import { App, ConfigProvider } from 'antd';
import 'antd/dist/reset.css';
import '../src/styles.css';
import { ADMIN_THEME } from '../src/app/config/theme';

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [
    (Story, context) => (
      <ConfigProvider theme={ADMIN_THEME}>
        <App>
          <div
            className={
              context.parameters.layout === 'fullscreen'
                ? 'min-h-screen bg-slate-50 text-slate-900'
                : 'min-h-screen bg-slate-50 p-6 text-slate-900'
            }
          >
            <Story />
          </div>
        </App>
      </ConfigProvider>
    ),
  ],
  parameters: {
    controls: {
      expanded: true,
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
