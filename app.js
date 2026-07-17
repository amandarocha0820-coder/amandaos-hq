const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

// ======================================
// Google Calendar
// ======================================

const GOOGLE_CLIENT_ID =
"962792348280-ft1u20jllo38g1gl4dj13r5jpknui4hl.apps.googleusercontent.com";
const VENDOR_SHEETS = [
  {
    id: "14wl2grmU7oujyXdL26y4Cnj_LdFPWP9cBJWrODFTIJg",
    tab: "SCCT Responses",
    label: "SCCT Responses",
    tracksStatus: true
  },
  {
    id: "1ChK3bNiOrH3F7HJvoISA7RGxDRz5hppvShrsdNR5040",
    tab: "Form Responses",
    label: "Form Responses",
    tracksStatus: true
  },
  {
    id: "13Tkm7WVEDEDutJ9aSxc5jLAsag1mmIGvPuZimLXjx3M",
    tab: "Form Responses 1",
    label: "Form Responses 1",
    tracksStatus: false
  },
  {
    id: "1EBxEaGXicIDXSZdcDTCfc89nB36iR4xfi-cpGJrs9CI",
    tab: "Volunteer Responses",
    label: "Volunteer Responses",
    tracksStatus: false
  }
];

let googleTokenClient = null;
let googleAccessToken = null;
let vendorSheetData = null;

const store = {
  get(key){ return JSON.parse(localStorage.getItem(key) || "[]"); },
  set(key, value){ localStorage.setItem(key, JSON.stringify(value)); },
  getObj(key, fallback={}){ return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); },
  setObj(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
};

const monthKey = d => new Date(d + "T12:00:00").toISOString().slice(0,7);
const currentMonth = () => new Date().toISOString().slice(0,7);
const money = n => Number(n || 0).toLocaleString("en-US",{style:"currency",currency:"USD"});
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random());
const localDateKey = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0")
].join("-");

function setTodayDefaults(){
  const today = localDateKey();
  $$('input[type="date"]').forEach(i => { if(!i.value) i.value = today; });
  const now = new Date();
  $("#todayDate").textContent = now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  const hr = now.getHours();
  $("#greeting").textContent = `${hr<12?"Good morning":hr<17?"Good afternoon":"Good evening"}, Amanda`;
}

function openModal(id){ const d = document.getElementById(id); if(d) d.showModal(); setTodayDefaults(); }
$$("[data-open]").forEach(b=>b.addEventListener("click",()=>openModal(b.dataset.open)));
$$("[data-close]").forEach(b=>b.addEventListener("click",()=>document.getElementById(b.dataset.close).close()));
// Make every Cancel and X button close its popup
$$('.modal button[value="cancel"]').forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    button.closest("dialog").close();
  });
});
$$("[data-jump]").forEach(b=>b.addEventListener("click",()=>{ $("#quickCaptureModal").close(); openModal(b.dataset.jump); }));

$$(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>{
  $$(".nav-btn").forEach(b=>b.classList.remove("active")); btn.classList.add("active");
  $$(".view").forEach(v=>v.classList.remove("active-view"));
  document.getElementById(btn.dataset.view).classList.add("active-view");
}));

function handleForm(formId, key, mapper){
  const form = document.getElementById(formId);
  form.addEventListener("submit", e=>{
    e.preventDefault();
    const fd = new FormData(form);
    const item = mapper(fd);
    const data = store.get(key); data.unshift(item); store.set(key,data);
    form.reset(); form.closest("dialog").close(); setTodayDefaults(); renderAll();
  });
}

handleForm("callahanForm","callahanPurchases",fd=>({
  id:uid(), item:fd.get("item"), amount:Number(fd.get("amount")), store:fd.get("store"),
  type:fd.get("type"), date:fd.get("date"), paidBy:fd.get("paidBy"), notes:fd.get("notes"),
  photoTaken:fd.get("photoTaken")==="on", filed:fd.get("filed")==="on"
}));

handleForm("businessPurchaseForm","businessPurchases",fd=>({
  id:uid(), merchant:fd.get("merchant"), amount:Number(fd.get("amount")), description:fd.get("description"),
  business:fd.get("business"), date:fd.get("date"), category:fd.get("category"),
  photoTaken:fd.get("photoTaken")==="on", filed:fd.get("filed")==="on", reviewed:fd.get("reviewed")==="on"
}));

handleForm("brainForm","brainItems",fd=>({id:uid(), text:fd.get("text"), bucket:fd.get("bucket"), created:new Date().toISOString()}));
handleForm("taskForm","tasks",fd=>({id:uid(), text:fd.get("text"), dueDate:fd.get("dueDate"), priority:fd.get("priority"), done:false}));
handleForm("eventForm","events",fd=>({id:uid(), title:fd.get("title"), date:fd.get("date"), time:fd.get("time"), location:fd.get("location")}));
handleForm("alertForm","alerts",fd=>({id:uid(), text:fd.get("text"), type:fd.get("type"), created:new Date().toISOString()}));

$("#taxForm").addEventListener("submit",e=>{
  e.preventDefault(); const fd=new FormData(e.currentTarget);
  store.setObj("taxSetup",{label:fd.get("label"),dueDay:Number(fd.get("dueDay")),status:fd.get("status")});
  e.currentTarget.closest("dialog").close(); renderAll();
});

function deleteItem(key,id){ store.set(key,store.get(key).filter(x=>x.id!==id)); renderAll(); }
function toggleTask(id){ const t=store.get("tasks"); const x=t.find(x=>x.id===id); if(x)x.done=!x.done; store.set("tasks",t); renderAll(); }
function markFiled(key,id){ const a=store.get(key); const x=a.find(x=>x.id===id); if(x)x.filed=true; store.set(key,a); renderAll(); }

window.deleteItem=deleteItem; window.toggleTask=toggleTask; window.markFiled=markFiled;

function renderCallahan(){
  const all=store.get("callahanPurchases"), month=all.filter(x=>monthKey(x.date)===currentMonth());
  const total=month.reduce((s,x)=>s+x.amount,0), unfiled=all.filter(x=>!x.filed).length;
  ["#callahanMonthTotal","#callahanPageTotal"].forEach(s=>$(s).textContent=money(total));
  $("#callahanPurchaseCount").textContent=month.length; $("#receiptNeedsFiling").textContent=unfiled;
  $("#callahanPageUnfiled").textContent=unfiled; $("#callahanPageCount").textContent=all.length;
  $("#callahanTableBody").innerHTML = all.length ? all.map(x=>`<tr>
    <td>${x.date}</td><td>${escapeHtml(x.item)}</td><td>${escapeHtml(x.type)}</td><td>${escapeHtml(x.store||"")}</td>
    <td>${money(x.amount)}</td><td>${x.filed?"✅ Yes":`<button class="small-btn" onclick="markFiled('callahanPurchases','${x.id}')">Mark filed</button>`}</td>
    <td><button class="icon-btn" onclick="deleteItem('callahanPurchases','${x.id}')">×</button></td></tr>`).join("") :
    `<tr><td colspan="7" class="empty-state">No purchases recorded yet.</td></tr>`;
}

function renderBusiness(){
  const all=store.get("businessPurchases"), month=all.filter(x=>monthKey(x.date)===currentMonth());
  const total=month.reduce((s,x)=>s+x.amount,0), review=all.filter(x=>!x.reviewed||x.category==="Needs Review").length, unfiled=all.filter(x=>!x.filed).length;
  $("#businessPurchaseTotal").textContent=money(total); $("#businessNeedsReview").textContent=review;
  $("#businessPageTotal").textContent=money(total); $("#businessPageReview").textContent=review; $("#businessPageUnfiled").textContent=unfiled;
  $("#bookkeepingStatus").textContent=review?`${review} to review`:"Caught up";
  $("#bookkeepingPreview").innerHTML=all.slice(0,3).map(x=>`<div class="list-item"><span>${escapeHtml(x.merchant)}</span><b>${money(x.amount)}</b></div>`).join("") || `<div class="empty-state">No purchases yet.</div>`;
  $("#businessTableBody").innerHTML=all.length?all.map(x=>`<tr>
    <td>${x.date}</td><td>${escapeHtml(x.merchant)}</td><td>${escapeHtml(x.description)}</td><td>${escapeHtml(x.business)}</td>
    <td>${money(x.amount)}</td><td>${x.reviewed&&x.filed?"✅ Complete":x.filed?"🟡 Review":"🟠 File receipt"}</td>
    <td><button class="icon-btn" onclick="deleteItem('businessPurchases','${x.id}')">×</button></td></tr>`).join("") :
    `<tr><td colspan="7" class="empty-state">No purchases recorded yet.</td></tr>`;
}

function renderBrain(){
  const all=store.get("brainItems"); $("#brainCount").textContent=all.length;
  $("#brainPreview").innerHTML=all.slice(0,3).map(x=>`<div class="list-item"><span>${escapeHtml(x.text)}</span></div>`).join("");
  $("#brainBoard").innerHTML=all.length?all.map(x=>`<div class="brain-card"><div><span class="pill">${escapeHtml(x.bucket)}</span><p>${escapeHtml(x.text)}</p></div><button class="icon-btn" onclick="deleteItem('brainItems','${x.id}')">×</button></div>`).join(""):`<div class="card empty-state">Your brain inbox is empty.</div>`;
}

function renderTasks(){
  const all=store.get("tasks"), open=all.filter(x=>!x.done);
  $("#taskPreview").innerHTML=open.slice(0,4).map(x=>`<div class="list-item"><label style="display:flex;grid-template-columns:auto 1fr;gap:8px;margin:0"><input type="checkbox" style="width:auto" onchange="toggleTask('${x.id}')">${escapeHtml(x.text)}</label><small>${x.dueDate||""}</small></div>`).join("")||`<div class="empty-state">No open tasks.</div>`;
  $("#taskBoard").innerHTML=all.length?all.map(x=>`<div class="task-card"><label style="display:flex;grid-template-columns:auto 1fr;gap:10px;margin:0"><input type="checkbox" style="width:auto" ${x.done?"checked":""} onchange="toggleTask('${x.id}')"><span style="${x.done?"text-decoration:line-through;color:#8a8490":""}">${escapeHtml(x.text)}<small style="display:block;color:#746d7e">${x.priority}${x.dueDate?" • "+x.dueDate:""}</small></span></label><button class="icon-btn" onclick="deleteItem('tasks','${x.id}')">×</button></div>`).join(""):`<div class="card empty-state">No tasks yet.</div>`;
}

function renderEvents(){
  const all = store
    .get("events")
    .sort((a,b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  const today = new Date().toISOString().slice(0,10);
  const upcoming = all.find(event => event.date >= today);

  // This supports the old dashboard strip if it still exists.
  const nextEventText = document.getElementById("nextEventText");

  if(nextEventText){
    nextEventText.textContent = upcoming
      ? `${upcoming.title} • ${upcoming.date}${upcoming.time ? " at " + upcoming.time : ""}`
      : "No upcoming events";
  }
}

function renderAlerts(){
  const manual=store.get("alerts");
  const callahanUnfiled=store.get("callahanPurchases").filter(x=>!x.filed).length;
  const businessUnfiled=store.get("businessPurchases").filter(x=>!x.filed).length;
  const businessReview=store.get("businessPurchases").filter(x=>!x.reviewed||x.category==="Needs Review").length;
  const generated=[];
  if(callahanUnfiled) generated.push({text:`${callahanUnfiled} Callahan receipt${callahanUnfiled===1?"":"s"} still need the receipt box.`,type:"Receipt"});
  if(businessUnfiled) generated.push({text:`${businessUnfiled} business receipt${businessUnfiled===1?"":"s"} still need filing.`,type:"Bookkeeping"});
  if(businessReview) generated.push({text:`${businessReview} business purchase${businessReview===1?"":"s"} need review.`,type:"Bookkeeping"});
  const all=[...manual,...generated];
  $("#alertCount").textContent=all.length;
  $("#alertsList").innerHTML=all.length?all.slice(0,6).map((x,i)=>`<div class="list-item"><div><b>${escapeHtml(x.type)}</b><small style="display:block">${escapeHtml(x.text)}</small></div>${i<manual.length?`<button class="icon-btn" onclick="deleteItem('alerts','${x.id}')">×</button>`:""}</div>`).join(""):`Nothing urgent. Nice!`;
}

function renderTax(){
  const t=store.getObj("taxSetup",null);
  if(!t){ $("#taxStatusCard").innerHTML=`<span class="status red"></span><div><b>Not configured</b><small>Add your due date and checklist.</small></div>`; return; }
  const cls=t.status==="Filed"?"green":t.status==="In Progress"?"yellow":"red";
  $("#taxStatusCard").innerHTML=`<span class="status ${cls}"></span><div><b>${escapeHtml(t.label)} — ${escapeHtml(t.status)}</b><small>Due day ${t.dueDay} each month.</small></div>`;
}

function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }

function exportCsv(key, filename, headers, rowsFn){
  const data=store.get(key); const rows=[headers,...data.map(rowsFn)];
  const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"}); const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href);
}
$("#exportCallahanCsv").addEventListener("click",()=>exportCsv("callahanPurchases","callahan-purchases.csv",
  ["Date","Item","Type","Store","Amount","Paid By","Photo Taken","Receipt Filed","Notes"],
  x=>[x.date,x.item,x.type,x.store,x.amount,x.paidBy,x.photoTaken,x.filed,x.notes]));
$("#exportBusinessCsv").addEventListener("click",()=>exportCsv("businessPurchases","business-purchases.csv",
  ["Date","Merchant","Description","Business","Category","Amount","Photo Taken","Receipt Filed","Reviewed"],
  x=>[x.date,x.merchant,x.description,x.business,x.category,x.amount,x.photoTaken,x.filed,x.reviewed]));

$("#morningBriefBtn").addEventListener("click",()=>{
  const tasks=store.get("tasks").filter(x=>!x.done).length, alerts=Number($("#alertCount").textContent),
  events=store.get("events").filter(x=>x.date===new Date().toISOString().slice(0,10)).length,
  brain=store.get("brainItems").length;
  $("#morningBriefContent").innerHTML=[
    `You have <b>${events}</b> event${events===1?"":"s"} today.`,
    `<b>${tasks}</b> task${tasks===1?"":"s"} remain open.`,
    `<b>${alerts}</b> alert${alerts===1?"":"s"} need attention.`,
    `Your Brain Inbox contains <b>${brain}</b> item${brain===1?"":"s"}.`
  ].map(x=>`<div class="brief-line">${x}</div>`).join("");
  openModal("morningBriefModal");
});

$("#clearAllData").addEventListener("click",()=>{
  if(confirm("Clear all prototype data from this browser?")){ localStorage.clear(); renderAll(); }
});
function renderTodaysMission(){
  const today = localDateKey();

  const events = store
    .get("events")
    .filter(event => event.date === today)
    .sort((a,b) => (a.time || "").localeCompare(b.time || ""));

  const tasks = store
    .get("tasks")
    .filter(task => !task.done && task.dueDate === today);

  const alerts = store.get("alerts");

  const followups = alerts.filter(
    alert =>
      alert.type === "General" ||
      alert.type === "Vendor Payment"
  );

  const appointmentCount = document.getElementById("todayAppointmentCount");
  const appointmentSummary = document.getElementById("todayNextAppointment");

  if(appointmentCount){
    appointmentCount.textContent = events.length;
  }

  if(appointmentSummary){
    appointmentSummary.textContent = events.length
      ? `${events[0].time || "Today"} — ${events[0].title}`
      : "Nothing scheduled";
  }

  renderVendorSheetSummaries();

  const followupCount = document.getElementById("todayFollowupCount");
  const followupSummary = document.getElementById("todayFollowupSummary");

  if(followupCount){
    followupCount.textContent = followups.length;
  }

  if(followupSummary){
    followupSummary.textContent = followups.length
      ? followups[0].text
      : "Nothing waiting";
  }

  const taskCount = document.getElementById("todayTaskCount");
  const taskSummary = document.getElementById("todayTaskSummary");

  if(taskCount){
    taskCount.textContent = tasks.length;
  }

  if(taskSummary){
    taskSummary.textContent = tasks.length
      ? tasks[0].text
      : "Nothing due";
  }
}
function renderAll(){
  setTodayDefaults();
  renderCallahan();
  renderBusiness();
  renderBrain();
  renderTasks();
  renderEvents();
  renderAlerts();
  renderTax();
  renderTodaysMission();
}renderAll();
// ======================================
// Connect Google Calendar
// ======================================

window.addEventListener("load", () => {
  const connectButton = document.getElementById(
    "connectGoogleCalendarBtn"
  );

  if (!connectButton) {
    console.error("Google Calendar button was not found.");
    return;
  }

  if (
    typeof google === "undefined" ||
    !google.accounts ||
    !google.accounts.oauth2
  ) {
    console.error("Google Identity Services did not load.");
    return;
  }

  googleTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,

    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/spreadsheets.readonly"
    ].join(" "),

    callback: response => {
      if (response.error) {
        console.error("Google connection error:", response);
        setVendorSyncStatus("error", "🔴 Sync failed");
        alert("Google Calendar could not connect.");
        return;
      }

      googleAccessToken = response.access_token;

      connectButton.textContent = "✓ Google Connected";
      connectButton.disabled = true;

      alert("Google Calendar and Vendor Applications connected successfully!");

      loadGoogleCalendar();
      loadVendorApplications();
    }
  });

  connectButton.addEventListener("click", () => {
    googleTokenClient.requestAccessToken({
      prompt: "consent"
    });
  });
});

async function loadGoogleCalendar() {
  console.log("Google Calendar is ready to load.");
}

async function loadVendorApplications() {
  const summaries = document.getElementById("vendorSheetSummaries");
  setVendorSyncStatus("syncing", "🟡 Syncing…");

  if (summaries) {
    summaries.innerHTML = "<p>Checking applications…</p>";
  }

  try {
    const seenCounts = store.getObj("vendorSheetSeenCounts", {});
    vendorSheetData = await Promise.all(
      VENDOR_SHEETS.map(sheet => loadVendorSheet(sheet, seenCounts))
    );
    store.setObj(
      "vendorSheetSeenCounts",
      Object.fromEntries(vendorSheetData.map(sheet => [sheet.id, sheet.total]))
    );
    renderTodaysMission();
    setVendorSyncStatus("success", "🟢 Synced");
  } catch (error) {
    console.error("Vendor applications could not be loaded:", error);
    vendorSheetData = null;
    setVendorSyncStatus("error", "🔴 Sync failed");

    if (summaries) {
      summaries.innerHTML = "<p>Applications could not be loaded.</p>";
    }
  }
}

function setVendorSyncStatus(status, label) {
  const syncStatus = document.getElementById("vendorSyncStatus");
  if (!syncStatus) return;

  syncStatus.dataset.status = status;
  syncStatus.textContent = label;
}

async function loadVendorSheet(sheet, seenCounts) {
  const range = encodeURIComponent(`'${sheet.tab}'!A:ZZ`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}/values/${range}`,
    { headers: { Authorization: `Bearer ${googleAccessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`${sheet.label} returned ${response.status}`);
  }

  const { values = [] } = await response.json();
  const [headers = [], ...allRows] = values;
  const rows = allRows.filter(row => row.some(cell => String(cell).trim()));
  const total = rows.length;

  if (!sheet.tracksStatus) {
    const hasPreviousCount = Object.prototype.hasOwnProperty.call(seenCounts, sheet.id);
    return {
      ...sheet,
      total,
      paid: null,
      attention: hasPreviousCount
        ? Math.max(total - Number(seenCounts[sheet.id] || 0), 0)
        : 0
    };
  }

  const statusIndex = headers.findIndex(
    value => String(value).replace(/\*/g, "").trim().toLowerCase() === "status"
  );

  if (statusIndex === -1) {
    throw new Error(`The Status column was not found in ${sheet.label}`);
  }

  const statuses = rows.map(row => String(row[statusIndex] || "").trim());
  return {
    ...sheet,
    total,
    paid: statuses.filter(status => /\bpaid\b/i.test(status)).length,
    attention: statuses.filter(status => !status).length
  };
}

function renderVendorSheetSummaries() {
  const summaries = document.getElementById("vendorSheetSummaries");
  if (!summaries || !vendorSheetData) return;

  summaries.innerHTML = vendorSheetData.map(sheet => {
    const paid = sheet.paid === null ? "" : ` · ${sheet.paid} paid`;
    return `<div class="vendor-sheet-row">
      <strong>${escapeHtml(sheet.label)}</strong>
      <span>${sheet.total} total${paid} · ${sheet.attention} need attention</span>
    </div>`;
  }).join("");
}
