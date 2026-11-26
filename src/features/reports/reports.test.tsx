import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/test/render-app';

const kpi = (label: string) =>
  screen.getByText(label, { selector: '.text-xs' }).parentElement!;

describe('reports dashboard', () => {
  it('shows headline numbers and charts for the chosen period and ward', async () => {
    const { user } = renderApp('/reports', { as: 'doctor' });
    expect(
      await screen.findByRole('heading', { name: 'Admissions and discharges' }),
    ).toBeInTheDocument();
    const month = within(kpi('Births')).getByText(/^\d/).textContent;

    // shorter period -> fewer births
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await waitFor(() =>
      expect(within(kpi('Births')).getByText(/^\d/).textContent).not.toBe(
        month,
      ),
    );
    expect(screen.getByText('Per day')).toBeInTheDocument();

    // a year is summed per month
    await user.click(screen.getByRole('button', { name: 'Last year' }));
    expect(await screen.findAllByText('Per month')).not.toHaveLength(0);

    // one ward only: the delivery ward has no patients over 64
    await user.selectOptions(screen.getByLabelText('Ward'), 'DEL');
    const age = screen
      .getByRole('heading', { name: 'Admissions by age' })
      .closest('section')!;
    await user.click(within(age).getByRole('button', { name: 'Table' }));
    const row = await within(age).findByRole('row', { name: /80\+/ });
    expect(within(row).getByText('0')).toBeInTheDocument();
  });

  it('shows small diagnosis counts as "<5" in the table view', async () => {
    const { user } = renderApp('/reports', { as: 'admin' });
    const dx = (
      await screen.findByRole('heading', { name: 'Most common diagnoses' })
    ).closest('section')!;
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await user.click(within(dx).getByRole('button', { name: 'Table' }));
    expect((await within(dx).findAllByText('<5')).length).toBeGreaterThan(0);
  });

  it('refuses a period that ends before it starts', async () => {
    renderApp('/reports', { as: 'admin' });
    const from = await screen.findByLabelText('From');
    // date inputs can't be typed into in jsdom: set the value like the date picker does
    fireEvent.change(from, { target: { value: '2099-01-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a period');
  });
});
