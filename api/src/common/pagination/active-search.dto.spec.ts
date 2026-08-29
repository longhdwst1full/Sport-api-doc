import { buildActiveLookupResponse } from './active-search.dto';

describe('buildActiveLookupResponse', () => {
  const items = [
    { id: '2', code: 'CN-HN-01', label: 'Chi nhánh Hà Nội' },
    { id: '1', code: 'CN-HCM-01', label: 'Chi nhánh Hồ Chí Minh' },
    { id: '3', code: 'CN-DN-01', label: 'Chi nhánh Đà Nẵng' },
  ];

  it('searches code and Vietnamese label on the backend', () => {
    expect(buildActiveLookupResponse(items, { search: 'hồ chí minh', page: 1, limit: 20 })).toEqual({
      items: [{ id: '1', code: 'CN-HCM-01', label: 'Chi nhánh Hồ Chí Minh' }],
      meta: { page: 1, limit: 20, total: 1, hasMore: false },
    });
  });

  it('returns stable server pagination metadata', () => {
    const result = buildActiveLookupResponse(items, { page: 1, limit: 2 });
    expect(result.items.map((item) => item.code)).toEqual(['CN-DN-01', 'CN-HCM-01']);
    expect(result.meta).toEqual({ page: 1, limit: 2, total: 3, hasMore: true });
  });
});
