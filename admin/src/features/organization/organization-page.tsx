import {
  BankOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { Descriptions, Table, Tag, Typography } from "antd";
import { ManagementPage, StatusTag } from "@/foundation/management";

type OrganizationStatus = "ACTIVE" | "INACTIVE";

interface BranchWarehouseRow {
  branchCode: string;
  branchName: string;
  warehouseCode: string;
  warehouseName: string;
  address: string;
  manager: string;
  status: OrganizationStatus;
}

const organizationStatuses: Record<
  OrganizationStatus,
  { color: string; label: string }
> = {
  ACTIVE: { color: "green", label: "Đang hoạt động" },
  INACTIVE: { color: "default", label: "Ngừng hoạt động" },
};

const rows: BranchWarehouseRow[] = [
  {
    branchCode: "CN-HCM-01",
    branchName: "Chi nhánh Hồ Chí Minh",
    warehouseCode: "KHO-HCM-01",
    warehouseName: "Kho bán hàng Hồ Chí Minh",
    address: "Quận 7, TP. Hồ Chí Minh",
    manager: "Nguyễn Hoàng Nam",
    status: "ACTIVE",
  },
  {
    branchCode: "CN-HN-01",
    branchName: "Chi nhánh Hà Nội",
    warehouseCode: "KHO-HN-01",
    warehouseName: "Kho bán hàng Hà Nội",
    address: "Cầu Giấy, Hà Nội",
    manager: "Trần Hải Yến",
    status: "ACTIVE",
  },
];

export function OrganizationPage() {
  return (
    <ManagementPage
      eyebrow="Organization"
      title="Chi nhánh & kho"
      description="Cấu trúc vận hành V1: mỗi chi nhánh sở hữu đúng một kho bán hàng."
      dataNotice="Màn hình dùng dữ liệu mẫu để chốt quan hệ. API organization/warehouse master chưa active; tồn kho hiện vẫn lấy từ inventory API."
      metrics={[
        {
          key: "branches",
          label: "Chi nhánh",
          value: rows.length,
          icon: <BankOutlined />,
        },
        {
          key: "warehouses",
          label: "Kho bán hàng",
          value: rows.length,
          icon: <InboxOutlined />,
          tone: "orange",
        },
        {
          key: "mapping",
          label: "Quan hệ",
          value: "1 : 1",
          icon: <LinkOutlined />,
          tone: "green",
          hint: "Một branch — một warehouse",
        },
        {
          key: "regions",
          label: "Khu vực",
          value: 2,
          icon: <EnvironmentOutlined />,
          tone: "blue",
        },
      ]}
    >
      <Table
        rowKey="branchCode"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        expandable={{
          expandedRowRender: (row) => (
            <Descriptions
              size="small"
              column={{ xs: 1, md: 2 }}
              className="py-2"
            >
              <Descriptions.Item label="Chi nhánh">
                {row.branchName} ({row.branchCode})
              </Descriptions.Item>
              <Descriptions.Item label="Kho liên kết">
                {row.warehouseName} ({row.warehouseCode})
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">
                {row.address}
              </Descriptions.Item>
              <Descriptions.Item label="Quản lý">
                {row.manager}
              </Descriptions.Item>
            </Descriptions>
          ),
        }}
        columns={[
          {
            title: "Mã chi nhánh",
            dataIndex: "branchCode",
            width: 150,
            render: (value) => <Typography.Text code>{value}</Typography.Text>,
          },
          {
            title: "Chi nhánh",
            dataIndex: "branchName",
            width: 240,
            render: (value) => <strong>{value}</strong>,
          },
          {
            title: "Kho duy nhất",
            dataIndex: "warehouseName",
            width: 260,
            render: (value, row) => (
              <div>
                <strong>{value}</strong>
                <div className="text-xs text-slate-500">
                  {row.warehouseCode}
                </div>
              </div>
            ),
          },
          { title: "Quản lý", dataIndex: "manager", width: 180 },
          { title: "Khu vực", dataIndex: "address", width: 220 },
          {
            title: "Mô hình",
            key: "relation",
            width: 120,
            render: () => <Tag color="blue">1 branch : 1 kho</Tag>,
          },
          {
            title: "Trạng thái",
            dataIndex: "status",
            width: 150,
            render: (value: OrganizationStatus) => (
              <StatusTag status={value} presentations={organizationStatuses} />
            ),
          },
        ]}
      />
    </ManagementPage>
  );
}
