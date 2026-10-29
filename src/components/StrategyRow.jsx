import { useState, memo, useEffect } from 'react';
import { GripVertical, Trash2, SquarePen } from 'lucide-react';

const WEEKDAYS = [
  { key: 'mon', label: 'M' },
  { key: 'tue', label: 'T' },
  { key: 'wed', label: 'W' },
  { key: 'thu', label: 'Th' },
  { key: 'fri', label: 'F' },
  { key: 'sat', label: 'Sa' },
  { key: 'sun', label: 'Su' },
];

const QTY_OPTIONS = Array.from({ length: 100 }, (_, i) => String(i + 1));

const StrategyRow = memo(({
  row,
  idx,
  dteTab,
  PillDropdown,
  DTEMultiSelect,
  BudgetDaysMultiSelect,
  onUpdateRow,
  onToggleSelected,
  onToggleWeekday,
  onDelete,
  onOpenInBuilder,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  // Local state for budget percentage to avoid fight-while-typing
  const [localBudgetPct, setLocalBudgetPct] = useState(String(row.budgetPct || 0));

  // Sync local state when row.budgetPct changes from parent (e.g., main slippage input)
  useEffect(() => {
    setLocalBudgetPct(String(row.budgetPct || 0));
  }, [row.budgetPct]);

  const qtyOptions = Array.from(new Set([...QTY_OPTIONS, String(row.qty)]));

  const handleBudgetBlur = () => {
    const parsed = Number(localBudgetPct) || 0;
    onUpdateRow(row.id, { budgetPct: parsed });
  };

  const rowBaseBg = row.selected ? 'transparent' : '#F8F8F8';
  const budgetPctColor = row.selected ? '#2A2A2A' : '#E4E4E7';
  const qtyColor = row.selected ? '#3A3A3A' : '#E4E4E7';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="pf-strategy-row group flex items-center gap-6 px-6 py-2.5 flex-wrap lg:flex-nowrap transition-colors"
      style={{ backgroundColor: rowBaseBg }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = rowBaseBg)}
    >
      <button
        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
        title="Drag to reorder"
        type="button"
      >
        <GripVertical size={17} />
      </button>

      <input
        type="checkbox"
        checked={row.selected}
        onChange={() => onToggleSelected(row.id)}
        className="w-4 h-4 rounded cursor-pointer shrink-0"
        style={{ accentColor: '#0782DA' }}
      />

      <div className="min-w-[10rem] flex items-center gap-1.5">
        <div>
          <p className="text-[14px] font-medium" style={{ color: '#2a2a2a' }}>{row.name}</p>
          <p className="text-[11px]" style={{ color: '#9CA3AF' }}>
            {row.symbol} <span className="mx-1">•</span> {row.strategy_type}
          </p>
        </div>
        <button
          type="button"
          title="Open this strategy in the Strategy Builder"
          onClick={() => onOpenInBuilder?.(row.id, row.name, row.version)}
          disabled={!onOpenInBuilder}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 disabled:cursor-not-allowed"
          style={{ color: '#0782DA' }}
        >
          <SquarePen size={17} />
        </button>
      </div>

      <div className="w-32 shrink-0">
        <PillDropdown
          value={String(row.qty)}
          onChange={(v) => onUpdateRow(row.id, { qty: Number(v) })}
          options={qtyOptions}
          className="w-full"
          textColor={qtyColor}
        />
      </div>

      {dteTab === 'Weekdays' && (
        <div className="flex-1 max-w-[54rem] flex items-center justify-center gap-2.5 shrink-0 px-4">
          {WEEKDAYS.map((d) => {
            const active = row.weekdays[d.key];
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onToggleWeekday(row.id, d.key)}
                className="w-8 h-8 rounded-full text-[11px] font-medium border transition-colors"
                style={
                  active
                    ? { backgroundColor: '#ECF6FF', borderColor: '#0782DA', color: '#0782DA' }
                    : { backgroundColor: '#FFFFFF', borderColor: '#e3e3e3', color: '#9CA3AF' }
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>
      )}

      {dteTab === 'DTE' && (
        <div className="flex-1 max-w-[54rem] flex justify-center">
          <DTEMultiSelect
            selectedDTEs={row.selectedDTEs || [0]}
            onChange={(next) => onUpdateRow(row.id, { selectedDTEs: next })}
            className="w-36 shrink-0"
          />
        </div>
      )}

      {dteTab === 'Budget Days' && (
        <div className="flex-1 max-w-[54rem] flex justify-center">
          <BudgetDaysMultiSelect
            selectedBudgetDays={row.selectedBudgetDays || []}
            onChange={(next) => onUpdateRow(row.id, { selectedBudgetDays: next })}
            className="w-44 shrink-0"
          />
        </div>
      )}

      <div className="pf-nudge w-28 shrink-0 mr-20 -ml-20 flex items-center gap-1.5">
        <input
          type="number"
          value={localBudgetPct}
          onChange={(e) => setLocalBudgetPct(e.target.value)}
          onBlur={handleBudgetBlur}
          className="w-16 px-3 py-1.5 border rounded-md text-[12px] text-center focus:outline-none focus:ring-2 focus:ring-blue-200 h-[28px]"
          style={{ borderColor: '#e3e3e3', color: budgetPctColor }}
        />
        <span className="text-[12px] flex items-center h-[28px]" style={{ color: '#808080' }}>%</span>
      </div>

      <button
        onClick={() => onDelete(row.id)}
        className="transition-opacity shrink-0 opacity-0 group-hover:opacity-100"
        style={{ color: '#e0473c' }}
        title="Delete this strategy"
        type="button"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
});

StrategyRow.displayName = 'StrategyRow';

export default StrategyRow;
