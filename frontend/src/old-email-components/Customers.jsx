import React, { useState, useEffect } from 'react';

export default function Customers() {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // ==========================================
  // LOAD ALL CUSTOMERS
  // ==========================================
  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:5002/api/ingestion/all');
      const data = await res.json();
      setCustomers(data || []);
      setFilteredCustomers(data || []);
    } catch (err) {
      console.error('Error loading customers:', err);
      alert('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // INITIAL DATA FETCH
  // ==========================================
  useEffect(() => {
    loadCustomers();
  }, []);

  // ==========================================
  // SEARCH CUSTOMERS
  // ==========================================
  const searchCustomer = async (query) => {
    setSearchQuery(query);

    if (!query) {
      setFilteredCustomers(customers);
      return;
    }

    try {
      const res = await fetch(
        `http://localhost:5002/api/ingestion/search?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setFilteredCustomers(data || []);
    } catch (err) {
      console.error('Search error:', err);
      alert('Search failed');
    }
  };

  // ==========================================
  // DELETE CUSTOMER
  // ==========================================
  const deleteCustomer = async (id) => {
    if (!window.confirm('Are you sure? 🗑')) return;

    try {
      await fetch(`http://localhost:5002/api/ingestion/${id}`, {
        method: 'DELETE'
      });

      alert('Deleted successfully ✅');
      loadCustomers();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete customer');
    }
  };

  // ==========================================
  // EDIT CUSTOMER
  // ==========================================
  const editCustomer = async (id, currentName, currentEmail) => {
    const newName = window.prompt('Edit Name:', currentName);

    if (!newName) return;

    const newEmail = window.prompt('Edit Email:', currentEmail);

    if (!newEmail) return;

    try {
      await fetch(`http://localhost:5002/api/ingestion/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newName,
          email: newEmail
        })
      });

      alert('Updated successfully ✏️');
      loadCustomers();
    } catch (err) {
      console.error('Edit error:', err);
      alert('Failed to update customer');
    }
  };

  // ==========================================
  // RENDER COMPONENT
  // ==========================================
  return (
    <div id="email-module">
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Customer List 🔥</h1>

        {/* Search Box */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search name or email 🔍"
            value={searchQuery}
            onChange={(e) => searchCustomer(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                      Loading customers...
                    </td>
                  </tr>
                ) : filteredCustomers && filteredCustomers.length > 0 ? (
                  filteredCustomers.map((customer, index) => (
                    <tr key={index} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 text-sm text-gray-700">{customer.id || '-'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{customer.name || '-'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700">{customer.email || '-'}</td>
                      <td className="px-6 py-3 text-sm">
                        <button
                          onClick={() =>
                            editCustomer(customer.id, customer.name, customer.email)
                          }
                          className="text-blue-600 hover:text-blue-800 font-medium mr-3 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCustomer(customer.id)}
                          className="text-red-600 hover:text-red-800 font-medium transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                      No customers found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
