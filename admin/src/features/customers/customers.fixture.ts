export type CustomerType = "MEMBER" | "GUEST";
export type CustomerStatus = "ACTIVE" | "NEEDS_VERIFICATION" | "BLOCKED";

export interface CustomerFixture {
  id: string;
  name: string;
  phone: string;
  email?: string;
  type: CustomerType;
  status: CustomerStatus;
  verifiedBy: "PHONE" | "EMAIL" | "BOTH" | "NONE";
  orderCount: number;
  lifetimeValue: number;
  lastOrderAt: string;
  tags: string[];
}

export const CUSTOMER_FIXTURES: CustomerFixture[] = [
  {
    id: "CUS-00128",
    name: "Nguyễn Minh Anh",
    phone: "0903 456 789",
    email: "minhanh@example.com",
    type: "MEMBER",
    status: "ACTIVE",
    verifiedBy: "BOTH",
    orderCount: 8,
    lifetimeValue: 12480000,
    lastOrderAt: "29/08/2026",
    tags: ["Runner", "VIP"],
  },
  {
    id: "CUS-00119",
    name: "Trần Quốc Huy",
    phone: "0935 555 901",
    email: "huy.tran@example.com",
    type: "MEMBER",
    status: "ACTIVE",
    verifiedBy: "EMAIL",
    orderCount: 4,
    lifetimeValue: 6790000,
    lastOrderAt: "29/08/2026",
    tags: ["Gym"],
  },
  {
    id: "GST-00987",
    name: "Khách 0912 008 776",
    phone: "0912 008 776",
    type: "GUEST",
    status: "ACTIVE",
    verifiedBy: "PHONE",
    orderCount: 1,
    lifetimeValue: 890000,
    lastOrderAt: "27/08/2026",
    tags: ["Guest checkout"],
  },
  {
    id: "CUS-00084",
    name: "Lê Thu Trang",
    phone: "0988 112 233",
    email: "trang.le@example.com",
    type: "MEMBER",
    status: "ACTIVE",
    verifiedBy: "BOTH",
    orderCount: 11,
    lifetimeValue: 18360000,
    lastOrderAt: "28/08/2026",
    tags: ["Yoga", "VIP"],
  },
  {
    id: "GST-00951",
    name: "Khách chưa xác minh",
    phone: "0900 000 112",
    type: "GUEST",
    status: "NEEDS_VERIFICATION",
    verifiedBy: "NONE",
    orderCount: 0,
    lifetimeValue: 0,
    lastOrderAt: "—",
    tags: ["Cần xác minh"],
  },
];
