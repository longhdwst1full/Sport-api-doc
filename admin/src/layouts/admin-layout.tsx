import {
  Avatar,
  Badge,
  Button,
  Input,
  Layout,
  Menu,
  Tag,
  Typography,
  type MenuProps,
} from "antd";
import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  NAVIGATION_GROUP_LABELS,
  NAVIGATION_ITEMS,
  type NavigationItem,
} from "@/app/navigation/navigation.config";
import { useAppDispatch, useAppSelector } from "@/app/store/hooks";
import { toggleSidebar } from "@/app/store/layout.slice";
import { usePermissions } from "@/core/auth/permissions";
import { PageContainer } from "@/foundation/layout/page-container";

const { Content, Header, Sider } = Layout;

export function AdminLayout() {
  const collapsed = useAppSelector((state) => state.layout.sidebarCollapsed);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const visibleItems = NAVIGATION_ITEMS.filter(
    (item) => !item.permission || permissions.has(item.permission),
  );
  const activeItem = visibleItems.find(
    (item) => item.path === location.pathname,
  );
  const groupedItems = Object.entries(NAVIGATION_GROUP_LABELS)
    .map(([group, label]) => ({
      type: "group" as const,
      key: group,
      label,
      children: visibleItems
        .filter((item) => item.group === group)
        .map((item) => ({
          key: item.path,
          icon: item.icon,
          label: item.label,
        })),
    }))
    .filter((group) => group.children.length > 0) satisfies MenuProps["items"];

  const handleQuickSearch = (value: string) => {
    const keyword = value.trim().toLocaleLowerCase("vi");
    const target = visibleItems.find((item: NavigationItem) =>
      item.label.toLocaleLowerCase("vi").includes(keyword),
    );
    if (target) navigate(target.path);
  };

  return (
    <Layout className="min-h-screen">
      <Sider
        width={256}
        collapsed={collapsed}
        theme="dark"
        className="!bg-admin-950"
        breakpoint="lg"
      >
        <div className="flex h-20 items-center gap-3 overflow-hidden px-5 text-lg font-bold text-white">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-admin-500">
            D
          </span>
          {!collapsed && <span className="whitespace-nowrap">DCTD ADMIN</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          className="!bg-admin-950"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={groupedItems}
        />
        {!collapsed && import.meta.env.DEV && (
          <div className="mx-4 mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
            <Tag color="gold" className="!mb-2">
              DEV
            </Tag>
            <div>Frontend đang mở quyền để phát triển.</div>
          </div>
        )}
      </Sider>
      <Layout>
        <Header className="!flex !h-20 !items-center !justify-between !bg-white !px-5 lg:!px-8">
          <div className="flex flex-1 items-center gap-4">
            <Button
              type="text"
              aria-label="Thu gọn menu"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => dispatch(toggleSidebar())}
            />
            <Input.Search
              placeholder="Đi tới module quản lý..."
              className="hidden max-w-md md:block"
              onSearch={handleQuickSearch}
            />
          </div>
          <div className="flex items-center gap-3">
            <Typography.Text className="hidden !text-slate-500 lg:block">
              {activeItem?.label ?? "Quản trị hệ thống"}
            </Typography.Text>
            <Badge dot>
              <Avatar className="bg-admin-500">AD</Avatar>
            </Badge>
            <div className="hidden sm:block">
              <Typography.Text strong>Quản trị viên</Typography.Text>
              <div className="text-xs text-gray-500">Toàn hệ thống</div>
            </div>
          </div>
        </Header>
        <Content className="bg-slate-50 p-5 lg:p-8">
          <PageContainer>
            <Outlet />
          </PageContainer>
        </Content>
      </Layout>
    </Layout>
  );
}
