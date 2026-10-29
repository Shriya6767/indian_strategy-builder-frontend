// "2024-03-06" -> "3/6/2024", the bracketed date style under Days for MDD.
const mdyDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

// Whole-rupee figures with comma grouping: 601, -1,029, 4,657.
const fmtAmount = (value) =>
  Math.round(Number(value)).toLocaleString('en-IN');

const MonthlyStatsTable = ({ monthlyStats, headingClass = 'text-[24px] font-medium',
  /* Empty data draws the HEADINGS with no rows beneath, instead of a line of
     text. The portfolio page needs that: unticking every strategy must leave
     the table standing and empty, not replace it with a sentence. */
  emptyAsTable = false }) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const isEmpty = !monthlyStats || Object.keys(monthlyStats).length === 0;
  if (isEmpty && !emptyAsTable) {
    return (
      <div className="px-8 py-8">
        <h3 className={`${headingClass} mb-2`} style={{ color: '#2A2A2A' }}>Year-wise Returns</h3>
        <p className="text-gray-500">No yearly stats data available</p>
      </div>
    );
  }

  // AlgoTest colours a value by its sign; zero counts as non-negative (green).
  const colorClass = (value) => {
    if (value === undefined || value === null || value === '') return 'text-gray-400';
    return Number(value) >= 0 ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="px-8 py-8">
      <h3 className={`${headingClass} mb-6`} style={{ color: '#2A2A2A' }}>Year-wise Returns</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr style={{ backgroundColor: '#E3E3E3' }}>
              <th className="text-left py-3 px-4 text-[14px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>Year</th>
              {months.map(month => (
                <th key={month} className="text-left py-3 px-4 text-[14px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>
                  {month}
                </th>
              ))}
              <th className="text-left py-3 px-4 text-[14px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>Total</th>
              <th className="text-left py-3 px-4 text-[14px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>Max Drawdown</th>
              <th className="text-left py-3 px-4 text-[14px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>Days for MDD</th>
              <th className="text-left py-3 px-4 text-[14px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>*R/MDD (Yearly)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(monthlyStats).map(([year, yearData]) => {
              const monthsData = yearData.months || yearData;
              const total = yearData.total ?? months.reduce((sum, m) => {
                const v = monthsData[m];
                return sum + (typeof v === 'number' ? v : 0);
              }, 0);
              const maxDrawdown = yearData.max_drawdown ?? yearData.maxDrawdown ?? null;
              const mddStart = yearData.mdd_start ?? yearData.mddStart ?? null;
              const mddEnd = yearData.mdd_end ?? yearData.mddEnd ?? null;
              const daysForMdd = yearData.days_for_mdd ?? yearData.daysForMdd ?? null;
              const rMdd = yearData.r_mdd ?? yearData.rMdd ??
                (maxDrawdown ? total / Math.abs(maxDrawdown) : null);

              return (
                <tr key={year} className="border-b last:border-b-0" style={{ borderColor: '#f0f0f0' }}>
                  <td className="py-3.5 px-4 text-[12px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>{year}</td>
                  {months.map(month => {
                    const value = monthsData[month];
                    const isEmpty = value === undefined || value === null || value === '';
                    return (
                      <td key={month} className={`py-3.5 px-3 whitespace-nowrap ${colorClass(value)}`}>
                        {isEmpty ? '' : fmtAmount(value)}
                      </td>
                    );
                  })}
                  <td className={`py-3.5 px-3 whitespace-nowrap ${colorClass(total)}`}>{fmtAmount(total)}</td>
                  <td className="py-3.5 px-3 whitespace-nowrap text-red-600">
                    {maxDrawdown !== null ? fmtAmount(maxDrawdown) : '---'}
                  </td>
                  <td className="py-3.5 px-4 text-[12px] font-light whitespace-nowrap" style={{ color: '#3A3A3A' }}>
                    {daysForMdd !== null ? (
                      <>
                        {daysForMdd}
                        {mddStart && mddEnd && (
                          <div className="text-[11px] text-gray-400 leading-tight">
                            [{mdyDate(mddStart)} to {mdyDate(mddEnd)}]
                          </div>
                        )}
                      </>
                    ) : '---'}
                  </td>
                  <td className={`py-3.5 px-3 whitespace-nowrap ${colorClass(rMdd)}`}>
                    {rMdd !== null ? parseFloat(Number(rMdd).toFixed(2)) : '---'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MonthlyStatsTable;
