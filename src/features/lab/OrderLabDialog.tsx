import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { errorMessage } from '@/lib/errors';
import { rangeText, useLabActions, useLabTests } from './api';

/** Doctor: pick tests from the catalog, routine or urgent. */
export function OrderLabDialog({
  patientId,
  encounterId,
  onClose,
}: {
  patientId: string;
  encounterId: string;
  onClose: () => void;
}) {
  const catalog = useLabTests();
  const { order } = useLabActions(patientId);
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [priority, setPriority] = useState<'routine' | 'urgent'>('routine');
  const toggle = (code: string) =>
    setPicked((p) =>
      p.includes(code) ? p.filter((c) => c !== code) : [...p, code],
    );

  return (
    <Modal title="Order lab tests" onClose={onClose}>
      <div className="space-y-4">
        <QueryState query={catalog}>
          {(tests) => (
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">
                Tests
              </legend>
              <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
                {tests.map((t) => (
                  <label
                    key={t.code}
                    className="flex items-start gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={picked.includes(t.code)}
                      onChange={() => toggle(t.code)}
                    />
                    <span>
                      {t.name}
                      <span className="block text-xs text-slate-400">
                        {rangeText(t)} {t.unit}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </QueryState>
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Priority</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="priority"
              checked={priority === 'routine'}
              onChange={() => setPriority('routine')}
            />
            Routine
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="priority"
              checked={priority === 'urgent'}
              onChange={() => setPriority('urgent')}
            />
            Urgent
          </label>
        </fieldset>
        {order.error && (
          <Alert>
            {errorMessage(order.error, {
              encounter_closed: 'The visit is closed: order in an open visit.',
              unknown_lab_tests:
                'One of the tests is not in the catalog anymore.',
            })}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked.length || order.isPending}
            onClick={() =>
              order.mutate(
                { encounterId, tests: picked, priority },
                {
                  onSuccess: () => {
                    toast(
                      `${picked.length} test${picked.length > 1 ? 's' : ''} ordered`,
                    );
                    onClose();
                  },
                },
              )
            }
          >
            Order {picked.length || ''} {picked.length === 1 ? 'test' : 'tests'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
