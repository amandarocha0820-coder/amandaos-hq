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
const CALLAHAN_SHEET_ID = "1oYfYyxDXkxhayq184OUoVD-wTcK6vUcGrvuaNwe9UZ0";
const CALLAHAN_SHEET_HEADERS = [
  "Date", "Item", "Type", "Store", "Amount", "Paid By", "Notes",
  "Receipt Photo Taken", "Filed in Receipt Box", "Date Added"
];

let googleTokenClient = null;
let googleAccessToken = null;
let vendorSheetData = null;
let callahanSheetSyncPromise = null;

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

function renderDailyAffirmation(){
  const affirmations=[
    "I only need to take the next right step.",
    "Progress counts, even when it happens slowly.",
    "I can build the life I want one completed task at a time.",
    "Today does not require perfection—only honest effort.",
    "I am allowed to begin again without judging yesterday.",
    "Small actions are still movement toward something bigger.",
    "I can be proud of what I finish and gentle about what remains.",
    "My pace is valid, and my progress belongs to me.",
    "I have handled difficult days before, and I can handle today.",
    "Done is valuable, even when it is not perfect.",
    "Rest and progress can exist in the same life.",
    "I am creating systems that support me instead of shame me.",
    "One green piece at a time is enough.",
    "I deserve to celebrate the work I put into myself."
  ];
  const now=new Date();
  const dayNumber=Math.floor(new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime()/86400000);
  const target=$("#dailyAffirmation");
  if(target) target.textContent=affirmations[dayNumber%affirmations.length];
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
  if(btn.dataset.view==="weighin") requestAnimationFrame(()=>drawWeightTrend([...store.get("weighIns")].sort((a,b)=>a.date.localeCompare(b.date))));
}));

$$(".money-tab").forEach(btn=>btn.addEventListener("click",()=>{
  $$(".money-tab").forEach(x=>x.classList.remove("active"));
  $$(".money-panel").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(btn.dataset.moneyPanel).classList.add("active");
}));

function handleForm(formId, key, mapper, afterSave){
  const form = document.getElementById(formId);
  form.addEventListener("submit", e=>{
    e.preventDefault();
    const fd = new FormData(form);
    const item = mapper(fd);
    const data = store.get(key); data.unshift(item); store.set(key,data);
    form.reset(); form.closest("dialog").close(); setTodayDefaults(); renderAll();
    if(afterSave) afterSave(item);
  });
}

handleForm("callahanForm","callahanPurchases",fd=>({
  id:uid(), item:fd.get("item"), amount:Number(fd.get("amount")), store:fd.get("store"),
  type:fd.get("type"), date:fd.get("date"), paidBy:fd.get("paidBy"), notes:fd.get("notes"),
  photoTaken:fd.get("photoTaken")==="on", filed:fd.get("filed")==="on"
}), queueCallahanPurchase);

handleForm("paycheckForm","paychecks",fd=>({
  id:uid(), date:fd.get("date"), source:fd.get("source"), gross:Number(fd.get("gross")),
  deductions:Number(fd.get("deductions")), truck:Number(fd.get("truck")), net:Number(fd.get("net")), notes:fd.get("notes")
}));

handleForm("transferForm","moneyTransfers",fd=>({
  id:uid(), date:fd.get("date"), amount:Number(fd.get("amount")), paycheckId:fd.get("paycheckId"),
  purpose:fd.get("purpose"), notes:fd.get("notes")
}));

handleForm("billForm","bills",fd=>({
  id:uid(), name:fd.get("name"), amount:Number(fd.get("amount")), dueDate:fd.get("dueDate"),
  frequency:fd.get("frequency"), category:fd.get("category"),
  autoPay:fd.get("autoPay")==="on", paid:fd.get("paid")==="on"
}));

handleForm("spendingForm","spending",fd=>({
  id:uid(), description:fd.get("description"), amount:Number(fd.get("amount")), date:fd.get("date"),
  category:fd.get("category"), flexibility:fd.get("flexibility"), notes:fd.get("notes")
}));

handleForm("weighInForm","weighIns",fd=>({
  id:uid(), date:fd.get("date"), weight:Number(fd.get("weight")),
  dressSize:fd.get("dressSize")?Number(fd.get("dressSize")):null,
  bust:fd.get("bust")?Number(fd.get("bust")):null,
  waist:fd.get("waist")?Number(fd.get("waist")):null,
  hips:fd.get("hips")?Number(fd.get("hips")):null,
  notes:fd.get("notes")
}));

handleForm("routineForm","routineTasks",fd=>({
  id:uid(), text:fd.get("text"), schedule:fd.get("schedule"), created:new Date().toISOString()
}));

handleForm("brainForm","brainItems",fd=>({id:uid(), text:fd.get("text"), bucket:fd.get("bucket"), created:new Date().toISOString()}));
handleForm("taskForm","tasks",fd=>({id:uid(), text:fd.get("text"), dueDate:fd.get("dueDate"), priority:fd.get("priority"), done:false}));
handleForm("eventForm","events",fd=>({id:uid(), title:fd.get("title"), date:fd.get("date"), time:fd.get("time"), location:fd.get("location")}));
handleForm("alertForm","alerts",fd=>({id:uid(), text:fd.get("text"), type:fd.get("type"), created:new Date().toISOString()}));

$("#weeklyRewardForm").addEventListener("submit",e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const mondayKey=dateKeyFromDate(startOfWeek());
  const rewards=store.getObj("weeklyRewards",{});
  rewards[mondayKey]=String(fd.get("reward")||"").trim();
  store.setObj("weeklyRewards",rewards);
  e.currentTarget.closest("dialog").close();
  renderMomentum();
});

function deleteItem(key,id){ store.set(key,store.get(key).filter(x=>x.id!==id)); renderAll(); }
function toggleTask(id){ const t=store.get("tasks"); const x=t.find(x=>x.id===id); if(x)x.done=!x.done; store.set("tasks",t); renderAll(); }
function markFiled(key,id){ const a=store.get(key); const x=a.find(x=>x.id===id); if(x)x.filed=true; store.set(key,a); renderAll(); }

function toggleBill(id){ const bills=store.get("bills"); const bill=bills.find(x=>x.id===id); if(bill) bill.paid=!bill.paid; store.set("bills",bills); renderAll(); }
function currentMomentumStats(){
  const routines=store.get("routineTasks"), completed=store.getObj("routineCompletions",{});
  const today=new Date(), todayKey=dateKeyFromDate(today);
  const weekdays=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const todayName=weekdays[today.getDay()];
  const dailyItems=(todayKey<MOMENTUM_START_DATE?[]:routines.filter(task=>task.schedule==="Daily"||task.schedule===todayName))
    .map(task=>({key:`${todayKey}:${task.id}`,done:!!completed[`${todayKey}:${task.id}`]}));
  const monday=startOfWeek(today), weekKey=dateKeyFromDate(monday), weeklyItems=[];
  routines.forEach(task=>{
    if(task.schedule==="Daily"){
      for(let index=0;index<7;index++){const date=new Date(monday);date.setDate(monday.getDate()+index);const dateKey=dateKeyFromDate(date);if(dateKey<MOMENTUM_START_DATE)continue;const key=`${dateKey}:${task.id}`;weeklyItems.push({key,done:!!completed[key]});}
    }else if(task.schedule==="Weekly"){
      if(dateKeyFromDate(new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+6))<MOMENTUM_START_DATE)return;
      const key=`${weekKey}:weekly:${task.id}`;weeklyItems.push({key,done:!!completed[key]});
    }else{
      const dayIndex=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(task.schedule);
      if(dayIndex>=0){const date=new Date(monday);date.setDate(monday.getDate()+dayIndex);const dateKey=dateKeyFromDate(date);if(dateKey<MOMENTUM_START_DATE)return;const key=`${dateKey}:${task.id}`;weeklyItems.push({key,done:!!completed[key]});}
    }
  });
  const percent=items=>items.length?Math.round(items.filter(x=>x.done).length/items.length*100):0;
  return {todayKey,weekKey,dailyTotal:dailyItems.length,dailyPercent:percent(dailyItems),weeklyTotal:weeklyItems.length,weeklyPercent:percent(weeklyItems)};
}
function showCelebration(type,message){
  const layer=$("#celebrationLayer"), toast=$("#celebrationToast");
  if(!layer||!toast) return;
  layer.querySelectorAll(".celebration-particle").forEach(x=>x.remove());
  toast.textContent=message; toast.classList.add("show");
  const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(!reduced){
    const count=type==="confetti"?42:20;
    for(let index=0;index<count;index++){
      const particle=document.createElement("span");
      particle.className=`celebration-particle ${type}`;
      particle.style.setProperty("--left",Math.round(Math.random()*100)+"%");
      particle.style.setProperty("--delay",(Math.random()*.9).toFixed(2)+"s");
      particle.style.setProperty("--duration",(type==="confetti"?3.8+Math.random()*2:3+Math.random()*2).toFixed(2)+"s");
      particle.style.setProperty("--drift",Math.round(-45+Math.random()*90)+"px");
      if(type==="confetti") particle.style.setProperty("--color",["#7c59d8","#111111","#35a968","#d84f5f","#f3bd4d"][index%5]);
      layer.appendChild(particle);
    }
  }
  setTimeout(()=>toast.classList.remove("show"),4200);
  setTimeout(()=>layer.querySelectorAll(".celebration-particle").forEach(x=>x.remove()),6500);
}
function checkMomentumCelebrations(){
  const stats=currentMomentumStats(), shown=store.getObj("momentumCelebrations",{});
  const dailyKey=`day:${stats.todayKey}`, weeklyKey=`week:${stats.weekKey}`;
  const wonDay=stats.dailyTotal>0&&stats.dailyPercent>=80&&!shown[dailyKey];
  const wonWeek=stats.weeklyTotal>0&&stats.weeklyPercent>80&&!shown[weeklyKey];
  if(wonDay){
    shown[dailyKey]=true;
    showCelebration("bubble",`🐼 You won today at ${stats.dailyPercent}%!`);
  }
  if(wonWeek){
    shown[weeklyKey]=true;
    setTimeout(()=>showCelebration("confetti",`🎉 Week won at ${stats.weeklyPercent}% — reward earned!`),wonDay?900:0);
  }
  store.setObj("momentumCelebrations",shown);
}

function toggleRoutineOccurrence(key){
  const completed=store.getObj("routineCompletions",{});
  completed[key]=!completed[key];
  store.setObj("routineCompletions",completed);
  renderMomentum();
  checkMomentumCelebrations();
}
function deleteRoutine(id){
  store.set("routineTasks",store.get("routineTasks").filter(x=>x.id!==id));
  renderAll();
}
function updateRoutine(id){
  const routines=store.get("routineTasks");
  const routine=routines.find(item=>item.id===id);
  const textInput=document.querySelector(`[data-routine-text="${id}"]`);
  const scheduleSelect=document.querySelector(`[data-routine-schedule="${id}"]`);
  if(!routine||!textInput||!scheduleSelect) return;
  const text=textInput.value.trim();
  if(!text){ textInput.focus(); return; }
  routine.text=text;
  routine.schedule=scheduleSelect.value;
  store.set("routineTasks",routines);
  renderAll();
}
function closeManageAndAddRoutine(){
  $("#manageRoutinesModal").close();
  openModal("routineModal");
}
window.deleteItem=deleteItem; window.toggleTask=toggleTask; window.markFiled=markFiled; window.toggleBill=toggleBill; window.toggleRoutineOccurrence=toggleRoutineOccurrence; window.deleteRoutine=deleteRoutine; window.updateRoutine=updateRoutine; window.closeManageAndAddRoutine=closeManageAndAddRoutine;

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

function renderMoney(){
  const paychecks=store.get("paychecks"), transfers=store.get("moneyTransfers"), bills=store.get("bills"), spending=store.get("spending");
  const month=currentMonth();
  const monthPaychecks=paychecks.filter(x=>monthKey(x.date)===month);
  const monthTransfers=transfers.filter(x=>monthKey(x.date)===month);
  const monthBills=bills.filter(x=>monthKey(x.dueDate)===month);
  const monthSpending=spending.filter(x=>monthKey(x.date)===month);
  const income=monthPaychecks.reduce((sum,x)=>sum+x.net,0);
  const transferred=monthTransfers.reduce((sum,x)=>sum+x.amount,0);
  const directBills=monthBills.filter(x=>x.paid).reduce((sum,x)=>sum+x.amount,0);
  const directSpending=monthSpending.reduce((sum,x)=>sum+x.amount,0);
  const billsDue=monthBills.filter(x=>!x.paid).reduce((sum,x)=>sum+x.amount,0);
  const available=income-transferred-directBills-directSpending;
  const categoryTotals={};
  monthTransfers.forEach(x=>categoryTotals[x.purpose]=(categoryTotals[x.purpose]||0)+x.amount);
  monthSpending.forEach(x=>categoryTotals[x.category]=(categoryTotals[x.category]||0)+x.amount);
  monthBills.filter(x=>x.paid).forEach(x=>categoryTotals[x.category]=(categoryTotals[x.category]||0)+x.amount);
  const pressure=Object.entries(categoryTotals).sort((a,b)=>b[1]-a[1])[0];
  const flexible=monthSpending.filter(x=>x.flexibility==="Flexible").reduce((sum,x)=>sum+x.amount,0);

  $("#moneyIncomeTotal").textContent=money(income);
  $("#moneyTransfersTotal").textContent=money(transferred);
  $("#moneyAvailable").textContent=money(available);
  $("#moneyAvailable").classList.toggle("negative-money",available<0);
  $("#moneyPressure").textContent=pressure?`${pressure[0]} · ${money(pressure[1])}`:"Add money activity";
  $("#dashboardSentToPaul").textContent=money(transferred);
  $("#dashboardMoneyLeft").textContent=money(available);
  $("#dashboardMoneyLeft").classList.toggle("negative-money",available<0);

  $("#moneyPreview").innerHTML=monthTransfers.slice(0,2).map(x=>`<div class="list-item"><span>${escapeHtml(x.purpose)}<small style="display:block">${x.date}</small></span><b>${money(x.amount)}</b></div>`).join("")
    || `<div class="empty-state">Record money sent to Paul here.</div>`;

  const transferSelect=$("#transferPaycheckSelect");
  if(transferSelect){
    const current=transferSelect.value;
    transferSelect.innerHTML=`<option value="">Not linked to a paycheck</option>`+paychecks.map(x=>`<option value="${x.id}">${x.date} · ${escapeHtml(x.source)} · ${money(x.net)}</option>`).join("");
    transferSelect.value=current;
  }
  const paycheckLabel=id=>{ const p=paychecks.find(x=>x.id===id); return p?`${p.date} · ${p.source}`:"Not linked"; };

  $("#paycheckTableBody").innerHTML=paychecks.length?paychecks.map(x=>`<tr><td>${x.date}</td><td>${escapeHtml(x.source)}</td><td>${money(x.gross)}</td><td>${money(x.deductions+x.truck)}</td><td><b>${money(x.net)}</b></td><td><button class="icon-btn" onclick="deleteItem('paychecks','${x.id}')">×</button></td></tr>`).join(""):`<tr><td colspan="6" class="empty-state">Add your first paycheck to begin planning.</td></tr>`;
  $("#transferTableBody").innerHTML=transfers.length?transfers.map(x=>`<tr><td>${x.date}</td><td>${escapeHtml(paycheckLabel(x.paycheckId))}</td><td>${escapeHtml(x.purpose)}</td><td>${escapeHtml(x.notes||"")}</td><td><b>${money(x.amount)}</b></td><td><button class="icon-btn" onclick="deleteItem('moneyTransfers','${x.id}')">×</button></td></tr>`).join(""):`<tr><td colspan="6" class="empty-state">No transfers to Paul recorded yet.</td></tr>`;
  $("#billTableBody").innerHTML=bills.length?bills.map(x=>`<tr><td>${x.dueDate}</td><td>${escapeHtml(x.name)}<small style="display:block">${escapeHtml(x.category)}</small></td><td>${money(x.amount)}</td><td>${escapeHtml(x.frequency)}</td><td>${x.autoPay?"Yes":"No"}</td><td><button class="small-btn" onclick="toggleBill('${x.id}')">${x.paid?"✅ Paid":"Mark paid"}</button></td><td><button class="icon-btn" onclick="deleteItem('bills','${x.id}')">×</button></td></tr>`).join(""):`<tr><td colspan="7" class="empty-state">Optional: add major shared bills if you want to see them.</td></tr>`;
  $("#spendingTableBody").innerHTML=spending.length?spending.map(x=>`<tr><td>${x.date}</td><td>${escapeHtml(x.description)}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.flexibility)}</td><td>${money(x.amount)}</td><td><button class="icon-btn" onclick="deleteItem('spending','${x.id}')">×</button></td></tr>`).join(""):`<tr><td colspan="6" class="empty-state">Record only money Amanda paid directly.</td></tr>`;

  $("#pressureHeading").textContent=pressure?`Biggest pressure: ${pressure[0]}`:"Add your money details";
  $("#pressureCopy").textContent=pressure?`${money(pressure[1])} went toward ${pressure[0]} this month. Flexible direct spending totals ${money(flexible)}.`:"Add paychecks and transfers to see where your income is going.";
  $("#budgetFlow").innerHTML=[
    ["Take-home income",income],["Sent to Paul",transferred],["Bills Amanda paid",directBills],
    ["Other direct spending",directSpending],["Remaining with Amanda",available],["Optional bills still due",billsDue]
  ].map(([label,value])=>`<div><span>${label}</span><b class="${value<0?"negative-money":""}">${money(value)}</b></div>`).join("");
  $("#categoryBreakdown").innerHTML=Object.entries(categoryTotals).sort((a,b)=>b[1]-a[1]).map(([label,value])=>`<div><span>${escapeHtml(label)}</span><b>${money(value)}</b></div>`).join("")||`<p class="muted">No money activity entered yet.</p>`;
}

function renderWeighIns(){
  const entries=store.get("weighIns").sort((a,b)=>b.date.localeCompare(a.date));
  const latest=entries[0], first=entries[entries.length-1];
  const weightText=latest?`${latest.weight.toFixed(1)} lb`:"—";
  const sizeText=latest&&latest.dressSize?`Size ${latest.dressSize}`:"—";
  $("#dashboardLatestWeight").textContent=weightText;
  $("#dashboardLatestSize").textContent=sizeText;
  $("#latestWeight").textContent=weightText;
  $("#goalLastWeight").textContent=weightText;
  $("#latestDressSize").textContent=sizeText;
  if(latest&&first&&entries.length>1){
    const change=latest.weight-first.weight;
    $("#weightChange").textContent=`${change>0?"+":""}${change.toFixed(1)} lb`;
    $("#weightChange").classList.toggle("positive-progress",change<0);
  }else{
    $("#weightChange").textContent=entries.length?"Starting point":"—";
    $("#weightChange").classList.remove("positive-progress");
  }
  const measurement=value=>value?`${Number(value).toFixed(1)} in`:"—";
  $("#weighInTableBody").innerHTML=entries.length?entries.map(x=>`<tr>
    <td>${x.date}</td><td><b>${x.weight.toFixed(1)} lb</b></td><td>${x.dressSize?`Size ${x.dressSize}`:"—"}</td>
    <td>${measurement(x.bust)}</td><td>${measurement(x.waist)}</td><td>${measurement(x.hips)}</td>
    <td>${escapeHtml(x.notes||"")}</td><td><button class="icon-btn" onclick="deleteItem('weighIns','${x.id}')">×</button></td>
  </tr>`).join(""):`<tr><td colspan="8" class="empty-state">Add your first weigh-in when you are ready.</td></tr>`;

  drawWeightTrend([...entries].reverse());
}

function drawWeightTrend(entries){
  const canvas=$("#weightTrendCanvas"), empty=$("#weightTrendEmpty"), summary=$("#weightTrendSummary");
  if(!canvas||!empty||!summary) return;
  if(entries.length<2){
    canvas.style.display="none"; empty.style.display="grid";
    summary.textContent="Add at least two weigh-ins to see a trend.";
    return;
  }
  const shell=canvas.parentElement;
  const width=Math.max(shell.clientWidth,0);
  if(width<100) return;
  const height=280, ratio=window.devicePixelRatio||1;
  canvas.style.display="block"; empty.style.display="none";
  canvas.width=width*ratio; canvas.height=height*ratio;
  canvas.style.width=width+"px"; canvas.style.height=height+"px";
  const ctx=canvas.getContext("2d"); ctx.scale(ratio,ratio);
  const pad={left:52,right:22,top:25,bottom:42};
  const weights=entries.map(x=>Number(x.weight));
  let min=Math.min(...weights), max=Math.max(...weights);
  if(min===max){min-=2;max+=2}else{const room=Math.max((max-min)*.15,1);min-=room;max+=room;}
  const x=index=>pad.left+(index/(entries.length-1))*(width-pad.left-pad.right);
  const y=value=>pad.top+((max-value)/(max-min))*(height-pad.top-pad.bottom);
  ctx.font="12px system-ui"; ctx.fillStyle="#746b85"; ctx.strokeStyle="#e1d8ec"; ctx.lineWidth=1;
  for(let i=0;i<4;i++){
    const value=max-(i/3)*(max-min), py=y(value);
    ctx.beginPath();ctx.moveTo(pad.left,py);ctx.lineTo(width-pad.right,py);ctx.stroke();
    ctx.fillText(value.toFixed(1),5,py+4);
  }
  ctx.strokeStyle="#7c59d8";ctx.lineWidth=3;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
  entries.forEach((entry,index)=>{const px=x(index),py=y(entry.weight);index?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();
  entries.forEach((entry,index)=>{const px=x(index),py=y(entry.weight);ctx.fillStyle="#7c59d8";ctx.beginPath();ctx.arc(px,py,4.5,0,Math.PI*2);ctx.fill();});
  const labelIndexes=[0,Math.floor((entries.length-1)/2),entries.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  ctx.fillStyle="#746b85";ctx.textAlign="center";
  labelIndexes.forEach(index=>ctx.fillText(new Date(entries[index].date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}),x(index),height-14));
  const change=entries[entries.length-1].weight-entries[0].weight;
  summary.textContent=`${entries.length} weigh-ins · ${change>0?"+":""}${change.toFixed(1)} lb from first to latest`;
}

function startOfWeek(date=new Date()){
  const d=new Date(date.getFullYear(),date.getMonth(),date.getDate());
  const day=d.getDay();
  const offset=day===0?-6:1-day;
  d.setDate(d.getDate()+offset);
  return d;
}
function dateKeyFromDate(d){ return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"); }
const MOMENTUM_START_DATE="2026-08-10";

function renderMomentum(){
  const routines=store.get("routineTasks");
  const completed=store.getObj("routineCompletions",{});
  const monday=startOfWeek();
  const weekdays=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const dates=weekdays.map((label,index)=>{
    const date=new Date(monday); date.setDate(monday.getDate()+index);
    return {label,date,key:dateKeyFromDate(date)};
  });
  const groups=dates.map(day=>({label:day.label,date:day.date,items:[]}));
  groups.push({label:"Weekly",date:null,items:[]});
  const occurrences=[];

  routines.forEach(task=>{
    if(task.schedule==="Daily"){
      dates.forEach((day,index)=>{
        if(day.key<MOMENTUM_START_DATE) return;
        const key=`${day.key}:${task.id}`;
        const item={task,key,done:!!completed[key],day:day.label};
        groups[index].items.push(item); occurrences.push(item);
      });
    }else if(task.schedule==="Weekly"){
      if(dates[6].key<MOMENTUM_START_DATE) return;
      const weekKey=dateKeyFromDate(monday);
      const key=`${weekKey}:weekly:${task.id}`;
      const item={task,key,done:!!completed[key],day:"Weekly"};
      groups[7].items.push(item); occurrences.push(item);
    }else{
      const index=weekdays.indexOf(task.schedule);
      if(index>=0){
        const day=dates[index], key=`${day.key}:${task.id}`;
        if(day.key<MOMENTUM_START_DATE) return;
        const item={task,key,done:!!completed[key],day:day.label};
        groups[index].items.push(item); occurrences.push(item);
      }
    }
  });

  const total=occurrences.length;
  const done=occurrences.filter(x=>x.done).length;
  const percent=total?Math.round(done/total*100):0;
  const mondayKey=dateKeyFromDate(monday);
  const rewards=store.getObj("weeklyRewards",{});
  const reward=rewards[mondayKey]||"";
  const winningCount=total?Math.ceil(total*.8):0;
  const neededToWin=Math.max(winningCount-done,0);
  const weekWon=total>0&&percent>=80;
  $("#weeklyRewardButton").textContent=reward?"Change Weekly Reward":"Set Weekly Reward";
  $("#weeklyRewardInput").value=reward;
  $("#weeklyRewardProgress").textContent=!reward
    ? "Winning number: 80% green. Set something worth working toward this week."
    : !total
      ? `This week's reward: ${reward}. Add routines to start the wheel.`
      : weekWon
        ? `Week won at ${percent}% — you earned it: ${reward}`
        : `Working toward: ${reward} · Turn ${neededToWin} more piece${neededToWin===1?"":"s"} green to reach 80%.`;
  $("#weeklyRewardProgress").classList.toggle("reached",!!reward&&weekWon);
  const chart=$("#momentumChart");
  if(total){
    const step=360/total;
    chart.style.background=`conic-gradient(${occurrences.map((item,index)=>`${item.done?"#35a968":"#d84f5f"} ${(index*step).toFixed(2)}deg ${((index+1)*step).toFixed(2)}deg`).join(",")})`;
  }else{
    chart.style.background="#d84f5f";
  }
  $("#momentumPercent").textContent=percent+"%";
  $("#momentumComplete").textContent=done;
  $("#momentumTotal").textContent=total;
  chart.setAttribute("aria-label",`${done} of ${total} weekly tasks completed; ${percent} percent green`);

  const today=new Date();
  const todayKey=dateKeyFromDate(today);
  const todayIndex=dates.findIndex(day=>day.key===todayKey);
  const dailyItems=todayKey>=MOMENTUM_START_DATE
    ? routines.filter(task=>task.schedule==="Daily").map(task=>{
        const key=`${todayKey}:${task.id}`;
        return {task,key,done:!!completed[key],day:"Daily"};
      })
    : [];
  const visibleGroups=[];
  if(dailyItems.length) visibleGroups.push({label:"Daily",date:null,subtitle:"Stays here every day",items:dailyItems});
  if(todayIndex>=0&&groups[todayIndex].items.some(item=>item.task.schedule!=="Daily")){
    visibleGroups.push({
      label:`Today's ${dates[todayIndex].label} Goals`,
      date:dates[todayIndex].date,
      items:groups[todayIndex].items.filter(item=>item.task.schedule!=="Daily")
    });
  }
  if(groups[7].items.length) visibleGroups.push(groups[7]);

  $("#routineWeekList").innerHTML=visibleGroups.length?visibleGroups.map(group=>{
    const dateText=group.subtitle
      ? `<small>${group.subtitle}</small>`
      : group.date
        ? `<small>${group.date.toLocaleDateString("en-US",{month:"short",day:"numeric"})}</small>`
        : "<small>Complete by Sunday</small>";
    return `<section class="routine-day"><div class="routine-day-heading"><h4>${group.label}</h4>${dateText}</div>${group.items.map(item=>`<div class="routine-row ${item.done?"done":""}"><label><input type="checkbox" ${item.done?"checked":""} onchange="toggleRoutineOccurrence('${item.key}')"><span>${escapeHtml(item.task.text)}</span></label><button class="routine-delete" aria-label="Remove ${escapeHtml(item.task.text)}" onclick="deleteRoutine('${item.task.id}')">×</button></div>`).join("")}</section>`;
  }).join(""):`<div class="empty-state routine-empty"><b>${todayKey<MOMENTUM_START_DATE?"Your new week begins Monday.":"Your wheel is ready."}</b><span>${todayKey<MOMENTUM_START_DATE?"Daily and weekday goals will appear here starting August 10.":"Add daily, weekday, or weekly goals to get started."}</span></div>`;
  $("#dailyTaskTrend").innerHTML=groups.slice(0,7).map(group=>{
    const dayTotal=group.items.length, dayDone=group.items.filter(x=>x.done).length;
    const dayPercent=dayTotal?Math.round(dayDone/dayTotal*100):0;
    return `<div class="daily-trend-row"><span>${group.label.slice(0,3)}</span><div class="daily-trend-bar" aria-label="${group.label}: ${dayPercent}% complete"><i style="width:${dayPercent}%"></i><b style="width:${100-dayPercent}%"></b></div><strong>${dayPercent}%</strong></div>`;
  }).join("");

  const scheduleOrder=["Daily","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Weekly"];
  const scheduleOptions=selected=>scheduleOrder.map(schedule=>`<option ${schedule===selected?"selected":""}>${schedule}</option>`).join("");
  $("#manageRoutineList").innerHTML=routines.length
    ? [...routines].sort((a,b)=>scheduleOrder.indexOf(a.schedule)-scheduleOrder.indexOf(b.schedule)).map(task=>`<div class="manage-routine-row"><input data-routine-text="${task.id}" value="${escapeHtml(task.text)}" aria-label="Goal wording"><select data-routine-schedule="${task.id}" aria-label="Goal schedule">${scheduleOptions(task.schedule)}</select><button class="small-btn" type="button" onclick="updateRoutine('${task.id}')">Save</button><button class="routine-delete manage-delete" type="button" aria-label="Delete ${escapeHtml(task.text)}" onclick="deleteRoutine('${task.id}')">×</button></div>`).join("")
    : `<div class="empty-state routine-empty"><b>No goals added yet.</b><span>Use Add Another Goal to build your week.</span></div>`;
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
  const today=localDateKey();
  const overdueBills=store.get("bills").filter(x=>!x.paid&&x.dueDate<today);
  const generated=[];
  if(callahanUnfiled) generated.push({text:`${callahanUnfiled} Callahan receipt${callahanUnfiled===1?"":"s"} still need the receipt box.`,type:"Receipt"});
  if(overdueBills.length) generated.push({text:`${overdueBills.length} bill${overdueBills.length===1?" is":"s are"} overdue, totaling ${money(overdueBills.reduce((sum,x)=>sum+x.amount,0))}.`,type:"Bills"});
  const all=[...manual,...generated];
  $("#alertCount").textContent=all.length;
  $("#alertsList").innerHTML=all.length?all.slice(0,6).map((x,i)=>`<div class="list-item"><div><b>${escapeHtml(x.type)}</b><small style="display:block">${escapeHtml(x.text)}</small></div>${i<manual.length?`<button class="icon-btn" onclick="deleteItem('alerts','${x.id}')">×</button>`:""}</div>`).join(""):`Nothing urgent. Nice!`;
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
  renderDailyAffirmation();
  renderCallahan();
  renderMoney();
  renderWeighIns();
  renderMomentum();
  renderBrain();
  renderTasks();
  renderEvents();
  renderAlerts();
  renderTodaysMission();
}renderAll();
// ======================================
// Connect Google Calendar
// ======================================

window.addEventListener("load", () => {
  const connectButton = document.getElementById(
    "connectGoogleCalendarBtn"
  );
  const vendorSyncButton = document.getElementById("vendorSyncStatus");

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
      "https://www.googleapis.com/auth/spreadsheets"
    ].join(" "),

    callback: response => {
      if (response.error) {
        console.error("Google connection error:", response);
        setVendorSyncStatus("error", "🔴 Sync failed");
        alert("Google Calendar could not connect.");
        return;
      }

      googleAccessToken = response.access_token;

      connectButton.textContent = "✓ Synced";
      connectButton.disabled = true;

      alert("Google services connected successfully!");

      loadGoogleCalendar();
      loadVendorApplications();
      flushCallahanSheetQueue();
    }
  });

  connectButton.addEventListener("click", requestGoogleAccess);

  if (vendorSyncButton) {
    vendorSyncButton.addEventListener("click", requestGoogleAccess);
  }
});

function requestGoogleAccess() {
  if (!googleTokenClient) {
    setVendorSyncStatus("error", "🔴 Sync failed");
    return;
  }

  setVendorSyncStatus("syncing", "🟡 Syncing…");
  googleTokenClient.requestAccessToken({
    prompt: googleAccessToken ? "" : "consent"
  });
}

async function loadGoogleCalendar() {
  console.log("Google Calendar is ready to load.");
}

function queueCallahanPurchase(item) {
  const queue = store.get("callahanSheetQueue");
  queue.push({ ...item, createdAt: new Date().toISOString() });
  store.set("callahanSheetQueue", queue);

  if (!googleAccessToken) {
    alert("Saved in Panda HQ. Sync Google to send this purchase to Sheets.");
    return;
  }

  flushCallahanSheetQueue()
    .then(synced => {
      if (synced) alert("Saved in Panda HQ and Google Sheets.");
    });
}

async function flushCallahanSheetQueue() {
  if (!googleAccessToken) return;
  if (callahanSheetSyncPromise) return callahanSheetSyncPromise;

  callahanSheetSyncPromise = (async () => {
    await ensureCallahanSheetHeaders();
    const queue = store.get("callahanSheetQueue");

    while (queue.length) {
      await appendCallahanPurchase(queue[0]);
      queue.shift();
      store.set("callahanSheetQueue", queue);
    }
    return true;
  })()
    .catch(error => {
      console.error("Callahan purchases could not be synced:", error);
      alert("The purchase is saved in Panda HQ but could not be sent to Google Sheets yet.");
      return false;
    })
    .finally(() => {
      callahanSheetSyncPromise = null;
    });

  return callahanSheetSyncPromise;
}

async function ensureCallahanSheetHeaders() {
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${CALLAHAN_SHEET_ID}/values/A1:J1`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${googleAccessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Callahan sheet returned ${response.status}`);
  }

  const { values = [] } = await response.json();
  if (values.length) return;

  const updateResponse = await fetch(`${endpoint}?valueInputOption=RAW`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values: [CALLAHAN_SHEET_HEADERS] })
  });

  if (!updateResponse.ok) {
    throw new Error(`Callahan sheet headers returned ${updateResponse.status}`);
  }
}

async function appendCallahanPurchase(item) {
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${CALLAHAN_SHEET_ID}/values/A:J:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      values: [[
        item.date,
        item.item,
        item.type,
        item.store || "",
        item.amount,
        item.paidBy || "",
        item.notes || "",
        item.photoTaken ? "Yes" : "No",
        item.filed ? "Yes" : "No",
        item.createdAt
      ]]
    })
  });

  if (!response.ok) {
    throw new Error(`Callahan sheet append returned ${response.status}`);
  }
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
  syncStatus.disabled = status === "syncing";
  syncStatus.setAttribute("aria-busy", status === "syncing" ? "true" : "false");
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
