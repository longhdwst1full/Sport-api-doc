import { measurePackageFrom, type MeasurableLine } from './package-measurement';

/**
 * Cước vận chuyển tính trên số này. Trước đây chỗ tạo vận đơn nhân số lượng với hằng số 500g và
 * KHÔNG gửi kích thước, nên hãng báo cước trên một kiện tưởng tượng — khai nhỏ hơn kiện thật thì
 * hãng cân lại rồi truy thu cửa hàng.
 */
function line(overrides: Partial<MeasurableLine> = {}): MeasurableLine {
  return {
    quantity: 1,
    weightGrams: 1_000,
    lengthMm: 200,
    widthMm: 150,
    heightMm: 100,
    ...overrides,
  };
}

describe('measurePackageFrom', () => {
  it('cộng khối lượng đã khai theo số lượng, không dùng hằng số', () => {
    const measurement = measurePackageFrom([
      line({ weightGrams: 2_500, quantity: 2 }),
      line({ weightGrams: 300, quantity: 1 }),
    ]);

    expect(measurement.actualWeightGrams).toBe(2_500 * 2 + 300);
  });

  /** Dài/rộng lấy món lớn nhất, cao cộng dồn theo số lượng — coi như xếp chồng. */
  it('xếp kiện: dài rộng lấy lớn nhất, cao cộng dồn', () => {
    const measurement = measurePackageFrom([
      line({ lengthMm: 200, widthMm: 150, heightMm: 100, quantity: 2 }),
      line({ lengthMm: 400, widthMm: 100, heightMm: 50, quantity: 1 }),
    ]);

    expect(measurement.lengthCm).toBe(40);
    expect(measurement.widthCm).toBe(15);
    expect(measurement.heightCm).toBe(10 * 2 + 5);
    expect(measurement.hasDimensions).toBe(true);
  });

  /**
   * Hàng cồng kềnh nhẹ cân là nhóm cách tính cũ sai nhiều nhất: thảm tập, giàn tạ. Cước phải theo
   * trọng lượng quy đổi thể tích, không theo cân nặng thật.
   */
  it('hàng cồng kềnh nhẹ cân tính cước theo trọng lượng quy đổi', () => {
    const measurement = measurePackageFrom([
      line({ weightGrams: 800, lengthMm: 1_200, widthMm: 600, heightMm: 400 }),
    ]);

    // 120 × 60 × 40 = 288.000 cm³ ÷ 5000 = 57,6 → làm tròn lên 58 kg
    expect(measurement.volumetricWeightGrams).toBe(58_000);
    expect(measurement.chargeableWeightGrams).toBe(58_000);
    expect(measurement.weightType).toBe('VOLUMETRIC');
  });

  it('hàng nặng gọn thì tính theo cân nặng thật', () => {
    const measurement = measurePackageFrom([
      line({ weightGrams: 20_000, lengthMm: 300, widthMm: 200, heightMm: 150 }),
    ]);

    expect(measurement.weightType).toBe('ACTUAL');
    expect(measurement.chargeableWeightGrams).toBe(20_000);
  });

  /** Chưa khai cân nặng thì rơi về mặc định, nhưng đó là đường lùi chứ không phải cách tính chính. */
  it('sản phẩm chưa khai cân nặng dùng giá trị mặc định', () => {
    const measurement = measurePackageFrom([line({ weightGrams: 0, quantity: 3 })]);

    expect(measurement.actualWeightGrams).toBe(500 * 3);
  });

  /**
   * Không món nào khai đủ ba chiều thì KHÔNG bịa kích thước: để hãng áp kích thước tối thiểu của
   * họ, vì một con số tự nghĩ ra cũng là một con số sai.
   */
  it('thiếu kích thước thì không gửi kích thước lên hãng', () => {
    const measurement = measurePackageFrom([
      line({ lengthMm: null, widthMm: null, heightMm: null, weightGrams: 2_000 }),
    ]);

    expect(measurement.hasDimensions).toBe(false);
    expect(measurement.volumetricWeightGrams).toBe(0);
    expect(measurement.weightType).toBe('ACTUAL');
    expect(measurement.chargeableWeightGrams).toBe(2_000);
  });

  /**
   * Trường hợp nguy hiểm nhất và từng bị bỏ sót: MỘT món đủ kích thước, một món thiếu.
   *
   * Bản đầu đặt `hasDimensions = true` ngay khi có một dòng đủ, nên kiện gửi lên hãng chỉ tính
   * phần món đo được và bỏ hẳn món còn lại — khai NHỎ hơn kiện thật, đúng thứ cách tính này tồn
   * tại để tránh. Máy tập có kích thước + thảm tập thiếu kích thước là ví dụ thật.
   */
  it('một dòng đủ kích thước, một dòng thiếu thì KHÔNG khai kích thước', () => {
    const measurement = measurePackageFrom([
      line({ lengthMm: 1_200, widthMm: 600, heightMm: 400, weightGrams: 30_000 }),
      line({ lengthMm: null, widthMm: null, heightMm: null, weightGrams: 900 }),
    ]);

    expect(measurement.hasDimensions).toBe(false);
    expect(measurement.lengthCm).toBe(0);
    expect(measurement.volumetricWeightGrams).toBe(0);
    // Cân nặng vẫn cộng đủ cả hai món; chỉ kích thước là thứ không đo được.
    expect(measurement.actualWeightGrams).toBe(30_900);
    expect(measurement.chargeableWeightGrams).toBe(30_900);
    expect(measurement.weightType).toBe('ACTUAL');
  });

  /** Khai thiếu một chiều cũng là không đo được: ba chiều phải đủ mới tính được thể tích. */
  it('khai thiếu một chiều thì bỏ qua kích thước của dòng đó', () => {
    const measurement = measurePackageFrom([
      line({ lengthMm: 500, widthMm: 400, heightMm: null, weightGrams: 1_000 }),
    ]);

    expect(measurement.hasDimensions).toBe(false);
  });

  it('kiện rỗng vẫn có khối lượng tối thiểu để hãng nhận đơn', () => {
    expect(measurePackageFrom([]).chargeableWeightGrams).toBe(500);
  });

  /** Milimet đổi sang centimet phải làm TRÒN LÊN: làm tròn xuống là khai nhỏ hơn kiện thật. */
  it('đổi mm sang cm bằng cách làm tròn lên', () => {
    const measurement = measurePackageFrom([
      line({ lengthMm: 201, widthMm: 151, heightMm: 101 }),
    ]);

    expect(measurement.lengthCm).toBe(21);
    expect(measurement.widthCm).toBe(16);
    expect(measurement.heightCm).toBe(11);
  });
});

/**
 * Báo giá và tạo vận đơn phải gửi CÙNG một kiện cho hãng.
 *
 * GHN tự tính trọng lượng quy đổi thể tích, nhưng chỉ từ kích thước ta gửi lên. Báo giá gửi thiếu
 * kích thước thì GHN báo giá trên một kiện 1cm; tới lúc tạo vận đơn gửi kích thước thật thì hãng
 * thu theo kiện thật, và phần chênh rơi vào cửa hàng.
 */
describe('cùng một công thức cho báo giá và vận đơn', () => {
  /** Thảm tập 1,2m × 0,6m × 0,4m nặng 800g — hàng cồng kềnh nhẹ cân điển hình. */
  const bulkyLight = {
    quantity: 1,
    weightGrams: 800,
    lengthMm: 1_200,
    widthMm: 600,
    heightMm: 400,
  };

  it('gửi kích thước lên hãng, còn khối lượng vẫn là khối lượng thật', () => {
    const measurement = measurePackageFrom([bulkyLight]);

    // Gửi lên hãng: khối lượng thật + kích thước, để hãng tự quy đổi.
    expect(measurement.actualWeightGrams).toBe(800);
    expect(measurement.hasDimensions).toBe(true);
    expect(measurement.lengthCm).toBe(120);
    expect(measurement.widthCm).toBe(60);
    expect(measurement.heightCm).toBe(40);
  });

  /** Biểu phí dự phòng nội bộ phải chia bậc theo đúng con số hãng dùng để tính tiền. */
  it('trọng lượng tính cước là số quy đổi, không phải 800g', () => {
    const measurement = measurePackageFrom([bulkyLight]);

    expect(measurement.chargeableWeightGrams).toBe(58_000);
    expect(measurement.weightType).toBe('VOLUMETRIC');
    // Với mốc mặc định (nhẹ ≤ 5kg, trung ≤ 20kg), 58kg rơi vào bậc nặng — đúng như hãng thu.
    expect(measurement.chargeableWeightGrams).toBeGreaterThan(20_000);
  });

  /**
   * Hồi quy: bản checkout cũ cộng `weightGrams * quantity` rồi `Math.max(1, …)`, nên sản phẩm chưa
   * khai cân nặng báo giá trên **1 gram** trong khi vận đơn gửi 500g.
   */
  it('sản phẩm chưa khai cân nặng không rơi về 1 gram', () => {
    const measurement = measurePackageFrom([
      { quantity: 2, weightGrams: 0, lengthMm: null, widthMm: null, heightMm: null },
    ]);

    expect(measurement.actualWeightGrams).toBe(1_000);
    expect(measurement.actualWeightGrams).not.toBe(1);
  });
});
