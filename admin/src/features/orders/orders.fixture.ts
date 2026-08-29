export type OrderStatus =
  "NEW" | "CONFIRMED" | "PACKING" | "SHIPPED" | "DELIVERED" | "RETURNED";

export interface OrderFixture {
  id: string;
  customer: string;
  contact: string;
  channel: "WEB" | "PWA" | "ADMIN";
  itemSummary: string;
  itemCount: number;
  total: number;
  paymentStatus: "PAID" | "PENDING";
  status: OrderStatus;
  createdAt: string;
  shippingAddress: string;
  note?: string;
}

export const ORDER_FIXTURES: OrderFixture[] = [
  {
    id: "SO-260829-0186",
    customer: "Nguyễn Minh Anh",
    contact: "0903 456 789",
    channel: "PWA",
    itemSummary: "Giày chạy bộ AeroRun Pro",
    itemCount: 2,
    total: 3890000,
    paymentStatus: "PAID",
    status: "NEW",
    createdAt: "29/08/2026 10:42",
    shippingAddress: "12 Nguyễn Văn Linh, Hải Châu, Đà Nẵng",
  },
  {
    id: "SO-260829-0185",
    customer: "Trần Quốc Huy",
    contact: "huy.tran@example.com",
    channel: "WEB",
    itemSummary: "Combo tập gym tại nhà",
    itemCount: 1,
    total: 2590000,
    paymentStatus: "PAID",
    status: "PACKING",
    createdAt: "29/08/2026 09:15",
    shippingAddress: "88 Lê Lợi, Quận 1, TP.HCM",
    note: "Combo chỉ nhận hoàn nguyên bộ.",
  },
  {
    id: "SO-260828-0179",
    customer: "Lê Thu Trang",
    contact: "0988 112 233",
    channel: "WEB",
    itemSummary: "Thảm yoga ProGrip",
    itemCount: 3,
    total: 1770000,
    paymentStatus: "PAID",
    status: "SHIPPED",
    createdAt: "28/08/2026 16:27",
    shippingAddress: "21 Trần Phú, Nha Trang, Khánh Hòa",
  },
  {
    id: "SO-260827-0164",
    customer: "Guest · 0912 008 776",
    contact: "0912 008 776",
    channel: "PWA",
    itemSummary: "Bóng đá thi đấu Size 5",
    itemCount: 1,
    total: 890000,
    paymentStatus: "PAID",
    status: "DELIVERED",
    createdAt: "27/08/2026 14:08",
    shippingAddress: "45 Nguyễn Trãi, Thanh Xuân, Hà Nội",
  },
  {
    id: "SO-260826-0153",
    customer: "Phạm Ngọc Linh",
    contact: "linh.pham@example.com",
    channel: "ADMIN",
    itemSummary: "Áo tennis DryFit",
    itemCount: 2,
    total: 1380000,
    paymentStatus: "PAID",
    status: "RETURNED",
    createdAt: "26/08/2026 11:36",
    shippingAddress: "09 Hai Bà Trưng, Hoàn Kiếm, Hà Nội",
    note: "Hoàn 1 áo lỗi đường may; hàng về kho chính.",
  },
];
