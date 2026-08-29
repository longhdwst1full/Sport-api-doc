import {
  Avatar,
  Badge,
  Button,
  Divider,
  Layout,
  Menu,
  Tag,
  Typography,
  type MenuProps,
} from 'antd';
import {
  BellOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAVIGATION_GROUP_LABELS, NAVIGATION_ITEMS } from '@/app/navigation/navigation.config';
import { useAppDispatch, useAppSelector } from '@/app/store/hooks';
import { setSidebarCollapsed, toggleSidebar } from '@/app/store/layout.slice';
import { usePermissions } from '@/core/auth/permissions';
import { PageContainer } from '@/foundation/layout/page-container';
import { NavigationTabs } from '@/layouts/components/navigation-tabs';
import { useAuth } from '@/core/auth/auth-context';

const { Content, Header, Sider } = Layout;

export function AdminLayout() {
  const collapsed = useAppSelector((state) => state.layout.sidebarCollapsed);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const auth = useAuth();
  const visibleItems = NAVIGATION_ITEMS.filter(
    (item) => !item.permission || permissions.has(item.permission),
  );
  const groupedItems = Object.entries(NAVIGATION_GROUP_LABELS)
    .map(([group, label]) => ({
      type: 'group' as const,
      key: group,
      label,
      children: visibleItems
        .filter((item) => item.group === group)
        .map((item) => ({ key: item.path, icon: item.icon, label: item.label })),
    }))
    .filter((group) => group.children.length > 0) satisfies MenuProps['items'];

  return (
    <Layout className="h-screen overflow-hidden bg-slate-50">
      <Header className="!flex !h-16 !items-center !bg-white !px-0 shadow-sm">
        <div
          className={`flex h-full shrink-0 items-center gap-3 border-r border-slate-100 px-4 transition-[width] duration-200 ${collapsed ? 'w-[88px] justify-center' : 'w-[260px]'}`}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-400 font-bold text-white shadow-sm">
            D
          </span>
          {!collapsed && (
            <span className="whitespace-nowrap text-base font-bold text-slate-800">DCTD ADMIN</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-4 px-4">
          <NavigationTabs navigationItems={visibleItems} />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {import.meta.env.DEV && <Tag color="gold">DEV · OPEN FE</Tag>}
            <Button type="text" shape="circle" aria-label="Tìm kiếm" icon={<SearchOutlined />} />
            <Badge dot>
              <Button type="text" shape="circle" aria-label="Thông báo" icon={<BellOutlined />} />
            </Badge>
            <Divider type="vertical" className="!mx-1 !h-7" />
            <Avatar className="bg-admin-500">
              {(auth.currentUser?.displayName ?? 'AD').slice(0, 2).toUpperCase()}
            </Avatar>
            <div className="hidden xl:block">
              <Typography.Text strong>{auth.currentUser?.displayName ?? 'Quản trị viên'}</Typography.Text>
              <div className="text-xs leading-4 text-slate-500">
                {auth.developmentBypass ? 'DEV bypass' : auth.currentUser?.scopes.map((scope) => scope.type).join(', ')}
              </div>
            </div>
            <Button
              type="text"
              shape="circle"
              aria-label="Đăng xuất"
              icon={<LogoutOutlined />}
              onClick={() => void auth.signOut()}
            />
          </div>
        </div>
      </Header>

      <Layout className="min-h-0">
        <Sider
          width={260}
          collapsedWidth={88}
          collapsed={collapsed}
          theme="light"
          breakpoint="lg"
          onCollapse={(nextCollapsed) => {
            if (nextCollapsed !== collapsed) dispatch(setSidebarCollapsed(nextCollapsed));
          }}
          className="!flex !h-full !flex-col !border-r !border-slate-200 !bg-white"
        >
          <div className="flex h-full min-h-0 flex-col py-3">
            <Menu
              mode="inline"
              inlineCollapsed={collapsed}
              className="dctd-side-menu min-h-0 flex-1 overflow-y-auto !border-e-0 !bg-white px-2"
              selectedKeys={[location.pathname]}
              onClick={({ key }) => navigate(key)}
              items={groupedItems}
            />
            {!collapsed && import.meta.env.DEV && (
              <div className="mx-3 mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Frontend đang bypass permission. API vẫn kiểm quyền độc lập.
              </div>
            )}
            <Button
              type="text"
              className="!mx-3 !flex !justify-center"
              aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => dispatch(toggleSidebar())}
            >
              {!collapsed && 'Thu gọn menu'}
            </Button>
          </div>
        </Sider>

        <Layout className="min-w-0 bg-slate-50">
          <Content className="overflow-auto bg-slate-50 p-5 lg:p-8">
            <PageContainer>
              <Outlet />
            </PageContainer>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
