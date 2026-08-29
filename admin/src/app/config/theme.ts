import type { ThemeConfig } from 'antd';

export const ADMIN_THEME: ThemeConfig = {
  token: {
    colorPrimary: '#16a56a',
    borderRadius: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  components: {
    Layout: { headerBg: '#ffffff', siderBg: '#10231a' },
    Table: { headerBg: '#f8fafc' },
  },
};
