const $ = id => document.getElementById(id);
const today = new Date().toISOString().slice(0,10);

function thaiDate(date) {
  return new Date(date + "T00:00:00").toLocaleDateString("th-TH", {
    day:"2-digit", month:"2-digit", year:"numeric"
  });
}
function showToast(msg) {
  $("toast").textContent = msg;
  $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 2500);
}
async function api(url, options={}) {
  const res = await fetch(url, {headers: {"Content-Type":"application/json"}, ...options});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});
function showPage(page) {
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === page));
  if (page === "dashboard") loadDashboard();
  if (page === "queue") loadQueue();
  if (page === "appointments") loadAppointments();
  if (page === "patients") loadPatients();
  if (page === "history") loadHistoryPatients();
}
function closeModal(){ $("modal").classList.remove("show"); }
function openModal(html){ $("modalContent").innerHTML = html; $("modal").classList.add("show"); }

$("today").textContent = new Date().toLocaleDateString("th-TH", {dateStyle:"full"});
$("queueDate").value = today;
$("appointmentDate").value = today;

async function loadDashboard() {
  const s = await api("/api/dashboard");
  $("statPatients").textContent = s.patients;
  $("statAppointments").textContent = s.appointmentsToday;
  $("statWaiting").textContent = s.waiting;
  $("statCompleted").textContent = s.completed;
  const q = await api("/api/queue?date="+today);
  renderQueue("dashboardQueue", q.slice(0,8), true);
}
function statusText(s) {
  return {waiting:"รอพบแพทย์",called:"กำลังพบแพทย์",completed:"เสร็จสิ้น",cancelled:"ยกเลิก"}[s] || s;
}
function renderQueue(target, list, compact=false) {
  if (!list.length) { $(target).innerHTML = '<div class="empty">ยังไม่มีคิวในวันนี้</div>'; return; }
  $(target).innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>คิว</th><th>ผู้ป่วย</th><th>เวลา</th><th>แพทย์</th><th>สถานะ</th>${compact?"":"<th>จัดการ</th>"}</tr></thead>
    <tbody>${list.map(x=>`<tr>
      <td class="queue-number">Q${String(x.queueNo).padStart(3,"0")}</td>
      <td>${x.patient?.name || "-"}</td><td>${x.time}</td><td>${x.doctor}</td>
      <td><span class="badge ${x.status}">${statusText(x.status)}</span></td>
      ${compact?"":`<td class="actions">
        ${x.status==="waiting"?`<button class="btn primary" onclick="setStatus('${x.id}','called')">เรียกคิว</button>`:""}
        ${x.status==="called"?`<button class="btn success" onclick="setStatus('${x.id}','completed')">เสร็จสิ้น</button>`:""}
        ${x.status!=="completed"?`<button class="btn danger" onclick="setStatus('${x.id}','cancelled')">ยกเลิก</button>`:""}
      </td>`}
    </tr>`).join("")}</tbody></table></div>`;
}
async function loadQueue(){
  const q = await api("/api/queue?date="+$("queueDate").value);
  renderQueue("queueTable", q);
}
$("queueDate").addEventListener("change", loadQueue);

async function loadAppointments(){
  const list = await api("/api/appointments?date="+$("appointmentDate").value);
  $("appointmentsTable").innerHTML = list.length ? `<div class="table-wrap"><table>
    <thead><tr><th>คิว</th><th>เวลา</th><th>ผู้ป่วย</th><th>แพทย์</th><th>เหตุผล</th><th>สถานะ</th></tr></thead>
    <tbody>${list.map(a=>`<tr><td>Q${String(a.queueNo).padStart(3,"0")}</td><td>${a.time}</td><td>${a.patient?.name||"-"}</td><td>${a.doctor}</td><td>${a.reason||"-"}</td><td><span class="badge ${a.status}">${statusText(a.status)}</span></td></tr>`).join("")}</tbody>
  </table></div>` : '<div class="empty">ไม่มีนัดหมายในวันที่เลือก</div>';
}
async function loadPatients(){
  const list = await api("/api/patients?q="+encodeURIComponent($("patientSearch").value));
  $("patientsTable").innerHTML = list.length ? `<div class="table-wrap"><table>
    <thead><tr><th>รหัส</th><th>ชื่อ</th><th>โทรศัพท์</th><th>วันเกิด</th><th>เพศ</th><th>ประวัติแพ้ยา</th><th></th></tr></thead>
    <tbody>${list.map(p=>`<tr><td>${p.id}</td><td><b>${p.name}</b></td><td>${p.phone}</td><td>${p.birthDate?thaiDate(p.birthDate):"-"}</td><td>${p.gender||"-"}</td><td>${p.allergy||"-"}</td><td><button class="btn" onclick="selectHistory('${p.id}')">ดูประวัติ</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">ยังไม่มีข้อมูลผู้ป่วย</div>';
}
function openPatientModal(){
  openModal(`<h2>👤 ลงทะเบียนผู้ป่วย</h2>
  <form onsubmit="savePatient(event)">
    <div class="form-grid">
      <label>ชื่อ-นามสกุล*<input name="name" required></label>
      <label>เบอร์โทรศัพท์*<input name="phone" required></label>
      <label>วันเกิด<input name="birthDate" type="date"></label>
      <label>เพศ<select name="gender"><option value="">-- เลือก --</option><option>ชาย</option><option>หญิง</option><option>อื่น ๆ</option></select></label>
      <label class="form-full">ประวัติแพ้ยา / แพ้อาหาร<textarea name="allergy" rows="2" placeholder="เช่น Penicillin, ไม่มี"></textarea></label>
    </div>
    <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">ยกเลิก</button><button class="btn primary">บันทึก</button></div>
  </form>`);
}
async function savePatient(e){
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  try { const p=await api("/api/patients",{method:"POST",body:JSON.stringify(data)}); closeModal(); showToast("บันทึกผู้ป่วย "+p.id+" สำเร็จ"); loadPatients(); loadHistoryPatients(); loadDashboard(); }
  catch(err){ alert(err.message); }
}

async function openAppointmentModal(){
  const patients=await api("/api/patients");
  openModal(`<h2>📅 เพิ่มนัดหมาย</h2>
  <form onsubmit="saveAppointment(event)">
    <div class="form-grid">
      <label>ผู้ป่วย*<select name="patientId" required><option value="">-- เลือกผู้ป่วย --</option>${patients.map(p=>`<option value="${p.id}">${p.id} - ${p.name}</option>`).join("")}</select></label>
      <label>แพทย์<select name="doctor"><option>แพทย์ทั่วไป</option><option>นพ.กิตติ</option><option>พญ.สุภาวดี</option></select></label>
      <label>วันที่*<input name="date" type="date" value="${today}" required></label>
      <label>เวลา*<input name="time" type="time" value="09:00" required></label>
      <label class="form-full">อาการ/เหตุผลที่นัด<textarea name="reason" rows="3"></textarea></label>
    </div>
    <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">ยกเลิก</button><button class="btn primary">สร้างนัดหมาย</button></div>
  </form>`);
}
async function saveAppointment(e){
  e.preventDefault(); const data=Object.fromEntries(new FormData(e.target));
  try{await api("/api/appointments",{method:"POST",body:JSON.stringify(data)});closeModal();showToast("สร้างนัดหมายสำเร็จ");loadAppointments();loadQueue();loadDashboard();}
  catch(err){alert(err.message);}
}
async function setStatus(id,status){
  try{await api("/api/appointments/"+id+"/status",{method:"PATCH",body:JSON.stringify({status})});showToast("เปลี่ยนสถานะคิวแล้ว");loadQueue();loadDashboard();loadAppointments();}
  catch(err){alert(err.message);}
}

async function loadHistoryPatients(selected=""){
  const list=await api("/api/patients");
  $("historyPatient").innerHTML='<option value="">-- เลือกผู้ป่วย --</option>'+list.map(p=>`<option value="${p.id}" ${p.id===selected?"selected":""}>${p.id} - ${p.name}</option>`).join("");
  if(selected) loadPatientHistory();
}
async function selectHistory(id){showPage("history");await loadHistoryPatients(id);}
async function loadPatientHistory(){
  const id=$("historyPatient").value;
  if(!id){$("patientProfile").innerHTML="";$("visitHistory").innerHTML='<div class="empty">เลือกผู้ป่วยเพื่อดูประวัติ</div>';return;}
  const d=await api("/api/patients/"+id);
  $("patientProfile").innerHTML=`<div class="profile">
    <div>รหัส<b>${d.patient.id}</b></div><div>ชื่อ<b>${d.patient.name}</b></div>
    <div>โทรศัพท์<b>${d.patient.phone}</b></div><div>แพ้ยา<b>${d.patient.allergy||"-"}</b></div>
  </div>`;
  $("visitHistory").innerHTML=d.visits.length?d.visits.map(v=>`<div class="panel" style="margin:12px 0;background:#fafafa">
    <b>วันที่ ${thaiDate(v.date)}</b>
    <p><b>อาการ:</b> ${v.symptoms}</p><p><b>การวินิจฉัย:</b> ${v.diagnosis}</p>
    <p><b>Vital signs:</b> BP ${v.bloodPressure||"-"} | Temp ${v.temperature||"-"} °C | น้ำหนัก ${v.weight||"-"} kg</p>
    <p><b>การรักษา:</b> ${v.treatment||"-"}</p><p><b>ยา:</b> ${v.medicine||"-"}</p><p><b>หมายเหตุ:</b> ${v.note||"-"}</p>
  </div>`).join(""):'<div class="empty">ยังไม่มีประวัติการรักษา</div>';
}
async function openVisitModal(){
  const patients=await api("/api/patients");
  openModal(`<h2>🩺 บันทึกการรักษาเบื้องต้น</h2>
  <form onsubmit="saveVisit(event)">
    <div class="form-grid">
      <label>ผู้ป่วย*<select name="patientId" required>${patients.map(p=>`<option value="${p.id}">${p.id} - ${p.name}</option>`).join("")}</select></label>
      <label>วันที่*<input name="date" type="date" value="${today}" required></label>
      <label class="form-full">อาการสำคัญ*<textarea name="symptoms" rows="3" required></textarea></label>
      <label class="form-full">การวินิจฉัยเบื้องต้น*<textarea name="diagnosis" rows="3" required></textarea></label>
      <label>ความดันโลหิต (BP)<input name="bloodPressure" placeholder="120/80"></label>
      <label>อุณหภูมิ (°C)<input name="temperature" type="number" step="0.1" placeholder="36.5"></label>
      <label>น้ำหนัก (kg)<input name="weight" type="number" step="0.1"></label>
      <label>การรักษา<input name="treatment"></label>
      <label class="form-full">ยา / คำแนะนำ<textarea name="medicine" rows="2"></textarea></label>
      <label class="form-full">หมายเหตุ<textarea name="note" rows="2"></textarea></label>
    </div>
    <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">ยกเลิก</button><button class="btn primary">บันทึกประวัติ</button></div>
  </form>`);
}
async function saveVisit(e){
  e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
  try{await api("/api/visits",{method:"POST",body:JSON.stringify(data)});closeModal();showToast("บันทึกประวัติการรักษาสำเร็จ");loadHistoryPatients(data.patientId);loadDashboard();}
  catch(err){alert(err.message);}
}

loadDashboard();
loadQueue();
loadAppointments();
loadPatients();
loadHistoryPatients();