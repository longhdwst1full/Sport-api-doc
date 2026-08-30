import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Popconfirm, Rate, Space, Table, Tag, Typography } from 'antd';
import { PermissionGate } from '@/core/auth/permissions';
import { QueryErrorAlert } from '@/foundation/feedback/query-error-alert';
import {
  getListAdminReviewsQueryKey,
  useListAdminReviews,
  useModerateAdminReview,
} from '@/generated/api/reviews/reviews';
import { getApiErrorMessage } from '@/lib/api/error';

export function ReviewsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const query = useListAdminReviews();
  const moderate = useModerateAdminReview({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdminReviewsQueryKey() });
        void message.success('Đã cập nhật trạng thái đánh giá.');
      },
      onError: (error) =>
        void message.error(getApiErrorMessage(error, 'Không thể kiểm duyệt đánh giá.')),
    },
  });
  return (
    <div className="space-y-6">
      <div>
        <Typography.Text type="secondary">CUSTOMER VOICE</Typography.Text>
        <Typography.Title level={2} className="!mb-0 !mt-1">
          Đánh giá sản phẩm
        </Typography.Title>
      </div>
      <Card>
        {query.isError && (
          <div className="mb-4">
            <QueryErrorAlert error={query.error} retry={() => void query.refetch()} />
          </div>
        )}
        <Table
          rowKey="id"
          loading={query.isPending}
          dataSource={query.data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: 'Khách',
              dataIndex: 'customerDisplayName',
              render: (value, row) => (
                <div>
                  <strong>{value}</strong>
                  <div className="text-xs text-gray-500">
                    {row.verifiedPurchase ? 'Đã mua hàng' : 'Chưa xác minh'}
                  </div>
                </div>
              ),
            },
            {
              title: 'Đánh giá',
              dataIndex: 'rating',
              render: (value) => <Rate disabled value={value} />,
            },
            { title: 'Nội dung', dataIndex: 'content' },
            {
              title: 'Phản hồi',
              dataIndex: 'comments',
              align: 'center',
              render: (value: unknown[]) => value.length,
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              render: (value) => (
                <Tag
                  color={value === 'APPROVED' ? 'green' : value === 'REJECTED' ? 'red' : 'orange'}
                >
                  {value}
                </Tag>
              ),
            },
            {
              title: 'Kiểm duyệt',
              key: 'actions',
              width: 230,
              align: 'right',
              render: (_, row) => (
                <PermissionGate permission="review.moderate">
                  <Space>
                    <Popconfirm
                      title="Duyệt đánh giá này?"
                      description="Đánh giá sẽ hiển thị trên trang sản phẩm."
                      disabled={row.status === 'APPROVED'}
                      onConfirm={() =>
                        moderate.mutate({ id: row.id, data: { status: 'APPROVED' } })
                      }
                    >
                      <Button
                        type="primary"
                        ghost
                        disabled={row.status === 'APPROVED'}
                        loading={moderate.isPending && moderate.variables?.id === row.id}
                        icon={<CheckOutlined />}
                      >
                        Duyệt
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title="Từ chối đánh giá này?"
                      description="Đánh giá sẽ không hiển thị công khai."
                      disabled={row.status === 'REJECTED'}
                      onConfirm={() =>
                        moderate.mutate({
                          id: row.id,
                          data: { status: 'REJECTED', reason: 'Không phù hợp chính sách hiển thị' },
                        })
                      }
                    >
                      <Button
                        danger
                        disabled={row.status === 'REJECTED'}
                        loading={moderate.isPending && moderate.variables?.id === row.id}
                        icon={<CloseOutlined />}
                      >
                        Từ chối
                      </Button>
                    </Popconfirm>
                  </Space>
                </PermissionGate>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
