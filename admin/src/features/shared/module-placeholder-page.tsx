import { AppstoreOutlined } from '@ant-design/icons';
import { Empty, Typography } from 'antd';

export function ModulePlaceholderPage({ title, moduleKey }: { title: string; moduleKey: string }) {
  return (
    <div className="rounded-3xl bg-white p-12 text-center">
      <Empty image={<AppstoreOutlined className="text-5xl text-admin-500" />} description={false}>
        <Typography.Title level={3}>{title}</Typography.Title>
        <Typography.Paragraph type="secondary">
          Bounded context <code>{moduleKey}</code> đã được scaffold theo model V1; API use case sẽ
          mở ở wave triển khai tương ứng.
        </Typography.Paragraph>
      </Empty>
    </div>
  );
}
