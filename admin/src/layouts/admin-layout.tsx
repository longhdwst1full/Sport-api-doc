import { Avatar, Badge, Button, Input, Layout, Menu, Typography } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '@/app/navigation/navigation.config';
import { useAppDispatch, useAppSelector } from '@/app/store/hooks';
import { toggleSidebar } from '@/app/store/layout.slice';
import { usePermissions } from '@/core/auth/permissions';
import { PageContainer } from '@/foundation/layout/page-container';

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
          items={visibleItems.map((item) => ({
            key: item.path,
            icon: item.icon,
            label: item.label,
          }))}
        />
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
              placeholder="Tìm nhanh sản phẩm, đơn hàng, khách..."
              className="hidden max-w-md md:block"
            />
          </div>
          <div className="flex items-center gap-3">
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
