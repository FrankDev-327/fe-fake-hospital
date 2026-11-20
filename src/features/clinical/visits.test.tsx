import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openVisitId } from '@/mocks/data/charts';
import { PATIENTS } from '@/mocks/data/patients';
import { renderApp } from '@/test/render-app';

const josip = PATIENTS[0]!;
const mira = PATIENTS[1]!;
const josipVisit = `/patients/${josip.id}/visits/${openVisitId(1)}`;
const miraVisit = `/patients/${mira.id}/visits/${openVisitId(2)}`;

describe('doctor: a visit from start to finish', () => {
  it('starts a visit, writes and signs a note, adds a diagnosis, finishes', async () => {
    const { user } = renderApp(`/patients/${PATIENTS[4]!.id}`, {
      as: 'doctor',
    });
    await user.click(
      await screen.findByRole('button', { name: 'Start visit' }),
    );
    await user.type(
      screen.getByLabelText('Reason for the visit'),
      'Cough for a week',
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Start visit',
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Outpatient visit' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cough for a week')).toBeInTheDocument();

    // note: draft first, then sign
    await user.click(
      screen.getByRole('button', { name: 'New doctor note (soap)' }),
    );
    const text = screen.getByLabelText('Doctor note (SOAP)');
    await user.clear(text);
    await user.type(text, 'S: cough{enter}A: bronchitis');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign' }));
    expect(await screen.findByText('Signed')).toBeInTheDocument();

    // diagnosis from the ICD-10 search
    await user.click(screen.getByRole('button', { name: 'Add diagnosis' }));
    await user.type(screen.getByLabelText('ICD-10 code or name'), 'upper resp');
    await user.click(await screen.findByRole('button', { name: /J06\.9/ }));
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      await screen.findByText('Acute upper respiratory infection, unspecified'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish visit' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Finish visit',
      }),
    );
    expect(await screen.findByText('Finished')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /New doctor note/ }),
    ).not.toBeInTheDocument();
  });

  it("can't sign an empty template", async () => {
    renderApp(josipVisit, { as: 'doctor' }); // Ana's draft is the bare S/O/A/P template
    expect(await screen.findByRole('button', { name: 'Sign' })).toBeDisabled();
    expect(screen.getByText(/before signing/)).toBeInTheDocument();
  });

  it("can't finish while a note is unsigned", async () => {
    const { user } = renderApp(josipVisit, { as: 'doctor' }); // has Ana's draft
    await user.click(
      await screen.findByRole('button', { name: 'Finish visit' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Finish visit',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is 1 unsigned note. Sign or discard it first.',
    );
  });

  it('amends a signed note: the original stays, marked amended', async () => {
    const { user } = renderApp(miraVisit, { as: 'doctor' });
    await user.click(await screen.findByRole('button', { name: 'Amend' }));
    const dialog = screen.getByRole('dialog');
    const text = within(dialog).getByLabelText('Corrected text');
    await user.type(text, ' Glucose recheck 14 mmol/l.');
    await user.selectOptions(
      within(dialog).getByLabelText('Reason'),
      'Missing information',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create correction' }),
    );

    await user.click(await screen.findByRole('button', { name: 'Sign' }));
    expect(await screen.findByText('Amended')).toBeInTheDocument();
    expect(screen.getByText(/Replaced by a correction/)).toBeInTheDocument();
    expect(screen.getByText('Missing information')).toBeInTheDocument();
  });

  it('marks her own note as entered in error, with a reason', async () => {
    const { user } = renderApp(miraVisit, { as: 'doctor' });
    await user.click(
      await screen.findByRole('button', { name: 'Mark as error' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'Wrong patient');
    await user.click(
      within(dialog).getByRole('button', { name: 'Mark as error' }),
    );
    expect(
      await screen.findByText('Marked as error: Wrong patient'),
    ).toBeInTheDocument();
  });

  it('confirms a provisional diagnosis (a new version replaces the old)', async () => {
    const { user } = renderApp(miraVisit, { as: 'doctor' });
    const item = (
      await screen.findByText('Volume depletion (dehydration)')
    ).closest('li')!;
    expect(within(item).getByText('Provisional')).toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Confirm' }));
    // the confirmed version is a NEW row (new id), so look the item up again once it's there
    await waitFor(() => {
      const updated = screen
        .getByText('Volume depletion (dehydration)')
        .closest('li')!;
      expect(within(updated).getByText('Confirmed')).toBeInTheDocument();
    });
  });
});

describe('nurse in a visit', () => {
  it("writes nursing notes, doesn't see the doctor's draft, can't diagnose or finish", async () => {
    const { user } = renderApp(josipVisit, { as: 'nurse' });
    expect(
      await screen.findByRole('heading', { name: 'Inpatient visit' }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText('Signed')).not.toHaveLength(0);
    expect(screen.queryByText('Draft')).not.toBeInTheDocument(); // Ana's draft is private
    expect(
      screen.queryByRole('button', { name: 'Finish visit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add diagnosis' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /doctor note/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New nursing note' }));
    await user.type(
      screen.getByLabelText('Nursing note'),
      'Ate the whole lunch.',
    );
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await user.click(await screen.findByRole('button', { name: 'Sign' }));
    expect(await screen.findByText('Ate the whole lunch.')).toBeInTheDocument();
  });
});
