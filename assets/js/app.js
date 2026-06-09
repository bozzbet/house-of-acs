const BOOKING_KEY = "pensionHouseBookings";
const APPOINTMENT_TIME_SLOTS = [
  "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM",
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "01:00 PM", "01:30 PM", "02:00 PM", "02:30 PM",
  "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM"
];

const defaultAnnouncements = [
  {
    title: "Clinic Schedule Update",
    category: "Clinic • Schedule",
    content: "The clinic will be open from 8:00 AM to 12:00 PM this Saturday."
  },
  {
    title: "Weekend Room Promo",
    category: "Pension House • Promo",
    content: "Ask our staff about available weekend rates and family room packages."
  },
  {
    title: "Book Appointments Early",
    category: "General • Notice",
    content: "Patients are encouraged to reserve appointment slots at least one day in advance."
  }
];

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function setMessage(elementId, message, type = "") {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatInputDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "";
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function parseInputDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const year = match[3];
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return "";
  }
  return `${year}-${month}-${day}`;
}

function isCountryCodeFormat(value) {
  return /^\+\d{1,4}$/.test(String(value || "").trim());
}

function isLocalPhoneNumberFormat(value) {
  return /^\d{4}-\d{3}-\d{4}$/.test(String(value || "").trim());
}

function formatPhoneNumber(countryCode, localNumber) {
  return `${String(countryCode || "").trim()} ${String(localNumber || "").trim()}`;
}

function formatDisplayDate(dateString) {
  if (!dateString) return "Current Date";
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function makeAppointmentId(date) {
  return "APT-" + date.replaceAll("-", "") + "-" + Math.floor(Math.random() * 9000 + 1000);
}

function formatPatientName(patient = {}) {
  if (patient.fullName) return patient.fullName;
  if (patient.name && !patient.firstName && !patient.lastName) return patient.name;
  return [
    patient.prefix,
    patient.firstName,
    patient.middleName,
    patient.lastName,
    patient.suffix
  ].map((part) => String(part || "").trim()).filter(Boolean).join(" ");
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

async function createAppointmentOnServer(appointment) {
  const response = await fetch("/api/appointments", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appointment)
  });

  if (!response.ok) {
    const isJsonResponse = response.headers.get("content-type")?.includes("application/json");
    const data = isJsonResponse ? await response.json().catch(() => ({})) : {};
    const error = new Error(data.error || "Appointment API is not available.");
    error.fromServer = isJsonResponse;
    throw error;
  }

  return response.json();
}

async function getBookedSlots(date) {
  if (!date) return [];

  try {
    const response = await fetch(`/api/appointments/availability?date=${encodeURIComponent(date)}`, { cache: "no-store" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Availability API is not available.");
    }
    const data = await response.json();
    return Array.isArray(data.bookedSlots) ? data.bookedSlots : [];
  } catch (error) {
    return [];
  }
}

async function refreshTimeSlots(date, preferredValue = "") {
  const select = document.getElementById("appointmentTime");
  if (!select) return;

  select.disabled = true;
  select.innerHTML = '<option value="">Loading available times...</option>';

  if (!date) {
    select.innerHTML = '<option value="">Select date first</option>';
    select.disabled = false;
    return;
  }

  const bookedSlots = new Set(await getBookedSlots(date));
  const availableSlots = APPOINTMENT_TIME_SLOTS.filter((slot) => !bookedSlots.has(slot));

  if (!availableSlots.length) {
    select.innerHTML = '<option value="">No slots available</option>';
    select.disabled = false;
    return;
  }

  select.innerHTML = [
    '<option value="">Select time</option>',
    ...availableSlots.map((slot) => `<option>${escapeHtml(slot)}</option>`)
  ].join("");

  if (preferredValue && availableSlots.includes(preferredValue)) {
    select.value = preferredValue;
  }

  select.disabled = false;
}

async function getPreviewAppointments() {
  try {
    const response = await fetch("/api/appointments/preview", { cache: "no-store" });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Preview API is not available.");
    }
    const data = await response.json();
    return Array.isArray(data.appointments) ? data.appointments : [];
  } catch (error) {
    return [];
  }
}

async function renderAppointments() {
  const table = document.getElementById("appointmentTable");
  if (!table) return;

  const today = getLocalDateString();
  const currentAppointmentDate = document.getElementById("currentAppointmentDate");
  if (currentAppointmentDate) currentAppointmentDate.textContent = formatDisplayDate(today);

  const appointments = (await getPreviewAppointments())
    .filter((appointment) => appointment.date === today);

  if (!appointments.length) {
    table.innerHTML = '<tr><td colspan="4">No appointments for the current date.</td></tr>';
    return;
  }

  table.innerHTML = appointments.map((appointment) => `
    <tr>
      <td>${escapeHtml(appointment.time)}</td>
      <td><span class="redacted-name">Redacted</span></td>
      <td>${escapeHtml(appointment.reasonForVisit || "Appointment")}</td>
      <td><span class="status ${escapeHtml(appointment.status)}">${escapeHtml(appointment.status)}</span></td>
    </tr>
  `).join("");
}

function renderAnnouncements() {
  const container = document.getElementById("announcementCards");
  if (!container) return;

  container.innerHTML = defaultAnnouncements.map((announcement) => `
    <article class="card announcement-card">
      <div class="card-body">
        <div class="announcement-meta">${escapeHtml(announcement.category)}</div>
        <h3>${escapeHtml(announcement.title)}</h3>
        <p>${escapeHtml(announcement.content)}</p>
      </div>
    </article>
  `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menuToggle");
  const siteNav = document.getElementById("siteNav");

  if (menuToggle && siteNav) {
    menuToggle.addEventListener("click", () => siteNav.classList.toggle("open"));
  }

  const appointmentDate = document.getElementById("appointmentDate");
  const appointmentTime = document.getElementById("appointmentTime");
  const checkIn = document.getElementById("checkIn");
  const checkOut = document.getElementById("checkOut");
  const today = getLocalDateString();

  if (appointmentDate) {
    if (!appointmentDate.value) appointmentDate.value = formatInputDate(today);
  }
  if (appointmentTime) refreshTimeSlots(parseInputDate(appointmentDate?.value) || today);

  if (checkIn && checkOut) {
    checkIn.addEventListener("input", () => {
      const checkInDate = parseInputDate(checkIn.value);
      const checkOutDate = parseInputDate(checkOut.value);
      if (checkInDate && checkOutDate && checkOutDate <= checkInDate) checkOut.value = "";
    });
  }

  const appointmentForm = document.getElementById("appointmentForm");

  if (appointmentForm) {
    if (appointmentDate) {
      appointmentDate.addEventListener("input", () => {
        const date = parseInputDate(appointmentDate.value);
        if (date) refreshTimeSlots(date);
      });
    }

    appointmentForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const date = parseInputDate(document.getElementById("appointmentDate").value);
      const time = document.getElementById("appointmentTime").value;
      const prefix = document.getElementById("patientPrefix").value.trim();
      const firstName = document.getElementById("firstName").value.trim();
      const middleName = document.getElementById("middleName").value.trim();
      const lastName = document.getElementById("lastName").value.trim();
      const suffix = document.getElementById("suffix").value.trim();
      const patientName = formatPatientName({ prefix, firstName, middleName, lastName, suffix });
      const patientCountryCode = document.getElementById("patientCountryCode").value.trim();
      const patientLocalNumber = document.getElementById("contactNumber").value.trim();
      const contactNumber = formatPhoneNumber(patientCountryCode, patientLocalNumber);

      if (!date || date < today) {
        setMessage("appointmentMessage", "Please enter today or a future appointment date in MM/DD/YYYY format.", "error");
        return;
      }

      if (!time) {
        setMessage("appointmentMessage", "Please choose an available time slot.", "error");
        return;
      }

      if (!firstName || !lastName || !patientCountryCode || !patientLocalNumber) {
        setMessage("appointmentMessage", "Please enter the first name, last name, and contact number.", "error");
        return;
      }

      if (!isCountryCodeFormat(patientCountryCode) || !isLocalPhoneNumberFormat(patientLocalNumber)) {
        setMessage("appointmentMessage", "Please enter the contact number as +63 and 0917-123-4567.", "error");
        return;
      }

      const appointmentInput = {
        date,
        time,
        patient: {
          prefix,
          firstName,
          middleName,
          lastName,
          suffix,
          fullName: patientName,
          name: patientName,
          age: document.getElementById("age").value,
          contactNumber,
          patientType: document.getElementById("patientType").value
        },
        reasonForVisit: document.getElementById("reason").value,
      };

      let appointment;

      try {
        const data = await createAppointmentOnServer(appointmentInput);
        appointment = data.appointment;
      } catch (error) {
        setMessage("appointmentMessage", error.message, "error");
        return;
      }

      setMessage("appointmentMessage", `Confirmation: ${patientName} is reserved for ${formatInputDate(date)} at ${time}. Appointment ID: ${appointment.id}.`, "success");

      this.reset();
      if (appointmentDate) {
        appointmentDate.value = formatInputDate(today);
      }
      await refreshTimeSlots(parseInputDate(appointmentDate?.value) || today);
      await renderAppointments();
    });
  }

  const bookingForm = document.getElementById("bookingForm");

  if (bookingForm) {
    bookingForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const guestName = document.getElementById("guestName").value.trim();
      const guestCountryCode = document.getElementById("guestCountryCode").value.trim();
      const guestLocalNumber = document.getElementById("guestContact").value.trim();
      const guestContact = formatPhoneNumber(guestCountryCode, guestLocalNumber);
      const checkInDate = parseInputDate(document.getElementById("checkIn").value);
      const checkOutDate = parseInputDate(document.getElementById("checkOut").value);

      if (!guestName) {
        setMessage("bookingMessageOutput", "Please enter the guest name.", "error");
        return;
      }

      if (!isCountryCodeFormat(guestCountryCode) || !isLocalPhoneNumberFormat(guestLocalNumber)) {
        setMessage("bookingMessageOutput", "Please enter the contact number as +63 and 0917-123-4567.", "error");
        return;
      }

      if (!checkInDate || !checkOutDate || checkInDate < today || checkOutDate <= checkInDate) {
        setMessage("bookingMessageOutput", "Please enter valid future check-in and check-out dates in MM/DD/YYYY format.", "error");
        return;
      }

      const booking = {
        id: "BOOK-" + Date.now(),
        createdAt: new Date().toISOString(),
        status: "new",
        guest: {
          name: guestName,
          contactNumber: guestContact
        },
        checkIn: checkInDate,
        checkOut: checkOutDate,
        numberOfGuests: document.getElementById("guests").value,
        preferredRoom: document.getElementById("roomType").value,
        message: document.getElementById("bookingMessage").value
      };

      const bookings = JSON.parse(localStorage.getItem(BOOKING_KEY) || "[]");
      bookings.push(booking);
      localStorage.setItem(BOOKING_KEY, JSON.stringify(bookings, null, 2));

      setMessage("bookingMessageOutput", `Sample message: Booking inquiry received for ${guestName}. Staff should confirm availability and QR/GCash payment instructions.`, "success");

      this.reset();
    });
  }

  renderAppointments();
  renderAnnouncements();
});
