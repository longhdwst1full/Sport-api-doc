import { Card, Rate, Table, Tag, Typography } from 'antd';
import { useListAdminReviews } from '@/generated/api/reviews/reviews';

export function ReviewsPage() {
  const query = useListAdminReviews();
  return (
    <div className="space-y-6">
      <div>
        <Typography.Text type="secondary">CUSTOMER VOICE</Typography.Text>
        <Typography.Title level={2} className="!mb-0 !mt-1">
          Đánh giá sản phẩm
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
          ]}
        />
      </Card>
    </div>
  );
}
