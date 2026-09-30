// compare/Legend.jsx — a chart's key. Each swatch takes the shape of the mark
// it stands for: a square for a column, a dot for a dot, a short rule for a
// line. An item with no colour is a plain note ("Above each column: ...").

const SWATCH = {
  square: "h-2.5 w-2.5 rounded-[3px]",
  dot: "h-2.5 w-2.5 rounded-full",
  line: "h-[3px] w-3.5 rounded-[2px]",
};

export default function Legend({ items, shape = "square", className = "" }) {
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1.5 ${className}`}>
      {items.map((item) => (
        <span key={item.key ?? item.label} className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
          {item.color && (
            <span
              className={`inline-block shrink-0 ${SWATCH[shape] ?? SWATCH.square}`}
              style={{ background: item.color }}
              aria-hidden="true"
            />
          )}
          <span>{item.label}</span>
          {item.value && <strong className="font-bold text-neutral-900">{item.value}</strong>}
        </span>
      ))}
    </div>
  );
}
