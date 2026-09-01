// Deliberately not a charting library — a handful of divs is all a "how
// many requests per day" trend needs, and it's one less dependency.
export default function BarChart({ data, valueKey = 'count', labelKey = 'label', color = '#3B82F6' }) {
  if (data.length === 0) {
    return <div className="text-gray-400 text-sm py-8 text-center">Not enough data for this period.</div>
  }

  const max = Math.max(1, ...data.map((d) => d[valueKey]))

  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
          <div className="text-[10px] text-gray-500 mb-1">{d[valueKey]}</div>
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max(2, (d[valueKey] / max) * 100)}%`,
              backgroundColor: color,
            }}
            title={`${d[labelKey]}: ${d[valueKey]}`}
          />
          <span className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">{d[labelKey]}</span>
        </div>
      ))}
    </div>
  )
}
