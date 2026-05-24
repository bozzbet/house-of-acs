# Integrated Pension House + Medical Clinic Website Blueprint

## Main Goal

Create one website for both the Pension House and Medical Clinic.

The public website should promote the pension house, show rooms and amenities, provide contact/booking information, and also allow patients to make clinic appointments.

The clinic side should include a simple appointment reservation system where patients can scan a QR code, choose a date/time slot, and submit their details.

## Public Website Sections

1. Hero
2. Rooms
3. Amenities
4. Location
5. Announcements / Updates
6. Contact / Booking / Appointment

## Clinic Appointment Flow

1. Patient scans clinic QR code.
2. QR code opens the appointment page.
3. Patient selects date and time slot.
4. Patient enters personal details and reason for visit.
5. Website checks if slot is available.
6. Appointment is saved.
7. Patient sees confirmation.

## Admin / Secretary Features

- View today's appointments
- Select other dates
- Search patient name or contact number
- Filter by status
- Edit appointments
- Reschedule appointments
- Cancel appointments
- Mark completed
- Mark no-show
- Print daily list
- Export CSV
- Generate reports

## JSON Files

- `data/appointments.json`
- `data/announcements.json`
- `data/room-bookings.json`

## Build Order

1. Public homepage
2. Appointment form
3. Static demo appointment saving
4. Secretary dashboard
5. Announcements
6. Booking inquiry form
7. Backend API
8. Real JSON/database appointment storage
9. Reports
