import { SYSTEM_PARAMETER_CODE, type SystemParameterCode } from '../parameters/system-parameter.catalog';

export const JOB_NAME = {
  RESERVATION_EXPIRY: 'reservation-expiry',
  FLASH_SALE_QUOTA_EXPIRY: 'flash-sale-quota-expiry',
  ORDER_MAINTENANCE: 'order-maintenance',
  NOTIFICATION_DISPATCH: 'notification-dispatch',
} as const;

export type JobName = (typeof JOB_NAME)[keyof typeof JOB_NAME];

export const JOB_RUN_STATUS = {
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;

export type JobRunStatus = (typeof JOB_RUN_STATUS)[keyof typeof JOB_RUN_STATUS];

export const JOB_HEALTH_AUDIT_ACTION = {
  RUN: 'system.job.run',
  STALE_ALERT: 'system.job.stale-alert',
} as const;

/**
 * Ngưỡng cảnh báo. STALE_MINUTES phải lớn hơn SUCCESS_HEARTBEAT_MINUTES (lượt thành công liên tiếp
 * chỉ ghi theo chu kỳ đó) cộng hai chu kỳ của job chậm nhất (5 phút), nếu không sẽ báo nhầm.
 */
export const JOB_HEALTH = {
  ALERT_AFTER_FAILURES: 2,
  FAILURE_LOOKBACK: 10,
  SUCCESS_HEARTBEAT_MINUTES: 10,
  STALE_MINUTES: 25,
  STALE_REALERT_MINUTES: 60,
} as const;

/** Lịch khớp `scripts/configure-*-cron.cjs`; job tắt bằng mọi tham số trong danh sách thì không bị coi là chết. */
export const JOB_DEFINITIONS: ReadonlyArray<{ name: JobName; cadence: string; enabledParameters: readonly SystemParameterCode[] }> = [
  { name: JOB_NAME.RESERVATION_EXPIRY, cadence: '*/5', enabledParameters: [SYSTEM_PARAMETER_CODE.RESERVATION_EXPIRY_JOB_ENABLED] },
  { name: JOB_NAME.FLASH_SALE_QUOTA_EXPIRY, cadence: '1-59/5', enabledParameters: [SYSTEM_PARAMETER_CODE.FLASH_SALE_QUOTA_EXPIRY_JOB_ENABLED] },
  {
    name: JOB_NAME.ORDER_MAINTENANCE,
    cadence: '2-59/5',
    enabledParameters: [
      SYSTEM_PARAMETER_CODE.PAYMENT_EXPIRY_JOB_ENABLED,
      SYSTEM_PARAMETER_CODE.ORDER_COMPLETION_JOB_ENABLED,
      SYSTEM_PARAMETER_CODE.CARRIER_SHIPMENT_JOB_ENABLED,
    ],
  },
  { name: JOB_NAME.NOTIFICATION_DISPATCH, cadence: '* (mỗi phút)', enabledParameters: [] },
];
