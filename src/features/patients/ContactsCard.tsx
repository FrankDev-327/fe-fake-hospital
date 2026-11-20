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

const ContactForm = z.object({
  relationship: z.string().trim().min(2, 'e.g. Wife, Son, Neighbour').max(50),
  name: z.string().trim().min(1, 'Required').max(200),
  phone: z.string().trim().min(6, 'At least 6 characters').max(30),
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
    <Card title="Contacts">
      <QueryState
        query={contacts}
        isEmpty={(c) => c.length === 0 && !canAdd}
        empty="No contacts."
      >
        {(items) => (
          <div className="space-y-4">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">No contacts yet.</p>
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
                  Add contact
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
            toast('Contact added');
            onDone();
          },
          () => {}, // shown below from add.error
        );
      })}
    >
      {add.error && <Alert>{errorMessage(add.error)}</Alert>}
      <TextField
        label="Relationship"
        error={errors.relationship?.message}
        {...register('relationship')}
      />
      <TextField
        label="Name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Phone"
        type="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save contact'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
