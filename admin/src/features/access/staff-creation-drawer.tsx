import { yupResolver } from '@hookform/resolvers/yup';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Drawer, Form, Input, Select } from 'antd';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useDebounce } from 'use-debounce';
import * as yup from 'yup';
import {
  getListAdminUsersQueryKey,
  useCreateAdminStaffUser,
} from '@/generated/api/iam/iam';
import {
  CreateStaffUserDtoRoleCode,
  type CreateStaffUserDtoRoleCode as StaffRoleCode,
} from '@/generated/api/iam/models';
import { useSearchActiveAdminBranches } from '@/generated/api/organization/organization';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/api/error';
import { type StaffFormValues, toCreateStaffUserDto } from './staff-creation.mapper';

const schema: yup.ObjectSchema<StaffFormValues> = yup.object({
  displayName: yup.string().trim().required('Nhập tên nhân viên').max(255, 'Tối đa 255 ký tự'),
  email: yup.string().trim().email('Email không hợp lệ').required('Nhập email').max(255, 'Tối đa 255 ký tự'),
  roleCode: yup
    .mixed<StaffRoleCode>()
    .oneOf(Object.values(CreateStaffUserDtoRoleCode))
    .required('Chọn vai trò'),
  branchId: yup.string().uuid('Chi nhánh không hợp lệ').required('Chọn chi nhánh'),
});

export function StaffCreationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [branchSearch, setBranchSearch] = useState('');
  const [debouncedBranchSearch] = useDebounce(branchSearch.trim(), 300);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<StaffFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      displayName: '',
      email: '',
      roleCode: CreateStaffUserDtoRoleCode.STAFF,
      branchId: '',
    },
  });
  const branchesQuery = useSearchActiveAdminBranches(
    { search: debouncedBranchSearch || undefined, page: 1, limit: 20 },
    { query: { enabled: open } },
  );
  const createStaff = useCreateAdminStaffUser({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
        void message.success('Đã tạo nhân viên và gán quyền theo chi nhánh.');
        reset();
        onClose();
      },
      onError: (error) => {
        const fields = getApiFieldErrors(error);
        Object.entries(fields).forEach(([field, fieldMessage]) => {
          if (field in schema.fields) {
            setError(field as keyof StaffFormValues, { message: fieldMessage });
          }
        });
        void message.error(getApiErrorMessage(error, 'Không thể tạo nhân viên.'));
      },
    },
  });

  useEffect(() => {
    if (!open) {
      reset();
      setBranchSearch('');
    }
  }, [open, reset]);

  const submit = handleSubmit((values) => {
    createStaff.mutate({
      data: toCreateStaffUserDto(values),
    });
  });

  return (
    <Drawer
      open={open}
      width={520}
      title="Tạo nhân viên"
      onClose={onClose}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={createStaff.isPending} onClick={() => void submit()}>
            Tạo nhân viên
          </Button>
        </div>
      }
    >
      <Alert
        className="mb-5"
        type="warning"
        showIcon
        message="Mật khẩu đăng nhập mặc định: Aa@123456"
        description="Nhân viên bắt buộc đổi mật khẩu sau lần đăng nhập đầu tiên. Hệ thống không gửi mật khẩu qua email tự động."
      />
      <Form layout="vertical">
        <Form.Item
          label="Tên nhân viên"
          required
          validateStatus={errors.displayName ? 'error' : undefined}
          help={errors.displayName?.message}
        >
          <Controller name="displayName" control={control} render={({ field }) => <Input {...field} />} />
        </Form.Item>
        <Form.Item
          label="Email đăng nhập"
          required
          validateStatus={errors.email ? 'error' : undefined}
          help={errors.email?.message}
        >
          <Controller name="email" control={control} render={({ field }) => <Input {...field} type="email" />} />
        </Form.Item>
        <Form.Item
          label="Vai trò"
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
                options={[
                  { value: CreateStaffUserDtoRoleCode.STAFF, label: 'Nhân viên' },
                  { value: CreateStaffUserDtoRoleCode.BRANCH_MANAGER, label: 'Quản lý chi nhánh' },
                ]}
              />
            )}
          />
        </Form.Item>
        <Form.Item
          label="Chi nhánh"
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
                options={(branchesQuery.data?.items ?? []).map((branch) => ({
                  value: branch.id,
                  label: `${branch.code} — ${branch.label}`,
                }))}
                placeholder="Tìm chi nhánh đang hoạt động"
                notFoundContent={branchesQuery.isError ? 'Không tải được chi nhánh' : undefined}
              />
            )}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
