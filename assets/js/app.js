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
      <td>${appointment.time}</td>
      <td>${appointment.patient.name}</td>
      <td>${appointment.reasonForVisit || "Appointment"}</td>
      <td><span class="status ${appointment.status}">${appointment.status}</span></td>
    </tr>
  `).join("");
}

function renderAnnouncements() {
  const container = document.getElementById("announcementCards");
  if (!container) return;

  container.innerHTML = defaultAnnouncements.map((announcement) => `
    <article class="card announcement-card">
      <div class="card-body">
        <div class="announcement-meta">${announcement.category}</div>
        <h3>${announcement.title}</h3>
        <p>${announcement.content}</p>
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
  const today = new Date().toISOString().split("T")[0];

  if (appointmentDate) appointmentDate.min = today;
  if (checkIn) checkIn.min = today;
  if (checkOut) checkOut.min = today;

  const appointmentForm = document.getElementById("appointmentForm");

  if (appointmentForm) {
    appointmentForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const date = document.getElementById("appointmentDate").value;
      const time = document.getElementById("appointmentTime").value;
      const patientName = document.getElementById("patientName").value.trim();
      const contactNumber = document.getElementById("contactNumber").value.trim();

      const appointments = getAppointments();
      const duplicate = appointments.some((appointment) => appointment.date === date && appointment.time === time && appointment.status !== "cancelled");

      if (duplicate) {
        document.getElementById("appointmentMessage").textContent = "That time slot is already reserved in this browser demo. Please choose another time.";
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

      document.getElementById("appointmentMessage").textContent =
        `Sample confirmation: ${patientName} is reserved for ${date} at ${time}. Appointment ID: ${appointment.id}.`;

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
      const booking = {
        id: "BOOK-" + Date.now(),
        createdAt: new Date().toISOString(),
        status: "new",
        guest: {
          name: guestName,
          contactNumber: document.getElementById("guestContact").value.trim()
        },
        checkIn: document.getElementById("checkIn").value,
        checkOut: document.getElementById("checkOut").value,
        numberOfGuests: document.getElementById("guests").value,
        preferredRoom: document.getElementById("roomType").value,
        message: document.getElementById("bookingMessage").value
      };

      const bookings = JSON.parse(localStorage.getItem(BOOKING_KEY) || "[]");
      bookings.push(booking);
      localStorage.setItem(BOOKING_KEY, JSON.stringify(bookings, null, 2));

      document.getElementById("bookingMessageOutput").textContent =
        `Sample message: Booking inquiry received for ${guestName}. In the real app, this will be saved to data/room-bookings.json or a backend database.`;

      this.reset();
    });
  }

  renderAppointments();
  renderAnnouncements();
});
