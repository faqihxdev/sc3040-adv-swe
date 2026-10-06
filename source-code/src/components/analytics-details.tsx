'use client';

import { useState } from 'react';
import type { QuantityEvent } from '@/domain/model';
import { formatQuantity, units, unitLabels } from '@/domain/quantities';
import { todaySingapore } from '@/domain/meals';
import { Modal } from './common';
import { SelectField } from './ui/select-field';
import { Button } from './ui/button';

const reasonLabels: Record<string, string> = {
  spoiled: 'Spoiled',
  past_date: 'Past date',
  prep: 'Prep scraps',
  other: 'Other',
  unspecified: 'Unspecified',
};

export function AmountRecords({
  events,
  start,
  end,
  onClose,
}: {
  events: QuantityEvent[];
  start: string;
  end: string;
  onClose: () => void;
}) {
  const [unit, setUnit] = useState('all');
  const [kind, setKind] = useState('discarded');
  const rows = events
    .filter((event) => {
      const date = todaySingapore(new Date(event.created_at));
      return (
        !event.voided &&
        Math.abs(event.amount) > 0 &&
        date >= start &&
        date <= end &&
        (event.kind === 'used' || event.kind === 'discarded') &&
        (kind === 'both' || event.kind === kind) &&
        (unit === 'all' || event.unit === unit)
      );
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name));
  return (
    <Modal
      title="Amount records"
      description="Recorded use and waste for the selected reporting period."
      onClose={onClose}
      wide
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Record type"
          value={kind}
          onValueChange={setKind}
          options={[
            { value: 'discarded', label: 'Waste' },
            { value: 'used', label: 'Used' },
            { value: 'both', label: 'Used and waste' },
          ]}
        />
        <SelectField
          label="Record unit"
          value={unit}
          onValueChange={setUnit}
          options={[
            { value: 'all', label: 'All units' },
            ...units.map((value) => ({ value, label: unitLabels[value] })),
          ]}
        />
      </div>
      {rows.length ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-left text-xs sm:text-sm">
            <caption className="sr-only">Recorded amounts</caption>
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="w-[18%] p-2 font-semibold sm:p-3">
                  Date
                </th>
                <th scope="col" className="w-[32%] p-2 font-semibold sm:p-3">
                  Ingredient
                </th>
                <th scope="col" className="w-[23%] p-2 font-semibold sm:p-3">
                  Amount
                </th>
                <th scope="col" className="p-2 font-semibold sm:p-3">
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-2 align-top sm:p-3">
                    <time dateTime={row.created_at}>
                      {new Date(row.created_at).toLocaleDateString('en-SG', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'Asia/Singapore',
                      })}
                    </time>
                  </td>
                  <td className="p-2 align-top font-medium sm:p-3">{row.name}</td>
                  <td className="p-2 align-top tabular-nums sm:p-3">
                    {formatQuantity(Math.abs(row.amount), row.unit)}
                  </td>
                  <td className="p-2 align-top sm:p-3">
                    {row.kind === 'used'
                      ? 'Cooked'
                      : reasonLabels[row.discard_reason ?? 'unspecified']}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="helper py-6 text-center">No matching amount records in this period.</p>
      )}
      <p className="helper">
        {rows.length} {rows.length === 1 ? 'record' : 'records'}. Amounts retain their original
        units.
      </p>
    </Modal>
  );
}
