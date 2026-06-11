# Pension House Booking System — Phase 2 Real Booking System

## Goal

Build a real booking system for the pension house using a backend server and SQLite database.

This system will allow guests to submit booking requests from the public website, while the admin or secretary can manage rooms, confirm bookings, check availability, view daily check-ins/check-outs, update payment status, and generate basic reports.

## Recommended Technology Stack

### Frontend

Use simple frontend pages first:

```text
HTML
CSS
JavaScript
```

Later, this can be upgraded to React, Vue, or another frontend framework.

### Backend

Use:

```text
Node.js
Express.js
```

The backend will handle:

```text
Saving bookings
Checking room availability
Managing rooms
Updating booking status
Admin dashboard data
Reports
Authentication later
```

### Database

Use:

```text
SQLite
```

SQLite is a good first database because:

```text
It is simple to install
It stores data in one .db file
It is easy to back up
It does not need a separate database server
It is enough for a small pension house system
```

---

# System Overview

## Basic Architecture

```text
Guest Website
    ↓
Booking Form
    ↓
Node.js + Express Backend API
    ↓
SQLite Database
    ↓
Admin Dashboard
```

## Suggested Hosting Setup

For development:

```text
Frontend: local computer or GitHub Pages preview
Backend: local computer or VPS
Database: SQLite file on backend server
```

For production later:

```text
Public Website: GitHub Pages or VPS
Backend API: VPS
Database: SQLite on VPS
Admin Dashboard: VPS protected route
```

Example future domain setup:

```text
www.yourpension.com       → public website
api.yourpension.com       → backend API
admin.yourpension.com     → admin dashboard
```

---

# Main Features

## Guest Features

Guests should be able to:

```text
View rooms
View room prices
View amenities
Select check-in date
Select check-out date
Choose room type
Enter guest information
Submit booking request
Receive a booking request confirmation message
```

The first version should use a booking request system, not automatic confirmation.

Recommended guest flow:

```text
Guest submits booking request
Admin reviews availability
Admin assigns room
Admin confirms booking
Guest is contacted manually or by notification later
```

This avoids double-booking and gives the pension staff control.

---

# Admin Features

The admin dashboard should allow staff to:

```text
View all bookings
View pending bookings
View confirmed bookings
View today's check-ins
View today's check-outs
Assign rooms
Confirm bookings
Cancel bookings
Edit guest details
Edit booking dates
Mark guest as checked-in
Mark guest as checked-out
Update payment status
View room availability
Generate basic reports
```

## Admin Dashboard Pages

Recommended pages:

```text
Dashboard Overview
Bookings
Rooms
Availability Calendar
Check-ins / Check-outs
Payments
Reports
Settings
```

## Dashboard Summary Cards

The admin dashboard should show quick summary cards:

```text
Available rooms today
Occupied rooms today
Pending bookings
Confirmed bookings
Today's check-ins
Today's check-outs
Unpaid bookings
Total revenue for selected date range
```

---

# Booking Statuses

Use clear booking statuses.

Recommended statuses:

```text
pending
confirmed
checked_in
checked_out
cancelled
no_show
```

## Meaning of Each Status

### pending

The guest submitted a booking request, but the admin has not confirmed it yet.

### confirmed

The admin confirmed the booking and assigned a room.

### checked_in

The guest has arrived and is currently staying.

### checked_out

The guest has completed the stay.

### cancelled

The booking was cancelled.

### no_show

The guest did not arrive.

---

# Payment Statuses

Recommended payment statuses:

```text
unpaid
partial
paid
refunded
```

## Payment Methods

Recommended payment method values:

```text
cash
gcash
bank_transfer
card
other
```

---

# Database Design

## Database File

Recommended database file location:

```text
backend/data/pension_booking.db
```

Make sure the database file is not committed publicly to GitHub.

Add this to `.gitignore`:

```gitignore
data/*.db
data/*.sqlite
data/*.sqlite3
.env
node_modules/
```

---

# Tables

## rooms Table

Stores pension house room information.

```sql
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_name TEXT NOT NULL,
  room_type TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  price_per_night REAL NOT NULL,
  status TEXT DEFAULT 'available',
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Example rooms

```text
Room 101 - Single Room
Room 102 - Double Room
Room 201 - Family Room
Room 202 - Family Room
```

## Room Status Values

```text
available
occupied
maintenance
inactive
```

---

## bookings Table

Stores guest booking records.

```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  room_id INTEGER,
  room_type_requested TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests INTEGER NOT NULL,
  special_request TEXT,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'unpaid',
  total_amount REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);
```

## Important Notes

`room_id` can be empty when the booking is still pending.

Example:

```text
Guest requests Family Room
Admin later assigns Room 201
```

This makes the booking workflow flexible.

---

## payments Table

Stores payment history for each booking.

```sql
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  reference_number TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);
```

This allows one booking to have multiple payments.

Example:

```text
Down payment: 1000
Balance payment: 2000
```

---

## admin_users Table

For login later.

```sql
CREATE TABLE admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

For the first version, you can start without login while developing locally. Add login before using the system publicly.

---

## activity_logs Table

Optional but useful for tracking admin actions.

```sql
CREATE TABLE activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id)
);
```

Example actions:

```text
Created booking
Confirmed booking
Cancelled booking
Marked as paid
Checked in guest
Checked out guest
```

---

# Availability Logic

This is the most important part of the booking system.

A room is unavailable if it already has a booking that overlaps with the requested dates.

## Date Overlap Rule

A new booking overlaps with an existing booking if:

```text
existing check-in is before new check-out
AND
existing check-out is after new check-in
```

## SQL Availability Check

```sql
SELECT *
FROM bookings
WHERE room_id = ?
AND status IN ('pending', 'confirmed', 'checked_in')
AND check_in < ?
AND check_out > ?;
```

Parameter order:

```text
room_id
new_check_out
new_check_in
```

## Example

New booking request:

```text
Check-in: 2026-06-10
Check-out: 2026-06-12
```

Existing booking:

```text
Check-in: 2026-06-11
Check-out: 2026-06-13
```

These dates overlap, so the room is not available.

---

# API Routes

## Booking Routes

```text
POST   /api/bookings
GET    /api/bookings
GET    /api/bookings/:id
PUT    /api/bookings/:id
DELETE /api/bookings/:id
```

## Booking Filter Routes

```text
GET /api/bookings/status/pending
GET /api/bookings/status/confirmed
GET /api/bookings/today/check-ins
GET /api/bookings/today/check-outs
GET /api/bookings/date-range?start=2026-06-01&end=2026-06-30
```

## Room Routes

```text
POST   /api/rooms
GET    /api/rooms
GET    /api/rooms/:id
PUT    /api/rooms/:id
DELETE /api/rooms/:id
```

## Availability Routes

```text
GET /api/availability?check_in=2026-06-10&check_out=2026-06-12
GET /api/availability/room/:room_id?check_in=2026-06-10&check_out=2026-06-12
```

## Payment Routes

```text
POST /api/payments
GET  /api/payments/booking/:booking_id
```

## Report Routes

```text
GET /api/reports/occupancy?start=2026-06-01&end=2026-06-30
GET /api/reports/revenue?start=2026-06-01&end=2026-06-30
GET /api/reports/bookings?start=2026-06-01&end=2026-06-30
```

---

# Suggested Project Structure

```text
pension-booking-system/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   ├── data/
│   │   └── pension_booking.db
│   ├── database/
│   │   ├── db.js
│   │   ├── schema.sql
│   │   └── seed.sql
│   ├── routes/
│   │   ├── bookings.js
│   │   ├── rooms.js
│   │   ├── availability.js
│   │   ├── payments.js
│   │   └── reports.js
│   ├── controllers/
│   │   ├── bookingController.js
│   │   ├── roomController.js
│   │   ├── availabilityController.js
│   │   ├── paymentController.js
│   │   └── reportController.js
│   ├── middleware/
│   │   └── auth.js
│   └── utils/
│       └── dateUtils.js
│
├── frontend/
│   ├── index.html
│   ├── rooms.html
│   ├── booking.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── booking.js
│       └── api.js
│
├── admin/
│   ├── login.html
│   ├── dashboard.html
│   ├── bookings.html
│   ├── rooms.html
│   ├── reports.html
│   ├── css/
│   │   └── admin.css
│   └── js/
│       ├── dashboard.js
│       ├── bookings.js
│       ├── rooms.js
│       └── reports.js
│
├── README.md
└── .gitignore
```

---

# Booking Workflow

## Guest Booking Request

1. Guest opens the booking page.
2. Guest selects check-in and check-out dates.
3. Guest selects room type.
4. Guest enters name, phone, email, number of guests, and special request.
5. Guest submits booking request.
6. System saves booking with status `pending`.
7. Admin sees new pending booking in dashboard.

## Admin Confirmation

1. Admin opens pending bookings.
2. Admin reviews request.
3. Admin checks available rooms for selected dates.
4. Admin assigns a room.
5. Admin updates status from `pending` to `confirmed`.
6. Admin contacts guest manually or through future notification system.

## Check-in

1. Guest arrives.
2. Admin opens today's check-ins.
3. Admin marks booking as `checked_in`.
4. Room can be marked as occupied if needed.

## Check-out

1. Guest leaves.
2. Admin opens today's check-outs.
3. Admin checks payment status.
4. Admin marks booking as `checked_out`.
5. Room becomes available after check-out.

---

# Booking Form Fields

## Public Booking Form

```text
Guest full name
Phone number
Email address optional
Check-in date
Check-out date
Number of guests
Room type requested
Special request
```

## Admin Booking Form

```text
Guest full name
Phone number
Email address
Room assigned
Check-in date
Check-out date
Number of guests
Special request
Booking status
Payment status
Total amount
Admin notes
```

---

# Sample Booking JSON Response

```json
{
  "id": 1,
  "guest_name": "Juan Dela Cruz",
  "phone": "09171234567",
  "email": "juan@example.com",
  "room_id": 3,
  "room_type_requested": "Family Room",
  "check_in": "2026-06-10",
  "check_out": "2026-06-12",
  "guests": 4,
  "special_request": "Late check-in",
  "status": "pending",
  "payment_status": "unpaid",
  "total_amount": 3000,
  "created_at": "2026-06-08 10:30:00"
}
```

---

# Development Steps

## Step 1 — Create Project Folder

```bash
mkdir pension-booking-system
cd pension-booking-system
mkdir backend frontend admin
```

## Step 2 — Initialize Backend

```bash
cd backend
npm init -y
npm install express sqlite3 cors dotenv
npm install --save-dev nodemon
```

## Step 3 — Create Basic Backend Files

Create:

```text
server.js
database/db.js
database/schema.sql
routes/bookings.js
routes/rooms.js
routes/availability.js
```

## Step 4 — Create SQLite Schema

Create the database tables:

```text
rooms
bookings
payments
admin_users
activity_logs
```

## Step 5 — Add Room Management

Build room API first:

```text
Add room
View rooms
Edit room
Set room maintenance status
```

## Step 6 — Add Booking Request API

Build booking API:

```text
Create booking request
View all bookings
View pending bookings
Update booking
Cancel booking
```

## Step 7 — Add Availability Check

Build availability API:

```text
Check available rooms by date range
Check if a specific room is available
Prevent double-booking
```

## Step 8 — Build Public Booking Page

Create:

```text
frontend/booking.html
frontend/js/booking.js
```

This page will send booking data to:

```text
POST /api/bookings
```

## Step 9 — Build Admin Dashboard

Create:

```text
admin/dashboard.html
admin/bookings.html
admin/rooms.html
```

Start with simple pages. Login can be added later before production.

## Step 10 — Add Reports

Start with basic reports:

```text
Bookings by date range
Revenue by date range
Occupancy by date range
Unpaid bookings
Cancelled bookings
```

## Step 11 — Add Login Before Going Public

Before using the system online, add:

```text
Admin login
Password hashing
Session or JWT authentication
Protected admin pages
Protected API routes
```

Recommended package:

```bash
npm install bcrypt jsonwebtoken cookie-parser
```

---

# Security Notes

Before using this system publicly, make sure to add:

```text
Admin login
Password hashing
Input validation
Rate limiting
CORS restrictions
HTTPS
Database backup
Environment variables
```

Do not expose the SQLite database file publicly.

Do not commit `.env` or `.db` files to GitHub.

---

# Backup Plan

Since SQLite stores data in one file, backup is simple.

Example backup folder:

```text
backend/backups/
```

Example backup file:

```text
pension_booking_2026-06-08.db
```

Recommended backup schedule:

```text
Daily backup
Weekly backup copied to another computer or cloud storage
Monthly archive backup
```

---

# MVP Checklist

Build these first:

```text
[ ] Create backend server
[ ] Create SQLite database
[ ] Create rooms table
[ ] Create bookings table
[ ] Add sample rooms
[ ] Create public booking form
[ ] Save booking request to database
[ ] Create admin bookings page
[ ] Show pending bookings
[ ] Assign room to booking
[ ] Confirm booking
[ ] Check room availability
[ ] Prevent double-booking
[ ] Show today's check-ins
[ ] Show today's check-outs
[ ] Update payment status
[ ] Generate basic booking report
```

---

# Recommended Build Order

Follow this order:

```text
1. Backend setup
2. SQLite database setup
3. Room table and sample rooms
4. Booking table
5. Create booking API
6. List bookings API
7. Update booking API
8. Availability check API
9. Public booking form
10. Admin bookings page
11. Room assignment
12. Booking confirmation
13. Check-in and check-out pages
14. Payment status update
15. Reports
16. Admin login
```

---

# Future Upgrade Ideas

After the MVP works, add:

```text
Email confirmation
SMS confirmation
GCash or online payment tracking
Printable receipt
Invoice generation
Room photo management
Calendar view
Multiple admin accounts
Role permissions
Maintenance scheduling
Guest history
Export reports to CSV
Automatic database backup
```

---

# Final Recommended Approach

Use this setup for the real Phase 2 version:

```text
Backend: Node.js + Express
Database: SQLite
Frontend: HTML + CSS + JavaScript
Admin Dashboard: HTML + CSS + JavaScript connected to backend API
Hosting: VPS when ready for production
```

Start with a controlled booking request system where admin confirms bookings manually. This is safer than automatic room confirmation and better for a small pension house.
