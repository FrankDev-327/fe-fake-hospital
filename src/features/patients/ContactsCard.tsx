import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Card, QueryState } from '@/components/ui';
import { useToast } from '@/components/toast-context';
import { errorMessage } from '@/lib/errors';
import { useAddContact, useContacts } from './api';
import { t, zmsg } from '@/i18n';

const ContactForm = z.object({
  relationship: z
    .string()
    .trim()
    .min(2, zmsg('patients.relationshipHint'))
    .max(50),
  name: z.string().trim().min(1, zmsg('common.required')).max(200),
  phone: z.string().trim().min(6, zmsg('patients.min6')).max(30),
});
type ContactForm = z.infer<typeof ContactForm>;

/** Who to call about the patient. Everyone on the care team reads it, the front desk adds. */
export function ContactsCard({
  patientId,
  canAdd,
}: {
  patientId: string;
  canAdd: boolean;
}) {
  const contacts = useContacts(patientId);
  const [adding, setAdding] = useState(false);
  return (
    <Card title={t('patients.contacts')}>
      <QueryState
        query={contacts}
        isEmpty={(c) => c.length === 0 && !canAdd}
        empty={t('patients.noContacts')}
      >
        {(items) => (
          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">
                {t('patients.noContactsYet')}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {items.map((c) => (
                  <li key={c.id}>
                    <div className="font-medium">
                      {c.name}{' '}
                      <span className="font-normal text-slate-500">
                        ({c.relationship})
                      </span>
                    </div>
                    <a
                      href={`tel:${c.phone.replace(/\s/g, '')}`}
                      className="text-teal-700"
                    >
                      {c.phone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {canAdd &&
              (adding ? (
                <AddContactForm
                  patientId={patientId}
                  onDone={() => setAdding(false)}
                />
              ) : (
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  {t('patients.addContact')}
                </Button>
              ))}
          </div>
        )}
      </QueryState>
    </Card>
  );
}

function AddContactForm({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone: () => void;
}) {
  const add = useAddContact(patientId);
  const toast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContactForm>({ resolver: zodResolver(ContactForm) });

  return (
    <form
      noValidate
      className="space-y-3 border-t border-slate-100 pt-4"
      onSubmit={handleSubmit(async (values) => {
        await add.mutateAsync(values).then(
          () => {
            toast(t('patients.contactAdded'));
            onDone();
          },
          () => {}, // shown below from add.error
        );
      })}
    >
      {add.error && <Alert>{errorMessage(add.error)}</Alert>}
      <TextField
        label={t('patients.relationship')}
        error={errors.relationship?.message}
        {...register('relationship')}
      />
      <TextField
        label={t('common.name')}
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label={t('common.phone')}
        type="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.saving') : t('patients.saveContact')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
