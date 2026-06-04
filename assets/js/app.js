const STORAGE_KEY = "pensionClinicAppointments";
const BOOKING_KEY = "pensionHouseBookings";

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

function getAppointments() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveAppointments(appointments) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appointments, null, 2));
}

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

function makeAppointmentId(date) {
  return "APT-" + date.replaceAll("-", "") + "-" + Math.floor(Math.random() * 9000 + 1000);
}

function renderAppointments() {
  const table = document.getElementById("appointmentTable");
  if (!table) return;

  const appointments = getAppointments().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (!appointments.length) {
    table.innerHTML = '<tr><td colspan="4">No demo appointments yet.</td></tr>';
    return;
  }

  table.innerHTML = appointments.slice(-8).map((appointment) => `
    <tr>
      <td>${escapeHtml(appointment.time)}</td>
      <td>${escapeHtml(appointment.patient?.name)}</td>
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
  const checkIn = document.getElementById("checkIn");
  const checkOut = document.getElementById("checkOut");
  const today = getLocalDateString();

  if (appointmentDate) appointmentDate.min = today;
  if (checkIn) checkIn.min = today;
  if (checkOut) checkOut.min = today;

  if (checkIn && checkOut) {
    checkIn.addEventListener("change", () => {
      checkOut.min = checkIn.value || today;
      if (checkOut.value && checkOut.value <= checkIn.value) checkOut.value = "";
    });
  }

  const appointmentForm = document.getElementById("appointmentForm");

  if (appointmentForm) {
    appointmentForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const date = document.getElementById("appointmentDate").value;
      const time = document.getElementById("appointmentTime").value;
      const patientName = document.getElementById("patientName").value.trim();
      const contactNumber = document.getElementById("contactNumber").value.trim();

      if (!date || date < today) {
        setMessage("appointmentMessage", "Please choose today or a future appointment date.", "error");
        return;
      }

      if (!time) {
        setMessage("appointmentMessage", "Please choose an available time slot.", "error");
        return;
      }

      if (!patientName || !contactNumber) {
        setMessage("appointmentMessage", "Please enter the patient name and contact number.", "error");
        return;
      }

      const appointments = getAppointments();
      const duplicate = appointments.some((appointment) => appointment.date === date && appointment.time === time && appointment.status !== "cancelled");

      if (duplicate) {
        setMessage("appointmentMessage", "That time slot is already reserved in this browser demo. Please choose another time.", "error");
        return;
      }

      const appointment = {
        id: makeAppointmentId(date),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        date,
        time,
        status: "confirmed",
        patient: {
          name: patientName,
          age: document.getElementById("age").value,
          contactNumber,
          patientType: document.getElementById("patientType").value
        },
        reasonForVisit: document.getElementById("reason").value,
        notes: "",
        source: "github-pages-demo"
      };

      appointments.push(appointment);
      saveAppointments(appointments);

      setMessage("appointmentMessage", `Sample confirmation: ${patientName} is reserved for ${date} at ${time}. Appointment ID: ${appointment.id}.`, "success");

      this.reset();
      if (appointmentDate) appointmentDate.min = today;
      renderAppointments();
    });
  }

  const bookingForm = document.getElementById("bookingForm");

  if (bookingForm) {
    bookingForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const guestName = document.getElementById("guestName").value.trim();
      const checkInDate = document.getElementById("checkIn").value;
      const checkOutDate = document.getElementById("checkOut").value;

      if (!guestName) {
        setMessage("bookingMessageOutput", "Please enter the guest name.", "error");
        return;
      }

      if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
        setMessage("bookingMessageOutput", "Please choose valid check-in and check-out dates.", "error");
        return;
      }

      const booking = {
        id: "BOOK-" + Date.now(),
        createdAt: new Date().toISOString(),
        status: "new",
        guest: {
          name: guestName,
          contactNumber: document.getElementById("guestContact").value.trim()
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
      if (checkIn) checkIn.min = today;
      if (checkOut) checkOut.min = today;
    });
  }

  renderAppointments();
  renderAnnouncements();
});
