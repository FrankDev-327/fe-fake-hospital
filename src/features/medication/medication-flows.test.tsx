import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PATIENTS } from '@/mocks/data/patients';
import { renderApp } from '@/test/render-app';

const josip = PATIENTS[0]!; // penicillin allergy (J01C), open visit
const mira = PATIENTS[1]!;

/** The list item of one prescription in the "Active medication" card */
const prescription = async (name: string) =>
  (
    await screen.findByText(
      new RegExp(`^${name} \\d`) /* "Name 500 mg", not the toast */,
      { selector: 'div' },
    )
  ).closest('li')!;

async function prescribe(
  user: ReturnType<typeof renderApp>['user'],
  drug: string,
) {
  await user.click(await screen.findByRole('button', { name: 'Prescribe' }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText('Drug'), drug.slice(0, 4));
  await user.click(
    await within(dialog).findByRole('button', { name: new RegExp(drug) }),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Prescribe' }));
  return dialog;
}

describe('doctor: prescribing with safety checks', () => {
  it('blocks amoxicillin for a penicillin allergy until a reason is written', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'doctor' });
    const dialog = await prescribe(user, 'Amoxicillin');

    expect(
      await within(dialog).findByText('Stopped by a safety check'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/active allergy to this drug or its group/),
    ).toBeInTheDocument();
    const anyway = within(dialog).getByRole('button', {
      name: 'Prescribe anyway',
    });
    expect(anyway).toBeDisabled();

    await user.type(
      within(dialog).getByLabelText(/Prescribe anyway\? Write why/),
      'Allergy was a childhood rash, tolerated amoxicillin in 2024',
    );
    await user.click(anyway);
    const item = await prescription('Amoxicillin');
    expect(within(item).getByText('Allergy override')).toBeInTheDocument();
  });

  it('asks to acknowledge a duplicate therapy', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'doctor' });
    const dialog = await prescribe(user, 'Ceftriaxone');
    expect(
      await within(dialog).findByText(/same active ingredient/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText('I have checked these'));
    await user.click(within(dialog).getByRole('button', { name: 'Prescribe' }));
    await screen.findByText('Prescribed Ceftriaxone');
    expect(
      await screen.findAllByText(/^Ceftriaxone 1 g/, { selector: 'div' }),
    ).toHaveLength(2);
  });

  it('stops a prescription with a reason', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'doctor' });
    await user.click(
      within(await prescription('Enoxaparin')).getByRole('button', {
        name: 'Stop',
      }),
    );
    await user.type(
      screen.getByLabelText('Reason'),
      'Patient walking, no more risk',
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop' }),
    );
    await screen.findByText('Enoxaparin stopped');
    expect(
      screen.queryByText(/^Enoxaparin 40 mg/, { selector: 'div' }),
    ).not.toBeInTheDocument();
  });
});

describe('nurse: recording doses', () => {
  it('records a dose, and it shows up in the history', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'nurse' });
    const item = await prescription('Paracetamol');
    await user.click(within(item).getByRole('button', { name: 'Record dose' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }),
    );
    await screen.findByText('Paracetamol: given');

    await user.click(
      within(await prescription('Paracetamol')).getByRole('button', {
        name: 'History',
      }),
    );
    expect(
      await within(await prescription('Paracetamol')).findAllByText('Given'),
    ).toHaveLength(2);
  });

  it('warns when a dose is too soon, and records it only when confirmed with a note', async () => {
    const { user } = renderApp(`/patients/${mira.id}`, { as: 'nurse' });
    await user.click(
      within(await prescription('Ramipril')).getByRole('button', {
        name: 'Record dose',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText('Too soon')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.click(within(dialog).getByLabelText(/Give it early anyway/));
    await user.type(
      within(dialog).getByLabelText('Note (required)'),
      'Doctor asked to give it now',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Ramipril: given')).toBeInTheDocument();
  });

  it('needs a reason for a skipped dose', async () => {
    const { user } = renderApp(`/patients/${mira.id}`, { as: 'nurse' });
    await user.click(
      within(await prescription('Metformin')).getByRole('button', {
        name: 'Record dose',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('Skipped'));
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText('Note (required)'),
      'Fasting for ultrasound',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Metformin: skipped')).toBeInTheDocument();
  });

  it('records from the medication round too', async () => {
    const { user } = renderApp('/medication', { as: 'nurse' });
    await user.click(
      await screen
        .findByRole('button', {
          name: 'Record Paracetamol 500 mg for Matić, Josip',
        })
        .catch(() =>
          screen.findByRole('button', {
            name: 'Record Paracetamol for Matić, Josip',
          }),
        ),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }),
    );
    expect(await screen.findByText('Paracetamol: given')).toBeInTheDocument();
  });
});
