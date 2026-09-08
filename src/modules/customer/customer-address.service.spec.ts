import { PrismaService } from '../../database/prisma.service';
import { CustomerAddressService } from './customer-address.service';

describe('CustomerAddressService', () => {
  const findCustomer = jest.fn();
  const findAddresses = jest.fn();
  const prisma = {
    customer: { findUnique: findCustomer },
    customerAddress: { findMany: findAddresses },
  } as unknown as PrismaService;
  const service = new CustomerAddressService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('lists only addresses owned by the authenticated customer', async () => {
    findCustomer.mockResolvedValue({ id: 9n, userId: 4n });
    findAddresses.mockResolvedValue([{
      id: 12n,
      recipient: 'Nguyễn Văn An',
      phone: '+84912345678',
      addressLine: '12 Nguyễn Trãi',
      ward: null,
      district: 'Quận 1',
      provinceCode: '79',
      postalCode: null,
      countryCode: 'VN',
      isDefault: true,
      version: 0n,
    }]);

    const result = await service.list('4');

    expect(findAddresses).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 9n, status: 'ACTIVE' },
    }));
    expect(result[0]).toMatchObject({ id: '12', phone: '+84912345678', version: 0 });
  });
});
