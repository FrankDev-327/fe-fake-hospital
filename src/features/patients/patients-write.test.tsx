import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PATIENTS } from '@/mocks/data/patients';
import { mockDb } from '@/mocks/db';
import { renderApp } from '@/test/render-app';

const josip = PATIENTS[0]!;

describe('receptionist: register a patient', () => {
  it('registers, opens the new record, and finds it in search', async () => {
    const { user, router } = renderApp('/patients', { as: 'receptionist' });
    await user.click(
      await screen.findByRole('link', { name: 'Register patient' }),
    );

    await user.type(await screen.findByLabelText('First name'), 'Iva');
    await user.type(screen.getByLabelText('Last name'), 'Perković');
    await user.type(screen.getByLabelText('Date of birth'), '1985-06-15');
    await user.selectOptions(screen.getByLabelText('Sex'), 'Female');
    await user.type(screen.getByLabelText('OIB'), '69435151530');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(
      await screen.findByRole('heading', { name: 'Perković, Iva' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toMatch(
      /^\/patients\/[0-9a-f-]{36}$/,
    );
    expect(screen.getByText('69435151530')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Patients' }));
    await user.type(await screen.findByLabelText('Search patients'), 'perko');
    expect(await screen.findByText('Perković, Iva')).toBeInTheDocument();
  });

  it('checks the OIB before sending', async () => {
    const { user } = renderApp('/patients/new', { as: 'receptionist' });
    await user.type(await screen.findByLabelText('OIB'), '12345678901');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText(/Not a valid OIB/)).toBeInTheDocument();
    expect(screen.getAllByText('Required')).toHaveLength(3); // first, last name, date of birth
  });

  it('points to the existing record when the OIB is already registered', async () => {
    const { user } = renderApp('/patients/new', { as: 'receptionist' });
    await user.type(await screen.findByLabelText('First name'), 'Josip');
    await user.type(screen.getByLabelText('Last name'), 'Matić');
    await user.type(screen.getByLabelText('Date of birth'), '1948-03-12');
    await user.type(screen.getByLabelText('OIB'), josip.oib!);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`already registered as ${josip.mrn}`);
    expect(
      within(alert).getByRole('link', { name: 'Open their record' }),
    ).toBeInTheDocument();
  });
});

describe('receptionist: edit a patient', () => {
  it('saves only the change and shows it', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'receptionist' });
    await user.click(await screen.findByRole('link', { name: 'Edit details' }));
    const phone = await screen.findByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '+385 99 123 4567');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('+385 99 123 4567')).toBeInTheDocument();
    expect(mockDb.get().patients[0]!.version).toBe(2);
  });

  it('refuses to overwrite a change someone else made meanwhile', async () => {
    const { user } = renderApp(`/patients/${josip.id}/edit`, {
      as: 'receptionist',
    });
    const address = await screen.findByLabelText('Address');
    // a colleague saves the patient while this form is open
    mockDb.get().patients[0]!.version = 5;

    await user.clear(address);
    await user.type(address, 'Vlaška 10, Zagreb');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText(/Someone else changed this patient/),
    ).toBeInTheDocument();
  });

  it('adds a contact', async () => {
    const { user } = renderApp(`/patients/${josip.id}`, { as: 'receptionist' });
    await user.click(
      await screen.findByRole('button', { name: 'Add contact' }),
    );
    await user.type(screen.getByLabelText('Relationship'), 'Daughter');
    await user.type(screen.getByLabelText('Name'), 'Petra Matić');
    await user.type(screen.getByLabelText('Phone'), '+385 91 555 0000');
    await user.click(screen.getByRole('button', { name: 'Save contact' }));
    expect(await screen.findByText('Petra Matić')).toBeInTheDocument();
  });

  it('is not possible for a doctor (no edit button, no add contact)', async () => {
    renderApp(`/patients/${josip.id}`, { as: 'doctor' });
    expect(await screen.findByText('Ana Matić')).toBeInTheDocument(); // contacts are visible
    expect(
      screen.queryByRole('link', { name: 'Edit details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add contact' }),
    ).not.toBeInTheDocument();
  });
});
