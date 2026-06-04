# Integrated Pension House + Medical Clinic Website Blueprint

## Main Goal

Create a polished, professional website for one integrated brand:
- ACS Pension House
- Dr. Allan Dideles Medical Clinic

The public site should promote the pension house stay and the clinic appointment service side by side, while supporting two main user journeys:
1. Pension house guests can explore room options, check availability, send a booking inquiry, and pay with QR or GCash.
2. Clinic patients can scan a QR code, choose an appointment date/time, submit their details, and receive confirmation.

This first version remains GitHub Pages-friendly and uses localStorage for appointment/demo data. It should clearly communicate that a backend API is required for real secure data storage.

## Target Sections

1. Hero / Brand Promise
2. Pension House Rooms & Availability
3. Pension House Booking Inquiry
4. Clinic Appointment Booking with QR Callout
5. Appointment Form & Preview
6. Secretary Dashboard Demo
7. Announcements / Updates
8. Location & Contact
9. Payment Options (QR / GCash)

## User Journeys

### Pension House Guest
- Land on homepage
- Review room types and sample rates
- See availability messaging
- Fill booking inquiry form with check-in/check-out dates and room preference
- Receive confirmation note and next steps for payment via QR/GCash

### Clinic Patient
- Scan clinic QR code
- Open appointment section/page
- Choose a future date and available slot
- Enter patient name, contact, age, type, and reason for visit
- Submit appointment request
- Receive sample confirmation message and appointment preview

### Secretary / Admin
- Open `admin.html`
- View appointments saved in the demo environment
- Filter by date or status
- Search by patient name or contact number
- Update appointment status
- Export appointment data to CSV
- Print a report

## Design Principles

- Elegant, professional, and clean layout
- Clear separation between pension house and clinic services
- Simple, readable typography and soft modern color palette
- Strong CTA buttons for booking and appointment actions
- Responsive layout for mobile and desktop
- Consistent card-based content blocks and form styling
- Prominent QR code section for clinic appointment access
- Explicit demo limitations and backend future path

## Data & Features

- Preserve current static/demo behavior:
  - `assets/js/app.js` for appointment form, booking inquiry, localStorage demo
  - `assets/js/admin.js` for dashboard filters, status update, CSV export
- Keep announcements either hard-coded in JS or sourced from `data/announcements.json`
- Keep sample JSON files for reference:
  - `data/appointments.json`
  - `data/announcements.json`
  - `data/room-bookings.json`

## Implementation Plan

1. Redesign `index.html`
   - Hero with integrated brand messaging
   - Pension House rooms and amenities
   - Clinic QR code section and appointment workflow
   - Booking inquiry form and appointment form cards
   - Contact and location details
2. Update `assets/css/styles.css`
   - Refined typography, spacing, and color palette
   - Responsive grid layout and card styling
   - Button and form field polish
   - QR card and announcement section styling
3. Improve `assets/js/app.js`
   - Better date validation and messaging
   - Keep localStorage appointment save behavior
   - Keep booking inquiry flow and form feedback
4. Improve `admin.html`
   - Polish dashboard layout and table readability
   - Maintain search/filter/export and status update interactions
5. Improve `assets/js/admin.js`
   - Keep current filtering and CSV export logic
   - Ensure status updates persist in localStorage demo
6. Validate on browser
   - Test homepage and admin page responsiveness
   - Verify appointment and booking form submissions
   - Verify admin filtering, export, and status updates

## Future Backend Considerations

- Add secure appointment storage with a backend API
- Add authentication for secretary/admin access
- Add a real room availability system and reservation database
- Add real payment flow for GCash and QR payments
- Add reporting/dashboard analytics for bookings and clinic volume
