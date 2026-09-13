export interface BaoAnDemoProduct {
  productNo: string;
  name: string;
  slug: string;
  brandCode: string;
  categoryCode: string;
  sku: string;
  amount: string;
  initialOnHand: number;
  reorderPoint: number;
  shortDescription: string;
  sourceUrl: string;
  imageUrl: string;
}

export const BAO_AN_BRANDS = [
  { code: 'PRO_FITNESS', name: 'Pro Fitness', slug: 'pro-fitness' },
  { code: 'SAKURA', name: 'Sakura', slug: 'sakura' },
  { code: 'BAO_AN', name: 'Bảo An Sport', slug: 'bao-an-sport' },
  { code: 'WOLON', name: 'Wolon', slug: 'wolon' },
  { code: 'BN', name: 'BN', slug: 'bn' },
  { code: '729', name: '729', slug: '729' },
] as const;

export interface BaoAnDemoCategory {
  code: string;
  name: string;
  slug: string;
  sortOrder: number;
  description: string;
  /** Ảnh nguồn; seed tải lên Cloudinary rồi gắn vào `Category.imageAssetId`. */
  imageUrl?: string;
  sourceUrl?: string;
}

/** Ba danh mục gốc của seed nền, gom cùng chỗ để script categories dùng chung manifest. */
export const CORE_CATEGORIES: readonly BaoAnDemoCategory[] = [
  {
    code: 'GYM', name: 'Gym & Sức mạnh', slug: 'tap-gym', sortOrder: 10,
    description: 'Tạ đơn, tạ đòn, ghế tập, giàn tạ đa năng và phụ kiện thể hình chuyên nghiệp.',
    imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/thiet-bi-gym/',
  },
  {
    code: 'RUNNING', name: 'Chạy bộ & Cardio', slug: 'chay-bo', sortOrder: 20,
    description: 'Máy chạy bộ gia đình, máy chèo thuyền, xe đạp tập và phụ kiện marathon.',
    imageUrl: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/chay-bo/',
  },
  {
    code: 'ACCESSORY', name: 'Phụ kiện thể thao', slug: 'phu-kien-the-thao', sortOrder: 30,
    description: 'Phụ kiện bảo hộ, bình nước, túi tập và thiết bị đo lường cho mọi bộ môn.',
    imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/phu-kien-the-thao/',
  },
];

export const BAO_AN_CATEGORIES: readonly BaoAnDemoCategory[] = [
  {
    code: 'TREADMILL', name: 'Máy chạy bộ', slug: 'may-chay-bo', sortOrder: 40,
    description: 'Máy chạy bộ gia đình và phòng gym, băng tải rộng, hỗ trợ bài tập cardio hằng ngày.',
    imageUrl: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/may-chay-bo/',
  },
  {
    code: 'WEIGHT_BENCH', name: 'Ghế tập tạ', slug: 'ghe-tap-ta', sortOrder: 50,
    description: 'Ghế tập đa năng, giàn tạ và phụ kiện thể hình cho phòng tập tại gia.',
    imageUrl: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/ghe-tap-ta/',
  },
  {
    code: 'MARTIAL_ARTS', name: 'Võ thuật & Boxing', slug: 'dung-cu-vo-thuat', sortOrder: 60,
    description: 'Bao cát đấm bốc, găng tay đối kháng boxing và băng quấn tay thể thao.',
    imageUrl: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/dung-cu-vo-thuat/',
  },
  {
    code: 'TABLE_TENNIS', name: 'Dụng cụ bóng bàn', slug: 'dung-cu-bong-ban', sortOrder: 70,
    description: 'Bàn bóng bàn thi đấu đạt chuẩn ITTF, vợt carbon và máy bắn bóng tự động.',
    imageUrl: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/dung-cu-bong-ban/',
  },
  {
    code: 'FOOTBALL', name: 'Bóng đá & Đồng đội', slug: 'bong-da', sortOrder: 80,
    description: 'Quả bóng tiêu chuẩn FIFA, giày đinh sân cỏ nhân tạo và phụ kiện thủ môn.',
    imageUrl: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/bong-da/',
  },
  {
    code: 'YOGA', name: 'Yoga & Phục hồi cơ', slug: 'yoga-phuc-hoi', sortOrder: 90,
    description: 'Thảm định tuyến, con lăn foam roller, bóng gai massage và dây kháng lực.',
    imageUrl: 'https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/yoga/',
  },
  {
    code: 'CYCLING', name: 'Xe đạp thể thao', slug: 'xe-dap-the-thao', sortOrder: 100,
    description: 'Xe đạp kháng lực từ, xe đạp spinning và phụ kiện đồng hồ đo nhịp tim.',
    imageUrl: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80',
    sourceUrl: 'https://baoansport.vn/xe-dap-the-thao/',
  },
];

export const BAO_AN_PRODUCTS: readonly BaoAnDemoProduct[] = [
  {
    productNo: 'BA-MCB-PF113DA',
    name: 'Máy chạy bộ Pro Fitness PF-113DA',
    slug: 'may-chay-bo-pro-fitness-pf-113da',
    brandCode: 'PRO_FITNESS', categoryCode: 'TREADMILL', sku: 'PF-113DA',
    amount: '12400000.00', initialOnHand: 5, reorderPoint: 2,
    shortDescription: 'Máy chạy bộ đa năng dành cho nhu cầu luyện tập tại gia đình.',
    sourceUrl: 'https://baoansport.vn/may-chay-bo/may-chay-bo-pro-fitness-pf-113da/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/may-chay-bo-pro-fitness-pf-113da.jpg',
  },
  {
    productNo: 'BA-MCB-PF117D',
    name: 'Máy chạy bộ Pro Fitness PF-117D',
    slug: 'may-chay-bo-pro-fitness-pf-117d',
    brandCode: 'PRO_FITNESS', categoryCode: 'TREADMILL', sku: 'PF-117D',
    amount: '20500000.00', initialOnHand: 4, reorderPoint: 2,
    shortDescription: 'Thiết bị cardio gia đình với thiết kế hiện đại và vùng chạy rộng.',
    sourceUrl: 'https://baoansport.vn/may-chay-bo/may-chay-bo-pro-fitness-pf-117d/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/may-chay-bo-pro-fitness-pf-117d.jpg',
  },
  {
    productNo: 'BA-MCB-HQV2C',
    name: 'Máy chạy bộ Sakura HQ-V2C',
    slug: 'may-chay-bo-sakura-hq-v2c',
    brandCode: 'SAKURA', categoryCode: 'TREADMILL', sku: 'SAKURA-HQ-V2C',
    amount: '20000000.00', initialOnHand: 5, reorderPoint: 2,
    shortDescription: 'Máy chạy bộ gia đình hỗ trợ các bài tập cardio thường ngày.',
    sourceUrl: 'https://baoansport.vn/may-chay-bo/may-chay-bo-sakura-hq-v2c/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/may-chay-bo-sakura-hq-v2c-7.jpg',
  },
  {
    productNo: 'BA-MCB-SAKURAV8',
    name: 'Máy chạy bộ phòng Gym Sakura V8',
    slug: 'may-chay-bo-phong-gym-sakura-v8',
    brandCode: 'SAKURA', categoryCode: 'TREADMILL', sku: 'SAKURA-V8',
    amount: '38000000.00', initialOnHand: 3, reorderPoint: 1,
    shortDescription: 'Máy chạy bộ cường độ cao phù hợp phòng tập và không gian luyện tập chuyên nghiệp.',
    sourceUrl: 'https://baoansport.vn/may-chay-bo/may-chay-bo-phong-gym-sakura-v8/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/may-chay-bo-sakura-v8.jpg',
  },
  {
    productNo: 'BA-GHE-DDS1201',
    name: 'Ghế tập Gym đa năng DDS-1201',
    slug: 'ghe-tap-gym-da-nang-dds-1201',
    brandCode: 'BAO_AN', categoryCode: 'WEIGHT_BENCH', sku: 'DDS-1201',
    amount: '2200000.00', initialOnHand: 10, reorderPoint: 3,
    shortDescription: 'Ghế tập đa năng gọn gàng dành cho các bài tập thể lực tại nhà.',
    sourceUrl: 'https://baoansport.vn/ghe-tap-ta/ghe-tap-gym-da-nang-dds-1201/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/ghe-tap-gym-dds-1201.jpg',
  },
  {
    productNo: 'BA-GHE-T058',
    name: 'Ghế tập tạ đa năng T058',
    slug: 'ghe-tap-ta-da-nang-t058',
    brandCode: 'BAO_AN', categoryCode: 'WEIGHT_BENCH', sku: 'GHE-T058',
    amount: '4050000.00', initialOnHand: 8, reorderPoint: 3,
    shortDescription: 'Ghế tập tạ đa năng cho nhiều nhóm cơ, phù hợp không gian gia đình.',
    sourceUrl: 'https://baoansport.vn/ghe-tap-ta/ghe-tap-ta-da-nang-t058/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/ghe-tap-ta-da-nang-t052.jpg',
  },
  {
    productNo: 'BA-GHE-GM4380',
    name: 'Ghế tập tạ GM 4380',
    slug: 'ghe-tap-ta-gm-4380',
    brandCode: 'BAO_AN', categoryCode: 'WEIGHT_BENCH', sku: 'GM-4380',
    amount: '6650000.00', initialOnHand: 7, reorderPoint: 2,
    shortDescription: 'Ghế tập tạ đa chức năng hỗ trợ bài tập ngực, tay, bụng và chân.',
    sourceUrl: 'https://baoansport.vn/ghe-tap-ta/ghe-tap-ta-gm-4380/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/ghe-tap-ta-gm-4380.jpg',
  },
  {
    productNo: 'BA-GHE-G02',
    name: 'Ghế tập tạ G02',
    slug: 'ghe-tap-ta-g02',
    brandCode: 'BAO_AN', categoryCode: 'WEIGHT_BENCH', sku: 'GHE-G02',
    amount: '5900000.00', initialOnHand: 7, reorderPoint: 2,
    shortDescription: 'Ghế đẩy tạ khung thép dành cho bài tập cơ ngực tại nhà hoặc phòng tập nhỏ.',
    sourceUrl: 'https://baoansport.vn/ghe-tap-ta/ghe-tap-ta-g02/',
    imageUrl: 'https://baoansport.vn/uploads/2025/02/ghe-tap-ta-g02.jpg',
  },
  {
    productNo: 'BA-MMA-WOLON',
    name: 'Găng tay MMA Wolon',
    slug: 'gang-tay-mma-wolon',
    brandCode: 'WOLON', categoryCode: 'MARTIAL_ARTS', sku: 'MMA-WOLON',
    amount: '400000.00', initialOnHand: 30, reorderPoint: 8,
    shortDescription: 'Găng MMA hở ngón hỗ trợ luyện tập võ đối kháng.',
    sourceUrl: 'https://baoansport.vn/gang-tay-boxing/gang-tay-mma-wolon/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/gang-tay-mma-wolon.jpg',
  },
  {
    productNo: 'BA-MMA-BN',
    name: 'Găng tay MMA BN',
    slug: 'gang-tay-mma-bn',
    brandCode: 'BN', categoryCode: 'MARTIAL_ARTS', sku: 'MMA-BN',
    amount: '400000.00', initialOnHand: 28, reorderPoint: 8,
    shortDescription: 'Găng MMA hở ngón dành cho tập luyện kỹ thuật và đối kháng.',
    sourceUrl: 'https://baoansport.vn/gang-tay-boxing/gang-tay-mma-bn/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/gang-tay-mma-bn-0.jpg',
  },
  {
    productNo: 'BA-BOX-KID-BN',
    name: 'Găng tay Boxing trẻ em BN',
    slug: 'gang-tay-boxing-tre-em-bn',
    brandCode: 'BN', categoryCode: 'MARTIAL_ARTS', sku: 'BOX-KID-BN',
    amount: '375000.00', initialOnHand: 24, reorderPoint: 6,
    shortDescription: 'Găng boxing cỡ nhỏ dành cho trẻ em làm quen với võ thuật.',
    sourceUrl: 'https://baoansport.vn/gang-tay-boxing/gang-tay-boxing-tre-em-bn/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/gang-tay-boxing-tre-em-bn-2.jpg',
  },
  {
    productNo: 'BA-BOX-BN',
    name: 'Găng tay Boxing BN',
    slug: 'gang-tay-boxing-bn',
    brandCode: 'BN', categoryCode: 'MARTIAL_ARTS', sku: 'BOX-BN',
    amount: '450000.00', initialOnHand: 32, reorderPoint: 8,
    shortDescription: 'Găng boxing cơ bản giúp bảo vệ bàn tay và cổ tay khi luyện tập.',
    sourceUrl: 'https://baoansport.vn/gang-tay-boxing/gang-tay-boxing-bn/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/gang-tay-boxing-bn.jpg',
  },
  {
    productNo: 'BA-VBB-729-3',
    name: 'Vợt bóng bàn 729 Very 3 Star',
    slug: 'vot-bong-ban-729-very-3-star',
    brandCode: '729', categoryCode: 'TABLE_TENNIS', sku: '729-VERY-3',
    amount: '350000.00', initialOnHand: 26, reorderPoint: 7,
    shortDescription: 'Vợt bóng bàn lắp sẵn phù hợp người mới và nhu cầu luyện tập phổ thông.',
    sourceUrl: 'https://baoansport.vn/vot-bong-ban/vot-bong-ban-729-very-3-star/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/vot-bong-ban-729-very-3-star.jpg',
  },
  {
    productNo: 'BA-VBB-729-6',
    name: 'Vợt bóng bàn 729 Very 6 sao',
    slug: 'vot-bong-ban-729-very-6-sao',
    brandCode: '729', categoryCode: 'TABLE_TENNIS', sku: '729-VERY-6',
    amount: '480000.00', initialOnHand: 24, reorderPoint: 7,
    shortDescription: 'Vợt bóng bàn lắp sẵn cho người chơi muốn nâng cấp khả năng kiểm soát bóng.',
    sourceUrl: 'https://baoansport.vn/vot-bong-ban/vot-bong-ban-729-very-6-sao/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/vot-bong-ban-729-very-6-sao.jpg',
  },
  {
    productNo: 'BA-VBB-729-8',
    name: 'Vợt bóng bàn 729 Very 8 sao',
    slug: 'vot-bong-ban-729-very-8-sao',
    brandCode: '729', categoryCode: 'TABLE_TENNIS', sku: '729-VERY-8',
    amount: '650000.00', initialOnHand: 20, reorderPoint: 6,
    shortDescription: 'Vợt bóng bàn phân khúc nâng cao, cân bằng tốc độ và độ kiểm soát.',
    sourceUrl: 'https://baoansport.vn/vot-bong-ban/vot-bong-ban-729-very-8-sao/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/vot-bong-ban-729-very-8-sao.jpg',
  },
  {
    productNo: 'BA-VBB-729-9',
    name: 'Vợt bóng bàn 729 Very 9 sao',
    slug: 'vot-bong-ban-729-very-9-sao',
    brandCode: '729', categoryCode: 'TABLE_TENNIS', sku: '729-VERY-9',
    amount: '1150000.00', initialOnHand: 16, reorderPoint: 5,
    shortDescription: 'Vợt bóng bàn cao cấp kèm hộp đựng, phù hợp người chơi thường xuyên.',
    sourceUrl: 'https://baoansport.vn/vot-bong-ban/vot-bong-ban-729-very-9-sao/',
    imageUrl: 'https://baoansport.vn/uploads/2025/01/vot-bong-ban-729-very-9-sao.jpg',
  },
] as const;
