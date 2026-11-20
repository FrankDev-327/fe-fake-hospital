import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openVisitId } from '@/mocks/data/charts';
import { PATIENTS } from '@/mocks/data/patients';
import { renderApp } from '@/test/render-app';

const josip = PATIENTS[0]!;
const mira = PATIENTS[1]!; // unacknowledged critical glucose
const stjepan = PATIENTS[2]!; // order waiting for collection

describe('doctor: lab', () => {
  it('orders tests from the visit page; they wait for collection on the chart', async () => {
    const { user } = renderApp(
      `/patients/${josip.id}/visits/${openVisitId(1)}`,
      { as: 'doctor' },
    );
    await user.click(
      await screen.findByRole('button', { name: 'Order lab tests' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(await within(dialog).findByLabelText(/Hemoglobin/));
    await user.click(within(dialog).getByLabelText(/C-reactive protein/));
    await user.click(within(dialog).getByLabelText('Urgent'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Order 2 tests' }),
    );
    expect(await screen.findByText('2 tests ordered')).toBeInTheDocument();
  });

  it('acknowledges a critical result', async () => {
    const { user } = renderApp(`/patients/${mira.id}`, { as: 'doctor' });
    expect(
      await screen.findByText('1 critical result waiting for a doctor'),
    ).toBeInTheDocument();
    expect(screen.getByText('Critical high')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await screen.findByText('Critical result acknowledged');
    expect(
      screen.queryByText(/critical result waiting/),
    ).not.toBeInTheDocument();
    expect(screen.getByText('seen')).toBeInTheDocument();
  });
});

describe('nurse: lab on the ward', () => {
  it('marks a sample as taken; a nurse cannot order', async () => {
    const { user } = renderApp(`/patients/${stjepan.id}`, { as: 'nurse' });
    await user.click(
      await screen.findByRole('button', { name: 'Sample taken' }),
    );
    expect(await screen.findByText('At the lab')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Order lab tests' }),
    ).not.toBeInTheDocument();
  });
});

describe('lab technician', () => {
  it('collects a sample, then it moves to the "collected" tab', async () => {
    const { user } = renderApp('/lab', { as: 'lab_tech' });
    const rows = await screen.findAllByRole('row');
    await user.click(
      within(rows[1]!).getByRole('button', { name: 'Collected' }),
    );
    await screen.findByText('Sample collected');
    await user.click(screen.getByRole('tab', { name: /Collected, waiting/ }));
    expect(await screen.findByText('Creatinine')).toBeInTheDocument();
  });

  it('enters a critical INR: the flag shows while typing, the doctor is alerted', async () => {
    const { user } = renderApp('/lab', { as: 'lab_tech' });
    await user.click(
      await screen.findByRole('tab', { name: /Collected, waiting/ }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Enter results' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('INR'), '5.6');
    expect(within(dialog).getByText('Critical high')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Save results' }),
    );
    expect(
      await screen.findByText(
        '1 result saved, 1 critical: the doctor is alerted',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText('Nothing here.')).toBeInTheDocument(); // order complete
  });
});
