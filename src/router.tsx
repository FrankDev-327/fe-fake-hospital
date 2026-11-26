import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { z } from 'zod';
import { NAV_ITEMS } from '@/app/nav';
import type { NavItem } from '@/app/nav';
import type { Auth } from '@/auth/auth-context';
import type { StaffRole } from '@/auth/types';
import { AdminPage } from '@/features/admin/AdminPage';
import { AppointmentsPage } from '@/features/appointments/AppointmentsPage';
import { EncounterPage } from '@/features/clinical/EncounterPage';
import { LabPage } from '@/features/lab/LabPage';
import { DeliveryPage } from '@/features/maternity/DeliveryPage';
import { MaternityPage } from '@/features/maternity/MaternityPage';
import { MedicationPage } from '@/features/medication/MedicationPage';
import { EditPatientPage } from '@/features/patients/EditPatientPage';
import { PatientPage } from '@/features/patients/PatientPage';
import { PatientsPage } from '@/features/patients/PatientsPage';
import { RegisterPatientPage } from '@/features/patients/RegisterPatientPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { WardPage } from '@/features/ward/WardPage';
import { safeRedirect } from '@/lib/safe-redirect';
import { AppLayout } from '@/routes/AppLayout';
import { HomePage } from '@/routes/HomePage';
import { LoginPage } from '@/routes/LoginPage';
import { NotFoundPage } from '@/routes/NotFoundPage';

/** What every route can read in beforeLoad: who is logged in. Passed in by <App>. */
export interface RouterContext {
  auth: Auth;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
});

// ---- public ----
export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  // ?redirect=/lab : where to go back after login. Validated like a DTO.
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: ({ context, search }) => {
    if (context.auth.state.status === 'logged_in')
      throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

// ---- everything else needs a login ----
// A "layout route": no path of its own, it wraps its children with the sidebar + header
// and checks the login once for all of them.
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: ({ context, location }) => {
    if (context.auth.state.status !== 'logged_in') {
      throw redirect({
        to: '/login',
        search: { redirect: location.href === '/' ? undefined : location.href },
      });
    }
  },
  component: AppLayout,
});

/** Only these roles may open the page; anyone else is sent home. (The backend checks again.) */
const onlyFor =
  (roles: readonly StaffRole[]) =>
  ({ context }: { context: RouterContext }) => {
    const role = context.auth.state.user?.role;
    if (!role || !roles.includes(role)) throw redirect({ to: '/' });
  };

const rolesOf = (to: NavItem['to']) =>
  NAV_ITEMS.find((item) => item.to === to)!.roles;

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: HomePage,
});

const patientsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/patients',
  validateSearch: z.object({ q: z.string().max(100).optional() }),
  beforeLoad: onlyFor(rolesOf('/patients')),
  component: PatientsPage,
});

const patientRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/patients/$patientId',
  beforeLoad: onlyFor(rolesOf('/patients')),
  component: PatientPage,
});

// the front desk registers and edits patients
const registerPatientRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/patients/new',
  beforeLoad: onlyFor(['receptionist', 'admin']),
  component: RegisterPatientPage,
});

const editPatientRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/patients/$patientId/edit',
  beforeLoad: onlyFor(['receptionist', 'admin']),
  component: EditPatientPage,
});

// a visit: only the care team (doctor, nurse)
const encounterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/patients/$patientId/visits/$encounterId',
  beforeLoad: onlyFor(['doctor', 'nurse']),
  component: EncounterPage,
});

// one delivery (labor, babies, team): the mother's care team
const deliveryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/maternity/$deliveryId',
  beforeLoad: onlyFor(rolesOf('/maternity')),
  component: DeliveryPage,
});

/** A simple page from the menu: path + role check + component. Generic so each keeps its own path type. */
const section = <TPath extends Exclude<NavItem['to'], '/patients'>>(
  to: TPath,
  component: () => React.ReactNode,
) =>
  createRoute({
    getParentRoute: () => appRoute,
    path: to,
    beforeLoad: onlyFor(rolesOf(to)),
    component,
  });

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    homeRoute,
    patientsRoute,
    registerPatientRoute, // static "/patients/new" wins over "/patients/$patientId"
    patientRoute,
    editPatientRoute,
    encounterRoute,
    section('/ward', WardPage),
    section('/maternity', MaternityPage),
    deliveryRoute,
    section('/medication', MedicationPage),
    section('/lab', LabPage),
    section('/appointments', AppointmentsPage),
    section('/admin', AdminPage),
    section('/reports', ReportsPage),
  ]),
]);

/** A factory so tests can make a fresh router with a fake history (start at any URL). */
export const createAppRouter = (history?: RouterHistory) =>
  createRouter({
    routeTree,
    history,
    // filled in by <App> with the real auth on every render
    context: { auth: undefined! },
    defaultPreload: 'intent',
  });

export const router = createAppRouter();
export type AppRouter = typeof router;

// lets <Link to="..."> and navigate() know every route: typos become type errors
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
