'use client';

import type { Unit } from '@/domain/quantities';
import { unitLabels, units } from '@/domain/quantities';
import { SelectField } from './ui/select-field';

export function QuantityField({
  amount,
  unit,
  onAmountChange,
  onUnitChange,
  label = 'Amount',
  required = true,
  unitLocked = false,
}: {
  amount: number | null;
  unit: Unit | null;
  onAmountChange: (amount: number | null) => void;
  onUnitChange: (unit: Unit) => void;
  label?: string;
  required?: boolean;
  unitLocked?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
      <label className="field min-w-0">
        {label}
        <input
          className="native-select tabular-nums"
          type="number"
          inputMode="decimal"
          min="0"
          max="1000000"
          step="0.01"
          required={required}
          value={amount ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            onAmountChange(value === '' ? null : Number(value));
          }}
          aria-label={label}
        />
      </label>
      <div className="field">
        <span>Unit</span>
        <SelectField
          label={`${label} unit`}
          disabled={unitLocked}
          value={unit ?? ''}
          onValueChange={(value) => onUnitChange(value as Unit)}
          options={units.map((value) => ({ value, label: unitLabels[value] }))}
        />
      </div>
    </div>
  );
}
