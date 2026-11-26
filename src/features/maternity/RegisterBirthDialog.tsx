import { useState } from 'react';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { SelectField } from '@/components/fields';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/toast-context';
import { useAuth } from '@/auth/auth-context';
import { useDoctors } from '@/features/appointments/api';
import { useWards } from '@/features/ward/api';
import { errorMessage } from '@/lib/errors';
import {
  NEWBORN_WARD_KINDS,
  SEX_OPTIONS,
  useBedsOf,
  useDeliveryActions,
  useNurses,
} from './api';
import type { BabySex, Delivery } from './api';
import { t } from '@/i18n';

/** Date -> "YYYY-MM-DDTHH:mm" in the computer's time, for <input type="datetime-local"> */
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * A baby is born. Fast on purpose (a nurse may do it alone, the mother can't wait for paperwork):
 * sex, time, cot, the baby's doctor, who helped. Name, OIB and MBO come later.
 */
export function RegisterBirthDialog({
  delivery,
  onClose,
}: {
  delivery: Delivery;
  onClose: () => void;
}) {
  const { state } = useAuth();
  const me = state.user!;
  const toast = useToast();
  const { registerBirth } = useDeliveryActions();
  const doctors = useDoctors();
  const nurses = useNurses();
  const wards = useWards();
  const cotWards =
    wards.data?.filter((w) => NEWBORN_WARD_KINDS.includes(w.kind)) ?? [];
  const boards = useBedsOf(cotWards);
  const freeCots = boards.flatMap(
    (b) =>
      b.data?.beds
        .filter((bed) => bed.state === 'free')
        .map((bed) => ({
          value: bed.bedId,
          label: t('mat.cotLabel', {
            ward: b.data!.ward.name,
            room: bed.room,
            cot: bed.bed,
          }),
        })) ?? [],
  );

  const [sex, setSex] = useState<BabySex | ''>('');
  const [bornAt, setBornAt] = useState(() => toLocalInput(new Date()));
  const [cotBedId, setCotBedId] = useState('');
  const [primaryDoctorId, setPrimaryDoctorId] = useState('');
  const [team, setTeam] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);

  const toggle = (id: string) =>
    setTeam((t) => {
      const next = new Set(t);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const missing = !sex || !cotBedId || !primaryDoctorId || !bornAt;
  const otherDoctors = doctors.data?.filter((d) => d.id !== me.id) ?? [];
  const otherNurses = nurses.data?.filter((n) => n.id !== me.id) ?? [];

  return (
    <Modal title={t('mat.registerTitle')} onClose={onClose}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setShowErrors(true);
          if (missing) return;
          registerBirth.mutate(
            {
              id: delivery.id,
              input: {
                sex,
                bornAt: new Date(bornAt).toISOString(),
                cotBedId,
                primaryDoctorId,
                team: {
                  doctorIds: otherDoctors
                    .filter((d) => team.has(d.id))
                    .map((d) => d.id),
                  nurseIds: otherNurses
                    .filter((n) => team.has(n.id))
                    .map((n) => n.id),
                },
              },
            },
            {
              onSuccess: (res) => {
                toast(t('mat.registered', { label: res.label }));
                onClose();
              },
            },
          );
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label={t('mat.sex')}
            value={sex}
            onChange={(e) => setSex(e.target.value as BabySex)}
            error={showErrors && !sex ? 'Required' : undefined}
            options={[{ value: '', label: t('mat.choose') }, ...SEX_OPTIONS]}
          />
          <div className="space-y-1">
            <label
              htmlFor="born-at"
              className="block text-sm font-medium text-slate-700"
            >
              {t('mat.bornAt')}
            </label>
            <input
              id="born-at"
              type="datetime-local"
              value={bornAt}
              onChange={(e) => setBornAt(e.target.value)}
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/30 focus:outline-none"
            />
          </div>
        </div>
        <SelectField
          label={t('mat.cot')}
          value={cotBedId}
          onChange={(e) => setCotBedId(e.target.value)}
          error={showErrors && !cotBedId ? 'Required' : undefined}
          hint={t('mat.cotHint')}
          options={[{ value: '', label: t('mat.chooseCot') }, ...freeCots]}
        />
        <SelectField
          label={t('mat.babyDoctor')}
          value={primaryDoctorId}
          onChange={(e) => setPrimaryDoctorId(e.target.value)}
          error={showErrors && !primaryDoctorId ? 'Required' : undefined}
          hint={t('mat.babyDoctorHint')}
          options={[
            { value: '', label: t('mat.choose') },
            ...(doctors.data?.map((d) => ({
              value: d.id,
              label: `${t('common.dr')} ${d.firstName} ${d.lastName}`,
            })) ?? []),
          ]}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            {t('mat.whoHelped')}
          </legend>
          <div className="grid grid-cols-2 gap-1 text-sm">
            {otherDoctors.map((d) => (
              <label key={d.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={team.has(d.id)}
                  onChange={() => toggle(d.id)}
                />
                {t('common.dr')} {d.firstName} {d.lastName}
              </label>
            ))}
            {otherNurses.map((n) => (
              <label key={n.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={team.has(n.id)}
                  onChange={() => toggle(n.id)}
                />
                {t('mat.nurseSuffix', { name: `${n.firstName} ${n.lastName}` })}
              </label>
            ))}
          </div>
        </fieldset>
        {registerBirth.error && (
          <Alert>
            {errorMessage(registerBirth.error, {
              cot_occupied: t('mat.eCot'),
              not_a_newborn_bed: t('mat.eNotNewborn'),
              delivery_cancelled: t('mat.eCancelled'),
              not_an_active_doctor: t('mat.eDoctor'),
              not_an_active_nurse: t('mat.eNurse'),
              validation_failed: t('mat.eTime'),
            })}
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={registerBirth.isPending}>
            {t('mat.register')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
