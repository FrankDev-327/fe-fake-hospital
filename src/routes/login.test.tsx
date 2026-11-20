import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '@/mocks/data/staff';
import { server } from '@/mocks/node';
import { renderApp } from '@/test/render-app';

async function fillLogin(
  user: ReturnType<typeof renderApp>['user'],
  email: string,
  password: string,
) {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('login', () => {
  it('sends a logged-out user to the login page', async () => {
    renderApp('/lab');
    expect(
      await screen.findByRole('heading', { name: 'Fake Hospital' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Staff login')).toBeInTheDocument();
  });

  it('checks the form before calling the backend', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('shows one message for a wrong password', async () => {
    const { user } = renderApp('/login');
    await fillLogin(user, 'ana.kovac@hospital.test', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Wrong email or password.',
    );
  });

  it('logs a doctor in and shows the doctor menu only', async () => {
    const { user } = renderApp('/login');
    await fillLogin(user, 'ana.kovac@hospital.test', DEMO_PASSWORD);

    expect(
      await screen.findByRole('heading', { name: /Dr\. Ana Kovač/ }),
    ).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: 'Main' });
    expect(menu).toHaveTextContent('Patients');
    expect(menu).toHaveTextContent('Ward board');
    expect(menu).not.toHaveTextContent('Lab worklist');
    expect(menu).not.toHaveTextContent('Administration');
  });

  it('goes back to the page that was asked for after login', async () => {
    const { user, router } = renderApp('/lab');
    await fillLogin(user, 'marija.babic@hospital.test', DEMO_PASSWORD);
    expect(
      await screen.findByRole('heading', { name: 'Lab worklist' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/lab');
  });

  it('says so when the login service is down', async () => {
    server.use(
      http.post('/api/identity/auth/login', () =>
        HttpResponse.json({ error: 'upstream_unavailable' }, { status: 503 }),
      ),
    );
    const { user } = renderApp('/login');
    await fillLogin(user, 'ana.kovac@hospital.test', DEMO_PASSWORD);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Login is unavailable right now.',
    );
  });
});

describe('session', () => {
  it('stays logged in after a reload (valid refresh cookie)', async () => {
    renderApp('/', { as: 'nurse' });
    expect(
      await screen.findByRole('heading', { name: /Ivan Horvat/ }),
    ).toBeInTheDocument();
  });

  it("keeps a role out of other roles' pages", async () => {
    const { router } = renderApp('/lab', { as: 'nurse' });
    expect(
      await screen.findByRole('heading', { name: /Ivan Horvat/ }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('logs out back to the login page', async () => {
    const { user } = renderApp('/', { as: 'admin' });
    await user.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByText('Staff login')).toBeInTheDocument();
  });
});
