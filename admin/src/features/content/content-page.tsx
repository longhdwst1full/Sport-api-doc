import { Avatar, Card, Table, Tag, Typography } from 'antd';
import { useListAdminPosts } from '@/generated/api/admin-content/admin-content';

export function ContentPage() {
  const query = useListAdminPosts();
  return (
    <div className="space-y-6">
      <div>
        <Typography.Text type="secondary">CMS</Typography.Text>
        <Typography.Title level={2} className="!mb-0 !mt-1">
          Bài viết
        </Typography.Title>
      </div>
      <Card>
        <Table
          rowKey="id"
          loading={query.isPending}
          dataSource={query.data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: 'Bài viết',
              dataIndex: 'title',
              render: (value, row) => (
                <div className="flex items-center gap-3">
                  <Avatar shape="square" size={48} src={row.coverUrl} />
                  <div>
                    <strong>{value}</strong>
                    <div className="text-xs text-gray-500">/{row.slug}</div>
                  </div>
                </div>
              ),
            },
            {
              title: 'Loại',
              dataIndex: 'postType',
              render: (value) => <Tag>{String(value).replaceAll('_', ' ')}</Tag>,
            },
            {
              title: 'Liên quan SP',
              dataIndex: 'relatedProductSlugs',
              render: (value: string[]) => value.length,
            },
            {
              title: 'Xuất bản',
              dataIndex: 'publishedAt',
              render: (value) => new Date(value).toLocaleDateString('vi-VN'),
            },
          ]}
        />
      </Card>
    </div>
  );
}
