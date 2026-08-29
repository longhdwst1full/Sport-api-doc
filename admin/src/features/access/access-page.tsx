import { useState } from 'react';
import {
  LockOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Avatar, Button, Space, Table, Tabs, Tag, Typography } from 'antd';
import { useCan } from '@/core/auth/permissions';
import { QueryErrorAlert } from '@/foundation/feedback/query-error-alert';
import { ManagementPage, StatusTag } from '@/foundation/management';
import {
  useListAdminPermissions,
  useListAdminRoles,
  useListAdminUsers,
} from '@/generated/api/iam/iam';
import type { UserDto, UserDtoStatus, UserRoleAssignmentDto } from '@/generated/api/iam/models';
import { RoleAssignmentDrawer } from './role-assignment-drawer';

const userStatuses: Record<UserDtoStatus, { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: 'Hoạt động' },
  INVITED: { color: 'blue', label: 'Đã mời' },
  LOCKED: { color: 'red', label: 'Đã khóa' },
};

export function AccessPage() {
  const [activeTab, setActiveTab] = useState('users');
  const [assignmentUser, setAssignmentUser] = useState<UserDto>();
  const canViewRoles = useCan('iam.role.view');
  const canAssignRoles = useCan('iam.assignment.manage');
  const usersQuery = useListAdminUsers();
  const rolesQuery = useListAdminRoles({ query: { enabled: canViewRoles } });
  const permissionsQuery = useListAdminPermissions({ query: { enabled: canViewRoles } });
  const users = usersQuery.data?.items ?? [];
  const roles = rolesQuery.data?.items ?? [];
  const permissions = permissionsQuery.data?.items ?? [];
  const loading =
    usersQuery.isPending || (canViewRoles && (rolesQuery.isPending || permissionsQuery.isPending));
  const hasError =
    usersQuery.isError || (canViewRoles && (rolesQuery.isError || permissionsQuery.isError));

  return (
    <ManagementPage
      eyebrow="Identity & access"
      title="Người dùng & phân quyền"
      description="RBAC V1 gồm OWNER, BRANCH_MANAGER và STAFF với scope GLOBAL/BRANCH; backend luôn là nguồn quyết định quyền cuối cùng."
      dataNotice="Dữ liệu lấy từ generated Admin IAM SDK. JWT đã xác minh danh tính và quyền từ PostgreSQL; danh sách IAM đang được chuyển tiếp từ adapter sang persistence."
      metrics={[
        { key: 'users', label: 'Người dùng', value: users.length, icon: <UserOutlined /> },
        {
          key: 'roles',
          label: 'Vai trò',
          value: roles.length,
          icon: <TeamOutlined />,
          tone: 'blue',
        },
        {
          key: 'permissions',
          label: 'Permission codes',
          value: permissions.length,
          icon: <SafetyCertificateOutlined />,
          tone: 'green',
        },
        {
          key: 'locked',
          label: 'Tài khoản khóa',
          value: users.filter((user) => user.status === 'LOCKED').length,
          icon: <LockOutlined />,
          tone: 'red',
        },
      ]}
    >
      <Alert
        className="mb-5"
        showIcon
        type="warning"
        message="Dev bypass chỉ áp dụng hiển thị phía frontend"
        description="API vẫn kiểm tra permission và scope; không dùng flag frontend làm cơ chế bảo mật."
      />
      {hasError && (
        <div className="mb-4">
          <QueryErrorAlert
            error={usersQuery.error ?? rolesQuery.error ?? permissionsQuery.error}
            retry={() =>
              void Promise.all([
                usersQuery.refetch(),
                rolesQuery.refetch(),
                permissionsQuery.refetch(),
              ])
            }
          />
        </div>
      )}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'users',
            label: 'Người dùng',
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={users}
                pagination={false}
                scroll={{ x: 900 }}
                columns={[
                  {
                    title: 'Người dùng',
                    dataIndex: 'displayName',
                    width: 240,
                    render: (value, row) => (
                      <Space>
                        <Avatar>{value.slice(0, 1)}</Avatar>
                        <div>
                          <Typography.Text strong>{value}</Typography.Text>
                          <div className="text-xs text-slate-500">{row.maskedEmail}</div>
                        </div>
                      </Space>
                    ),
                  },
                  {
                    title: 'Vai trò',
                    dataIndex: 'assignments',
                    width: 210,
                    render: (assignments: UserRoleAssignmentDto[]) => (
                      <Space size={[4, 4]} wrap>
                        {assignments.map((assignment) => (
                          <Tag color="blue" key={assignment.id}>
                            {assignment.roleCode}
                          </Tag>
                        ))}
                      </Space>
                    ),
                  },
                  {
                    title: 'Phạm vi dữ liệu',
                    dataIndex: 'assignments',
                    width: 180,
                    render: (assignments: UserRoleAssignmentDto[]) =>
                      assignments.map((assignment) => assignment.scopeType).join(', ') ||
                      'Chưa gán',
                  },
                  {
                    title: 'Permission version',
                    dataIndex: 'permissionVersion',
                    align: 'center',
                    width: 150,
                  },
                  {
                    title: 'Trạng thái',
                    dataIndex: 'status',
                    width: 140,
                    render: (value: UserDtoStatus) => (
                      <StatusTag status={value} presentations={userStatuses} />
                    ),
                  },
                  ...(canAssignRoles
                    ? [
                        {
                          title: 'Thao tác',
                          key: 'actions',
                          width: 130,
                          fixed: 'right' as const,
                          render: (_: unknown, user: UserDto) => (
                            <Button type="link" onClick={() => setAssignmentUser(user)}>
                              Gán vai trò
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            ),
          },
          ...(canViewRoles
            ? [
                {
                  key: 'roles',
                  label: 'Vai trò & quyền',
                  children: (
                    <Table
                      rowKey="id"
                      loading={loading}
                      dataSource={roles}
                      pagination={false}
                      scroll={{ x: 900 }}
                      columns={[
                        {
                          title: 'Vai trò',
                          dataIndex: 'name',
                          width: 220,
                          render: (value, row) => (
                            <div>
                              <strong>{value}</strong>
                              <div className="text-xs text-slate-500">{row.description}</div>
                            </div>
                          ),
                        },
                        {
                          title: 'Loại',
                          dataIndex: 'system',
                          width: 120,
                          render: (system) => <Tag>{system ? 'Hệ thống' : 'Tùy chỉnh'}</Tag>,
                        },
                        {
                          title: 'Người dùng',
                          key: 'users',
                          align: 'center',
                          width: 110,
                          render: (_, role) =>
                            users.filter((user) =>
                              user.assignments.some((assignment) => assignment.roleId === role.id),
                            ).length,
                        },
                        {
                          title: 'Permission keys',
                          dataIndex: 'permissionCodes',
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
              ]
            : []),
        ]}
      />
      <RoleAssignmentDrawer
        user={assignmentUser}
        open={Boolean(assignmentUser)}
        onClose={() => setAssignmentUser(undefined)}
      />
    </ManagementPage>
  );
}
