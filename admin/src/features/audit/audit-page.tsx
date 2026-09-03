import { EyeOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useListAdminAuditLogs } from '@/generated/api/audit/audit';
import type { AuditLogDto } from '@/generated/api/audit/models';
import { getApiErrorMessage } from '@/lib/api/error';

const { RangePicker } = DatePicker;
const PAGE_SIZE = 25;

function JsonSnapshot({ value }: { value: unknown }) {
  if (!value) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có snapshot" />;
  return (
    <pre className="max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-emerald-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function AuditPage() {
  const [action, setAction] = useState('');
  const [requestId, setRequestId] = useState('');
  const [entityType, setEntityType] = useState<string>();
  const [range, setRange] = useState<[string, string]>();
  const [selected, setSelected] = useState<AuditLogDto>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(0);
  const [debouncedAction] = useDebounce(action.trim(), 350);
  const [debouncedRequestId] = useDebounce(requestId.trim(), 350);

  useEffect(() => {
    setCursorHistory([undefined]);
    setPage(0);
  }, [debouncedAction, debouncedRequestId, entityType, range]);

  const query = useListAdminAuditLogs({
    limit: PAGE_SIZE,
    cursor: cursorHistory[page],
    action: debouncedAction || undefined,
    requestId: debouncedRequestId || undefined,
    entityType,
    from: range?.[0],
    to: range?.[1],
  });

  return (
    <div className="space-y-6">
      <div>
        <Typography.Text type="secondary">SECURITY & TRACEABILITY</Typography.Text>
        <Typography.Title level={2} style={{ margin: '4px 0 0' }}>Nhật ký hệ thống</Typography.Title>
        <Typography.Paragraph type="secondary" className="!mb-0">
          Dữ liệu chỉ đọc, đã che thông tin nhạy cảm và chỉ mở cho Chủ cửa hàng có phạm vi toàn hệ thống.
        </Typography.Paragraph>
      </div>

      <Card>
        <div className="mb-5 grid gap-3 lg:grid-cols-4">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Hành động, ví dụ catalog.price"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          />
          <Select
            allowClear
            placeholder="Loại dữ liệu"
            value={entityType}
            onChange={setEntityType}
            options={['USER', 'USER_ROLE_ASSIGNMENT', 'PRODUCT', 'PRODUCT_VARIANT', 'PRODUCT_PRICE', 'INVENTORY_BALANCE', 'MEDIA_ASSET'].map((value) => ({ value, label: value }))}
          />
          <Input
            allowClear
            placeholder="Request ID"
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
          />
          <RangePicker
            showTime
            className="w-full"
            onChange={(dates) => setRange(
              dates?.[0] && dates[1]
                ? [dates[0].toISOString(), dates[1].toISOString()]
                : undefined,
            )}
          />
        </div>

        {query.isError && (
          <Alert
            className="mb-4"
            showIcon
            type="error"
            message="Không tải được nhật ký"
            description={getApiErrorMessage(query.error, 'Vui lòng thử lại.')}
            action={<Button onClick={() => void query.refetch()}>Thử lại</Button>}
          />
        )}

        <Table
          rowKey="id"
          loading={query.isPending}
          dataSource={query.data?.items ?? []}
          pagination={false}
          locale={{ emptyText: 'Chưa có sự kiện phù hợp bộ lọc' }}
          columns={[
            {
              title: 'Thời gian',
              dataIndex: 'createdAt',
              width: 180,
              render: (value: string) => new Intl.DateTimeFormat('vi-VN', {
                dateStyle: 'short', timeStyle: 'medium',
              }).format(new Date(value)),
            },
            {
              title: 'Hành động',
              dataIndex: 'action',
              render: (value: string, row) => (
                <div>
                  <Typography.Text strong>{value}</Typography.Text>
                  <div><Tag className="mt-1">{row.entityType}</Tag></div>
                </div>
              ),
            },
            {
              title: 'Người thực hiện',
              render: (_, row) => (
                <div>
                  <span>{row.actorDisplayName ?? row.actorType}</span>
                  <div className="text-xs text-slate-500">{row.actorUserId ?? 'Không định danh'}</div>
                </div>
              ),
            },
            { title: 'Lý do', dataIndex: 'reason', render: (value) => value || '—' },
            {
              title: '',
              align: 'right',
              render: (_, row) => (
                <Button icon={<EyeOutlined />} onClick={() => setSelected(row)}>Xem</Button>
              ),
            },
          ]}
        />

        <div className="mt-5 flex items-center justify-between">
          <Typography.Text type="secondary">Trang {page + 1}</Typography.Text>
          <Space>
            <Button disabled={page === 0} onClick={() => setPage((value) => value - 1)}>
              Trang trước
            </Button>
            <Button
              type="primary"
              disabled={!query.data?.nextCursor}
              onClick={() => {
                const next = query.data?.nextCursor ?? undefined;
                setCursorHistory((history) => [...history.slice(0, page + 1), next]);
                setPage((value) => value + 1);
              }}
            >
              Trang sau
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()} />
          </Space>
        </div>
      </Card>

      <Drawer
        width={720}
        title="Chi tiết sự kiện audit"
        open={Boolean(selected)}
        onClose={() => setSelected(undefined)}
      >
        {selected && (
          <div className="space-y-5">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Action">{selected.action}</Descriptions.Item>
              <Descriptions.Item label="Entity">{selected.entityType} · {selected.entityId ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Request">{selected.requestId} / #{selected.sequenceNo}</Descriptions.Item>
              <Descriptions.Item label="Lý do">{selected.reason ?? '—'}</Descriptions.Item>
            </Descriptions>
            <div><Typography.Title level={5}>Trước thay đổi</Typography.Title><JsonSnapshot value={selected.before} /></div>
            <div><Typography.Title level={5}>Sau thay đổi</Typography.Title><JsonSnapshot value={selected.after} /></div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
