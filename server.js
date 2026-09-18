const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function defaultDB() {
  return {
    patients: [
      {
        id: "P001",
        name: "สทชาย ใจร้าย",
        phone: "0812345678",
        birthDate: "1990-05-10",
        gender: "ชาย",
        allergy: "ไม่มี",
        createdAt: new Date().toISOString()
      }
    ],
    appointments: [],
    visits: []
  };
}

function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB(), null, 2), "utf8");
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function nextId(items, prefix) {
  const nums = items
    .map(x => Number(String(x.id || "").replace(prefix, "")))
    .filter(Number.isFinite);
  return prefix + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0");
}

app.get("/api/dashboard", (req, res) => {
  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);
  const appointmentsToday = db.appointments.filter(a => a.date === today);
  const waiting = appointmentsToday.filter(a => a.status === "waiting").length;
  const completed = appointmentsToday.filter(a => a.status === "completed").length;
  res.json({
    patients: db.patients.length,
    appointmentsToday: appointmentsToday.length,
    waiting,
    completed
  });
});

app.get("/api/patients", (req, res) => {
  const db = readDB();
  const q = String(req.query.q || "").trim().toLowerCase();
  let patients = db.patients;
  if (q) {
    patients = patients.filter(p =>
      [p.id, p.name, p.phone].some(v => String(v || "").toLowerCase().includes(q))
    );
  }
  res.json(patients.sort((a, b) => a.name.localeCompare(b.name, "th")));
});

app.get("/api/patients/:id", (req, res) => {
  const db = readDB();
  const patient = db.patients.find(p => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "ไม่พบข้อมูลผู้ป่วย" });

  const visits = db.visits
    .filter(v => v.patientId === patient.id)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const appointments = db.appointments
    .filter(a => a.patientId === patient.id)
    .sort((a, b) => String(b.date + a.time).localeCompare(String(a.date + b.time)));

  res.json({ patient, visits, appointments });
});

app.post("/api/patients", (req, res) => {
  const db = readDB();
  const { name, phone, birthDate, gender, allergy } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: "กรุณากรอกชื่อและเบอร์โทรศัพท์" });
  }

  const patient = {
    id: nextId(db.patients, "P"),
    name: String(name).trim(),
    phone: String(phone).trim(),
    birthDate: birthDate || "",
    gender: gender || "",
    allergy: allergy || "ไม่ระบุ",
    createdAt: new Date().toISOString()
  };

  db.patients.push(patient);
  writeDB(db);
  res.status(201).json(patient);
});

app.get("/api/appointments", (req, res) => {
  const db = readDB();
  const date = req.query.date;
  let list = db.appointments;
  if (date) list = list.filter(a => a.date === date);

  list = list
    .map(a => ({ ...a, patient: db.patients.find(p => p.id === a.patientId) || null }))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  res.json(list);
});

app.post("/api/appointments", (req, res) => {
  const db = readDB();
  const { patientId, date, time, doctor, reason } = req.body;

  if (!patientId || !date || !time) {
    return res.status(400).json({ error: "กรุณาระบุผู้ป่วย วันที่ และเวลา" });
  }
  if (!db.patients.some(p => p.id === patientId)) {
    return res.status(400).json({ error: "ไม่พบผู้ป่วยรายนี้" });
  }

  const sameSlot = db.appointments.some(
    a => a.date === date && a.time === time && a.doctor === doctor && a.status !== "cancelled"
  );
  if (sameSlot) {
    return res.status(409).json({ error: "ช่วงเวลานี้มีนัดแล้ว กรุณาเลือกเวลาอื่น" });
  }

  const dayCount = db.appointments.filter(a => a.date === date).length;
  const appointment = {
    id: nextId(db.appointments, "A"),
    patientId,
    date,
    time,
    doctor: doctor || "แพทย์ทั่วไป",
    reason: reason || "",
    queueNo: dayCount + 1,
    status: "waiting",
    createdAt: new Date().toISOString()
  };

  db.appointments.push(appointment);
  writeDB(db);
  res.status(201).json(appointment);
});

app.patch("/api/appointments/:id/status", (req, res) => {
  const db = readDB();
  const item = db.appointments.find(a => a.id === req.params.id);
  if (!item) return res.status(404).json({ error: "ไม่พบนัดหมาย" });

  const allowed = ["waiting", "called", "completed", "cancelled"];
  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
  }

  item.status = req.body.status;
  item.updatedAt = new Date().toISOString();
  writeDB(db);
  res.json(item);
});

app.post("/api/visits", (req, res) => {
  const db = readDB();
  const {
    patientId, appointmentId, date, symptoms, diagnosis,
    bloodPressure, temperature, weight, treatment, medicine, note
  } = req.body;

  if (!patientId || !date || !symptoms || !diagnosis) {
    return res.status(400).json({ error: "กรุณากรอกผู้ป่วย อาการ และการวินิจฉัย" });
  }
  if (!db.patients.some(p => p.id === patientId)) {
    return res.status(400).json({ error: "ไม่พบผู้ป่วย" });
  }

  const visit = {
    id: nextId(db.visits, "V"),
    patientId,
    appointmentId: appointmentId || "",
    date,
    symptoms,
    diagnosis,
    bloodPressure: bloodPressure || "",
    temperature: temperature || "",
    weight: weight || "",
    treatment: treatment || "",
    medicine: medicine || "",
    note: note || "",
    createdAt: new Date().toISOString()
  };

  db.visits.push(visit);

  if (appointmentId) {
    const appointment = db.appointments.find(a => a.id === appointmentId);
    if (appointment) appointment.status = "completed";
  }

  writeDB(db);
  res.status(201).json(visit);
});

app.get("/api/queue", (req, res) => {
  const db = readDB();
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const queue = db.appointments
    .filter(a => a.date === date && a.status !== "cancelled")
    .map(a => ({
      ...a,
      patient: db.patients.find(p => p.id === a.patientId) || null
    }))
    .sort((a, b) => a.queueNo - b.queueNo);

  res.json(queue);
});

app.get("*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Clinic Queue System running at http://localhost:${PORT}`);
});