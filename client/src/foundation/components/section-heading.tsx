import type { ReactNode } from 'react';

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-9 flex items-end justify-between gap-5">
      <div>
        <p className="font-bold uppercase tracking-[.2em] text-brand-600">{eyebrow}</p>
        <h2 className="mt-2 text-4xl font-extrabold">{title}</h2>
      </div>
      {action}
    </div>
  );
}
