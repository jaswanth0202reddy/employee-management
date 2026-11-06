(function () {
  "use strict";

  var API = "/api/employees";

  var employees = [];
  var editingId = null;   // null => adding
  var deletingId = null;

  var $ = function (id) { return document.getElementById(id); };
  var body = $("employeeBody");
  var emptyMsg = $("emptyMsg");
  var countLabel = $("countLabel");
  var searchInput = $("searchInput");
  var formDialog = $("formDialog");
  var form = $("employeeForm");
  var deleteDialog = $("deleteDialog");

  var FIELDS = ["id", "name", "email", "department", "role"];

  // On localhost the Python server stores data in employees.xlsx.
  // On any other host (e.g. Vercel static hosting) there is no API, so the
  // app falls back to browser localStorage.
  var useLocal = false;
  var STORAGE_KEY = "employees";
  var SEED = [
    { id: "E001", name: "Aarav Sharma", email: "aarav.sharma@example.com", department: "Engineering", role: "Software Engineer" },
    { id: "E002", name: "Priya Reddy", email: "priya.reddy@example.com", department: "HR", role: "HR Manager" },
    { id: "E003", name: "John Smith", email: "john.smith@example.com", department: "Finance", role: "Accountant" },
    { id: "E004", name: "Meera Iyer", email: "meera.iyer@example.com", department: "Design", role: "UX Designer" }
  ];

  function isLocalhost() {
    return location.hostname === "localhost" || location.hostname === "127.0.0.1";
  }

  function localRequest(method, url, data) {
    var list;
    try { list = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { list = null; }
    if (!list) list = SEED.slice();
    var id = decodeURIComponent(url.split("/")[3] || "");
    var result;

    if (method === "POST") {
      if (list.some(function (e) { return e.id.toLowerCase() === data.id.toLowerCase(); })) {
        return Promise.reject(new Error("This ID already exists."));
      }
      list.push(data);
      result = data;
    } else if (method === "PUT") {
      list = list.map(function (e) { return e.id === id ? data : e; });
      result = data;
    } else if (method === "DELETE") {
      list = list.filter(function (e) { return e.id !== id; });
      result = { deleted: id };
    } else {
      result = list;
    }
    if (method !== "GET") localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return Promise.resolve(result);
  }

  function request(method, url, data) {
    if (useLocal) return localRequest(method, url, data);
    var opts = { method: method, headers: { "Content-Type": "application/json" } };
    if (data) opts.body = JSON.stringify(data);
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok) throw new Error(json.error || "Request failed.");
        return json;
      });
    });
  }

  function refresh() {
    return request("GET", API).then(function (list) {
      employees = list;
      render();
    }).catch(function (err) {
      if (!useLocal && !isLocalhost()) {
        useLocal = true;
        return refresh();
      }
      emptyMsg.hidden = false;
      emptyMsg.textContent = "Could not load employees: " + err.message + " (run serve_https.py and open https://localhost:8443)";
    });
  }

  function render() {
    var q = searchInput.value.trim().toLowerCase();
    var list = employees.filter(function (e) {
      return !q || e.name.toLowerCase().indexOf(q) !== -1 || e.id.toLowerCase().indexOf(q) !== -1;
    });

    body.innerHTML = "";
    list.forEach(function (e) {
      var tr = document.createElement("tr");
      FIELDS.forEach(function (f) {
        var td = document.createElement("td");
        td.textContent = e[f];
        tr.appendChild(td);
      });
      var actions = document.createElement("td");
      actions.className = "actions";
      actions.appendChild(button("Edit", "btn btn-sm", function () { openForm(e.id); }));
      actions.appendChild(button("Delete", "btn btn-sm btn-danger", function () { openDelete(e.id); }));
      tr.appendChild(actions);
      body.appendChild(tr);
    });

    emptyMsg.textContent = "No employees found.";
    emptyMsg.hidden = list.length > 0;
    countLabel.textContent = list.length + " of " + employees.length + " employees";
  }

  function button(text, cls, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function findById(id) {
    return employees.filter(function (e) { return e.id === id; })[0];
  }

  function clearErrors() {
    Array.prototype.forEach.call(form.querySelectorAll(".error"), function (el) { el.textContent = ""; });
  }

  function setError(field, msg) {
    form.querySelector('.error[data-for="' + field + '"]').textContent = msg;
  }

  function openForm(id) {
    editingId = id || null;
    clearErrors();
    form.reset();
    $("formTitle").textContent = editingId ? "Edit Employee" : "Add Employee";
    $("empId").disabled = !!editingId;
    if (editingId) {
      var e = findById(editingId);
      FIELDS.forEach(function (f) { form.elements[f].value = e[f]; });
    }
    formDialog.showModal();
  }

  function validate(data) {
    var ok = true;
    clearErrors();
    FIELDS.forEach(function (f) {
      if (!data[f]) { setError(f, "This field is required."); ok = false; }
    });
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      setError("email", "Enter a valid email address."); ok = false;
    }
    if (!editingId && data.id) {
      var dup = employees.some(function (e) { return e.id.toLowerCase() === data.id.toLowerCase(); });
      if (dup) { setError("id", "This ID already exists."); ok = false; }
    }
    return ok;
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var data = {};
    FIELDS.forEach(function (f) {
      // id input is disabled while editing, so read from the stored record
      data[f] = (f === "id" && editingId) ? editingId : form.elements[f].value.trim();
    });
    if (!validate(data)) return;

    var req = editingId
      ? request("PUT", API + "/" + encodeURIComponent(editingId), data)
      : request("POST", API, data);

    req.then(function () {
      formDialog.close();
      return refresh();
    }).catch(function (err) {
      setError(editingId ? "name" : "id", err.message);
    });
  });

  function openDelete(id) {
    deletingId = id;
    var e = findById(id);
    $("deleteMsg").textContent = "Are you sure you want to delete " + e.name + " (" + e.id + ")? This cannot be undone.";
    deleteDialog.showModal();
  }

  $("deleteConfirm").addEventListener("click", function () {
    request("DELETE", API + "/" + encodeURIComponent(deletingId)).then(function () {
      deleteDialog.close();
      return refresh();
    }).catch(function (err) {
      deleteDialog.close();
      alert(err.message);
    });
  });

  $("deleteCancel").addEventListener("click", function () { deleteDialog.close(); });
  $("cancelBtn").addEventListener("click", function () { formDialog.close(); });
  $("addBtn").addEventListener("click", function () { openForm(null); });
  searchInput.addEventListener("input", render);

  refresh();
})();
