import { useState } from "react";
import {
  LockOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Avatar, Space, Table, Tabs, Tag, Typography } from "antd";
import { ManagementPage, StatusTag } from "@/foundation/management";

type UserStatus = "ACTIVE" | "INVITED" | "LOCKED";

const userStatuses: Record<UserStatus, { color: string; label: string }> = {
  ACTIVE: { color: "green", label: "Hoạt động" },
  INVITED: { color: "blue", label: "Đã mời" },
  LOCKED: { color: "red", label: "Đã khóa" },
};

const users = [
  {
    id: "USR-001",
    name: "Long Hoàng",
    email: "long.hoang@dctd.vn",
    role: "Super Admin",
    scope: "Toàn hệ thống",
    status: "ACTIVE" as UserStatus,
    lastActive: "Vừa xong",
  },
  {
    id: "USR-007",
    name: "Nguyễn Hoàng Nam",
    email: "nam.nguyen@dctd.vn",
    role: "Branch Manager",
    scope: "CN-HCM-01",
    status: "ACTIVE" as UserStatus,
    lastActive: "12 phút trước",
  },
  {
    id: "USR-009",
    name: "Trần Hải Yến",
    email: "yen.tran@dctd.vn",
    role: "Warehouse Staff",
    scope: "KHO-HN-01",
    status: "INVITED" as UserStatus,
    lastActive: "Chưa đăng nhập",
  },
];

const roles = [
  {
    key: "super-admin",
    name: "Super Admin",
    users: 1,
    scope: "Toàn hệ thống",
    permissions: ["system.*"],
    description: "Quản trị cấu hình, phân quyền và toàn bộ module.",
  },
  {
    key: "branch-manager",
    name: "Branch Manager",
    users: 1,
    scope: "Theo chi nhánh",
    permissions: ["order.*", "customer.view", "inventory.stock.view"],
    description: "Điều hành bán hàng, khách hàng và tồn kho trong chi nhánh.",
  },
  {
    key: "warehouse-staff",
    name: "Warehouse Staff",
    users: 1,
    scope: "Theo kho",
    permissions: ["inventory.stock.view", "inventory.stock.adjust"],
    description: "Xử lý kho, kiểm kê và hàng hoàn về kho được gán.",
  },
  {
    key: "content-editor",
    name: "Content Editor",
    users: 0,
    scope: "Nội dung",
    permissions: ["content.post.*", "review.moderate"],
    description: "Quản lý bài viết, giới thiệu và kiểm duyệt đánh giá.",
  },
];

export function AccessPage() {
  const [activeTab, setActiveTab] = useState("users");
  return (
    <ManagementPage
      eyebrow="Identity & access"
      title="Người dùng & phân quyền"
      description="RBAC theo vai trò kết hợp scope chi nhánh/kho; backend luôn là nguồn quyết định quyền cuối cùng."
      dataNotice="Dữ liệu hiện là fixture review. Trong môi trường development, flag FE đang mở toàn quyền để phát triển UI; production mặc định tắt bypass."
      metrics={[
        {
          key: "users",
          label: "Người dùng mẫu",
          value: users.length,
          icon: <UserOutlined />,
        },
        {
          key: "roles",
          label: "Vai trò",
          value: roles.length,
          icon: <TeamOutlined />,
          tone: "blue",
        },
        {
          key: "scoped",
          label: "Vai trò có scope",
          value: 2,
          icon: <SafetyCertificateOutlined />,
          tone: "green",
        },
        {
          key: "locked",
          label: "Tài khoản khóa",
          value: users.filter((user) => user.status === "LOCKED").length,
          icon: <LockOutlined />,
          tone: "red",
        },
      ]}
    >
      <Alert
        className="mb-5"
        showIcon
        type="warning"
        message="Dev bypass chỉ áp dụng hiển thị phía frontend"
        description="API vẫn phải kiểm tra quyền, transition trạng thái và scope dữ liệu; không dùng flag frontend làm cơ chế bảo mật."
      />
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "users",
            label: "Người dùng",
            children: (
              <Table
                rowKey="id"
                dataSource={users}
                pagination={false}
                scroll={{ x: 820 }}
                columns={[
                  {
                    title: "Người dùng",
                    dataIndex: "name",
                    width: 240,
                    render: (value, row) => (
                      <Space>
                        <Avatar>{value.slice(0, 1)}</Avatar>
                        <div>
                          <Typography.Text strong>{value}</Typography.Text>
                          <div className="text-xs text-slate-500">
                            {row.email}
                          </div>
                        </div>
                      </Space>
                    ),
                  },
                  {
                    title: "Vai trò",
                    dataIndex: "role",
                    width: 180,
                    render: (value) => <Tag color="blue">{value}</Tag>,
                  },
                  { title: "Phạm vi dữ liệu", dataIndex: "scope", width: 180 },
                  {
                    title: "Hoạt động gần nhất",
                    dataIndex: "lastActive",
                    width: 160,
                  },
                  {
                    title: "Trạng thái",
                    dataIndex: "status",
                    width: 140,
                    render: (value: UserStatus) => (
                      <StatusTag status={value} presentations={userStatuses} />
                    ),
                  },
                ]}
              />
            ),
          },
          {
            key: "roles",
            label: "Vai trò & quyền",
            children: (
              <Table
                rowKey="key"
                dataSource={roles}
                pagination={false}
                scroll={{ x: 860 }}
                columns={[
                  {
                    title: "Vai trò",
                    dataIndex: "name",
                    width: 190,
                    render: (value, row) => (
                      <div>
                        <strong>{value}</strong>
                        <div className="text-xs text-slate-500">
                          {row.description}
                        </div>
                      </div>
                    ),
                  },
                  { title: "Phạm vi", dataIndex: "scope", width: 160 },
                  {
                    title: "Người dùng",
                    dataIndex: "users",
                    align: "center",
                    width: 110,
                  },
                  {
                    title: "Permission keys",
                    dataIndex: "permissions",
                    render: (values: string[]) => (
                      <Space size={[4, 4]} wrap>
                        {values.map((value) => (
                          <Tag key={value}>{value}</Tag>
                        ))}
                      </Space>
                    ),
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </ManagementPage>
  );
}
