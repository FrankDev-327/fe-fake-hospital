import { delay, http, HttpResponse } from 'msw';
import { APPOINTMENTS, BEDS, WARDS } from '../data/admissions';
import { NURSE_DOCTORS } from '../data/patients';
import { patientById } from '../db';
import { badRequest, canSeePatient, guard, notFound } from './guard';

/** apps/admissions (/api/admissions/...) */
export const admissionsHandlers = [
  http.get('/api/admissions/wards', async ({ request }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse', 'receptionist', 'admin']);
    if (staff instanceof Response) return staff;
    return HttpResponse.json(WARDS);
  }),

  /** Bed board: free/occupied for everyone, WHO only for the patient's own care team */
  http.get('/api/admissions/wards/:id/beds', async ({ request, params }) => {
    await delay();
    const staff = guard(request, ['doctor', 'nurse', 'receptionist', 'admin']);
    if (staff instanceof Response) return staff;
    const ward = WARDS.find((w) => w.id === params.id);
    if (!ward) return notFound('ward_not_found');
    return HttpResponse.json({
      ward,
      beds: BEDS.filter((b) => b.wardId === ward.id).map((b) => ({
        bedId: b.bedId,
        bed: b.bed,
        room: b.room,
        state: !b.active ? 'out_of_service' : b.stay ? 'occupied' : 'free',
        ...(b.stay && canSeePatient(staff, b.stay.patientId) ? b.stay : {}),
      })),
    });
  }),

  /** A doctor's schedule: front desk any doctor, a doctor only their own, a nurse her doctors' */
  http.get(
    '/api/admissions/doctors/:doctorId/appointments',
    async ({ request, params }) => {
      await delay();
      const staff = guard(request, [
        'doctor',
        'nurse',
        'receptionist',
        'admin',
      ]);
      if (staff instanceof Response) return staff;
      const doctorId = String(params.doctorId);
      const allowed =
        staff.role === 'receptionist' ||
        staff.role === 'admin' ||
        (staff.role === 'doctor' && staff.id === doctorId) ||
        (staff.role === 'nurse' && NURSE_DOCTORS[staff.id]?.includes(doctorId));
      if (!allowed)
        return HttpResponse.json({ error: 'forbidden' }, { status: 403 });

      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!from || !to || to < from) return badRequest();
      const start = new Date(`${from}T00:00:00`).getTime();
      const end = new Date(`${to}T00:00:00`).getTime() + 86_400_000;
      return HttpResponse.json({
        items: APPOINTMENTS.filter(
          (a) =>
            a.doctorId === doctorId &&
            Date.parse(a.startsAt) >= start &&
            Date.parse(a.startsAt) < end,
        )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .map(({ doctorId: _, ...a }) => {
            const p = patientById(a.patientId)!;
            // NOT IN THE BACKEND YET: a schedule without names is useless at the desk, and a
            // doctor can't look up patients not assigned to them. Backend should add this.
            return {
              ...a,
              patient: {
                mrn: p.mrn,
                firstName: p.firstName,
                lastName: p.lastName,
              },
            };
          }),
      });
    },
  ),
];
