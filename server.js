const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PRIVATE_DIR = path.join(ROOT_DIR, "private-data");
const APPOINTMENTS_FILE = path.join(PRIVATE_DIR, "clinic-appointments.json");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "secretary";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";
const SESSION_COOKIE = "acs_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const DEFAULT_APPOINTMENT_STATUS = "confirmed";

const sessions = new Map();

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

server.listen(PORT, () => {
  console.log(`ACS clinic server running at http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log("Default admin login is secretary / change-this-password. Set ADMIN_PASSWORD before real use.");
  }
});
