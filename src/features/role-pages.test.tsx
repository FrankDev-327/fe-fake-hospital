import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PATIENTS } from '@/mocks/data/patients';
import { renderApp } from '@/test/render-app';

/** What each demo user sees on their pages, with the fake backend's data. */

const josip = PATIENTS[0]!; // Ana's patient, penicillin allergy
const branko = PATIENTS[6]!; // Dr. Šimić's patient: not Ana's, not Ivan's

describe('doctor (Dr. Ana Kovač)', () => {
  it('sees only her own patients', async () => {
    renderApp('/patients', { as: 'doctor' });
    expect(await screen.findByText('Matić, Josip')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 6); // header + 6 patients
    expect(screen.queryByText('Kovačević, Branko')).not.toBeInTheDocument();
  });

  it('filters her patients by name, without accents, or by MRN', async () => {
    const { user } = renderApp('/patients', { as: 'doctor' });
    const box = await screen.findByLabelText('Filter my patients');
    await screen.findByText('Matić, Josip');

    await user.type(box, 'matic');
    expect(screen.getByText('Matić, Josip')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 1);

    await user.clear(box);
    await user.type(box, josip.mrn.toLowerCase());
    expect(screen.getByText('Matić, Josip')).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'nobody');
    expect(
      screen.getByText(/None of your patients matches/),
    ).toBeInTheDocument();
  });

  it('opens a chart with allergy warning and active medication', async () => {
    renderApp(`/patients/${josip.id}`, { as: 'doctor' });
    expect(
      await screen.findByRole('heading', { name: 'Matić, Josip' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Allergy warning: Penicillin (severe)',
    );
    expect(await screen.findByText('Ceftriaxone 1 g')).toBeInTheDocument();
    expect(screen.getByText('1 g IV every 24 h')).toBeInTheDocument();
  });

  it('sees names on the ward board only for her patients', async () => {
    renderApp('/ward', { as: 'doctor' });
    expect(await screen.findByText('Matić, Josip')).toBeInTheDocument();
    expect(screen.getAllByText('Occupied').length).toBeGreaterThan(0); // someone else's patient
    expect(screen.getByText('Out of service')).toBeInTheDocument();
  });

  it('sees her appointments for the week', async () => {
    renderApp('/appointments', { as: 'doctor' });
    expect(await screen.findByText('Matić, Ana')).toBeInTheDocument();
    expect(screen.getByText('No-show')).toBeInTheDocument();
  });
});

describe('nurse (Ivan Horvat)', () => {
  it("gets 'not found' for a patient who isn't theirs", async () => {
    renderApp(`/patients/${branko.id}`, { as: 'nurse' });
    expect(
      await screen.findByRole('heading', { name: 'Patient not found' }),
    ).toBeInTheDocument();
  });

  it('can filter his patients too', async () => {
    const { user } = renderApp('/patients', { as: 'nurse' });
    await user.type(await screen.findByLabelText('Filter my patients'), 'kata');
    expect(await screen.findByText('Vuković, Kata')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 1);
  });

  it('sees the medication round, overdue doses first', async () => {
    renderApp('/medication', { as: 'nurse' });
    expect(
      await screen.findByRole('heading', { name: 'Medication round' }),
    ).toBeInTheDocument();
    const rows = await screen.findAllByRole('row');
    expect(rows).toHaveLength(1 + 10); // header + 10 active prescriptions
    expect(within(rows[1]!).getByText(/Overdue/)).toBeInTheDocument();
  });
});

describe('lab technician (Marija Babić)', () => {
  it('sees the worklist, urgent first, and can switch tabs', async () => {
    const { user } = renderApp('/lab', { as: 'lab_tech' });
    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]!).getByText('Urgent')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Potassium')).toBeInTheDocument(); // Josip's urgent recheck

    await user.click(screen.getByRole('tab', { name: /Collected/ }));
    expect(await screen.findByText('INR')).toBeInTheDocument();
  });
});

describe('pharmacist (Petra Novak)', () => {
  it('searches the drug catalog', async () => {
    const { user } = renderApp('/medication', { as: 'pharmacist' });
    await user.type(await screen.findByLabelText('Search drugs'), 'para');
    expect(await screen.findByText('Paracetamol')).toBeInTheDocument();
    expect(screen.getByText('N02BE01')).toBeInTheDocument();
  });
});

describe('receptionist (Luka Jurić)', () => {
  it('searches all patients and keeps the search in the URL', async () => {
    const { user, router } = renderApp('/patients', { as: 'receptionist' });
    await user.type(await screen.findByLabelText('Search patients'), 'matić');
    expect(await screen.findByText('Matić, Josip')).toBeInTheDocument();
    expect(screen.getByText('Matić, Ana')).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ q: 'matić' });
  });

  it('sees demographics but no clinical data', async () => {
    renderApp(`/patients/${josip.id}`, { as: 'receptionist' });
    expect(await screen.findByText(josip.oib!)).toBeInTheDocument();
    expect(screen.queryByText('Allergies')).not.toBeInTheDocument();
    expect(screen.queryByText(/Allergy warning/)).not.toBeInTheDocument();
  });

  it("picks a doctor and sees that doctor's schedule", async () => {
    const { user } = renderApp('/appointments', { as: 'receptionist' });
    await user.selectOptions(
      await screen.findByLabelText('Doctor'),
      'Dr. Marko Šimić',
    );
    expect(await screen.findByText('Blažević, Sanja')).toBeInTheDocument();
  });
});

describe('admin (Tomislav Perić)', () => {
  it('sees and filters the staff list', async () => {
    const { user } = renderApp('/admin', { as: 'admin' });
    expect(await screen.findByText('Šimić, Marko')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Role'), 'Nurse');
    expect(await screen.findByText('Marić, Ivana')).toBeInTheDocument();
    expect(screen.queryByText('Šimić, Marko')).not.toBeInTheDocument();
  });

  it('sees reports with small counts hidden', async () => {
    renderApp('/reports', { as: 'admin' });
    expect(await screen.findByText('Whole hospital')).toBeInTheDocument();
    expect((await screen.findAllByText('<5')).length).toBeGreaterThan(0);
  });

  it('cannot open patient charts (no clinical data for admin)', async () => {
    const { router } = renderApp('/ward', { as: 'admin' });
    expect(
      await screen.findByRole('heading', { name: /Tomislav Perić/ }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
