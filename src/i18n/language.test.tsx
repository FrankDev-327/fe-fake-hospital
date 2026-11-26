import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '@/test/render-app';
import { setLanguage } from './index';
import en from './en.json';
import hr from './hr.json';

/** every key of a nested JSON as "a.b.c" */
const keys = (o: object, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );

describe('language', () => {
  afterEach(() => setLanguage('en'));

  it('en.json and hr.json have the same keys', () => {
    expect(keys(hr).sort()).toEqual(keys(en).sort());
  });

  it('switches the login page to Croatian', async () => {
    const { user } = renderApp('/login');
    await user.selectOptions(await screen.findByLabelText('Language'), 'hr');
    expect(screen.getByText('Prijava za osoblje')).toBeInTheDocument();
    expect(screen.getByLabelText('Lozinka')).toBeInTheDocument();
  });

  it('shows the app pages in Croatian', async () => {
    setLanguage('hr');
    renderApp('/maternity', { as: 'doctor' });
    expect(
      await screen.findByRole('heading', { name: 'Rodilište' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Početak porođaja')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pacijenti' })).toBeInTheDocument();
  });
});
