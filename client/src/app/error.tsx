'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f6f3ea] p-6 text-center">
      <div>
        <p className="text-sm font-bold text-red-600">ĐÃ XẢY RA LỖI</p>
        <h1 className="mt-2 text-4xl font-extrabold">Không thể tải trang</h1>
        <button onClick={reset} className="mt-6 rounded-full bg-ink px-6 py-3 font-bold text-white">
          Thử lại
        </button>
      </div>
    </main>
  );
}
