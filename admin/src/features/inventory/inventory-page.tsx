import { ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Progress, Table, Tag, Typography } from 'antd';
import { useListInventoryBalances } from '@/generated/api/inventory/inventory';

const status = {
  IN_STOCK: { color: 'green', label: 'Còn hàng' },
  LOW_STOCK: { color: 'orange', label: 'Sắp hết' },
  OUT_OF_STOCK: { color: 'red', label: 'Hết hàng' },
} as const;

export function InventoryPage() {
  const query = useListInventoryBalances();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Typography.Text type="secondary">INVENTORY</Typography.Text>
          <Typography.Title level={2} className="!mb-0 !mt-1">
            Tồn kho cơ bản
          </Typography.Title>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()}>
          Làm mới
        </Button>
      </div>
      <Card>
        <Table
          rowKey="id"
          loading={query.isPending}
          dataSource={query.data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: 'SKU',
              dataIndex: 'sku',
              render: (value, row) => (
                <div>
                  <strong>{value}</strong>
                  <div className="text-xs text-gray-500">{row.productName}</div>
                </div>
              ),
            },
            { title: 'Kho', dataIndex: 'warehouseCode' },
            { title: 'Tồn vật lý', dataIndex: 'onHand', align: 'right' },
            { title: 'Đang giữ', dataIndex: 'reserved', align: 'right' },
            {
              title: 'Có thể bán',
              dataIndex: 'available',
              align: 'right',
              render: (value, row) => (
                <div className="min-w-28">
                  <strong>{value}</strong>
                  <Progress
                    percent={row.onHand ? Math.round((value / row.onHand) * 100) : 0}
                    showInfo={false}
                    size="small"
                  />
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              render: (value: keyof typeof status) => (
                <Tag color={status[value].color}>{status[value].label}</Tag>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
