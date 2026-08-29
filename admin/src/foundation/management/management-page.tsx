import type { ReactNode } from "react";
import { Alert, Card, Col, Row, Statistic, Typography } from "antd";

export interface ManagementMetric {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "blue" | "green" | "orange" | "red";
}

interface ManagementPageProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  metrics?: ManagementMetric[];
  filters?: ReactNode;
  dataNotice?: string;
  children: ReactNode;
}

const toneClasses: Record<NonNullable<ManagementMetric["tone"]>, string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  orange: "bg-amber-50 text-amber-600",
  red: "bg-rose-50 text-rose-600",
};

export function ManagementPage({
  eyebrow,
  title,
  description,
  actions,
  metrics = [],
  filters,
  dataNotice,
  children,
}: ManagementPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <Typography.Text
            className="!text-xs !font-semibold !tracking-[0.16em]"
            type="secondary"
          >
            {eyebrow.toUpperCase()}
          </Typography.Text>
          <Typography.Title level={2} className="!mb-1 !mt-1">
            {title}
          </Typography.Title>
          {description && (
            <Typography.Text type="secondary">{description}</Typography.Text>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>

      {dataNotice && (
        <Alert
          showIcon
          type="info"
          message="Màn hình base để review"
          description={dataNotice}
        />
      )}

      {metrics.length > 0 && (
        <Row gutter={[16, 16]}>
          {metrics.map((metric) => (
            <Col key={metric.key} xs={24} sm={12} xl={6}>
              <Card className="h-full" styles={{ body: { padding: 20 } }}>
                <div className="flex items-start justify-between gap-3">
                  <Statistic title={metric.label} value={metric.value} />
                  {metric.icon && (
                    <span
                      className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg ${toneClasses[metric.tone ?? "blue"]}`}
                    >
                      {metric.icon}
                    </span>
                  )}
                </div>
                {metric.hint && (
                  <div className="mt-2 text-xs text-slate-500">
                    {metric.hint}
                  </div>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Card styles={{ body: { padding: 0 } }}>
        {filters && (
          <div className="border-b border-slate-100 p-4 lg:p-5">{filters}</div>
        )}
        <div className="p-4 lg:p-5">{children}</div>
      </Card>
    </div>
  );
}
