import { Tag } from "antd";

export interface StatusPresentation {
  label: string;
  color: string;
}

interface StatusTagProps<TStatus extends string> {
  status: TStatus;
  presentations: Record<TStatus, StatusPresentation>;
}

export function StatusTag<TStatus extends string>({
  status,
  presentations,
}: StatusTagProps<TStatus>) {
  const presentation = presentations[status];
  return <Tag color={presentation.color}>{presentation.label}</Tag>;
}
