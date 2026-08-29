import {
  AppstoreOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { Card, Col, Progress, Row, Table, Tag, Typography } from 'antd';
import { useListSystemModules } from '@/generated/api/admin-system/admin-system';

export function DashboardPage() {
  const query = useListSystemModules();
  const data = query.data;
  const active = data?.items.filter((item) => item.status === 'ACTIVE').length ?? 0;
  const cards = [
    {
      label: 'Model đã rà soát',
      value: data?.totalModels ?? 0,
      icon: <DatabaseOutlined />,
      color: '#1677ff',
    },
    { label: 'Bảng P0', value: data?.p0Models ?? 0, icon: <RocketOutlined />, color: '#16a56a' },
    { label: 'Bảng P1', value: data?.p1Models ?? 0, icon: <AppstoreOutlined />, color: '#722ed1' },
    { label: 'Module có API', value: active, icon: <CheckCircleOutlined />, color: '#fa8c16' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Typography.Text type="secondary">DCTD COMMERCE V1</Typography.Text>
        <Typography.Title level={2} className="!mb-0 !mt-1">
          Tổng quan hệ thống
        </Typography.Title>
      </div>
      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col xs={24} sm={12} xl={6} key={card.label}>
            <Card loading={query.isPending}>
              <div className="flex items-center justify-between">
                <div>
                  <Typography.Text type="secondary">{card.label}</Typography.Text>
                  <div className="mt-2 text-3xl font-bold">{card.value}</div>
                </div>
                <span
                  className="grid size-12 place-items-center rounded-2xl text-xl"
                  style={{ background: `${card.color}16`, color: card.color }}
                >
                  {card.icon}
                </span>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Card
        title="Tiến độ bounded context"
        extra={
          <Progress
            type="circle"
            size={44}
            percent={data?.items.length ? Math.round((active / data.items.length) * 100) : 0}
          />
        }
      >
        <Table
          rowKey="key"
          loading={query.isPending}
          dataSource={data?.items ?? []}
          pagination={false}
          columns={[
            {
              title: 'Module',
              dataIndex: 'name',
              render: (value, row) => (
                <div>
                  <strong>{value}</strong>
                  <div className="text-xs text-gray-500">{row.key}</div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              render: (value) => (
                <Tag color={value === 'ACTIVE' ? 'green' : 'default'}>
                  {value === 'ACTIVE' ? 'Đã có API' : 'Đã scaffold'}
                </Tag>
              ),
            },
            { title: 'P0', dataIndex: 'p0Count', align: 'center' },
            { title: 'P1', dataIndex: 'p1Count', align: 'center' },
            {
              title: 'Bảng',
              dataIndex: 'tables',
              responsive: ['lg'],
              render: (tables: string[]) => (
                <span className="text-xs text-gray-500">{tables.join(', ')}</span>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
