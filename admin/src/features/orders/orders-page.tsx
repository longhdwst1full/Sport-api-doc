import { useMemo, useState } from "react";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EyeOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import {
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { ManagementPage, StatusTag } from "@/foundation/management";
import {
  ORDER_FIXTURES,
  type OrderFixture,
  type OrderStatus,
} from "./orders.fixture";

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
});

const orderStatuses: Record<OrderStatus, { color: string; label: string }> = {
  NEW: { color: "blue", label: "Đơn mới" },
  CONFIRMED: { color: "cyan", label: "Đã xác nhận" },
  PACKING: { color: "gold", label: "Đang đóng gói" },
  SHIPPED: { color: "purple", label: "Đang giao" },
  DELIVERED: { color: "green", label: "Hoàn tất" },
  RETURNED: { color: "red", label: "Đã hoàn" },
};

export function OrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [selectedOrder, setSelectedOrder] = useState<OrderFixture | null>(null);
  const rows = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");
    return ORDER_FIXTURES.filter(
      (order) =>
        (!status || order.status === status) &&
        (!keyword ||
          order.id.toLocaleLowerCase("vi").includes(keyword) ||
          order.customer.toLocaleLowerCase("vi").includes(keyword) ||
          order.contact.toLocaleLowerCase("vi").includes(keyword)),
    );
  }, [search, status]);

  const totalRevenue = ORDER_FIXTURES.filter(
    (order) => order.paymentStatus === "PAID",
  ).reduce((sum, order) => sum + order.total, 0);

  return (
    <>
      <ManagementPage
        eyebrow="Sales operations"
        title="Quản lý đơn hàng"
        description="Theo dõi một luồng thống nhất từ tiếp nhận, thanh toán một lần, giao hàng đến hoàn về kho."
        dataNotice="Danh sách hiện dùng fixture tách biệt để duyệt UX. Module order của API chưa có endpoint active; khi có OpenAPI sẽ thay nguồn dữ liệu bằng generated SDK."
        metrics={[
          {
            key: "all",
            label: "Tổng đơn mẫu",
            value: ORDER_FIXTURES.length,
            icon: <ShoppingCartOutlined />,
          },
          {
            key: "new",
            label: "Cần xử lý",
            value: ORDER_FIXTURES.filter((order) =>
              ["NEW", "CONFIRMED"].includes(order.status),
            ).length,
            icon: <ClockCircleOutlined />,
            tone: "orange",
          },
          {
            key: "completed",
            label: "Đã giao",
            value: ORDER_FIXTURES.filter(
              (order) => order.status === "DELIVERED",
            ).length,
            icon: <CheckCircleOutlined />,
            tone: "green",
          },
          {
            key: "revenue",
            label: "Đã thanh toán",
            value: money.format(totalRevenue),
            icon: <DollarOutlined />,
            tone: "blue",
            hint: "Giá đã gồm VAT",
          },
        ]}
        filters={
          <div className="flex flex-wrap gap-3">
            <Input.Search
              allowClear
              className="min-w-64 max-w-md"
              placeholder="Mã đơn, khách hàng, điện thoại..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              allowClear
              className="min-w-48"
              placeholder="Tất cả trạng thái"
              value={status}
              options={Object.entries(orderStatuses).map(
                ([value, presentation]) => ({
                  value,
                  label: presentation.label,
                }),
              )}
              onChange={setStatus}
            />
          </div>
        }
      >
        <Table
          rowKey="id"
          dataSource={rows}
          scroll={{ x: 1050 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          columns={[
            {
              title: "Đơn hàng",
              dataIndex: "id",
              fixed: "left",
              width: 180,
              render: (value, row) => (
                <div>
                  <Typography.Text strong>{value}</Typography.Text>
                  <div className="text-xs text-slate-500">{row.createdAt}</div>
                </div>
              ),
            },
            {
              title: "Khách hàng",
              dataIndex: "customer",
              width: 210,
              render: (value, row) => (
                <div>
                  <strong>{value}</strong>
                  <div className="text-xs text-slate-500">{row.contact}</div>
                </div>
              ),
            },
            {
              title: "Sản phẩm",
              dataIndex: "itemSummary",
              width: 240,
              render: (value, row) => (
                <div>
                  {value}
                  <div className="text-xs text-slate-500">
                    {row.itemCount} dòng sản phẩm
                  </div>
                </div>
              ),
            },
            {
              title: "Kênh",
              dataIndex: "channel",
              width: 90,
              render: (value) => <Tag>{value}</Tag>,
            },
            {
              title: "Thanh toán",
              dataIndex: "paymentStatus",
              width: 130,
              render: (value) => (
                <Tag color={value === "PAID" ? "green" : "gold"}>
                  {value === "PAID" ? "Đã trả đủ" : "Chờ trả"}
                </Tag>
              ),
            },
            {
              title: "Tổng tiền",
              dataIndex: "total",
              align: "right",
              width: 150,
              render: (value) => <strong>{money.format(value)}</strong>,
            },
            {
              title: "Trạng thái",
              dataIndex: "status",
              width: 150,
              render: (value: OrderStatus) => (
                <StatusTag status={value} presentations={orderStatuses} />
              ),
            },
            {
              title: "",
              key: "actions",
              fixed: "right",
              width: 72,
              render: (_, row) => (
                <Button
                  type="text"
                  aria-label={`Xem ${row.id}`}
                  icon={<EyeOutlined />}
                  onClick={() => setSelectedOrder(row)}
                />
              ),
            },
          ]}
        />
      </ManagementPage>

      <Drawer
        width={560}
        open={Boolean(selectedOrder)}
        title={
          selectedOrder ? `Chi tiết ${selectedOrder.id}` : "Chi tiết đơn hàng"
        }
        onClose={() => setSelectedOrder(null)}
      >
        {selectedOrder && (
          <Space direction="vertical" size="large" className="w-full">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Khách hàng">
                {selectedOrder.customer}
              </Descriptions.Item>
              <Descriptions.Item label="Liên hệ">
                {selectedOrder.contact}
              </Descriptions.Item>
              <Descriptions.Item label="Giao tới">
                {selectedOrder.shippingAddress}
              </Descriptions.Item>
              <Descriptions.Item label="Sản phẩm">
                {selectedOrder.itemSummary}
              </Descriptions.Item>
              <Descriptions.Item label="Khách trả">
                {money.format(selectedOrder.total)} · đã gồm VAT · một lần
              </Descriptions.Item>
              {selectedOrder.note && (
                <Descriptions.Item label="Ghi chú">
                  {selectedOrder.note}
                </Descriptions.Item>
              )}
            </Descriptions>
            <div>
              <Typography.Title level={5}>Tiến trình xử lý</Typography.Title>
              <Timeline
                items={[
                  { color: "green", children: "Đã tiếp nhận đơn hàng" },
                  {
                    color:
                      selectedOrder.paymentStatus === "PAID" ? "green" : "gray",
                    children: "Xác nhận thanh toán một lần",
                  },
                  {
                    color: [
                      "PACKING",
                      "SHIPPED",
                      "DELIVERED",
                      "RETURNED",
                    ].includes(selectedOrder.status)
                      ? "blue"
                      : "gray",
                    children: "Đóng gói và bàn giao vận chuyển",
                  },
                  {
                    color:
                      selectedOrder.status === "RETURNED"
                        ? "red"
                        : selectedOrder.status === "DELIVERED"
                          ? "green"
                          : "gray",
                    children:
                      selectedOrder.status === "RETURNED"
                        ? "Hoàn có lý do và nhập lại kho"
                        : "Hoàn tất giao hàng",
                  },
                ]}
              />
            </div>
          </Space>
        )}
      </Drawer>
    </>
  );
}
