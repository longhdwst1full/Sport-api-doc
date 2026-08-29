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
  AssignUserRoleDtoScopeType,
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
  scopeType: yup
    .mixed<AssignUserRoleDtoScopeType>()
    .oneOf(Object.values(AssignUserRoleDtoScopeType))
    .required('Vui lòng chọn phạm vi'),
  branchId: yup.string().when('scopeType', {
    is: AssignUserRoleDtoScopeType.BRANCH,
    then: (value) => value.required('Vui lòng chọn chi nhánh'),
    otherwise: (value) => value.optional(),
  }),
});

const scopeOptions = [
  { value: AssignUserRoleDtoScopeType.GLOBAL, label: 'Toàn hệ thống' },
  { value: AssignUserRoleDtoScopeType.BRANCH, label: 'Theo chi nhánh' },
];

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
    setValue,
    watch,
    formState: { errors },
  } = useForm<AssignmentFormValues>({
    resolver: yupResolver(schema),
    defaultValues: { roleCode: '', scopeType: AssignUserRoleDtoScopeType.BRANCH },
  });
  const scopeType = watch('scopeType');
  const roleCode = watch('roleCode');
  const rolesQuery = useSearchActiveAdminRoles(
    { search: debouncedRoleSearch || undefined, page: 1, limit: 20 },
    { query: { enabled: open } },
  );
  const branchesQuery = useSearchActiveAdminBranches(
    { search: debouncedBranchSearch || undefined, page: 1, limit: 20 },
    { query: { enabled: open && scopeType === AssignUserRoleDtoScopeType.BRANCH } },
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

  useEffect(() => {
    if (!roleCode) return;
    setValue(
      'scopeType',
      roleCode === AssignUserRoleDtoRoleCode.OWNER
        ? AssignUserRoleDtoScopeType.GLOBAL
        : AssignUserRoleDtoScopeType.BRANCH,
    );
  }, [roleCode, setValue]);

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

        <Form.Item
          label="Phạm vi dữ liệu"
          validateStatus={errors.scopeType ? 'error' : undefined}
          help={errors.scopeType?.message}
        >
          <Controller
            name="scopeType"
            control={control}
            render={({ field }) => <Select {...field} options={scopeOptions} disabled={Boolean(roleCode)} />}
          />
        </Form.Item>

        {scopeType === AssignUserRoleDtoScopeType.BRANCH && (
          <Form.Item
            label="Chi nhánh đang hoạt động"
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
        )}

        <Form.Item label="Người dùng">
          <Input value={user?.displayName} disabled />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
