import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateProductDto,
  ListProductsQueryDto,
  ProductDetailDto,
  ProductListResponseDto,
  UpdateProductDto,
} from '../dto/product.dto';

@Injectable()
export class ProductsService {
  private readonly products: ProductDetailDto[] = [
    {
      id: randomUUID(),
      name: 'Máy chạy bộ DCTD Pro X1',
      slug: 'may-chay-bo-dctd-pro-x1',
      sku: 'RUN-X1',
      brand: 'DCTD',
      category: 'Máy tập cardio',
      description: 'Máy chạy bộ gia đình, động cơ 3HP và vùng chạy rộng.',
      price: 18_990_000,
      currency: 'VND',
      imageUrl: 'https://images.unsplash.com/photo-1576678927484-cc907957088c',
      gallery: ['https://images.unsplash.com/photo-1576678927484-cc907957088c'],
      rating: 4.8,
      reviewCount: 124,
      available: true,
      availableQuantity: 12,
      variants: [
        {
          id: 'variant-run-x1',
          sku: 'RUN-X1',
          name: 'Tiêu chuẩn',
          price: 18_990_000,
          availableQuantity: 12,
          attributes: { color: 'Đen' },
        },
      ],
      tags: ['Bán chạy', 'Giao nhanh'],
    },
    {
      id: randomUUID(),
      name: 'Combo tập gym tại nhà',
      slug: 'combo-tap-gym-tai-nha',
      sku: 'COMBO-HOME-01',
      brand: 'DCTD',
      category: 'Combo',
      description: 'Combo cố định gồm thảm yoga, dây kháng lực và hai tạ tay.',
      price: 1_490_000,
      currency: 'VND',
      imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438',
      gallery: ['https://images.unsplash.com/photo-1517836357463-d25dfeac3438'],
      rating: 4.7,
      reviewCount: 48,
      available: true,
      availableQuantity: 20,
      variants: [
        {
          id: 'variant-combo-home-01',
          sku: 'COMBO-HOME-01',
          name: 'Combo cố định',
          price: 1_490_000,
          availableQuantity: 20,
          attributes: {},
        },
      ],
      bundle: {
        bundleType: 'FIXED',
        components: [
          { componentSku: 'MAT-YOGA-01', componentName: 'Thảm yoga', quantity: 1 },
          { componentSku: 'BAND-SET-01', componentName: 'Bộ dây kháng lực', quantity: 1 },
          { componentSku: 'DUMBBELL-05', componentName: 'Tạ tay 5 kg', quantity: 2 },
        ],
      },
      tags: ['Combo'],
    },
  ];

  list(query: ListProductsQueryDto): ProductListResponseDto {
    const search = query.search?.trim().toLocaleLowerCase('vi');
    const filtered = this.products.filter((product) => {
      const matchesSearch =
        !search ||
        `${product.name} ${product.brand} ${product.sku}`.toLocaleLowerCase('vi').includes(search);
      const matchesCategory = !query.category || product.category === query.category;
      return matchesSearch && matchesCategory;
    });
    const start = (query.page - 1) * query.limit;
    return {
      items: filtered.slice(start, start + query.limit),
      meta: {
        page: query.page,
        limit: query.limit,
        total: filtered.length,
        totalPages: Math.max(1, Math.ceil(filtered.length / query.limit)),
      },
    };
  }

  getBySlug(slug: string): ProductDetailDto {
    const product = this.products.find((item) => item.slug === slug);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  create(input: CreateProductDto): ProductDetailDto {
    const product: ProductDetailDto = {
      ...input,
      id: randomUUID(),
      currency: 'VND',
      gallery: [input.imageUrl],
      rating: 0,
      reviewCount: 0,
      available: input.availableQuantity > 0,
      variants: [
        {
          id: randomUUID(),
          sku: input.sku,
          name: input.name,
          price: input.price,
          availableQuantity: input.availableQuantity,
          attributes: {},
        },
      ],
      tags: input.tags ?? [],
    };
    this.products.unshift(product);
    return product;
  }

  update(id: string, input: UpdateProductDto): ProductDetailDto {
    const index = this.products.findIndex((product) => product.id === id);
    if (index < 0) throw new NotFoundException('Product not found');
    const current = this.products[index];
    const next = { ...current, ...input };
    next.available = next.availableQuantity > 0;
    next.variants = next.variants.map((variant, variantIndex) =>
      variantIndex === 0
        ? {
            ...variant,
            sku: next.sku,
            name: next.name,
            price: next.price,
            availableQuantity: next.availableQuantity,
          }
        : variant,
    );
    this.products[index] = next;
    return next;
  }
}
