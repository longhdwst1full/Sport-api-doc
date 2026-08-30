import {
  BankOutlined,
  EditOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  LinkOutlined,
  PlusOutlined,
  PoweroffOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Descriptions, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { PermissionGate, useCan } from '@/core/auth/permissions';
import { QueryErrorAlert } from '@/foundation/feedback/query-error-alert';
import { ManagementPage, StatusTag } from '@/foundation/management';
import {
  getListAdminBranchesQueryKey,
  getListAdminWarehousesQueryKey,
  useActivateAdminBranchWithWarehouse,
  useDeactivateAdminBranchWithWarehouse,
  useListAdminBranches,
  useListAdminWarehouses,
} from '@/generated/api/organization/organization';
import type { BranchDto, BranchDtoStatus, WarehouseDto } from '@/generated/api/organization/models';
import { getApiErrorMessage } from '@/lib/api/error';
import { OrganizationFormDrawer } from './organization-form-drawer';

interface BranchWarehouseRow {
  branchId: string;
  branchCode: string;
  branchName: string;
  warehouseCode: string;
  warehouseName: string;
  address: string;
  region: string;
  status: BranchDtoStatus;
  branch: BranchDto;
  warehouse?: WarehouseDto;
}

const organizationStatuses: Record<BranchDtoStatus, { color: string; label: string }> = {
  ACTIVE: { color: 'green', label: 'Đang hoạt động' },
  INACTIVE: { color: 'default', label: 'Ngừng hoạt động' },
};

export function OrganizationPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<BranchDto>();
  const canViewWarehouses = useCan('org.warehouse.view');
  const branchesQuery = useListAdminBranches();
  const warehousesQuery = useListAdminWarehouses({ query: { enabled: canViewWarehouses } });
  const branches = branchesQuery.data?.items ?? [];
  const warehouses = warehousesQuery.data?.items ?? [];
  const rows: BranchWarehouseRow[] = branches.map((branch) => {
    const warehouse = warehouses.find((item) => item.branchId === branch.id);
    return {
      branchId: branch.id,
      branchCode: branch.code,
      branchName: branch.name,
      warehouseCode: warehouse?.code ?? 'Chưa liên kết',
      warehouseName: warehouse?.name ?? 'Chưa có kho',
      address: [branch.address.addressLine, branch.address.district, branch.address.province].join(
        ', ',
      ),
      region: branch.address.province,
      status: branch.status,
      branch,
      warehouse,
    };
  });
  const regionCount = new Set(branches.map((branch) => branch.address.province)).size;
  const hasError = branchesQuery.isError || (canViewWarehouses && warehousesQuery.isError);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListAdminBranchesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListAdminWarehousesQueryKey() }),
    ]);
  };
  const lifecycleOptions = {
    mutation: {
      onSuccess: async () => {
        await refresh();
        void message.success('Đã cập nhật trạng thái chi nhánh và kho.');
      },
      onError: (error: unknown) =>
        void message.error(getApiErrorMessage(error, 'Không thể cập nhật trạng thái.')),
    },
  };
  const activate = useActivateAdminBranchWithWarehouse(lifecycleOptions);
  const deactivate = useDeactivateAdminBranchWithWarehouse(lifecycleOptions);
  const selectedWarehouse = selectedBranch
    ? warehouses.find((item) => item.branchId === selectedBranch.id)
    : undefined;

  return (
    <ManagementPage
      eyebrow="Organization"
      title="Chi nhánh & kho"
      description="Cấu trúc vận hành V1: mỗi chi nhánh sở hữu đúng một kho bán hàng."
      dataNotice="Dữ liệu lấy từ generated Admin Organization SDK và PostgreSQL khi DATABASE_ENABLED=true. Mọi thay đổi branch/kho dùng optimistic version."
      actions={
        <PermissionGate permission="org.branch.manage">
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => {
              setSelectedBranch(undefined);
              setDrawerOpen(true);
            }}
          >
            Thêm chi nhánh & kho
          </Button>
        </PermissionGate>
      }
      metrics={[
        { key: 'branches', label: 'Chi nhánh', value: branches.length, icon: <BankOutlined /> },
        {
          key: 'warehouses',
          label: 'Kho bán hàng',
          value: warehouses.length,
          icon: <InboxOutlined />,
          tone: 'orange',
        },
        {
          key: 'mapping',
          label: 'Quan hệ V1',
          value: '1 : 1',
          icon: <LinkOutlined />,
          tone: 'green',
          hint: 'Một branch — một warehouse',
        },
        {
          key: 'regions',
          label: 'Khu vực',
          value: regionCount,
          icon: <EnvironmentOutlined />,
          tone: 'blue',
        },
      ]}
    >
      {hasError && (
        <div className="mb-4">
          <QueryErrorAlert
            error={branchesQuery.error ?? warehousesQuery.error}
            retry={() => void Promise.all([branchesQuery.refetch(), warehousesQuery.refetch()])}
          />
        </div>
      )}
      <Table
        rowKey="branchId"
        loading={branchesQuery.isPending || (canViewWarehouses && warehousesQuery.isPending)}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 900 }}
        expandable={{
          expandedRowRender: (row) => (
            <Descriptions size="small" column={{ xs: 1, md: 2 }} className="py-2">
              <Descriptions.Item label="Chi nhánh">
                {row.branchName} ({row.branchCode})
              </Descriptions.Item>
              <Descriptions.Item label="Kho liên kết">
                {row.warehouseName} ({row.warehouseCode})
              </Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">{row.address}</Descriptions.Item>
              <Descriptions.Item label="Mô hình">Một chi nhánh — một kho</Descriptions.Item>
            </Descriptions>
          ),
        }}
        columns={[
          {
            title: 'Mã chi nhánh',
            dataIndex: 'branchCode',
            width: 150,
            render: (value) => <Typography.Text code>{value}</Typography.Text>,
          },
          {
            title: 'Chi nhánh',
            dataIndex: 'branchName',
            width: 240,
            render: (value) => <strong>{value}</strong>,
          },
          {
            title: 'Kho duy nhất',
            dataIndex: 'warehouseName',
            width: 260,
            render: (value, row) => (
              <div>
                <strong>{value}</strong>
                <div className="text-xs text-slate-500">{row.warehouseCode}</div>
              </div>
            ),
          },
          { title: 'Khu vực', dataIndex: 'region', width: 180 },
          { title: 'Địa chỉ', dataIndex: 'address', width: 280 },
          {
            title: 'Mô hình',
            key: 'relation',
            width: 150,
            render: () => <Tag color="blue">1 branch : 1 kho</Tag>,
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 150,
            render: (value: BranchDtoStatus) => (
              <StatusTag status={value} presentations={organizationStatuses} />
            ),
          },
          {
            title: 'Thao tác',
            key: 'actions',
            width: 230,
            align: 'right',
            render: (_, row: BranchWarehouseRow) => (
              <PermissionGate permission="org.branch.manage">
                <Space>
                  <Button
                    icon={<EditOutlined />}
                    disabled={!row.warehouse}
                    onClick={() => {
                      setSelectedBranch(row.branch);
                      setDrawerOpen(true);
                    }}
                  >
                    Sửa
                  </Button>
                  <Popconfirm
                    title={row.status === 'ACTIVE' ? 'Ngừng chi nhánh và kho?' : 'Kích hoạt lại chi nhánh và kho?'}
                    description="Hai bản ghi sẽ đổi trạng thái trong cùng transaction."
                    disabled={!row.warehouse}
                    onConfirm={() => {
                      if (!row.warehouse) return;
                      const variables = {
                        id: row.branch.id,
                        data: {
                          expectedVersion: row.branch.version,
                          warehouseExpectedVersion: row.warehouse.version,
                        },
                      };
                      if (row.status === 'ACTIVE') deactivate.mutate(variables);
                      else activate.mutate(variables);
                    }}
                  >
                    <Button danger={row.status === 'ACTIVE'} disabled={!row.warehouse} icon={<PoweroffOutlined />}>
                      {row.status === 'ACTIVE' ? 'Ngừng' : 'Bật'}
                    </Button>
                  </Popconfirm>
                </Space>
              </PermissionGate>
            ),
          },
        ]}
      />
      <OrganizationFormDrawer
        open={drawerOpen}
        branch={selectedBranch}
        warehouse={selectedWarehouse}
        onClose={() => setDrawerOpen(false)}
      />
    </ManagementPage>
  );
}
