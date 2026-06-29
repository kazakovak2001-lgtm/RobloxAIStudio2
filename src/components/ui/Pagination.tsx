interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
        type="button"
      >
        Prev
      </button>
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            currentPage === page
              ? "border-brand-400/50 bg-brand-500/15 text-brand-200"
              : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
          }`}
          type="button"
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
        type="button"
      >
        Next
      </button>
    </div>
  );
}
