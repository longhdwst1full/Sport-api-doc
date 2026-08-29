import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f3ea] p-6 text-center">
      <div>
        <p className="text-sm font-bold text-brand-600">404</p>
        <h1 className="mt-2 text-4xl font-extrabold">Không tìm thấy nội dung</h1>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 font-bold text-white"
        >
          Về trang chủ
        </Link>
      </div>
    </main>
  );
}
