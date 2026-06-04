const STORAGE_KEY = "pensionClinicAppointments";

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

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function renderAdminTable() {
  const table = document.getElementById("adminAppointmentTable");
  const filterDate = document.getElementById("filterDate").value;
  const filterStatus = document.getElementById("filterStatus").value;
  const searchText = document.getElementById("searchText").value.toLowerCase();

  let appointments = getAppointments();

  if (filterDate) appointments = appointments.filter((appointment) => appointment.date === filterDate);
  if (filterStatus) appointments = appointments.filter((appointment) => appointment.status === filterStatus);
  if (searchText) {
    appointments = appointments.filter((appointment) => {
      const name = appointment.patient?.name?.toLowerCase() || "";
      const contact = appointment.patient?.contactNumber?.toLowerCase() || "";
      return name.includes(searchText) || contact.includes(searchText);
    });
  }

  appointments.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (!appointments.length) {
    table.innerHTML = '<tr><td colspan="7">No appointments found.</td></tr>';
    return;
  }

  table.innerHTML = appointments.map((appointment) => `
    <tr>
      <td>${escapeHtml(appointment.date)}</td>
      <td>${escapeHtml(appointment.time)}</td>
      <td>${escapeHtml(appointment.patient?.name)}</td>
      <td>${escapeHtml(appointment.patient?.contactNumber)}</td>
      <td>${escapeHtml(appointment.reasonForVisit)}</td>
      <td><span class="status ${escapeHtml(appointment.status)}">${escapeHtml(appointment.status)}</span></td>
      <td>
        <select data-id="${appointment.id}" class="status-select">
          ${["confirmed", "pending", "completed", "cancelled", "no-show"].map(status =>
            `<option ${appointment.status === status ? "selected" : ""}>${status}</option>`
          ).join("")}
        </select>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".status-select").forEach((select) => {
    select.addEventListener("change", () => {
      const appointments = getAppointments();
      const index = appointments.findIndex((appointment) => appointment.id === select.dataset.id);
      if (index >= 0) {
        appointments[index].status = select.value;
        appointments[index].updatedAt = new Date().toISOString();
        saveAppointments(appointments);
        renderAdminTable();
      }
    });
  });
}

function exportCsv() {
  const appointments = getAppointments();
  const header = ["ID", "Date", "Time", "Patient", "Contact", "Reason", "Status"];
  const rows = appointments.map((appointment) => [
    appointment.id,
    appointment.date,
    appointment.time,
    appointment.patient.name,
    appointment.patient.contactNumber || "",
    appointment.reasonForVisit || "",
    appointment.status
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "appointments.csv";
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  const today = getLocalDateString();
  document.getElementById("filterDate").value = today;

  ["filterDate", "filterStatus", "searchText"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderAdminTable);
  });

  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("printBtn").addEventListener("click", () => window.print());

  renderAdminTable();
});
