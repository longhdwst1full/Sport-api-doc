import { EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Progress, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { PermissionGate } from '@/core/auth/permissions';
import { QueryErrorAlert } from '@/foundation/feedback/query-error-alert';
import { useListInventoryBalances } from '@/generated/api/inventory/inventory';
import type { InventoryBalanceDto } from '@/generated/api/inventory/models';
import { StockAdjustmentDrawer } from './stock-adjustment-drawer';

const status = {
  IN_STOCK: { color: 'green', label: 'Còn hàng' },
  LOW_STOCK: { color: 'orange', label: 'Sắp hết' },
  OUT_OF_STOCK: { color: 'red', label: 'Hết hàng' },
} as const;

export function InventoryPage() {
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [selectedBalance, setSelectedBalance] = useState<InventoryBalanceDto>();
  const query = useListInventoryBalances();

  const openAdjustment = (balance?: InventoryBalanceDto) => {
    setSelectedBalance(balance);
    setAdjustmentOpen(true);
  };

  const closeAdjustment = () => {
    setAdjustmentOpen(false);
    setSelectedBalance(undefined);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <Typography.Text type="secondary">INVENTORY</Typography.Text>
          <Typography.Title level={2} className="!mb-0 !mt-1">
            Tồn kho cơ bản
          </Typography.Title>
        </div>
        <div className="flex gap-2">
          <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()}>Làm mới</Button>
          <PermissionGate permission="inventory.stock.adjust">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openAdjustment()}>Điều chỉnh tồn</Button>
          </PermissionGate>
        </div>
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
            {
              title: 'Thao tác',
              key: 'actions',
              fixed: 'right',
              width: 120,
              render: (_, row) => (
                <PermissionGate permission="inventory.stock.adjust">
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openAdjustment(row)}
                  >
                    Điều chỉnh
                  </Button>
                </PermissionGate>
              ),
            },
          ]}
        />
      </Card>
      {adjustmentOpen && (
        <StockAdjustmentDrawer
          open={adjustmentOpen}
          balances={query.data?.items ?? []}
          balance={selectedBalance}
          onClose={closeAdjustment}
        />
      )}
    </div>
  );
}
