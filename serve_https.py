"""Serve this folder over HTTPS at https://localhost:8443 and store employees in employees.xlsx.

API:
  GET    /api/employees
  POST   /api/employees          (JSON body)
  PUT    /api/employees/<id>     (JSON body)
  DELETE /api/employees/<id>
"""
import http.server
import json
import os
import ssl
import threading
from urllib.parse import unquote

from openpyxl import Workbook, load_workbook

BASE = os.path.dirname(os.path.abspath(__file__))
XLSX = os.path.join(BASE, "employees.xlsx")
CERT = "/tmp/ui-cert/cert.pem"
KEY = "/tmp/ui-cert/key.pem"
FIELDS = ["id", "name", "email", "department", "role"]
HEADERS = ["ID", "Name", "Email", "Department", "Role"]
SEED = [
    ["E001", "Aarav Sharma", "aarav.sharma@example.com", "Engineering", "Software Engineer"],
    ["E002", "Priya Reddy", "priya.reddy@example.com", "HR", "HR Manager"],
    ["E003", "John Smith", "john.smith@example.com", "Finance", "Accountant"],
    ["E004", "Meera Iyer", "meera.iyer@example.com", "Design", "UX Designer"],
]

lock = threading.Lock()


def read_all():
    if not os.path.exists(XLSX):
        write_all([dict(zip(FIELDS, row)) for row in SEED])
    ws = load_workbook(XLSX).active
    rows = ws.iter_rows(min_row=2, values_only=True)
    return [dict(zip(FIELDS, ["" if v is None else str(v) for v in r])) for r in rows if r[0] is not None]


def write_all(employees):
    wb = Workbook()
    ws = wb.active
    ws.title = "Employees"
    ws.append(HEADERS)
    for e in employees:
        ws.append([e[f] for f in FIELDS])
    for col, width in zip("ABCDE", (12, 24, 32, 18, 24)):
        ws.column_dimensions[col].width = width
    wb.save(XLSX)


def clean(data):
    return {f: str(data.get(f, "")).strip() for f in FIELDS}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE, **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def emp_id(self):
        parts = self.path.split("?")[0].strip("/").split("/")
        if parts[:2] != ["api", "employees"]:
            return False, None
        return True, unquote(parts[2]) if len(parts) > 2 else None

    def do_GET(self):
        is_api, _ = self.emp_id()
        if not is_api:
            return super().do_GET()
        with lock:
            self.send_json(200, read_all())

    def do_POST(self):
        is_api, _ = self.emp_id()
        if not is_api:
            return self.send_json(404, {"error": "Not found"})
        emp = clean(self.read_body())
        if not all(emp.values()):
            return self.send_json(400, {"error": "All fields are required."})
        with lock:
            employees = read_all()
            if any(e["id"].lower() == emp["id"].lower() for e in employees):
                return self.send_json(409, {"error": "This ID already exists."})
            employees.append(emp)
            write_all(employees)
        self.send_json(201, emp)

    def do_PUT(self):
        is_api, eid = self.emp_id()
        if not is_api or not eid:
            return self.send_json(404, {"error": "Not found"})
        emp = clean(self.read_body())
        emp["id"] = eid
        if not all(emp.values()):
            return self.send_json(400, {"error": "All fields are required."})
        with lock:
            employees = read_all()
            if not any(e["id"] == eid for e in employees):
                return self.send_json(404, {"error": "Employee not found."})
            write_all([emp if e["id"] == eid else e for e in employees])
        self.send_json(200, emp)

    def do_DELETE(self):
        is_api, eid = self.emp_id()
        if not is_api or not eid:
            return self.send_json(404, {"error": "Not found"})
        with lock:
            employees = read_all()
            write_all([e for e in employees if e["id"] != eid])
        self.send_json(200, {"deleted": eid})


if __name__ == "__main__":
    read_all()  # creates employees.xlsx with sample data on first run
    server = http.server.ThreadingHTTPServer(("localhost", 8443), Handler)
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)
    server.socket = ctx.wrap_socket(server.socket, server_side=True)
    print("Serving on https://localhost:8443  (data file: employees.xlsx)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
