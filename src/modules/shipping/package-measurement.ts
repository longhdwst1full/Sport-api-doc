/**
 * Đo kiện hàng — **một công thức duy nhất** cho báo giá, phí dự phòng và tạo vận đơn.
 *
 * Vì sao phải dùng chung: GHN tự tính trọng lượng quy đổi thể tích, nhưng chỉ từ kích thước MÀ TA
 * GỬI LÊN. Báo giá gửi thiếu kích thước thì GHN báo giá trên một kiện 1cm; tới lúc tạo vận đơn gửi
 * kích thước thật thì hãng thu theo kiện thật. Khách đã trả con số đầu, cửa hàng chịu phần chênh —
 * và chênh lệch chỉ lộ ra ở hoá đơn hãng vận chuyển cuối tháng.
 *
 * Với thảm tập 1,2m × 0,6m × 0,4m nặng 800g, hai con số đó là 50.000đ và 200.000đ.
 */
/** Khối lượng dùng khi sản phẩm chưa khai cân nặng. Chỉ là đường lùi, không phải cách tính chính. */
const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

/**
 * Hệ số quy đổi trọng lượng thể tích: cm³ chia 5000 ra kg. Đây là hệ số GHN và phần lớn hãng nội
 * địa đang dùng cho hàng tiêu chuẩn.
 */
const VOLUMETRIC_DIVISOR = 5000;

/** Một dòng hàng cần đo, đã tách khỏi Prisma để hàm đo kiện test được mà không cần database. */
export interface MeasurableLine {
  quantity: number;
  weightGrams: number;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
}

export interface PackageMeasurement {
  /** Tổng khối lượng thật của hàng trong kiện. */
  actualWeightGrams: number;
  /** Khối lượng quy đổi từ thể tích kiện. */
  volumetricWeightGrams: number;
  /** Số hãng vận chuyển thực sự tính tiền: số lớn hơn giữa hai loại trên. */
  chargeableWeightGrams: number;
  /** Loại trọng lượng quyết định cước, để đối soát khi hãng báo lại số khác. */
  weightType: 'ACTUAL' | 'VOLUMETRIC';
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  /** Không sản phẩm nào khai kích thước: để hãng áp kích thước tối thiểu thay vì bịa số. */
  hasDimensions: boolean;
}

const mmToCm = (mm: number): number => Math.ceil(mm / 10);

/**
 * Đo kiện hàng từ khối lượng và kích thước ĐÃ KHAI của từng sản phẩm.
 *
 * Xếp kiện theo cách đơn giản và đoán được: dài/rộng lấy số lớn nhất trong các món, cao cộng dồn
 * theo số lượng — tức coi như xếp chồng lên nhau. Đây là xấp xỉ, không phải bài toán xếp thùng
 * tối ưu; chọn nó vì nó không bao giờ khai NHỎ hơn kiện thật, mà khai nhỏ hơn mới là thứ khiến
 * hãng cân lại rồi truy thu cửa hàng.
 *
 * Cước thực tế tính theo số lớn hơn giữa khối lượng thật và khối lượng quy đổi thể tích. Hàng cồng
 * kềnh nhẹ cân — thảm tập, giàn tạ — luôn rơi vào vế quy đổi, và đó chính là nhóm hàng mà cách
 * tính cũ (nhân số lượng với 500g, không gửi kích thước) sai nhiều nhất.
 */
export function measurePackageFrom(lines: readonly MeasurableLine[]): PackageMeasurement {
  let actualWeightGrams = 0;
  let lengthCm = 0;
  let widthCm = 0;
  let heightCm = 0;

  /**
   * Đo được kiện chỉ khi **MỌI** dòng đều khai đủ ba chiều.
   *
   * Chỉ cần một món thiếu kích thước là phần kiện của món đó không được cộng vào, nên con số gửi
   * đi NHỎ hơn kiện thật — đúng thứ mà cách tính này tồn tại để tránh. Thà không khai kích thước và
   * để hãng áp mức tối thiểu, còn hơn khai một con số chắc chắn thiếu.
   */
  const hasDimensions =
    lines.length > 0 && lines.every((line) => line.lengthMm && line.widthMm && line.heightMm);

  for (const line of lines) {
    const unitWeight = line.weightGrams > 0 ? line.weightGrams : DEFAULT_ITEM_WEIGHT_GRAMS;
    actualWeightGrams += unitWeight * line.quantity;

    if (hasDimensions) {
      lengthCm = Math.max(lengthCm, mmToCm(line.lengthMm!));
      widthCm = Math.max(widthCm, mmToCm(line.widthMm!));
      heightCm += mmToCm(line.heightMm!) * line.quantity;
    }
  }

  actualWeightGrams = Math.max(DEFAULT_ITEM_WEIGHT_GRAMS, actualWeightGrams);
  const volumetricWeightGrams = hasDimensions
    ? Math.ceil((lengthCm * widthCm * heightCm) / VOLUMETRIC_DIVISOR) * 1000
    : 0;
  const chargeableWeightGrams = Math.max(actualWeightGrams, volumetricWeightGrams);

  return {
    actualWeightGrams,
    volumetricWeightGrams,
    chargeableWeightGrams,
    weightType: volumetricWeightGrams > actualWeightGrams ? 'VOLUMETRIC' : 'ACTUAL',
    lengthCm,
    widthCm,
    heightCm,
    hasDimensions,
  };
}

