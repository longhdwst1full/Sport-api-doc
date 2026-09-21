import {
  buildUniqueMasterSlug,
  deriveMasterCode,
  slugifyMasterName,
} from './catalog-master-identifiers';

describe('slug và mã của brand/category', () => {
  it('bỏ dấu tiếng Việt và đổi đ thành d', () => {
    expect(slugifyMasterName('Giày Đá Bóng Nam')).toBe('giay-da-bong-nam');
  });

  it('gộp ký tự lạ thành một dấu nối và không để nối thừa ở hai đầu', () => {
    expect(slugifyMasterName('  Áo/Quần — Thể Thao!! ')).toBe('ao-quan-the-thao');
  });

  it('dùng chuỗi dự phòng khi tên không tạo được slug', () => {
    expect(buildUniqueMasterSlug('🏀🏀', [])).toBe('muc');
  });

  it('nối số thứ tự khi slug đã có người dùng', () => {
    expect(buildUniqueMasterSlug('Nike', ['nike'])).toBe('nike-2');
    expect(buildUniqueMasterSlug('Nike', ['nike', 'nike-2'])).toBe('nike-3');
  });

  it('mã suy từ slug nên luôn khớp nhau', () => {
    expect(deriveMasterCode('giay-da-bong-nam')).toBe('GIAY-DA-BONG-NAM');
  });

  it('cắt mã theo giới hạn cột mà không để lại dấu nối cụt', () => {
    const slug = buildUniqueMasterSlug('a'.repeat(40), []);
    expect(deriveMasterCode(slug)).toHaveLength(32);
  });
});
