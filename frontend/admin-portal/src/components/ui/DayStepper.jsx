// DayStepper — ‹ day › for anything shown one day at a time: My Sections'
// attendance grid, and the homes' attendance (the admin's Present tile, the
// teacher's Today cards). Days after `max` (today, by default) can't be
// picked: no attendance is saved for a day that hasn't come.
//
//   picker       adds a date field between the arrows, for jumping far back
//   todayButton  adds "Today", disabled while on today

import Button from "./Button";
import { shiftISODate, todayISO } from "../../utils/format";

export default function DayStepper({
  value,
  onChange,
  max = todayISO(),
  min,
  picker = false,
  todayButton = false,
  className = "",
}) {
  const today = todayISO();
  const clamp = (iso) => (max && iso > max ? max : min && iso < min ? min : iso);
  return (
    <div role="group" aria-label="Choose a day" className={`flex shrink-0 items-center gap-1.5 ${className}`}>
      <Button
        variant="secondary" size="sm" iconOnly icon="ti-chevron-left"
        aria-label="Previous day" title="Previous day"
        disabled={Boolean(min) && value <= min}
        onClick={() => onChange(shiftISODate(value, -1))}
      />
      {picker && (
        <input
          type="date"
          aria-label="Day"
          value={value}
          min={min}
          max={max}
          // Clearing the field leaves the day as it was rather than no day.
          onChange={(e) => e.target.value && onChange(clamp(e.target.value))}
          className="focus-ring h-8 cursor-pointer rounded-md border-[1.5px] border-neutral-300 bg-surface px-2.5 text-xs font-bold text-neutral-900"
        />
      )}
      <Button
        variant="secondary" size="sm" iconOnly icon="ti-chevron-right"
        aria-label="Next day" title="Next day"
        disabled={Boolean(max) && value >= max}
        onClick={() => onChange(shiftISODate(value, 1))}
      />
      {todayButton && (
        <Button variant="secondary" size="sm" disabled={value === today} onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}
