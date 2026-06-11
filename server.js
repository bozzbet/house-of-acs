const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PRIVATE_DIR = path.join(ROOT_DIR, "private-data");
const APPOINTMENTS_FILE = path.join(PRIVATE_DIR, "clinic-appointments.json");
const BOOKING_DB_FILE = path.join(PRIVATE_DIR, "pension-booking.db");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "secretary";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const SESSION_COOKIE = "acs_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DEFAULT_APPOINTMENT_STATUS = "confirmed";
const BOOKING_STATUSES = new Set(["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"]);
const BOOKING_PAYMENT_STATUSES = new Set(["unpaid", "partial", "paid", "refunded"]);

const sessions = new Map();
let bookingDb;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const blockedStaticNames = new Set([
  ".env",
  ".git",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "private-data",
  "server.js"
]);

function ensureDataFile() {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  if (!fs.existsSync(APPOINTMENTS_FILE)) {
    fs.writeFileSync(APPOINTMENTS_FILE, "[]\n");
  }
}

function readAppointments() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(APPOINTMENTS_FILE, "utf8");
    const appointments = JSON.parse(raw || "[]");
    if (!Array.isArray(appointments)) return [];

    return appointments;
  } catch (error) {
    console.error("Unable to read appointment database:", error);
    return [];
  }
}

function writeAppointments(appointments) {
  ensureDataFile();
  const tempFile = `${APPOINTMENTS_FILE}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(appointments, null, 2)}\n`);
  fs.renameSync(tempFile, APPOINTMENTS_FILE);
}

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    bookingDb.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    bookingDb.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function allSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    bookingDb.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function initBookingDb() {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  bookingDb = new sqlite3.Database(BOOKING_DB_FILE);
  await runSql("PRAGMA foreign_keys = ON");
  await runSql(`
    CREATE TABLE IF NOT EXISTS rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_name TEXT NOT NULL,
      room_type TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      price_per_night REAL NOT NULL,
      status TEXT DEFAULT 'available',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await runSql(`
    CREATE TABLE IF NOT EXISTS bookings (
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
    )
  `);
  await runSql(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      reference_number TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    )
  `);
  await seedRooms();
}

async function seedRooms() {
  const row = await getSql("SELECT COUNT(*) AS count FROM rooms");
  if (row.count > 0) return;

  const rooms = [
    ["Room 101", "Small Room", 2, 1200, "Compact room for short stays."],
    ["Room 102", "Matrimonial Bed Room", 2, 1500, "Room with matrimonial bed."],
    ["Room 201", "Twin Room", 2, 1500, "Two-bed room for guests sharing a stay."],
    ["Room 202", "Family Room", 4, 2200, "Larger room for families."],
    ["Room 301", "Group Room", 6, 3000, "Room for small groups."]
  ];

  for (const room of rooms) {
    await runSql(
      "INSERT INTO rooms (room_name, room_type, capacity, price_per_night, description) VALUES (?, ?, ?, ?, ?)",
      room
    );
  }
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function sendJson(res, status, body, headers = {}) {
  send(res, status, body, headers);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((cookie) => {
    const [name, ...parts] = cookie.trim().split("=");
    return [name, decodeURIComponent(parts.join("="))];
  }));
}

function cleanSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

function getSession(req) {
  cleanSessions();
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) return null;
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (session) return session;
  sendJson(res, 401, { error: "Authentication required" });
  return null;
}

function safeCompare(value, expected) {
  const valueBuffer = Buffer.from(String(value));
  const expectedBuffer = Buffer.from(String(expected));
  if (valueBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(valueBuffer, expectedBuffer);
}

function toLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeAppointmentId(date) {
  return `APT-${date.replaceAll("-", "")}-${crypto.randomInt(1000, 9999)}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function formatPatientName(patient = {}) {
  if (patient.fullName) return normalizeText(patient.fullName);
  if (patient.name && !patient.firstName && !patient.lastName) return normalizeText(patient.name);
  return [
    patient.prefix,
    patient.firstName,
    patient.middleName,
    patient.lastName,
    patient.suffix
  ].map(normalizeText).filter(Boolean).join(" ");
}

function timeToMinutes(time) {
  const match = String(time || "").match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();
  if (period === "AM" && hours === 12) hours = 0;
  if (period === "PM" && hours !== 12) hours += 12;
  return hours * 60 + minutes;
}

function compareAppointmentsByDateTime(a, b) {
  const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
  if (dateCompare !== 0) return dateCompare;
  return timeToMinutes(a.time) - timeToMinutes(b.time);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validateAppointment(input) {
  const date = normalizeText(input.date);
  const time = normalizeText(input.time);
  const patient = input.patient || {};
  const firstName = normalizeText(patient.firstName);
  const lastName = normalizeText(patient.lastName);
  const legacyName = normalizeText(patient.name);
  const contactNumber = normalizeText(patient.contactNumber);

  if (!isValidDate(date) || date < toLocalDateString()) return "Please choose today or a future appointment date.";
  if (!time) return "Please choose an appointment time.";
  if ((!firstName || !lastName) && !legacyName) return "Patient first name and last name are required.";
  if (!contactNumber) return "Contact number is required.";
  return "";
}

function validateBooking(input) {
  const guestName = normalizeText(input.guestName);
  const phone = normalizeText(input.phone);
  const checkIn = normalizeText(input.checkIn);
  const checkOut = normalizeText(input.checkOut);
  const guests = Number(input.guests || 1);

  if (!guestName) return "Guest name is required.";
  if (!phone) return "Contact number is required.";
  if (!isValidDate(checkIn) || !isValidDate(checkOut)) return "Valid check-in and check-out dates are required.";
  if (checkIn < toLocalDateString()) return "Check-in must be today or a future date.";
  if (checkOut <= checkIn) return "Check-out must be after check-in.";
  if (!Number.isInteger(guests) || guests < 1) return "Guest count must be at least 1.";
  return "";
}

function toBookingResponse(row) {
  if (!row) return null;
  return {
    id: row.id,
    guestName: row.guest_name,
    phone: row.phone,
    email: row.email || "",
    roomId: row.room_id,
    roomName: row.room_name || "",
    roomType: row.room_type || "",
    roomTypeRequested: row.room_type_requested || "",
    checkIn: row.check_in,
    checkOut: row.check_out,
    guests: row.guests,
    specialRequest: row.special_request || "",
    status: row.status,
    paymentStatus: row.payment_status,
    totalAmount: Number(row.total_amount || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRoomResponse(row) {
  return {
    id: row.id,
    roomName: row.room_name,
    roomType: row.room_type,
    capacity: row.capacity,
    pricePerNight: Number(row.price_per_night || 0),
    status: row.status,
    description: row.description || ""
  };
}

function bookingSelectSql(whereClause = "") {
  return `
    SELECT bookings.*, rooms.room_name, rooms.room_type
    FROM bookings
    LEFT JOIN rooms ON rooms.id = bookings.room_id
    ${whereClause}
  `;
}

function bookingOrderSql() {
  return " ORDER BY bookings.check_in ASC, bookings.created_at DESC";
}

async function getBookingById(id) {
  const row = await getSql(`${bookingSelectSql("WHERE bookings.id = ?")}`, [id]);
  return toBookingResponse(row);
}

async function findRoomConflict(roomId, checkIn, checkOut, excludeBookingId = null) {
  const params = [roomId, checkOut, checkIn];
  let excludeSql = "";
  if (excludeBookingId) {
    excludeSql = "AND id != ?";
    params.push(excludeBookingId);
  }
  return getSql(`
    SELECT id, guest_name, check_in, check_out
    FROM bookings
    WHERE room_id = ?
      AND status IN ('pending', 'confirmed', 'checked_in')
      AND check_in < ?
      AND check_out > ?
      ${excludeSql}
    LIMIT 1
  `, params);
}

async function listBookings(searchParams) {
  const clauses = [];
  const params = [];
  const date = searchParams.get("date") || "";
  const month = searchParams.get("month") || "";
  const status = searchParams.get("status") || "";
  const paymentStatus = searchParams.get("paymentStatus") || "";
  const search = normalizeText(searchParams.get("search")).toLowerCase();

  if (date) {
    clauses.push("(bookings.check_in = ? OR bookings.check_out = ?)");
    params.push(date, date);
  } else if (month) {
    clauses.push("(bookings.check_in LIKE ? OR bookings.check_out LIKE ?)");
    params.push(`${month}%`, `${month}%`);
  }
  if (status) {
    clauses.push("bookings.status = ?");
    params.push(status);
  }
  if (paymentStatus) {
    clauses.push("bookings.payment_status = ?");
    params.push(paymentStatus);
  }
  if (search) {
    clauses.push("(LOWER(bookings.guest_name) LIKE ? OR LOWER(bookings.phone) LIKE ? OR LOWER(bookings.room_type_requested) LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await allSql(`${bookingSelectSql(where)}${bookingOrderSql()}`, params);
  return rows.map(toBookingResponse);
}

async function getBookingReports(reportMonth = toLocalDateString().slice(0, 7)) {
  const today = toLocalDateString();
  const tomorrow = toLocalDateString(new Date(Date.now() + 1000 * 60 * 60 * 24));
  const rooms = await allSql("SELECT * FROM rooms WHERE status = 'available'");
  const occupiedRows = await allSql(`
    SELECT DISTINCT room_id
    FROM bookings
    WHERE room_id IS NOT NULL
      AND status IN ('confirmed', 'checked_in')
      AND check_in < ?
      AND check_out > ?
  `, [tomorrow, today]);
  const occupiedRoomIds = new Set(occupiedRows.map((row) => row.room_id));
  const bookings = await allSql("SELECT * FROM bookings");
  const monthBookings = bookings.filter((booking) => String(booking.check_in || "").startsWith(reportMonth));
  const byStatus = {};
  const byPaymentStatus = {};

  bookings.forEach((booking) => {
    byStatus[booking.status] = (byStatus[booking.status] || 0) + 1;
    byPaymentStatus[booking.payment_status] = (byPaymentStatus[booking.payment_status] || 0) + 1;
  });

  return {
    availableRoomsToday: rooms.filter((room) => !occupiedRoomIds.has(room.id)).length,
    occupiedRoomsToday: occupiedRoomIds.size,
    pendingBookings: bookings.filter((booking) => booking.status === "pending").length,
    confirmedBookings: bookings.filter((booking) => booking.status === "confirmed").length,
    todayCheckIns: bookings.filter((booking) => booking.check_in === today && booking.status === "confirmed").length,
    todayCheckOuts: bookings.filter((booking) => booking.check_out === today && ["confirmed", "checked_in"].includes(booking.status)).length,
    unpaidBookings: bookings.filter((booking) => booking.payment_status === "unpaid").length,
    totalRevenue: monthBookings
      .filter((booking) => booking.payment_status === "paid")
      .reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0),
    byStatus,
    byPaymentStatus
  };
}

function sanitizeAppointment(input) {
  const now = new Date().toISOString();
  const patient = sanitizePatient(input.patient);

  return {
    id: makeAppointmentId(input.date),
    createdAt: now,
    updatedAt: now,
    date: normalizeText(input.date),
    time: normalizeText(input.time),
    status: DEFAULT_APPOINTMENT_STATUS,
    patient,
    reasonForVisit: normalizeText(input.reasonForVisit),
    notes: "",
    source: "server-file-db"
  };
}

function sanitizePatient(inputPatient = {}) {
  const patient = {
    prefix: normalizeText(inputPatient.prefix),
    firstName: normalizeText(inputPatient.firstName),
    middleName: normalizeText(inputPatient.middleName),
    lastName: normalizeText(inputPatient.lastName),
    suffix: normalizeText(inputPatient.suffix),
    age: normalizeText(inputPatient.age),
    contactNumber: normalizeText(inputPatient.contactNumber),
    patientType: normalizeText(inputPatient.patientType) || "New Patient"
  };
  patient.fullName = formatPatientName({ ...patient, name: inputPatient.name });
  patient.name = patient.fullName;
  return patient;
}

function applyAppointmentUpdate(appointment, input) {
  appointment.updatedAt = new Date().toISOString();
  appointment.date = normalizeText(input.date);
  appointment.time = normalizeText(input.time);
  appointment.patient = sanitizePatient(input.patient);
  appointment.reasonForVisit = normalizeText(input.reasonForVisit);
  return appointment;
}

function filterAppointments(appointments, searchParams) {
  const date = searchParams.get("date") || "";
  const month = searchParams.get("month") || "";
  const status = searchParams.get("status") || "";
  const search = (searchParams.get("search") || "").toLowerCase();

  return appointments.filter((appointment) => {
    if (date && appointment.date !== date) return false;
    if (!date && month && !String(appointment.date || "").startsWith(month)) return false;
    if (status && appointment.status !== status) return false;
    if (search) {
      const name = formatPatientName(appointment.patient).toLowerCase();
      const contact = appointment.patient?.contactNumber?.toLowerCase() || "";
      if (!name.includes(search) && !contact.includes(search)) return false;
    }
    return true;
  }).sort(compareAppointmentsByDateTime);
}

function getBookedTimeSlots(date) {
  if (!isValidDate(date)) return [];
  return [...new Set(readAppointments()
    .filter((appointment) => appointment.date === date && appointment.status !== "cancelled")
    .map((appointment) => appointment.time)
    .filter(Boolean))]
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

function getPublicAppointmentPreview() {
  const today = toLocalDateString();
  return readAppointments()
    .filter((appointment) => appointment.date === today)
    .sort(compareAppointmentsByDateTime)
    .map((appointment) => ({
      id: appointment.id,
      date: appointment.date,
      time: appointment.time,
      reasonForVisit: appointment.reasonForVisit || "Appointment",
      status: appointment.status
    }));
}

function getAnalytics(appointments, reportMonth = toLocalDateString().slice(0, 7)) {
  const today = toLocalDateString();
  const sevenDaysFromNow = toLocalDateString(new Date(Date.now() + 1000 * 60 * 60 * 24 * 7));
  const byStatus = {};
  const byPatientType = {};
  const dailyVolume = {};

  appointments.forEach((appointment) => {
    byStatus[appointment.status] = (byStatus[appointment.status] || 0) + 1;
    const patientType = appointment.patient?.patientType || "Unspecified";
    byPatientType[patientType] = (byPatientType[patientType] || 0) + 1;
    dailyVolume[appointment.date] = (dailyVolume[appointment.date] || 0) + 1;
  });

  return {
    total: appointments.length,
    today: appointments.filter((appointment) => appointment.date === today).length,
    upcoming7Days: appointments.filter((appointment) => appointment.date >= today && appointment.date <= sevenDaysFromNow).length,
    completedThisMonth: appointments.filter((appointment) => appointment.status === "completed" && appointment.date.startsWith(reportMonth)).length,
    cancelled: appointments.filter((appointment) => appointment.status === "cancelled" && appointment.date.startsWith(reportMonth)).length,
    noShow: appointments.filter((appointment) => appointment.status === "no-show" && appointment.date.startsWith(reportMonth)).length,
    byStatus,
    byPatientType,
    dailyVolume: Object.entries(dailyVolume)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-14)
      .map(([date, count]) => ({ date, count }))
  };
}

function csvEscape(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function appointmentsToCsv(appointments) {
  const header = ["ID", "Date", "Time", "Patient", "Age", "Contact", "Patient Type", "Reason", "Status", "Created At"];
  const rows = appointments.map((appointment) => [
    appointment.id,
    appointment.date,
    appointment.time,
    formatPatientName(appointment.patient),
    appointment.patient?.age,
    appointment.patient?.contactNumber,
    appointment.patient?.patientType,
    appointment.reasonForVisit,
    appointment.status,
    appointment.createdAt
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function bookingsToCsv(bookings) {
  const header = ["ID", "Guest", "Phone", "Requested Room", "Assigned Room", "Check In", "Check Out", "Guests", "Status", "Payment", "Total", "Request", "Created At"];
  const rows = bookings.map((booking) => [
    booking.id,
    booking.guestName,
    booking.phone,
    booking.roomTypeRequested,
    booking.roomName,
    booking.checkIn,
    booking.checkOut,
    booking.guests,
    booking.status,
    booking.paymentStatus,
    booking.totalAmount,
    booking.specialRequest,
    booking.createdAt
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readBody(req);
    if (!safeCompare(body.username || "", ADMIN_USERNAME) || !safeCompare(body.password || "", ADMIN_PASSWORD)) {
      sendJson(res, 401, { error: "Invalid username or password" });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { username: ADMIN_USERNAME, expiresAt: Date.now() + SESSION_TTL_MS });
    sendJson(res, 200, { username: ADMIN_USERNAME }, {
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) sessions.delete(token);
    sendJson(res, 200, { ok: true }, {
      "Set-Cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const session = getSession(req);
    sendJson(res, session ? 200 : 401, session ? { username: session.username } : { error: "Not signed in" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/appointments/availability") {
    const date = url.searchParams.get("date") || "";
    if (!isValidDate(date)) {
      sendJson(res, 400, { error: "Valid appointment date is required." });
      return;
    }
    sendJson(res, 200, { date, bookedSlots: getBookedTimeSlots(date) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/appointments/preview") {
    sendJson(res, 200, { appointments: getPublicAppointmentPreview() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const body = await readBody(req);
    const validationError = validateBooking(body);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }

    const result = await runSql(`
      INSERT INTO bookings (
        guest_name,
        phone,
        email,
        room_type_requested,
        check_in,
        check_out,
        guests,
        special_request,
        status,
        payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unpaid')
    `, [
      normalizeText(body.guestName),
      normalizeText(body.phone),
      normalizeText(body.email),
      normalizeText(body.roomTypeRequested),
      normalizeText(body.checkIn),
      normalizeText(body.checkOut),
      Number(body.guests || 1),
      normalizeText(body.specialRequest)
    ]);

    sendJson(res, 201, { booking: await getBookingById(result.lastID) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/appointments") {
    const body = await readBody(req);
    const validationError = validateAppointment(body);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }

    const appointments = readAppointments();
    const duplicate = appointments.some((appointment) => (
      appointment.date === body.date &&
      appointment.time === body.time &&
      appointment.status !== "cancelled"
    ));

    if (duplicate) {
      sendJson(res, 409, { error: "That time slot is already reserved. Please choose another time." });
      return;
    }

    const appointment = sanitizeAppointment(body);
    appointments.push(appointment);
    writeAppointments(appointments);
    sendJson(res, 201, { appointment });
    return;
  }

  if (url.pathname === "/api/admin/appointments" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { appointments: filterAppointments(readAppointments(), url.searchParams) });
    return;
  }

  if (url.pathname === "/api/admin/reports" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const month = url.searchParams.get("month") || toLocalDateString().slice(0, 7);
    sendJson(res, 200, getAnalytics(readAppointments(), month));
    return;
  }

  if (url.pathname === "/api/admin/bookings" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    sendJson(res, 200, { bookings: await listBookings(url.searchParams) });
    return;
  }

  if (url.pathname === "/api/admin/rooms" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const rows = await allSql("SELECT * FROM rooms ORDER BY room_name ASC");
    sendJson(res, 200, { rooms: rows.map(toRoomResponse) });
    return;
  }

  if (url.pathname === "/api/admin/booking-reports" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const month = url.searchParams.get("month") || toLocalDateString().slice(0, 7);
    sendJson(res, 200, await getBookingReports(month));
    return;
  }

  if (url.pathname === "/api/admin/bookings.csv" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const csv = bookingsToCsv(await listBookings(url.searchParams));
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=pension-bookings.csv",
      "Cache-Control": "no-store"
    });
    res.end(csv);
    return;
  }

  if (url.pathname === "/api/admin/appointments.csv" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const csv = appointmentsToCsv(filterAppointments(readAppointments(), url.searchParams));
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=clinic-appointments.csv",
      "Cache-Control": "no-store"
    });
    res.end(csv);
    return;
  }

  const appointmentMatch = url.pathname.match(/^\/api\/admin\/appointments\/([^/]+)$/);
  if (appointmentMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const validationError = validateAppointment(body);
    if (validationError) {
      sendJson(res, 400, { error: validationError });
      return;
    }

    const appointments = readAppointments();
    const appointment = appointments.find((item) => item.id === appointmentMatch[1]);
    if (!appointment) {
      sendJson(res, 404, { error: "Appointment not found" });
      return;
    }

    const duplicate = appointments.some((item) => (
      item.id !== appointment.id &&
      item.date === body.date &&
      item.time === body.time &&
      item.status !== "cancelled"
    ));

    if (duplicate) {
      sendJson(res, 409, { error: "That time slot is already reserved. Please choose another time." });
      return;
    }

    applyAppointmentUpdate(appointment, body);
    writeAppointments(appointments);
    sendJson(res, 200, { appointment });
    return;
  }

  if (appointmentMatch && req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    const appointments = readAppointments();
    const nextAppointments = appointments.filter((item) => item.id !== appointmentMatch[1]);

    if (nextAppointments.length === appointments.length) {
      sendJson(res, 404, { error: "Appointment not found" });
      return;
    }

    writeAppointments(nextAppointments);
    sendJson(res, 200, { ok: true });
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/admin\/appointments\/([^/]+)\/status$/);
  if (statusMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const allowedStatuses = new Set(["confirmed", "completed", "cancelled", "no-show"]);
    if (!allowedStatuses.has(body.status)) {
      sendJson(res, 400, { error: "Invalid appointment status" });
      return;
    }

    const appointments = readAppointments();
    const appointment = appointments.find((item) => item.id === statusMatch[1]);
    if (!appointment) {
      sendJson(res, 404, { error: "Appointment not found" });
      return;
    }

    appointment.status = body.status;
    appointment.updatedAt = new Date().toISOString();
    writeAppointments(appointments);
    sendJson(res, 200, { appointment });
    return;
  }

  const bookingMatch = url.pathname.match(/^\/api\/admin\/bookings\/(\d+)$/);
  if (bookingMatch && req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    const result = await runSql("DELETE FROM bookings WHERE id = ?", [bookingMatch[1]]);
    if (!result.changes) {
      sendJson(res, 404, { error: "Booking not found" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  const bookingStatusMatch = url.pathname.match(/^\/api\/admin\/bookings\/(\d+)\/status$/);
  if (bookingStatusMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    if (!BOOKING_STATUSES.has(body.status)) {
      sendJson(res, 400, { error: "Invalid booking status" });
      return;
    }

    const result = await runSql(
      "UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [body.status, bookingStatusMatch[1]]
    );
    if (!result.changes) {
      sendJson(res, 404, { error: "Booking not found" });
      return;
    }
    sendJson(res, 200, { booking: await getBookingById(bookingStatusMatch[1]) });
    return;
  }

  const bookingPaymentMatch = url.pathname.match(/^\/api\/admin\/bookings\/(\d+)\/payment$/);
  if (bookingPaymentMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const paymentStatus = normalizeText(body.paymentStatus);
    const totalAmount = Number(body.totalAmount || 0);
    if (!BOOKING_PAYMENT_STATUSES.has(paymentStatus)) {
      sendJson(res, 400, { error: "Invalid payment status" });
      return;
    }
    if (Number.isNaN(totalAmount) || totalAmount < 0) {
      sendJson(res, 400, { error: "Total amount must be a valid number." });
      return;
    }

    const result = await runSql(
      "UPDATE bookings SET payment_status = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [paymentStatus, totalAmount, bookingPaymentMatch[1]]
    );
    if (!result.changes) {
      sendJson(res, 404, { error: "Booking not found" });
      return;
    }
    sendJson(res, 200, { booking: await getBookingById(bookingPaymentMatch[1]) });
    return;
  }

  const bookingRoomMatch = url.pathname.match(/^\/api\/admin\/bookings\/(\d+)\/room$/);
  if (bookingRoomMatch && req.method === "PATCH") {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const roomId = body.roomId ? Number(body.roomId) : null;
    const booking = await getBookingById(bookingRoomMatch[1]);
    if (!booking) {
      sendJson(res, 404, { error: "Booking not found" });
      return;
    }
    if (!roomId) {
      await runSql("UPDATE bookings SET room_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [bookingRoomMatch[1]]);
      sendJson(res, 200, { booking: await getBookingById(bookingRoomMatch[1]) });
      return;
    }

    const room = await getSql("SELECT * FROM rooms WHERE id = ? AND status = 'available'", [roomId]);
    if (!room) {
      sendJson(res, 400, { error: "Please choose an available active room." });
      return;
    }

    const conflict = await findRoomConflict(roomId, booking.checkIn, booking.checkOut, booking.id);
    if (conflict) {
      sendJson(res, 409, { error: `Room overlaps with booking #${conflict.id} (${conflict.check_in} to ${conflict.check_out}).` });
      return;
    }

    await runSql("UPDATE bookings SET room_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [roomId, bookingRoomMatch[1]]);
    sendJson(res, 200, { booking: await getBookingById(bookingRoomMatch[1]) });
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT_DIR, requestedPath));
  const relativeParts = path.relative(ROOT_DIR, filePath).split(path.sep);

  if (
    (filePath !== ROOT_DIR && !filePath.startsWith(`${ROOT_DIR}${path.sep}`)) ||
    relativeParts.some((part) => blockedStaticNames.has(part))
  ) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      if (req.method === "GET" && !requestedPath.includes(".") && requestedPath !== "/admin") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        });
        fs.createReadStream(path.join(ROOT_DIR, "index.html")).pipe(res);
        return;
      }

      send(res, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
      "Cache-Control": [".html", ".css", ".js"].includes(extension) ? "no-store" : "public, max-age=3600"
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

ensureDataFile();

initBookingDb().then(() => {
  server.listen(PORT, () => {
    console.log(`ACS clinic and pension booking server running at http://localhost:${PORT}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log("Default admin login is secretary / change-this-password. Set ADMIN_PASSWORD before real use.");
    }
  });
}).catch((error) => {
  console.error("Unable to initialize pension booking database:", error);
  process.exit(1);
});
