//////////////////////////////////////////////////////
// ✅ LOAD ALL CUSTOMERS
//////////////////////////////////////////////////////

async function loadCustomers() {
  const res = await fetch("http://localhost:5001/api/ingestion/all");
  const data = await res.json();

  renderTable(data);
}

//////////////////////////////////////////////////////
// ✅ RENDER TABLE (REUSABLE 🔥)
//////////////////////////////////////////////////////

function renderTable(data) {
  const table = document.getElementById("tableBody");
  table.innerHTML = "";

  data.forEach(c => {
    const row = `
      <tr>
        <td>${c.id}</td>
        <td>${c.name}</td>
        <td>${c.email}</td>
        <td>
          <button onclick="editCustomer(${c.id}, '${c.name}', '${c.email}')">Edit</button>
          <button onclick="deleteCustomer(${c.id})">Delete</button>
        </td>
      </tr>
    `;
    table.innerHTML += row;
  });
}

//////////////////////////////////////////////////////
// ✅ SEARCH 🔍
//////////////////////////////////////////////////////

async function searchCustomer() {
  const query = document.getElementById("searchInput").value;

  if (!query) {
    loadCustomers();
    return;
  }

  const res = await fetch(`http://localhost:5001/api/ingestion/search?q=${query}`);
  const data = await res.json();

  renderTable(data);
}

//////////////////////////////////////////////////////
// ✅ DELETE 🗑
//////////////////////////////////////////////////////

async function deleteCustomer(id) {
  const confirmDelete = confirm("Are you sure? 🗑");

  if (!confirmDelete) return;

  await fetch(`http://localhost:5001/api/ingestion/${id}`, {
    method: "DELETE"
  });

  alert("Deleted successfully ✅");

  loadCustomers();
}

//////////////////////////////////////////////////////
// ✅ EDIT ✏️
//////////////////////////////////////////////////////

async function editCustomer(id, name, email) {
  const newName = prompt("Edit Name:", name);
  const newEmail = prompt("Edit Email:", email);

  if (!newName || !newEmail) return;

  await fetch(`http://localhost:5001/api/ingestion/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: newName,
      email: newEmail
    })
  });

  alert("Updated successfully ✏️");

  loadCustomers();
}

//////////////////////////////////////////////////////

loadCustomers();