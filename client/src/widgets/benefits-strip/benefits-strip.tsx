import { Dumbbell, ShieldCheck, Truck, type LucideIcon } from 'lucide-react';

const BENEFITS: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: Truck, title: 'Giao từ kho gần nhất', description: 'Thời gian và phí giao rõ ràng.' },
  {
    icon: ShieldCheck,
    title: 'Thanh toán an toàn',
    description: 'Thanh toán một lần, đối soát đầy đủ.',
  },
  {
    icon: Dumbbell,
    title: 'Tư vấn đúng nhu cầu',
    description: 'Chọn thiết bị theo không gian và mục tiêu.',
  },
];

export function BenefitsStrip() {
  return (
    <section id="benefits" className="border-y border-ink/10 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-8 md:grid-cols-3 lg:px-10">
        {BENEFITS.map(({ icon: Icon, title, description }) => (
          <div key={title} className="flex gap-4">
            <Icon className="mt-1 text-brand-600" aria-hidden="true" />
            <div>
              <h2 className="font-bold">{title}</h2>
              <p className="mt-1 text-sm text-stone-500">{description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
