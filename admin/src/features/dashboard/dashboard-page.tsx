import {
  AppstoreOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { Card, Col, Progress, Row, Typography } from 'antd';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useListSystemModules } from '@/generated/api/system/system';
import { SystemModuleList } from './components/system-module-list';

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
  const chartData = (data?.items ?? []).map((item) => ({
    name: item.name,
    P0: item.p0Count,
    P1: item.p1Count,
  }));

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
      <Card title="Phân bổ model theo module" loading={query.isPending}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 0, right: 12, top: 8, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" angle={-20} textAnchor="end" height={64} interval={0} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="P0" fill="#16a56a" radius={[5, 5, 0, 0]} />
              <Bar dataKey="P1" fill="#722ed1" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
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
        <div className="overflow-x-auto">
          <SystemModuleList items={data?.items ?? []} />
        </div>
      </Card>
    </div>
  );
}
