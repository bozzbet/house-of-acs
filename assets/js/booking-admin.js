const bookingStatusOptions = ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"];
const paymentStatusOptions = ["unpaid", "partial", "paid", "refunded"];
const monthOptions = [
  ["01", "January"],
  ["02", "February"],
  ["03", "March"],
  ["04", "April"],
  ["05", "May"],
  ["06", "June"],
  ["07", "July"],
  ["08", "August"],
  ["09", "September"],
  ["10", "October"],
  ["11", "November"],
  ["12", "December"]
];

let currentBookings = [];
let availableRooms = [];

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "";
  return `${match[2]}/${match[3]}/${match[1]}`;
}

function parseDisplayDate(value) {
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

function setLoginMessage(message, type = "") {
  const element = document.getElementById("adminLoginMessage");
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(path, {
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
  } catch (error) {
    throw new Error("Admin backend is not running. Start it with npm start and open http://localhost:3000/booking-admin.html.");
  }

  if (!response.ok) {
    const isJsonResponse = response.headers.get("content-type")?.includes("application/json");
    const data = isJsonResponse ? await response.json().catch(() => ({})) : {};
    throw new Error(data.error || "Request failed");
  }

  return response.json();
}

function populateMonthYearFilters() {
  const currentYear = new Date().getFullYear();
  document.getElementById("bookingFilterMonth").innerHTML = monthOptions
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  document.getElementById("bookingFilterYear").innerHTML = Array.from({ length: 7 }, (_, index) => currentYear - 3 + index)
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
}

function setBookingMonthYearToDate(date = new Date()) {
  document.getElementById("bookingFilterMonth").value = String(date.getMonth() + 1).padStart(2, "0");
  document.getElementById("bookingFilterYear").value = String(date.getFullYear());
}

function getSelectedBookingMonthString() {
  return `${document.getElementById("bookingFilterYear").value}-${document.getElementById("bookingFilterMonth").value}`;
}

function getBookingFilterQuery() {
  const query = new URLSearchParams();
  const filterDate = parseDisplayDate(document.getElementById("bookingFilterDate").value);
  const filterMonth = document.getElementById("bookingFilterMonth").value;
  const filterYear = document.getElementById("bookingFilterYear").value;
  const filterStatus = document.getElementById("bookingFilterStatus").value;
  const paymentStatus = document.getElementById("bookingPaymentFilter").value;
  const searchText = document.getElementById("bookingSearchText").value.trim();

  if (filterDate) {
    query.set("date", filterDate);
  } else if (filterMonth && filterYear) {
    query.set("month", getSelectedBookingMonthString());
  }
  if (filterStatus) query.set("status", filterStatus);
  if (paymentStatus) query.set("paymentStatus", paymentStatus);
  if (searchText) query.set("search", searchText);
  return query.toString();
}

function getActiveBookingReportMonth() {
  const filterDate = parseDisplayDate(document.getElementById("bookingFilterDate").value);
  return filterDate ? filterDate.slice(0, 7) : getSelectedBookingMonthString();
}

function setAuthenticatedView(user) {
  document.getElementById("loginSection").hidden = true;
  document.getElementById("adminShell").hidden = false;
  document.getElementById("logoutBtn").hidden = false;
  document.getElementById("printBtn").hidden = false;
  document.getElementById("adminUser").textContent = user.username;
  document.getElementById("bookingFilterDate").value = "";
  document.getElementById("bookingFilterStatus").value = "";
  document.getElementById("bookingPaymentFilter").value = "";
  document.getElementById("bookingSearchText").value = "";
  setBookingMonthYearToDate();
}

function setLoggedOutView() {
  document.getElementById("loginSection").hidden = false;
  document.getElementById("adminShell").hidden = true;
  document.getElementById("logoutBtn").hidden = true;
  document.getElementById("printBtn").hidden = true;
}

function renderBookingTable(bookings) {
  currentBookings = bookings;
  const table = document.getElementById("adminBookingTable");

  if (!bookings.length) {
    table.innerHTML = '<tr><td colspan="11">No booking requests found.</td></tr>';
    return;
  }

  const roomOptions = [
    '<option value="">Unassigned</option>',
    ...availableRooms.map((room) => `<option value="${room.id}">${escapeHtml(room.roomName)} - ${escapeHtml(room.roomType)}</option>`)
  ].join("");

  table.innerHTML = bookings.map((booking) => `
    <tr>
      <td>#${escapeHtml(booking.id)}</td>
      <td>${escapeHtml(booking.guestName)}</td>
      <td>${escapeHtml(booking.phone)}</td>
      <td>${escapeHtml(formatDisplayDate(booking.checkIn))}<br />${escapeHtml(formatDisplayDate(booking.checkOut))}</td>
      <td>${escapeHtml(booking.roomTypeRequested)}<br /><span class="muted-cell">${escapeHtml(booking.guests)} guest${Number(booking.guests) === 1 ? "" : "s"}</span></td>
      <td>
        <select data-id="${escapeHtml(booking.id)}" class="booking-room-select">
          ${roomOptions}
        </select>
      </td>
      <td>
        <select data-id="${escapeHtml(booking.id)}" class="booking-status-select">
          ${bookingStatusOptions.map((status) => `<option ${booking.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </td>
      <td>
        <select data-id="${escapeHtml(booking.id)}" class="booking-payment-select">
          ${paymentStatusOptions.map((status) => `<option ${booking.paymentStatus === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </td>
      <td><input class="booking-total-input" data-id="${escapeHtml(booking.id)}" type="number" min="0" step="0.01" value="${escapeHtml(booking.totalAmount)}" /></td>
      <td>${escapeHtml(booking.specialRequest || "-")}</td>
      <td>
        <div class="row-actions">
          <button class="button-link secondary-link save-booking-payment-btn" data-id="${escapeHtml(booking.id)}" type="button"><span class="ui-icon" aria-hidden="true">✓</span>Save</button>
          <button class="button-link danger-link delete-booking-btn" data-id="${escapeHtml(booking.id)}" type="button"><span class="ui-icon" aria-hidden="true">−</span>Delete</button>
        </div>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".booking-room-select").forEach((select) => {
    const booking = currentBookings.find((item) => String(item.id) === select.dataset.id);
    select.value = booking?.roomId || "";
    select.addEventListener("change", async () => {
      try {
        await apiRequest(`/api/admin/bookings/${encodeURIComponent(select.dataset.id)}/room`, {
          method: "PATCH",
          body: JSON.stringify({ roomId: select.value || null })
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
        await refreshDashboard();
      }
    });
  });

  document.querySelectorAll(".booking-status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await apiRequest(`/api/admin/bookings/${encodeURIComponent(select.dataset.id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value })
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".save-booking-payment-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const paymentStatus = document.querySelector(`.booking-payment-select[data-id="${CSS.escape(id)}"]`).value;
      const totalAmount = document.querySelector(`.booking-total-input[data-id="${CSS.escape(id)}"]`).value;
      try {
        await apiRequest(`/api/admin/bookings/${encodeURIComponent(id)}/payment`, {
          method: "PATCH",
          body: JSON.stringify({ paymentStatus, totalAmount })
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".delete-booking-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const booking = currentBookings.find((item) => String(item.id) === button.dataset.id);
      if (!booking || !confirm(`Delete booking request #${booking.id} for ${booking.guestName}?`)) return;
      try {
        await apiRequest(`/api/admin/bookings/${encodeURIComponent(button.dataset.id)}`, {
          method: "DELETE"
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderBookingAnalytics(report) {
  document.getElementById("availableRoomsToday").textContent = report.availableRoomsToday ?? 0;
  document.getElementById("occupiedRoomsToday").textContent = report.occupiedRoomsToday ?? 0;
  document.getElementById("pendingBookings").textContent = report.pendingBookings ?? 0;
  document.getElementById("todayCheckIns").textContent = report.todayCheckIns ?? 0;
  document.getElementById("todayCheckOuts").textContent = report.todayCheckOuts ?? 0;
  document.getElementById("unpaidBookings").textContent = report.unpaidBookings ?? 0;
}

async function refreshDashboard() {
  const bookingQuery = getBookingFilterQuery();
  const bookingReportQuery = new URLSearchParams({ month: getActiveBookingReportMonth() }).toString();
  const [bookingData, roomData, bookingReportData] = await Promise.all([
    apiRequest(`/api/admin/bookings${bookingQuery ? `?${bookingQuery}` : ""}`),
    apiRequest("/api/admin/rooms"),
    apiRequest(`/api/admin/booking-reports?${bookingReportQuery}`)
  ]);
  availableRooms = roomData.rooms || [];
  renderBookingTable(bookingData.bookings || []);
  renderBookingAnalytics(bookingReportData);
}

document.addEventListener("DOMContentLoaded", () => {
  populateMonthYearFilters();
  setBookingMonthYearToDate();
  setLoggedOutView();

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginMessage("Signing in...");

    try {
      const user = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("adminUsername").value.trim(),
          password: document.getElementById("adminPassword").value
        })
      });
      setAuthenticatedView(user);
      setLoginMessage("");
      event.target.reset();
      await refreshDashboard();
    } catch (error) {
      setLoginMessage(error.message, "error");
    }
  });

  document.getElementById("bookingFilterDate").addEventListener("input", () => {
    const filterDate = parseDisplayDate(document.getElementById("bookingFilterDate").value);
    if (filterDate) {
      setBookingMonthYearToDate(new Date(`${filterDate}T00:00:00`));
    }
    refreshDashboard();
  });

  ["bookingFilterMonth", "bookingFilterYear"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      document.getElementById("bookingFilterDate").value = "";
      refreshDashboard();
    });
  });

  ["bookingFilterStatus", "bookingPaymentFilter", "bookingSearchText"].forEach((id) => {
    document.getElementById(id).addEventListener("input", refreshDashboard);
  });

  document.getElementById("exportBookingsCsvBtn").addEventListener("click", () => {
    const query = getBookingFilterQuery();
    window.location.href = `/api/admin/bookings.csv${query ? `?${query}` : ""}`;
  });

  document.getElementById("clearBookingFiltersBtn").addEventListener("click", async () => {
    document.getElementById("bookingFilterDate").value = "";
    document.getElementById("bookingFilterStatus").value = "";
    document.getElementById("bookingPaymentFilter").value = "";
    document.getElementById("bookingSearchText").value = "";
    setBookingMonthYearToDate();
    await refreshDashboard();
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => {});
    setLoggedOutView();
  });

  document.getElementById("printBtn").addEventListener("click", () => window.print());
});
