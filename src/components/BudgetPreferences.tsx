import type { InsightData } from "../insights";

export function BudgetPreferences({ data, onChange }: { data: InsightData; onChange: (patch: Partial<InsightData>) => void }) {
  const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return <div className="budget-controls"><div><span className="field-caption">Working days</span><div className="workdays">
    {labels.map((label, day) => <button key={label} type="button" aria-label={label} aria-pressed={data.workingDays.includes(day)}
      className={data.workingDays.includes(day) ? "selected" : ""} onClick={() => {
        const days = data.workingDays.includes(day) ? data.workingDays.filter(value => value !== day) : [...data.workingDays, day];
        if (days.length) onChange({ workingDays: days });
      }}>{label[0]}</button>)}
    </div></div><label className="reserve-control">Keep {data.reserve}% in reserve<input aria-label="Reserve percentage" type="range" min={0} max={50} step={5} value={data.reserve} onChange={event => onChange({ reserve: Number(event.target.value) })} /></label>
  </div>;
}
