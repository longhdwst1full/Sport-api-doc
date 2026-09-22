/**
 * Bằng chứng một cron job của Supabase có THỰC SỰ gọi được API hay không.
 *
 * `cron.job_run_details` báo `succeeded` ngay khi pg_cron chạy xong câu `net.http_get` — tức là
 * request đã được XẾP HÀNG, không phải API đã trả 200. API chết hẳn thì bảng đó vẫn đều đặn
 * `succeeded` mỗi 5 phút. Phản hồi thật nằm ở `net._http_response`.
 *
 * Hạn chế đã biết: pg_net không lưu URL trong bảng phản hồi, và `cron.job_run_details` không lưu
 * `request_id` mà `net.http_get` trả về, nên không ghép được chính xác phản hồi với job. Ở đây
 * ghép theo thời gian (phản hồi tạo ra trong khoảng ±`TOLERANCE_SECONDS` quanh lúc job chạy). Khi
 * hai job trùng lịch, một lượt chạy có thể nhận nhiều phản hồi — vì vậy kết quả luôn kèm `note`
 * thay vì để người đọc tưởng đây là quan hệ một-một.
 */
const TOLERANCE_SECONDS = 10;
const CONTENT_PREVIEW_LENGTH = 200;

async function readHttpResponses(prisma, runs) {
  if (runs.length === 0) return { available: false, reason: 'no cron runs recorded', rows: [] };
  const since = new Date(
    new Date(runs[runs.length - 1].start_time).getTime() - TOLERANCE_SECONDS * 1000,
  );
  const until = new Date(new Date(runs[0].start_time).getTime() + TOLERANCE_SECONDS * 1000);

  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT status_code, created, timed_out, error_msg, left(coalesce(content, ''), ${CONTENT_PREVIEW_LENGTH}) AS content
         FROM net._http_response
        WHERE created BETWEEN $1 AND $2
        ORDER BY created DESC
        LIMIT 20`,
      since,
      until,
    );
    return { available: true, rows };
  } catch (error) {
    // pg_net dọn bảng phản hồi theo TTL (mặc định 6 tiếng) và có thể chưa được cấp quyền đọc.
    return { available: false, reason: error.message.split('\n')[0], rows: [] };
  }
}

/**
 * Kết luận từ các phản hồi đọc được.
 *
 * Không có phản hồi nào KHÔNG được coi là bình thường: đó chính là dấu hiệu request bị xếp hàng
 * mà không bao giờ tới đích, hoặc bảng phản hồi đã bị dọn.
 */
function summarize(responses) {
  if (!responses.available) return `chưa xác nhận được (${responses.reason})`;
  if (responses.rows.length === 0) {
    return 'KHÔNG có phản hồi HTTP nào trong khoảng thời gian các lượt chạy — request có thể không tới đích';
  }
  const failed = responses.rows.filter((row) => row.timed_out || row.error_msg || row.status_code >= 400);
  if (failed.length > 0) {
    return `${failed.length}/${responses.rows.length} phản hồi lỗi hoặc timeout — cron chạy nhưng API không xử lý được`;
  }
  return `${responses.rows.length} phản hồi, tất cả 2xx/3xx`;
}

/** In báo cáo trạng thái của một job kèm bằng chứng HTTP. */
async function printCronStatus(prisma, { jobName, job, runs }) {
  const responses = await readHttpResponses(prisma, runs);
  console.log(JSON.stringify(
    {
      jobName,
      job: job ?? null,
      // Giữ nguyên tên cũ để không phá script/quy trình đang đọc output này.
      recentRuns: runs,
      httpEvidence: {
        note:
          'cron.job_run_details chỉ chứng minh pg_cron đã xếp hàng request. Các dòng dưới đây là '
          + 'phản hồi HTTP thật từ net._http_response, ghép theo thời gian nên có thể lẫn phản hồi '
          + 'của job khác chạy cùng phút.',
        verdict: summarize(responses),
        responses: responses.rows,
      },
    },
    (_, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  ));
}

module.exports = { printCronStatus, readHttpResponses, summarize, TOLERANCE_SECONDS };
