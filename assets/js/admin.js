const statusOptions = ["confirmed", "completed", "cancelled", "no-show"];
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
let currentAppointments = [];
const selectedAppointmentIds = new Set();

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

function setFilterDateToToday() {
  document.getElementById("filterDate").value = formatDisplayDate(getLocalDateString());
}

function populateMonthYearFilters() {
  const monthSelect = document.getElementById("filterMonth");
  const yearSelect = document.getElementById("filterYear");
  const currentYear = new Date().getFullYear();

  monthSelect.innerHTML = monthOptions
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");

  yearSelect.innerHTML = Array.from({ length: 7 }, (_, index) => currentYear - 3 + index)
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
}

function setMonthYearToDate(date = new Date()) {
  document.getElementById("filterMonth").value = String(date.getMonth() + 1).padStart(2, "0");
  document.getElementById("filterYear").value = String(date.getFullYear());
}

function getSelectedMonthString() {
  return `${document.getElementById("filterYear").value}-${document.getElementById("filterMonth").value}`;
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

function getAppointmentById(id) {
  return currentAppointments.find((appointment) => appointment.id === id);
}

function buildUpdatePayload(appointment, updates) {
  const patient = appointment.patient || {};
  return {
    date: updates.date ?? appointment.date,
    time: updates.time ?? appointment.time,
    patient: {
      prefix: patient.prefix || "",
      firstName: updates.firstName ?? patient.firstName ?? "",
      middleName: patient.middleName || "",
      lastName: updates.lastName ?? patient.lastName ?? "",
      suffix: patient.suffix || "",
      age: updates.age ?? patient.age ?? "",
      contactNumber: updates.contactNumber ?? patient.contactNumber ?? "",
      patientType: updates.patientType ?? patient.patientType ?? "New Patient",
      name: updates.fullName ?? patient.name ?? ""
    },
    reasonForVisit: updates.reasonForVisit ?? appointment.reasonForVisit ?? ""
  };
}

function updateBulkActionState() {
  const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
  if (bulkDeleteBtn) bulkDeleteBtn.disabled = selectedAppointmentIds.size === 0;
}

function syncSelectAllState() {
  const selectAll = document.getElementById("selectAllRecords");
  if (!selectAll) return;
  const visibleIds = currentAppointments.map((appointment) => appointment.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedAppointmentIds.has(id)).length;
  selectAll.checked = Boolean(visibleIds.length && selectedVisibleCount === visibleIds.length);
  selectAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
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
    throw new Error("Admin backend is not running. Start it with npm start and open http://localhost:3000/admin.html.");
  }

  if (!response.ok) {
    const isJsonResponse = response.headers.get("content-type")?.includes("application/json");
    const data = isJsonResponse ? await response.json().catch(() => ({})) : {};
    throw new Error(data.error || "Request failed");
  }

  return response.json();
}

function getFilterQuery() {
  const query = new URLSearchParams();
  const filterDateInput = document.getElementById("filterDate");
  const filterDate = parseDisplayDate(filterDateInput.value);
  const filterMonth = document.getElementById("filterMonth").value;
  const filterYear = document.getElementById("filterYear").value;
  const filterStatus = document.getElementById("filterStatus").value;
  const searchText = document.getElementById("searchText").value.trim();

  if (filterDate) {
    query.set("date", filterDate);
  } else if (filterMonth && filterYear) {
    query.set("month", getSelectedMonthString());
  }
  if (filterStatus) query.set("status", filterStatus);
  if (searchText) query.set("search", searchText);
  return query.toString();
}

function getReportQuery() {
  const query = new URLSearchParams();
  query.set("month", getActiveReportMonth());
  return query.toString();
}

function getActiveReportMonth() {
  const filterDate = parseDisplayDate(document.getElementById("filterDate").value);
  return filterDate ? filterDate.slice(0, 7) : getSelectedMonthString();
}

function setAuthenticatedView(user) {
  document.getElementById("loginSection").hidden = true;
  document.getElementById("adminShell").hidden = false;
  document.getElementById("logoutBtn").hidden = false;
  document.getElementById("printBtn").hidden = false;
  document.getElementById("adminUser").textContent = user.username;
  setFilterDateToToday();
  setMonthYearToDate();
  document.getElementById("filterStatus").value = "";
  document.getElementById("searchText").value = "";
}

function setLoggedOutView() {
  document.getElementById("loginSection").hidden = false;
  document.getElementById("adminShell").hidden = true;
  document.getElementById("logoutBtn").hidden = true;
  document.getElementById("printBtn").hidden = true;
}

function renderAdminTable(appointments) {
  currentAppointments = appointments;
  selectedAppointmentIds.clear();
  updateBulkActionState();
  const table = document.getElementById("adminAppointmentTable");

  if (!appointments.length) {
    table.innerHTML = '<tr><td colspan="9">No appointments found.</td></tr>';
    return;
  }

  table.innerHTML = appointments.map((appointment) => `
    <tr>
      <td><input class="record-select" data-id="${escapeHtml(appointment.id)}" type="checkbox" aria-label="Select appointment record" /></td>
      <td>${escapeHtml(formatDisplayDate(appointment.date))}</td>
      <td>${escapeHtml(appointment.time)}</td>
      <td>${escapeHtml(formatPatientName(appointment.patient))}</td>
      <td>${escapeHtml(appointment.patient?.contactNumber)}</td>
      <td>${escapeHtml(appointment.reasonForVisit)}</td>
      <td><span class="status ${escapeHtml(appointment.status)}">${escapeHtml(appointment.status)}</span></td>
      <td>
        <select data-id="${escapeHtml(appointment.id)}" class="status-select">
          ${statusOptions.map((status) => `<option ${appointment.status === status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </td>
      <td>
        <div class="row-actions">
          <button class="button-link secondary-link edit-record-btn" data-id="${escapeHtml(appointment.id)}" type="button"><span class="ui-icon" aria-hidden="true">✎</span>Edit</button>
          <button class="button-link danger-link delete-record-btn" data-id="${escapeHtml(appointment.id)}" type="button"><span class="ui-icon" aria-hidden="true">−</span>Delete</button>
        </div>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".record-select").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedAppointmentIds.add(checkbox.dataset.id);
      } else {
        selectedAppointmentIds.delete(checkbox.dataset.id);
      }
      syncSelectAllState();
      updateBulkActionState();
    });
  });

  document.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", async () => {
      try {
        await apiRequest(`/api/admin/appointments/${encodeURIComponent(select.dataset.id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: select.value })
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".edit-record-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const appointment = getAppointmentById(button.dataset.id);
      if (!appointment) return;

      const patient = appointment.patient || {};
      const fullName = prompt("Patient name", formatPatientName(patient));
      if (fullName === null) return;
      const contactNumber = prompt("Contact number", patient.contactNumber || "");
      if (contactNumber === null) return;
      const date = prompt("Date (YYYY-MM-DD)", appointment.date || "");
      if (date === null) return;
      const time = prompt("Time (example: 08:00 AM)", appointment.time || "");
      if (time === null) return;
      const reasonForVisit = prompt("Reason for visit", appointment.reasonForVisit || "");
      if (reasonForVisit === null) return;

      try {
        await apiRequest(`/api/admin/appointments/${encodeURIComponent(appointment.id)}`, {
          method: "PATCH",
          body: JSON.stringify(buildUpdatePayload(appointment, {
            fullName: fullName.trim(),
            contactNumber: contactNumber.trim(),
            date: date.trim(),
            time: time.trim(),
            reasonForVisit: reasonForVisit.trim()
          }))
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".delete-record-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const appointment = getAppointmentById(button.dataset.id);
      if (!appointment) return;
      if (!confirm(`Delete appointment for ${formatPatientName(appointment.patient)} at ${appointment.time}?`)) return;

      try {
        await apiRequest(`/api/admin/appointments/${encodeURIComponent(appointment.id)}`, {
          method: "DELETE"
        });
        await refreshDashboard();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderChart(containerId, data) {
  const container = document.getElementById(containerId);
  const entries = Object.entries(data || {});

  if (!entries.length) {
    container.innerHTML = '<p class="form-message">No data yet.</p>';
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);
  container.innerHTML = entries.map(([label, count]) => `
    <div class="chart-row">
      <span>${escapeHtml(label)}</span>
      <div class="chart-track"><div class="chart-bar" style="width: ${Math.max(6, (count / max) * 100)}%"></div></div>
      <strong>${escapeHtml(count)}</strong>
    </div>
  `).join("");
}

function renderDailyVolume(items) {
  const container = document.getElementById("dailyVolume");

  if (!items.length) {
    container.innerHTML = '<p class="form-message">No daily volume yet.</p>';
    return;
  }

  const max = Math.max(...items.map((item) => item.count), 1);
  container.innerHTML = items.map((item) => `
    <div class="chart-row">
      <span>${escapeHtml(formatDisplayDate(item.date))}</span>
      <div class="chart-track"><div class="chart-bar" style="width: ${Math.max(6, (item.count / max) * 100)}%"></div></div>
      <strong>${escapeHtml(item.count)}</strong>
    </div>
  `).join("");
}

function renderAnalytics(report, monthAppointments = []) {
  const completedCount = monthAppointments.filter((appointment) => appointment.status === "completed").length;
  const cancelledCount = monthAppointments.filter((appointment) => appointment.status === "cancelled").length;
  const noShowCount = monthAppointments.filter((appointment) => appointment.status === "no-show").length;

  document.getElementById("totalAppointments").textContent = report.total ?? 0;
  document.getElementById("todayAppointments").textContent = report.today ?? 0;
  document.getElementById("upcomingAppointments").textContent = report.upcoming7Days ?? 0;
  document.getElementById("completedMonth").textContent = completedCount;
  document.getElementById("cancelledAppointments").textContent = cancelledCount;
  document.getElementById("noShowAppointments").textContent = noShowCount;
  renderChart("statusBreakdown", report.byStatus);
  renderChart("patientTypeBreakdown", report.byPatientType);
  renderDailyVolume(report.dailyVolume || []);
}

async function refreshDashboard() {
  const query = getFilterQuery();
  const reportQuery = getReportQuery();
  const reportMonth = getActiveReportMonth();
  const monthQuery = new URLSearchParams({ month: reportMonth }).toString();
  const [appointmentData, monthAppointmentData, reportData] = await Promise.all([
    apiRequest(`/api/admin/appointments${query ? `?${query}` : ""}`),
    apiRequest(`/api/admin/appointments?${monthQuery}`),
    apiRequest(`/api/admin/reports?${reportQuery}`)
  ]);
  const monthAppointments = monthAppointmentData.appointments
    .filter((appointment) => String(appointment.date || "").startsWith(reportMonth));
  renderAdminTable(appointmentData.appointments);
  renderAnalytics(reportData, monthAppointments);
}

document.addEventListener("DOMContentLoaded", () => {
  populateMonthYearFilters();
  setFilterDateToToday();
  setMonthYearToDate();
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

  document.getElementById("filterDate").addEventListener("input", () => {
    const filterDate = parseDisplayDate(document.getElementById("filterDate").value);
    if (filterDate) {
      setMonthYearToDate(new Date(`${filterDate}T00:00:00`));
    }
    refreshDashboard();
  });

  ["filterMonth", "filterYear"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      document.getElementById("filterDate").value = "";
      refreshDashboard();
    });
  });

  ["filterStatus", "searchText"].forEach((id) => {
    document.getElementById(id).addEventListener("input", refreshDashboard);
  });

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    const query = getFilterQuery();
    window.location.href = `/api/admin/appointments.csv${query ? `?${query}` : ""}`;
  });

  document.getElementById("clearFiltersBtn").addEventListener("click", async () => {
    document.getElementById("filterDate").value = "";
    setMonthYearToDate();
    document.getElementById("filterStatus").value = "";
    document.getElementById("searchText").value = "";
    await refreshDashboard();
  });

  document.getElementById("selectAllRecords").addEventListener("change", (event) => {
    selectedAppointmentIds.clear();
    if (event.target.checked) {
      currentAppointments.forEach((appointment) => selectedAppointmentIds.add(appointment.id));
    }
    document.querySelectorAll(".record-select").forEach((checkbox) => {
      checkbox.checked = selectedAppointmentIds.has(checkbox.dataset.id);
    });
    syncSelectAllState();
    updateBulkActionState();
  });

  document.getElementById("bulkDeleteBtn").addEventListener("click", async () => {
    const ids = [...selectedAppointmentIds];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected appointment record${ids.length === 1 ? "" : "s"}?`)) return;

    try {
      await Promise.all(ids.map((id) => apiRequest(`/api/admin/appointments/${encodeURIComponent(id)}`, {
        method: "DELETE"
      })));
      selectedAppointmentIds.clear();
      await refreshDashboard();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => {});
    setLoggedOutView();
  });

  document.getElementById("printBtn").addEventListener("click", () => window.print());
});
