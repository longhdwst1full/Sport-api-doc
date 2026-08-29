import { useMemo, useState } from "react";
import {
  EyeOutlined,
  IdcardOutlined,
  SafetyCertificateOutlined,
  ShoppingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Avatar,
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { ManagementPage, StatusTag } from "@/foundation/management";
import {
  CUSTOMER_FIXTURES,
  type CustomerFixture,
  type CustomerStatus,
  type CustomerType,
} from "./customers.fixture";

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});
const customerStatuses: Record<
  CustomerStatus,
  { color: string; label: string }
> = {
  ACTIVE: { color: "green", label: "Hoạt động" },
  NEEDS_VERIFICATION: { color: "gold", label: "Cần xác minh" },
  BLOCKED: { color: "red", label: "Đã khóa" },
};

export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<CustomerType | undefined>();
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerFixture | null>(null);
  const rows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return CUSTOMER_FIXTURES.filter(
      (customer) =>
        (!type || customer.type === type) &&
        (!keyword ||
          [
            customer.id,
            customer.name,
            customer.phone,
            customer.email ?? "",
          ].some((value) => value.toLocaleLowerCase("vi").includes(keyword))),
    );
  }, [search, type]);

  return (
    <>
      <ManagementPage
        eyebrow="Customer 360"
        title="Quản lý khách hàng"
        description="Một hồ sơ khách thống nhất cho tài khoản thành viên và guest checkout đã xác minh điện thoại/email."
        dataNotice="Dữ liệu đang là fixture review. Khi customer API active, danh sách này sẽ đổi sang generated SDK và giữ nguyên cấu trúc màn hình."
        metrics={[
          {
            key: "all",
            label: "Tổng hồ sơ mẫu",
            value: CUSTOMER_FIXTURES.length,
            icon: <TeamOutlined />,
          },
          {
            key: "members",
            label: "Thành viên",
            value: CUSTOMER_FIXTURES.filter((item) => item.type === "MEMBER")
              .length,
            icon: <IdcardOutlined />,
            tone: "blue",
          },
          {
            key: "guests",
            label: "Guest đã lưu",
            value: CUSTOMER_FIXTURES.filter((item) => item.type === "GUEST")
              .length,
            icon: <ShoppingOutlined />,
            tone: "orange",
          },
          {
            key: "verified",
            label: "Đã xác minh",
            value: CUSTOMER_FIXTURES.filter(
              (item) => item.verifiedBy !== "NONE",
            ).length,
            icon: <SafetyCertificateOutlined />,
            tone: "green",
          },
        ]}
        filters={
          <div className="flex flex-wrap gap-3">
            <Input.Search
              allowClear
              className="min-w-64 max-w-md"
              placeholder="Tên, mã, điện thoại, email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              allowClear
              className="min-w-48"
              placeholder="Loại khách hàng"
              value={type}
              options={[
                { value: "MEMBER", label: "Thành viên" },
                { value: "GUEST", label: "Guest checkout" },
              ]}
              onChange={setType}
            />
          </div>
        }
      >
        <Table
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 980 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          columns={[
            {
              title: "Khách hàng",
              dataIndex: "name",
              fixed: "left",
              width: 260,
              render: (value, row) => (
                <Space>
                  <Avatar>{value.slice(0, 1).toUpperCase()}</Avatar>
                  <div>
                    <Typography.Text strong>{value}</Typography.Text>
                    <div className="text-xs text-slate-500">{row.id}</div>
                  </div>
                </Space>
              ),
            },
            {
              title: "Liên hệ",
              dataIndex: "phone",
              width: 220,
              render: (value, row) => (
                <div>
                  {value}
                  <div className="text-xs text-slate-500">
                    {row.email ?? "Chưa có email"}
                  </div>
                </div>
              ),
            },
            {
              title: "Loại hồ sơ",
              dataIndex: "type",
              width: 140,
              render: (value) => (
                <Tag color={value === "MEMBER" ? "blue" : "default"}>
                  {value === "MEMBER" ? "Thành viên" : "Guest checkout"}
                </Tag>
              ),
            },
            {
              title: "Xác minh",
              dataIndex: "verifiedBy",
              width: 120,
              render: (value) =>
                value === "NONE" ? (
                  <Tag>Chưa có</Tag>
                ) : (
                  <Tag color="cyan">{value}</Tag>
                ),
            },
            {
              title: "Đơn hàng",
              dataIndex: "orderCount",
              align: "right",
              width: 100,
            },
            {
              title: "Tổng chi tiêu",
              dataIndex: "lifetimeValue",
              align: "right",
              width: 150,
              render: (value) => <strong>{money.format(value)}</strong>,
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              width: 140,
              render: (value: CustomerStatus) => (
                <StatusTag status={value} presentations={customerStatuses} />
              ),
            },
            {
              title: "",
              key: "action",
              fixed: "right",
              width: 72,
              render: (_, row) => (
                <Button
                  type="text"
                  aria-label={`Xem ${row.name}`}
                  icon={<EyeOutlined />}
                  onClick={() => setSelectedCustomer(row)}
                />
              ),
            },
          ]}
        />
      </ManagementPage>

      <Drawer
        width={520}
        open={Boolean(selectedCustomer)}
        title="Hồ sơ khách hàng"
        onClose={() => setSelectedCustomer(null)}
      >
        {selectedCustomer && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Mã">
              {selectedCustomer.id}
            </Descriptions.Item>
            <Descriptions.Item label="Họ tên">
              {selectedCustomer.name}
            </Descriptions.Item>
            <Descriptions.Item label="Điện thoại">
              {selectedCustomer.phone}
            </Descriptions.Item>
            <Descriptions.Item label="Email">
              {selectedCustomer.email ?? "Chưa cung cấp"}
            </Descriptions.Item>
            <Descriptions.Item label="Kiểu hồ sơ">
              {selectedCustomer.type === "GUEST"
                ? "Guest checkout — vẫn lưu customer record"
                : "Tài khoản thành viên"}
            </Descriptions.Item>
            <Descriptions.Item label="Đã xác minh qua">
              {selectedCustomer.verifiedBy}
            </Descriptions.Item>
            <Descriptions.Item label="Lần mua gần nhất">
              {selectedCustomer.lastOrderAt}
            </Descriptions.Item>
            <Descriptions.Item label="Nhãn">
              {selectedCustomer.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  );
}
