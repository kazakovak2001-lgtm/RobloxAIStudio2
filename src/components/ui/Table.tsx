interface TableProps {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  className?: string;
}

export function Table({ headers, rows, className = "" }: TableProps) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 ${className}`}>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {headers.map((header, index) => (
              <th key={index} className="px-4 py-3 font-medium text-slate-400">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-white/5 transition hover:bg-white/5"
            >
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 text-slate-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
