import { useEffect, useState } from 'react';
import { App, Button, Drawer, Form, Input, Select } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';
import * as yup from 'yup';
import {
  getListAdminUsersQueryKey,
  useAssignAdminUserRole,
  useSearchActiveAdminRoles,
} from '@/generated/api/iam/iam';
import {
  AssignUserRoleDtoRoleCode,
  type UserDto,
} from '@/generated/api/iam/models';
import {
  useSearchActiveAdminBranches,
} from '@/generated/api/organization/organization';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api/error';
import {
  type AssignmentFormValues,
  toAssignUserRoleDto,
} from './role-assignment.mapper';

interface RoleAssignmentDrawerProps {
  user?: UserDto;
  open: boolean;
  onClose: () => void;
}

const schema: yup.ObjectSchema<AssignmentFormValues> = yup.object({
  roleCode: yup
    .mixed<AssignmentFormValues['roleCode']>()
    .oneOf(Object.values(AssignUserRoleDtoRoleCode))
    .required('Vui lòng chọn vai trò'),
  branchId: yup.string().required('Vui lòng chọn chi nhánh'),
});

export function RoleAssignmentDrawer({ user, open, onClose }: RoleAssignmentDrawerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [roleSearch, setRoleSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [debouncedRoleSearch] = useDebounce(roleSearch.trim(), 300);
  const [debouncedBranchSearch] = useDebounce(branchSearch.trim(), 300);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AssignmentFormValues>({
    resolver: yupResolver(schema),
    defaultValues: { roleCode: '', branchId: '' },
  });
  const rolesQuery = useSearchActiveAdminRoles(
    { search: debouncedRoleSearch || undefined, page: 1, limit: 20 },
    { query: { enabled: open } },
  );
  const branchesQuery = useSearchActiveAdminBranches(
    { search: debouncedBranchSearch || undefined, page: 1, limit: 20 },
    { query: { enabled: open } },
  );
  const assignment = useAssignAdminUserRole({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        void message.success('Đã gán vai trò cho người dùng.');
        reset();
        onClose();
      },
      onError: (error) => {
        const fields = getApiFieldErrors(error);
        Object.entries(fields).forEach(([field, fieldMessage]) => {
          if (field in schema.fields) {
            setError(field as keyof AssignmentFormValues, { message: fieldMessage });
          }
        });
        void message.error(getApiErrorMessage(error, 'Không thể gán vai trò.'));
      },
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setRoleSearch('');
      setBranchSearch('');
    }
  }, [open, reset]);

  const submit = handleSubmit((values) => {
    if (!user) return;
    assignment.mutate({
      userId: user.id,
      data: toAssignUserRoleDto(values),
    });
  });

  return (
    <Drawer
      open={open}
      width={520}
      title={`Gán vai trò — ${user?.displayName ?? ''}`}
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={assignment.isPending} onClick={() => void submit()}>
            Gán vai trò
          </Button>
        </div>
      }
    >
      <Form layout="vertical">
        <Form.Item
          label="Vai trò đang hoạt động"
          required
          validateStatus={errors.roleCode ? 'error' : undefined}
          help={errors.roleCode?.message}
        >
          <Controller
            name="roleCode"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                showSearch
                filterOption={false}
                onSearch={setRoleSearch}
                loading={rolesQuery.isFetching}
                options={(rolesQuery.data?.items ?? []).map((item) => ({
                  value: item.code,
                  label: `${item.code} — ${item.label}`,
                }))}
                placeholder="Tìm theo mã hoặc tên vai trò"
                notFoundContent={rolesQuery.isError ? 'Không tải được vai trò' : undefined}
              />
            )}
          />
        </Form.Item>

        <Form.Item label="Phạm vi dữ liệu">
          <Input value="Theo chi nhánh" disabled />
        </Form.Item>

        <Form.Item
          label="Chi nhánh đang hoạt động"
          required
          validateStatus={errors.branchId ? 'error' : undefined}
          help={errors.branchId?.message}
        >
          <Controller
            name="branchId"
            control={control}
            render={({ field }) => (
              <Select
                {...field}
                showSearch
                filterOption={false}
                onSearch={setBranchSearch}
                loading={branchesQuery.isFetching}
                options={(branchesQuery.data?.items ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.code} — ${item.label}`,
                }))}
                placeholder="Tìm chi nhánh active"
              />
            )}
          />
        </Form.Item>

        <Form.Item label="Người dùng">
          <Input value={user?.displayName} disabled />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
