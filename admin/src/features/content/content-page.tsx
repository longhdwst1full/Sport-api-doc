import { PlusOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Skeleton, Table, Tag, Typography } from 'antd';
import { lazy, Suspense, useState } from 'react';
import { PermissionGate } from '@/core/auth/permissions';
import { useListAdminPosts } from '@/generated/api/content/content';

const ContentEditorDrawer = lazy(() =>
  import('./content-editor-drawer').then((module) => ({ default: module.ContentEditorDrawer })),
);

export function ContentPage() {
  const [editorOpen, setEditorOpen] = useState(false);
  const query = useListAdminPosts();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography.Text type="secondary">CMS</Typography.Text>
          <Typography.Title level={2} className="!mb-0 !mt-1">
            Bài viết
          </Typography.Title>
        </div>
        <PermissionGate permission="content.post.manage">
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => setEditorOpen(true)}
          >
            Soạn bài viết
          </Button>
        </PermissionGate>
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
      {editorOpen && (
        <Suspense fallback={<Skeleton active />}>
          <ContentEditorDrawer open={editorOpen} onClose={() => setEditorOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
