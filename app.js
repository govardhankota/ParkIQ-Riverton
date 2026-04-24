'use strict';
/* ═══════════════════════════════════════════════
   ParkIQ Riverton — app.js
   Clean build · real CSV data only · no sample data
   Tables: Transaction_Table, Payment_Table, Audit_Status_Table
═══════════════════════════════════════════════ */

/* ── RAW TABLES (set by processData after CSV load) ── */
let TX  = [];   // Transaction rows
let PAY = [];   // Payment rows
let AUD = [];   // Audit rows

/* ── COMPUTED (rebuilt each time by compute()) ── */
let D = {};

/* ── UI STATE ── */
let role = 'admin';
let page = 'dashboard';
let charts = {};
let vehicleMap = {};   // Vehicle_ID → TX row (active preferred)
let txMap      = {};   // Transaction_ID → TX row
let payMap     = {};   // Transaction_ID → PAY row

/* ── COLOURS ── */
const C = {
  orange:'#e8621a', blue:'#2563eb', green:'#16a34a',
  red:'#dc2626',    amber:'#d97706', teal:'#0d9488',
  purple:'#7c3aed', gray:'#6b7280',
  grid:'rgba(0,0,0,.04)', tick:'#9ca3af'
};
const V_COLORS = [C.red,C.amber,C.purple,C.blue,C.teal,C.green,C.orange,C.gray];

/* ── CHART BASE ── */
const CB = {
  responsive:true, maintainAspectRatio:false,
  plugins:{ legend:{display:false} },
  scales:{
    y:{ grid:{color:C.grid}, ticks:{font:{size:10},color:C.tick} },
    x:{ grid:{display:false}, ticks:{font:{size:10},color:C.tick} }
  }
};

/* ══════════════════════════════════════════════
   CSV PARSING
   Your CSVs have no quoted fields — clean simple
   split on comma is correct and fast.
   Handles both LF and CRLF line endings.
══════════════════════════════════════════════ */
function parseCSV(text) {
  /* Normalise line endings, drop trailing empty lines */
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                    .trimEnd().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const nCols   = headers.length;
  const rows    = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    /* Simple split — works perfectly when no fields contain commas */
    const vals = line.split(',');

    /* Safety: if a row has fewer columns pad with empty strings */
    const obj = {};
    for (let c = 0; c < nCols; c++) {
      obj[headers[c]] = (vals[c] !== undefined ? vals[c] : '').trim();
    }
    rows.push(obj);
  }
  return rows;
}

/* ══════════════════════════════════════════════
   AUTO LOAD CSVs FROM data/ FOLDER
   Folder structure:
     index.html
     app.js
     styles.css
     data/
       Transaction_Table_Correct1.csv
       Payment_Table_Correct1.csv
       Audit_Status_Table_Correct1.csv
   Works on GitHub Pages and any static host.
══════════════════════════════════════════════ */
async function autoLoad() {
  const files = [
    { key:'tx',  path:'data/Transaction_Table_Correct1.csv'  },
    { key:'pay', path:'data/Payment_Table_Correct1.csv'      },
    { key:'aud', path:'data/Audit_Status_Table_Correct1.csv' }
  ];

  showLoadingScreen('Loading data…', '');

  for (const f of files) {
    updateLoadingScreen(`Loading ${f.path}…`);
    try {
      const res = await fetch(f.path);
      if (!res.ok) throw new Error(`${f.path} — HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseCSV(text);
      if (!rows.length) throw new Error(`${f.path} is empty`);
      if (f.key === 'tx')  TX  = rows;
      if (f.key === 'pay') PAY = rows;
      if (f.key === 'aud') AUD = rows;
    } catch(err) {
      showError(err.message);
      return;
    }
  }

  buildMaps();
  compute();
  document.getElementById('loader').style.display = 'none';
  document.getElementById('app').style.display    = 'block';
  buildNav();
  go('dashboard');
}

function showLoadingScreen(title, sub) {
  document.getElementById('loader').innerHTML = `
    <div class="ld-bg"></div>
    <div class="ld-card" style="text-align:center;padding:2.5rem;">
      <div class="ld-brand" style="justify-content:center;margin-bottom:1.5rem;">
        <div class="ld-logo"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>
        <div><div class="ld-name">ParkIQ Riverton</div><div class="ld-tagline">Parking Data Ecosystem Platform</div></div>
      </div>
      <div style="font-size:32px;margin-bottom:1rem;animation:spin 1s linear infinite;">⟳</div>
      <div id="ld-status" style="font-size:13px;color:var(--t2);font-weight:500;">${title}</div>
      <div style="background:var(--s2);border-radius:4px;height:5px;overflow:hidden;margin-top:1rem;">
        <div id="ld-bar" style="height:5px;background:var(--orange);border-radius:4px;width:0%;transition:width .4s;"></div>
      </div>
      <div style="font-size:11px;color:var(--t4);margin-top:.75rem;">Reading your CSV files from the data/ folder…</div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
}

function updateLoadingScreen(msg) {
  const el = document.getElementById('ld-status');
  const bar = document.getElementById('ld-bar');
  if (el)  el.textContent  = msg;
  if (bar) bar.style.width = (TX.length?TX.length>0?66:33:PAY.length?66:33)+'%';
}

function showError(msg) {
  document.getElementById('loader').innerHTML = `
    <div class="ld-bg"></div>
    <div class="ld-card" style="text-align:center;padding:2.5rem;">
      <div class="ld-brand" style="justify-content:center;margin-bottom:1.5rem;">
        <div class="ld-logo"><svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>
        <div><div class="ld-name">ParkIQ Riverton</div><div class="ld-tagline">Parking Data Ecosystem Platform</div></div>
      </div>
      <div style="font-size:32px;margin-bottom:1rem;">⚠️</div>
      <div style="font-size:13px;font-weight:600;color:var(--red);margin-bottom:.5rem;">Could not load CSV files</div>
      <div style="font-size:12px;color:var(--t3);margin-bottom:1.5rem;line-height:1.6;">${msg}</div>
      <div style="background:var(--s2);border-radius:var(--r);padding:1rem;text-align:left;font-size:12px;color:var(--t2);line-height:2;">
        <strong>Make sure your repo has this structure:</strong><br/>
        📄 index.html<br/>
        📄 app.js<br/>
        📄 styles.css<br/>
        📁 data/<br/>
        &nbsp;&nbsp;&nbsp;📄 Transaction_Table_Correct1.csv<br/>
        &nbsp;&nbsp;&nbsp;📄 Payment_Table_Correct1.csv<br/>
        &nbsp;&nbsp;&nbsp;📄 Audit_Status_Table_Correct1.csv
      </div>
      <button onclick="location.reload()" style="margin-top:1rem;background:var(--orange);border:none;border-radius:var(--r);padding:.65rem 1.5rem;font-size:13px;font-weight:600;color:white;cursor:pointer;font-family:inherit;">Try Again</button>
    </div>`
}

/* ══════════════════════════════════════════════
   BUILD LOOKUP MAPS
══════════════════════════════════════════════ */
function buildMaps() {
  txMap = {}; TX.forEach(r => { txMap[r.Transaction_ID] = r; });
  payMap = {}; PAY.forEach(r => { payMap[r.Transaction_ID] = r; });
  vehicleMap = {};
  TX.forEach(r => {
    if (!vehicleMap[r.Vehicle_ID] || r.Permit_Status === 'Active')
      vehicleMap[r.Vehicle_ID] = r;
  });
}

/* ══════════════════════════════════════════════
   COMPUTE ALL STATS FROM RAW TABLES
══════════════════════════════════════════════ */
function compute() {
  /* ── TX ── */
  const violRows = TX.filter(r => r.Violation_Type && r.Violation_Type.trim());
  const psCounts = countBy(TX, 'Permit_Status');
  const vtCounts = countBy(violRows, 'Violation_Type');
  const zvCounts = countBy(TX, 'Zone_ID');
  const zNames   = {}; TX.forEach(r => { if(r.Zone_ID) zNames[r.Zone_ID]=r.Zone_Name; });
  const mvCounts = countByMonth(violRows, 'Event_Time');

  /* ── PAY ── */
  const paysCounts = countBy(PAY, 'Payment_Status');
  const pmCounts   = countBy(PAY.filter(r=>r.Payment_Method&&r.Payment_Method.trim()&&r.Payment_Method!=='—'), 'Payment_Method');
  const totalFines = sumBy(PAY, 'Fine_Amount');
  const totalPaid  = sumBy(PAY, 'Payment_Amount');
  const levByM     = sumByMonth(PAY, 'Payment_Date', 'Fine_Amount');
  const colByM     = sumByMonth(PAY, 'Payment_Date', 'Payment_Amount');
  const mLabels    = Object.keys(levByM);

  /* ── AUD ── */
  const syncOk   = AUD.filter(r => r.Data_Sync_Status==='True').length;
  const recCnts  = countBy(AUD, 'Record_Status');
  const appCnts  = countBy(AUD, 'Appeal_Status');
  const occCnts  = countBy(AUD, 'Sensor_Occupancy_Status');
  const srcCnts  = countBy(AUD, 'Data_Source_System');
  const maMap    = countByMonth(AUD.filter(r=>r.Appeal_Status&&r.Appeal_Status!=='None'), 'Appeal_Date');
  const totalApp = (appCnts.Pending||0)+(appCnts.Rejected||0)+(appCnts.Approved||0);

  /* ── Data sources ── */
  const dataSources = Object.entries(srcCnts).map(([name,total])=>{
    const rows   = AUD.filter(r=>r.Data_Source_System===name);
    const synced = rows.filter(r=>r.Data_Sync_Status==='True').length;
    return { name, total, synced, failed:total-synced };
  });

  /* ── Pending appeals with TX cross-ref ── */
  const pendingAppeals = AUD.filter(r=>r.Appeal_Status==='Pending').map(r=>({
    aud:    r.Audit_ID,
    tid:    r.Transaction_ID,
    reason: r.Appeal_Reason || 'Not provided',
    date:   r.Appeal_Date   ? r.Appeal_Date.slice(0,10) : '—',
    viol:   (txMap[r.Transaction_ID]||{}).Violation_Type || '—'
  }));

  D = {
    totalTx:         TX.length,
    totalViol:        violRows.length,
    permitStatus:     psCounts,
    violTypes:        vtCounts,
    zoneVol:          zvCounts,
    zoneNames:        zNames,
    monthlyViol:      mvCounts,
    totalFines, totalPaid,
    uncollected:      totalFines - totalPaid,
    payStatus:        paysCounts,
    payMethods:       pmCounts,
    mLabels,
    mLevied:          mLabels.map(m=>levByM[m]||0),
    mCollected:       mLabels.map(m=>colByM[m]||0),
    syncOk,
    syncFail:         AUD.length - syncOk,
    syncRate:         AUD.length>0?((syncOk/AUD.length)*100).toFixed(1):'0',
    recStatus:        recCnts,
    appStatus:        appCnts,
    totalAppeals:     totalApp,
    monthlyAppeals:   maMap,
    occStatus:        occCnts,
    dataSources,
    pendingAppeals,
    compRate:         violRows.length>0?Math.round(((paysCounts.Paid||0)/violRows.length)*100):0,
    appApprovalRate:  totalApp>0?(((appCnts.Approved||0)/totalApp)*100).toFixed(1):'0.0'
  };

  /* Update badge */
  document.getElementById('rbAlert').textContent = '⚠ '+fmt(D.syncFail)+' failures';
}

/* ── Aggregation helpers ── */
function countBy(rows, key) {
  return rows.reduce((a,r)=>{ const v=r[key]||''; a[v]=(a[v]||0)+1; return a; },{});
}
function sumBy(rows, key) {
  return rows.reduce((s,r)=>s+(parseFloat(r[key])||0),0);
}
function monthKey(str) {
  if(!str||!str.trim()) return null;
  const d=new Date(str.trim()); if(isNaN(d)) return null;
  return d.toLocaleString('en-US',{month:'short',year:'2-digit'});
}
function countByMonth(rows, key) {
  return rows.reduce((a,r)=>{ const m=monthKey(r[key]); if(m) a[m]=(a[m]||0)+1; return a; },{});
}
function sumByMonth(rows, dateKey, valKey) {
  return rows.reduce((a,r)=>{ const m=monthKey(r[dateKey]); if(m) a[m]=(a[m]||0)+(parseFloat(r[valKey])||0); return a; },{});
}

/* ── Display helpers ── */
function fmt(n)  { return Number(n).toLocaleString(); }
function fmtK(n) { return '$'+Math.round(n/1000)+'K'; }
function bx(label,type) {
  const m={g:'bx-g',r:'bx-r',a:'bx-a',b:'bx-b',n:'bx-n',p:'bx-p',o:'bx-o'};
  return `<span class="bx ${m[type]||'bx-n'}">${label}</span>`;
}
function sbx(s) {
  if(['Active','Paid','Matched','Healthy','True'].includes(s))            return bx(s,'g');
  if(['Expired','Unpaid','Critical','False'].includes(s))                 return bx(s,'r');
  if(['Suspended','Partial','Pending','Degraded','Review Needed'].includes(s)) return bx(s,'a');
  if(s==='Duplicate') return bx(s,'p');
  return bx(s,'n');
}
function mkChart(id,cfg) {
  const cv=document.getElementById(id); if(!cv) return;
  if(charts[id]){ try{charts[id].destroy();}catch(e){} }
  charts[id]=new Chart(cv,cfg);
}
function leg(items) {
  return `<div class="legend">${items.map(([c,l])=>`<span><span class="ls" style="background:${c}"></span>${l}</span>`).join('')}</div>`;
}
function pct(a,b) { return b>0?((a/b)*100).toFixed(1)+'%':'0%'; }

/* ══════════════════════════════════════════════
   ROLE / NAV CONFIG
══════════════════════════════════════════════ */
const ROLES = {
  admin:   {name:'City Administrator', av:'CA', nav:['dashboard','permits','violations','payments','appeals','zones','sync','reports']},
  manager: {name:'Operations Manager',  av:'OM', nav:['dashboard','permits','violations','payments','appeals','zones','sync','reports']},
  staff:   {name:'Permit Staff',        av:'PS', nav:['dashboard','permits','payments','appeals']},
  officer: {name:'Enforcement Officer', av:'EO', nav:['dashboard','violations','zones','sync']}
};
const NAV = {
  dashboard:  {icon:'📊',label:'Dashboard'},
  permits:    {icon:'📋',label:'Permits',    badge:null, bt:'n'},
  violations: {icon:'⚠️',label:'Violations', badge:'r',  bt:'r'},
  payments:   {icon:'💳',label:'Payments',   badge:null, bt:'n'},
  appeals:    {icon:'⚖️',label:'Appeals',    badge:'a',  bt:'a'},
  zones:      {icon:'🗺️',label:'Zones'},
  sync:       {icon:'🔄',label:'Data Sync',  badge:'!',  bt:'r'},
  reports:    {icon:'📈',label:'Reports'}
};
const PAGE_META = {
  dashboard:  {title:'Command Center',     sub:'Full operational overview — live data from all 3 tables'},
  permits:    {title:'Permits',            sub:'Transaction_Table · all permit records with filters'},
  violations: {title:'Violations',         sub:'Violation records · issue citations · citation log'},
  payments:   {title:'Payments & Revenue', sub:'Payment_Table · all financial records with filters'},
  appeals:    {title:'Appeals',            sub:'Audit_Status_Table · pending actions'},
  zones:      {title:'Zone Occupancy',     sub:'Sensor data · 8 zones · real-time'},
  sync:       {title:'Data Sync Health',   sub:'Audit_Status_Table · system health · record quality'},
  reports:    {title:'Reports & Analytics',sub:'Full KPI summary · period analysis · exports'}
};
const TOP_BTN = {permits:'+ New Permit', violations:'+ Issue Citation', reports:'Export'};

function setRole(r,btn) {
  role=r;
  document.querySelectorAll('.rb-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('sbAv').textContent   = ROLES[r].av;
  document.getElementById('sbName').textContent = ROLES[r].name;
  buildNav();
  if(!ROLES[r].nav.includes(page)) page='dashboard';
  go(page);
}
function buildNav() {
  const el=document.getElementById('sbnav');
  el.innerHTML='<div class="nav-sec">Navigation</div>'+
    ROLES[role].nav.map(k=>{
      const n=NAV[k];
      let badge='';
      if(n.badge==='r') badge=`<span class="nb nb-r">${k==='violations'?fmt(D.totalViol||0):fmt(D.syncFail||0)}</span>`;
      else if(n.badge==='a') badge=`<span class="nb nb-a">${fmt(D.appStatus?.Pending||0)}</span>`;
      else if(n.badge==='!') badge=`<span class="nb nb-r">!</span>`;
      return `<div class="nav-item${page===k?' active':''}" onclick="go('${k}')"><span class="ni">${n.icon}</span>${n.label}${badge}</div>`;
    }).join('');
}
function go(p) {
  page=p; buildNav();
  Object.keys(charts).forEach(k=>{ try{charts[k].destroy();}catch(e){} delete charts[k]; });
  const m=PAGE_META[p];
  document.getElementById('tbIcon').textContent  = NAV[p].icon;
  document.getElementById('tbTitle').textContent = m.title;
  document.getElementById('tbSub').textContent   = m.sub;
  const ab=document.getElementById('topAction');
  if(TOP_BTN[p]){ab.textContent=TOP_BTN[p];ab.style.display='inline-flex';}else ab.style.display='none';
  const c=document.getElementById('content');
  c.innerHTML='';
  c.className='page';
  ({dashboard:pgDashboard,permits:pgPermits,violations:pgViolations,payments:pgPayments,appeals:pgAppeals,zones:pgZones,sync:pgSync,reports:pgReports})[p]?.(c);
}
function topAct(){
  if(page==='permits')    openPermitModal();
  if(page==='violations') pgViolations(document.getElementById('content'));
  if(page==='reports')    toast('Generating export…');
}

/* ══════════════════════════════════════════════
   PAGE: DASHBOARD
══════════════════════════════════════════════ */
function pgDashboard(c) {
  const d=D, sfPct=(100-parseFloat(d.syncRate)).toFixed(1);
  c.innerHTML=`
  <div class="alert alert-r">
    <span class="alert-icon">⚠</span>
    <div><strong>${fmt(d.syncFail)} sync failures (${sfPct}%)</strong> — enforcement devices may display stale permit data, directly causing ${fmt(d.appStatus.Approved||0)} wrongful citations (${d.appApprovalRate}% appeal approval rate).</div>
    <span class="alert-act" onclick="go('sync')">View Sync →</span>
  </div>
  <div class="kpi-row">
    <div class="kpi k-blue"> <div class="kpi-val">${fmt(d.totalTx)}</div>           <div class="kpi-lbl">Total Transactions</div><div class="kpi-d db">Across ${Object.keys(d.zoneVol).length} zones</div></div>
    <div class="kpi k-red">  <div class="kpi-val">${fmt(d.totalViol)}</div>          <div class="kpi-lbl">Violations Issued</div> <div class="kpi-d dr">${pct(d.totalViol,d.totalTx)} of records</div></div>
    <div class="kpi k-orange"><div class="kpi-val">${fmtK(d.totalFines)}</div>       <div class="kpi-lbl">Fines Levied</div>      <div class="kpi-d da">${fmtK(d.uncollected)} uncollected</div></div>
    <div class="kpi k-red">  <div class="kpi-val">${d.compRate}%</div>               <div class="kpi-lbl">Payment Compliance</div><div class="kpi-d dr">↓ Critical</div></div>
    <div class="kpi k-amber"><div class="kpi-val">${d.syncRate}%</div>               <div class="kpi-lbl">Sync Rate</div>          <div class="kpi-d da">${fmt(d.syncFail)} failures</div></div>
    <div class="kpi k-red">  <div class="kpi-val">${d.appApprovalRate}%</div>        <div class="kpi-lbl">Appeal Approval</div>   <div class="kpi-d dr">${fmt(d.appStatus.Approved||0)} wrongful</div></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div><div class="ct">Monthly violations &amp; appeals</div><div class="cs">Event_Time · Appeal_Date — from your CSV</div></div><span class="clink" onclick="go('violations')">Details →</span></div>
      ${leg([[C.orange,'Violations'],[C.blue,'Appeals']])}
      <div class="chart-wrap" style="height:175px"><canvas id="ch_dt"></canvas></div>
    </div>
    <div class="card">
      <div class="ch"><div><div class="ct">Payment status — all ${fmt(d.totalTx)} records</div><div class="cs">Payment_Table · Payment_Status field</div></div><span class="clink" onclick="go('payments')">Details →</span></div>
      ${leg([[C.green,'No Fine'],[C.blue,'Paid'],[C.red,'Unpaid'],[C.amber,'Partial']])}
      <div class="chart-wrap" style="height:175px"><canvas id="ch_dp"></canvas></div>
    </div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div><div class="ct">Zone transaction volume</div><div class="cs">Transaction_Table · Zone_ID — all ${Object.keys(d.zoneVol).length} zones</div></div><span class="clink" onclick="go('zones')">Map →</span></div>
      <div class="chart-wrap" style="height:195px"><canvas id="ch_dz"></canvas></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Live activity feed</div><span class="bx bx-g" style="font-size:10px">● Live</span></div>
      <div class="tl">
        ${[
          ['#22c55e','Permit approved — V93810, Z007 Student Housing','Just now · Permit Staff'],
          ['#f59e0b','Citation issued — No Permit, Z005 Riverfront','3 min · Enforcement'],
          ['#dc2626','Sync failure — Enforcement App ('+fmt(d.syncFail)+' total)','8 min · System'],
          ['#22c55e','Payment $60.00 — T100000 via Card received','15 min · Finance'],
          ['#f59e0b','Appeal filed — Valid Permit reason, AUD300986','22 min · Resident'],
          ['#2563eb',fmt(d.syncOk)+' records synced across all systems','30 min · System']
        ].map(([col,txt,time],i)=>`
        <div class="tl-item">
          <div class="tl-line"><div class="tl-dot" style="background:${col}"></div>${i<5?'<div class="tl-stem"></div>':''}</div>
          <div class="tl-content"><div class="tl-txt">${txt}</div><div class="tl-time">${time}</div></div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;

  setTimeout(()=>{
    const months=Object.keys(d.monthlyViol);
    mkChart('ch_dt',{type:'line',data:{labels:months,datasets:[
      {label:'Violations',data:Object.values(d.monthlyViol),borderColor:C.orange,backgroundColor:'rgba(232,98,26,.08)',fill:true,tension:.4,pointRadius:4,pointBackgroundColor:C.orange,borderWidth:2},
      {label:'Appeals',   data:months.map(m=>d.monthlyAppeals[m]||0),borderColor:C.blue,backgroundColor:'rgba(37,99,235,.05)',fill:true,tension:.4,pointRadius:3,borderDash:[4,4],borderWidth:1.5,pointBackgroundColor:C.blue}
    ]},options:{...CB,scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});

    const ps=d.payStatus;
    mkChart('ch_dp',{type:'bar',data:{labels:['No Fine','Paid','Unpaid','Partial'],datasets:[{label:'Count',data:[ps['No Fine']||0,ps.Paid||0,ps.Unpaid||0,ps.Partial||0],backgroundColor:[C.green,C.blue,C.red,C.amber],borderRadius:5,borderSkipped:false}]},options:{...CB,scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});

    const zIds=Object.keys(d.zoneVol),zVols=Object.values(d.zoneVol),mx=Math.max(...zVols);
    mkChart('ch_dz',{type:'bar',data:{labels:zIds.map(z=>`${z} · ${d.zoneNames[z]||z}`),datasets:[{label:'Transactions',data:zVols,backgroundColor:zVols.map(v=>v>=mx*0.99?C.red:v>=mx*0.97?C.amber:C.green),borderRadius:4,borderSkipped:false}]},options:{...CB,indexAxis:'y',scales:{x:{beginAtZero:false,min:Math.min(...zVols)-300,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},y:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
  },80);
}

/* ══════════════════════════════════════════════
   PAGE: PERMITS  (with filters + pagination)
══════════════════════════════════════════════ */
function pgPermits(c) {
  const d=D;
  c.innerHTML=`
  <div class="alert alert-g"><span class="alert-icon">✓</span>
    <div>${fmt(d.totalTx)} records loaded from Transaction_Table. Active: <strong>${fmt(d.permitStatus.Active||0)}</strong> · Expired: <strong>${fmt(d.permitStatus.Expired||0)}</strong> · Suspended: <strong>${fmt(d.permitStatus.Suspended||0)}</strong></div>
  </div>
  <div class="kpi-row">
    <div class="kpi k-green">  <div class="kpi-val">${fmt(d.permitStatus.Active||0)}</div>   <div class="kpi-lbl">Active</div></div>
    <div class="kpi k-red">    <div class="kpi-val">${fmt(d.permitStatus.Expired||0)}</div>  <div class="kpi-lbl">Expired</div></div>
    <div class="kpi k-amber">  <div class="kpi-val">${fmt(d.permitStatus.Suspended||0)}</div><div class="kpi-lbl">Suspended</div></div>
    <div class="kpi k-neutral"><div class="kpi-val">${fmt(d.totalTx)}</div>                   <div class="kpi-lbl">Total Records</div></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Permit status</div></div>
      ${leg([[C.green,'Active'],[C.red,'Expired'],[C.amber,'Suspended']])}
      <div class="chart-wrap" style="height:150px"><canvas id="ch_ps"></canvas></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Permits by zone type</div><div class="cs">Zone_Type field</div></div>
      <div class="chart-wrap" style="height:150px"><canvas id="ch_pzt"></canvas></div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><div><div class="ct">Permit records</div><div class="cs">Transaction_Table_Correct1.csv — filterable</div></div><button class="btn btn-pri btn-sm" onclick="openPermitModal()">+ New Permit</button></div>
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <select id="f-pstatus" onchange="renderPermitTable()"><option value="">All Statuses</option><option>Active</option><option>Expired</option><option>Suspended</option></select>
      <select id="f-pzone" onchange="renderPermitTable()"><option value="">All Zones</option>${Object.keys(d.zoneVol).sort().map(z=>`<option>${z}</option>`).join('')}</select>
      <select id="f-pviol" onchange="renderPermitTable()"><option value="">All Violations</option>${Object.keys(d.violTypes).map(v=>`<option>${v}</option>`).join('')}</select>
      <input id="f-pvehicle" placeholder="Vehicle ID…" oninput="renderPermitTable()" style="width:110px"/>
      <span class="filter-clear" onclick="clearFilters('f-pstatus','f-pzone','f-pviol','f-pvehicle')">Clear</span>
      <span class="result-count" id="perm-count"></span>
    </div>
    <div id="perm-table"></div>
    <div id="perm-pages"></div>
  </div>`;
  setTimeout(()=>{
    mkChart('ch_ps',{type:'bar',data:{labels:['Active','Expired','Suspended'],datasets:[{label:'Count',data:[d.permitStatus.Active||0,d.permitStatus.Expired||0,d.permitStatus.Suspended||0],backgroundColor:[C.green,C.red,C.amber],borderRadius:6,borderSkipped:false}]},options:{...CB,scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
    const ztRaw={}; TX.forEach(r=>{ztRaw[r.Zone_Type]=(ztRaw[r.Zone_Type]||0)+1;});
    const ztE=Object.entries(ztRaw).sort((a,b)=>b[1]-a[1]);
    mkChart('ch_pzt',{type:'bar',data:{labels:ztE.map(e=>e[0]),datasets:[{label:'Count',data:ztE.map(e=>e[1]),backgroundColor:ztE.map((_,i)=>V_COLORS[i%V_COLORS.length]),borderRadius:5}]},options:{...CB,scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
    renderPermitTable();
  },80);
}
let pPermPage=0;
function renderPermitTable() {
  pPermPage=0; showPermitPage();
}
function showPermitPage() {
  const status  = document.getElementById('f-pstatus')?.value||'';
  const zone    = document.getElementById('f-pzone')?.value||'';
  const viol    = document.getElementById('f-pviol')?.value||'';
  const vehicle = (document.getElementById('f-pvehicle')?.value||'').toUpperCase();
  let rows = TX;
  if(status)  rows=rows.filter(r=>r.Permit_Status===status);
  if(zone)    rows=rows.filter(r=>r.Zone_ID===zone);
  if(viol)    rows=rows.filter(r=>r.Violation_Type===viol);
  if(vehicle) rows=rows.filter(r=>r.Vehicle_ID.includes(vehicle));
  const total=rows.length, perPage=50, pages=Math.ceil(total/perPage);
  if(pPermPage>=pages) pPermPage=Math.max(0,pages-1);
  const slice=rows.slice(pPermPage*perPage,(pPermPage+1)*perPage);
  document.getElementById('perm-count').textContent=`${fmt(total)} records`;
  const tbl=document.getElementById('perm-table');
  const pg=document.getElementById('perm-pages');
  if(!slice.length){tbl.innerHTML=`<div style="padding:2rem;text-align:center;color:var(--t4);">No records match the selected filters.</div>`;pg.innerHTML='';return;}
  tbl.innerHTML=`<div class="tbl"><table>
    <tr><th>Transaction ID</th><th>Vehicle</th><th>Permit ID</th><th>Space</th><th>Zone</th><th>Zone Name</th><th>Type</th><th>Start</th><th>End</th><th>Status</th><th>Violation</th><th>Fine</th></tr>
    ${slice.map(r=>`<tr>
      <td class="mono">${r.Transaction_ID}</td><td>${r.Vehicle_ID}</td><td class="mono">${r.Permit_ID}</td><td class="mono">${r.Parking_Space_ID}</td>
      <td>${bx(r.Zone_ID,'b')}</td><td style="font-size:11px;color:var(--t2)">${r.Zone_Name}</td><td><span class="bx bx-n" style="font-size:10px">${r.Zone_Type}</span></td>
      <td>${r.Permit_Start_Time.slice(0,10)}</td><td>${r.Permit_End_Time.slice(0,10)}</td>
      <td>${sbx(r.Permit_Status)}</td>
      <td style="font-size:11px">${r.Violation_Type||'—'}</td>
      <td>${parseFloat(r.Fine_Amount)>0?'$'+r.Fine_Amount:'—'}</td>
    </tr>`).join('')}
  </table></div>`;
  renderPagination(pg, total, perPage, pPermPage, n=>{pPermPage=n;showPermitPage();});
}

/* ══════════════════════════════════════════════
   PAGE: VIOLATIONS  (with filters)
══════════════════════════════════════════════ */
function pgViolations(c) {
  const d=D;
  const vTypes=Object.entries(d.violTypes).sort((a,b)=>b[1]-a[1]);
  c.innerHTML=`
  <div class="kpi-row">
    <div class="kpi k-red">  <div class="kpi-val">${fmt(d.totalViol)}</div>             <div class="kpi-lbl">Total Violations</div></div>
    <div class="kpi k-red">  <div class="kpi-val">${vTypes[0]?.[0]||'—'}</div>          <div class="kpi-lbl">Top Type</div><div class="kpi-d dr">${fmt(vTypes[0]?.[1]||0)} cases</div></div>
    <div class="kpi k-amber"><div class="kpi-val">${fmt(d.appStatus.Pending||0)}</div>  <div class="kpi-lbl">Open Appeals</div></div>
    <div class="kpi k-red">  <div class="kpi-val">${fmt(d.appStatus.Approved||0)}</div> <div class="kpi-lbl">Wrongful Citations</div><div class="kpi-d dr">${d.appApprovalRate}% approval</div></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Violation type breakdown</div><div class="cs">Violation_Type — ${fmt(d.totalViol)} records</div></div>
      <div class="chart-wrap" style="height:210px"><canvas id="ch_vt"></canvas></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Issue new citation</div><div class="cs">Real-time permit check against all ${fmt(d.totalTx)} records</div></div>
      <div class="form-group"><label class="form-lbl">Vehicle ID</label><input class="form-inp" id="cit-v" placeholder="e.g. V93810" oninput="checkPermit(this.value)"/></div>
      <div id="permit-check" style="margin-bottom:.6rem"></div>
      <div class="form-row">
        <div><label class="form-lbl">Zone</label><select class="form-sel" id="cit-z"><option value="">Select zone</option>${Object.entries(d.zoneNames).map(([id,name])=>`<option>${id} — ${name}</option>`).join('')}</select></div>
        <div><label class="form-lbl">Violation type</label><select class="form-sel" id="cit-t"><option value="">Select type</option>${vTypes.map(([t])=>`<option>${t}</option>`).join('')}</select></div>
      </div>
      <div class="form-actions"><button class="btn btn-sec btn-sm" onclick="clearCit()">Clear</button><button class="btn btn-pri btn-sm" onclick="issueCit()">Issue Citation</button></div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><div><div class="ct">Citation log</div><div class="cs">Audit_Status_Table cross-referenced with Transaction_Table</div></div></div>
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <select id="f-vzone" onchange="renderViolTable()"><option value="">All Zones</option>${Object.keys(d.zoneVol).sort().map(z=>`<option>${z}</option>`).join('')}</select>
      <select id="f-vsync" onchange="renderViolTable()"><option value="">All Sync Status</option><option>True</option><option>False</option></select>
      <select id="f-vapp" onchange="renderViolTable()"><option value="">All Appeal Status</option><option>None</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
      <span class="filter-clear" onclick="clearFilters('f-vzone','f-vsync','f-vapp')">Clear</span>
      <span class="result-count" id="viol-count"></span>
    </div>
    <div id="viol-table"></div>
    <div id="viol-pages"></div>
  </div>`;
  setTimeout(()=>{
    mkChart('ch_vt',{type:'bar',data:{labels:vTypes.map(([l])=>l),datasets:[{label:'Count',data:vTypes.map(([,v])=>v),backgroundColor:vTypes.map((_,i)=>V_COLORS[i%V_COLORS.length]),borderRadius:5,borderSkipped:false}]},options:{...CB,indexAxis:'y',scales:{x:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},y:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
    renderViolTable();
  },80);
}
let pViolPage=0;
function renderViolTable(){pViolPage=0;showViolPage();}
function showViolPage(){
  const zone  = document.getElementById('f-vzone')?.value||'';
  const sync  = document.getElementById('f-vsync')?.value||'';
  const appeal= document.getElementById('f-vapp')?.value||'';
  let rows=AUD;
  if(zone)   rows=rows.filter(r=>{ const tx=txMap[r.Transaction_ID]; return tx&&tx.Zone_ID===zone; });
  if(sync)   rows=rows.filter(r=>r.Data_Sync_Status===sync);
  if(appeal) rows=rows.filter(r=>r.Appeal_Status===appeal);
  const total=rows.length, perPage=50, pages=Math.ceil(total/perPage);
  if(pViolPage>=pages) pViolPage=Math.max(0,pages-1);
  const slice=rows.slice(pViolPage*perPage,(pViolPage+1)*perPage);
  document.getElementById('viol-count').textContent=`${fmt(total)} records`;
  const tbl=document.getElementById('viol-table');
  const pg =document.getElementById('viol-pages');
  if(!slice.length){tbl.innerHTML=`<div style="padding:2rem;text-align:center;color:var(--t4)">No records match the selected filters.</div>`;pg.innerHTML='';return;}
  tbl.innerHTML=`<div class="tbl"><table>
    <tr><th>Audit ID</th><th>Transaction</th><th>Zone</th><th>Violation</th><th>Fine</th><th>Payment</th><th>Data Source</th><th>Sync</th><th>Record</th><th>Appeal</th></tr>
    ${slice.map(r=>{
      const tx=txMap[r.Transaction_ID]||{};
      return `<tr>
        <td class="mono">${r.Audit_ID}</td><td class="mono">${r.Transaction_ID}</td>
        <td>${tx.Zone_ID?bx(tx.Zone_ID,'b'):'—'}</td>
        <td style="font-size:11px">${tx.Violation_Type||'—'}</td>
        <td>${parseFloat(tx.Fine_Amount)>0?'$'+tx.Fine_Amount:'—'}</td>
        <td>${sbx(tx.Violation_Status||'—')}</td>
        <td style="font-size:11px;color:var(--t2)">${r.Data_Source_System}</td>
        <td>${sbx(r.Data_Sync_Status)}</td>
        <td>${sbx(r.Record_Status)}</td>
        <td>${sbx(r.Appeal_Status==='None'?'—':r.Appeal_Status)}</td>
      </tr>`;
    }).join('')}
  </table></div>`;
  renderPagination(pg,total,perPage,pViolPage,n=>{pViolPage=n;showViolPage();});
}
function checkPermit(val){
  const el=document.getElementById('permit-check');
  if(!el||val.trim().length<4){if(el)el.innerHTML='';return;}
  const vid=val.trim().toUpperCase();
  const r=vehicleMap[vid];
  if(!r){el.innerHTML=`<div class="verify-fail">✗ No permit record found for <strong>${vid}</strong></div>`;return;}
  const today=new Date();today.setHours(0,0,0,0);
  const end=new Date(r.Permit_End_Time);end.setHours(0,0,0,0);
  const valid=r.Permit_Status==='Active'&&end>=today;
  el.innerHTML=valid
    ?`<div class="verify-ok">✓ Valid active permit — <strong>${vid}</strong> · Zone ${r.Zone_ID} · ${r.Permit_ID} · expires ${r.Permit_End_Time.slice(0,10)}</div>`
    :`<div class="verify-fail">✗ Permit ${r.Permit_Status.toLowerCase()} for <strong>${vid}</strong> · ${r.Permit_ID} · ended ${r.Permit_End_Time.slice(0,10)}</div>`;
}
function clearCit(){['cit-v','cit-z','cit-t'].forEach(id=>{const e=document.getElementById(id);if(e){e.value='';e.classList.remove('err');}});const p=document.getElementById('permit-check');if(p)p.innerHTML='';}
function issueCit(){
  const ids=['cit-v','cit-z','cit-t'];let err=false;
  ids.forEach(id=>{const e=document.getElementById(id);if(!e?.value){e?.classList.add('err');err=true;}else e.classList.remove('err');});
  if(err){toast('Please fill in all required fields');return;}
  toast(`Citation issued — ${document.getElementById('cit-v').value} · ${document.getElementById('cit-t').value} · ${document.getElementById('cit-z').value}. Synced instantly.`);
  clearCit();
}

/* ══════════════════════════════════════════════
   PAGE: PAYMENTS  (with filters)
══════════════════════════════════════════════ */
function pgPayments(c){
  const d=D;
  c.innerHTML=`
  <div class="alert alert-a"><span class="alert-icon">⚑</span>
    <div><strong>${fmtK(d.uncollected)} outstanding</strong> — ${fmt(d.payStatus.Unpaid||0)} unpaid + ${fmt(d.payStatus.Partial||0)} partial fines from Payment_Table.</div>
  </div>
  <div class="kpi-row">
    <div class="kpi k-orange"><div class="kpi-val">${fmtK(d.totalFines)}</div>          <div class="kpi-lbl">Total Fines Levied</div></div>
    <div class="kpi k-green"> <div class="kpi-val">${fmtK(d.totalPaid)}</div>           <div class="kpi-lbl">Collected</div>          <div class="kpi-d dg">${fmt(d.payStatus.Paid||0)} transactions</div></div>
    <div class="kpi k-red">   <div class="kpi-val">${fmt(d.payStatus.Unpaid||0)}</div>  <div class="kpi-lbl">Unpaid Fines</div></div>
    <div class="kpi k-amber"> <div class="kpi-val">${fmt(d.payStatus.Partial||0)}</div> <div class="kpi-lbl">Partial Payments</div></div>
    <div class="kpi k-red">   <div class="kpi-val">${d.compRate}%</div>                  <div class="kpi-lbl">Compliance Rate</div>   <div class="kpi-d dr">↓ Critical</div></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Revenue levied vs. collected monthly</div><div class="cs">Payment_Date · Fine_Amount · Payment_Amount</div></div>
      ${leg([[C.orange,'Levied'],[C.green,'Collected']])}
      <div class="chart-wrap" style="height:175px"><canvas id="ch_pr"></canvas></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Payment method breakdown</div><div class="cs">Payment_Method — fined records only</div></div>
      <div class="chart-wrap" style="height:175px"><canvas id="ch_pm"></canvas></div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><div><div class="ct">Payment records</div><div class="cs">Payment_Table_Correct1.csv — filterable</div></div></div>
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <select id="f-paystat" onchange="renderPayTable()"><option value="">All Statuses</option><option>Paid</option><option>Unpaid</option><option>Partial</option><option>No Fine</option></select>
      <select id="f-paymeth" onchange="renderPayTable()"><option value="">All Methods</option>${Object.keys(d.payMethods).map(m=>`<option>${m}</option>`).join('')}</select>
      <input id="f-paytid" placeholder="Transaction ID…" oninput="renderPayTable()" style="width:130px"/>
      <span class="filter-clear" onclick="clearFilters('f-paystat','f-paymeth','f-paytid')">Clear</span>
      <span class="result-count" id="pay-count"></span>
    </div>
    <div id="pay-table"></div>
    <div id="pay-pages"></div>
  </div>`;
  setTimeout(()=>{
    const minV=d.mLevied.length>0?Math.min(...d.mLevied)*0.95:0;
    mkChart('ch_pr',{type:'bar',data:{labels:d.mLabels,datasets:[
      {label:'Levied',   data:d.mLevied,   backgroundColor:'rgba(232,98,26,.28)',borderColor:C.orange,borderWidth:1.5,borderRadius:3},
      {label:'Collected',data:d.mCollected,backgroundColor:C.green,borderRadius:3}
    ]},options:{...CB,plugins:{legend:{display:false}},scales:{y:{beginAtZero:false,min:minV,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick,callback:v=>fmtK(v)}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
    const mE=Object.entries(d.payMethods),mC=[C.blue,C.purple,C.teal,C.orange];
    mkChart('ch_pm',{type:'bar',data:{labels:mE.map(e=>e[0]),datasets:[{label:'Payments',data:mE.map(e=>e[1]),backgroundColor:mE.map((_,i)=>mC[i%mC.length]),borderRadius:6,borderSkipped:false}]},options:{...CB,scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
    renderPayTable();
  },80);
}
let pPayPage=0;
function renderPayTable(){pPayPage=0;showPayPage();}
function showPayPage(){
  const stat  = document.getElementById('f-paystat')?.value||'';
  const meth  = document.getElementById('f-paymeth')?.value||'';
  const tid   = (document.getElementById('f-paytid')?.value||'').toUpperCase();
  let rows=PAY;
  if(stat) rows=rows.filter(r=>r.Payment_Status===stat);
  if(meth) rows=rows.filter(r=>r.Payment_Method===meth);
  if(tid)  rows=rows.filter(r=>r.Transaction_ID.includes(tid));
  const total=rows.length,perPage=50,pages=Math.ceil(total/perPage);
  if(pPayPage>=pages) pPayPage=Math.max(0,pages-1);
  const slice=rows.slice(pPayPage*perPage,(pPayPage+1)*perPage);
  document.getElementById('pay-count').textContent=`${fmt(total)} records`;
  const tbl=document.getElementById('pay-table');
  const pg =document.getElementById('pay-pages');
  if(!slice.length){tbl.innerHTML=`<div style="padding:2rem;text-align:center;color:var(--t4)">No records match the selected filters.</div>`;pg.innerHTML='';return;}
  tbl.innerHTML=`<div class="tbl"><table>
    <tr><th>Payment ID</th><th>Transaction ID</th><th>Fine Amount</th><th>Paid Amount</th><th>Method</th><th>Payment Date</th><th>Due Date</th><th>Status</th></tr>
    ${slice.map(r=>`<tr>
      <td class="mono">${r.Payment_ID}</td><td class="mono">${r.Transaction_ID}</td>
      <td>${parseFloat(r.Fine_Amount)>0?'$'+parseFloat(r.Fine_Amount).toFixed(2):'—'}</td>
      <td>${parseFloat(r.Payment_Amount)>0?'$'+parseFloat(r.Payment_Amount).toFixed(2):'—'}</td>
      <td>${r.Payment_Method||'—'}</td>
      <td>${r.Payment_Date?r.Payment_Date.slice(0,10):'—'}</td>
      <td>${r.Due_Date?r.Due_Date.slice(0,10):'—'}</td>
      <td>${sbx(r.Payment_Status)}</td>
    </tr>`).join('')}
  </table></div>`;
  renderPagination(pg,total,perPage,pPayPage,n=>{pPayPage=n;showPayPage();});
}

/* ══════════════════════════════════════════════
   PAGE: APPEALS  (with filters)
══════════════════════════════════════════════ */
function pgAppeals(c){
  const d=D;
  c.innerHTML=`
  <div class="alert alert-r"><span class="alert-icon">⚠</span>
    <div><strong>${d.appApprovalRate}% appeal approval rate</strong> — ${fmt(d.appStatus.Approved||0)} wrongful citations. Root cause: ${fmt(d.syncFail)} sync failures.</div>
    <span class="alert-act" onclick="go('sync')">Fix Sync →</span>
  </div>
  <div class="kpi-row">
    <div class="kpi k-neutral"><div class="kpi-val">${fmt(d.totalAppeals)}</div>             <div class="kpi-lbl">Total Appeals</div></div>
    <div class="kpi k-red">    <div class="kpi-val">${fmt(d.appStatus.Approved||0)}</div>    <div class="kpi-lbl">Approved (Wrongful)</div><div class="kpi-d dr">${d.appApprovalRate}% rate</div></div>
    <div class="kpi k-amber">  <div class="kpi-val">${fmt(d.appStatus.Pending||0)}</div>     <div class="kpi-lbl">Pending Review</div><div class="kpi-d da">Action required</div></div>
    <div class="kpi k-neutral"><div class="kpi-val">${fmt(d.appStatus.Rejected||0)}</div>    <div class="kpi-lbl">Rejected</div></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Appeal outcomes</div><div class="cs">Audit_Status_Table · Appeal_Status field</div></div>
      ${leg([[C.red,'Approved (Wrongful)'],[C.amber,'Pending'],[C.gray,'Rejected']])}
      <div class="chart-wrap" style="height:175px"><canvas id="ch_ao"></canvas></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Top appeal reasons</div><div class="cs">Appeal_Reason field — real values from your data</div></div>
      ${(()=>{
        const reas={}; AUD.filter(r=>r.Appeal_Reason&&r.Appeal_Status!=='None').forEach(r=>{reas[r.Appeal_Reason]=(reas[r.Appeal_Reason]||0)+1;});
        const top=Object.entries(reas).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const max=top[0]?.[1]||1;
        return top.map(([r,n],i)=>`<div class="bar-item"><div class="bar-meta"><span>${r}</span><span>${fmt(n)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/max*100)}%;background:${V_COLORS[i%V_COLORS.length]}"></div></div></div>`).join('');
      })()}
    </div>
  </div>
  <div class="card">
    <div class="ch"><div><div class="ct">Appeal records</div><div class="cs">Audit_Status_Table — filterable</div></div><span class="bx bx-a">${fmt(d.appStatus.Pending||0)} pending</span></div>
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <select id="f-appstat" onchange="renderAppTable()"><option value="">All Statuses</option><option>Pending</option><option>Approved</option><option>Rejected</option><option>None</option></select>
      <select id="f-appreason" onchange="renderAppTable()"><option value="">All Reasons</option>${(()=>{const reas=new Set(AUD.filter(r=>r.Appeal_Reason).map(r=>r.Appeal_Reason));return [...reas].sort().map(r=>`<option>${r}</option>`).join('');})()}</select>
      <span class="filter-clear" onclick="clearFilters('f-appstat','f-appreason')">Clear</span>
      <span class="result-count" id="app-count"></span>
    </div>
    <div id="app-table"></div>
    <div id="app-pages"></div>
  </div>`;
  setTimeout(()=>{
    mkChart('ch_ao',{type:'bar',data:{labels:['Approved\n(Wrongful)','Pending','Rejected'],datasets:[{label:'Count',data:[d.appStatus.Approved||0,d.appStatus.Pending||0,d.appStatus.Rejected||0],backgroundColor:[C.red,C.amber,C.gray],borderRadius:6,borderSkipped:false}]},options:{...CB,scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
    renderAppTable();
  },80);
}
let pAppPage=0;
function renderAppTable(){pAppPage=0;showAppPage();}
function showAppPage(){
  const stat  = document.getElementById('f-appstat')?.value||'';
  const reason= document.getElementById('f-appreason')?.value||'';
  let rows=AUD.filter(r=>r.Appeal_Status&&r.Appeal_Status!=='None');
  if(stat)   rows=rows.filter(r=>r.Appeal_Status===stat);
  if(reason) rows=rows.filter(r=>r.Appeal_Reason===reason);
  const total=rows.length,perPage=50,pages=Math.ceil(total/perPage);
  if(pAppPage>=pages) pAppPage=Math.max(0,pages-1);
  const slice=rows.slice(pAppPage*perPage,(pAppPage+1)*perPage);
  document.getElementById('app-count').textContent=`${fmt(total)} records`;
  const tbl=document.getElementById('app-table');
  const pg =document.getElementById('app-pages');
  if(!slice.length){tbl.innerHTML=`<div style="padding:2rem;text-align:center;color:var(--t4)">No records match the selected filters.</div>`;pg.innerHTML='';return;}
  tbl.innerHTML=`<div class="tbl"><table>
    <tr><th>Audit ID</th><th>Transaction</th><th>Violation</th><th>Reason</th><th>Date</th><th>Status</th><th>Record</th><th>Actions</th></tr>
    ${slice.map(r=>{
      const tx=txMap[r.Transaction_ID]||{};
      return `<tr>
        <td class="mono">${r.Audit_ID}</td><td class="mono">${r.Transaction_ID}</td>
        <td style="font-size:11px">${tx.Violation_Type||'—'}</td>
        <td style="font-size:11px;color:var(--t2)">${r.Appeal_Reason||'—'}</td>
        <td>${r.Appeal_Date?r.Appeal_Date.slice(0,10):'—'}</td>
        <td>${sbx(r.Appeal_Status)}</td>
        <td>${sbx(r.Record_Status)}</td>
        <td style="white-space:nowrap">${r.Appeal_Status==='Pending'?`
          <button class="btn btn-pri btn-sm" style="margin-right:4px" onclick="resolveApp(event,'${r.Audit_ID}','approved')">Approve</button>
          <button class="btn btn-danger btn-sm" onclick="resolveApp(event,'${r.Audit_ID}','rejected')">Reject</button>`:'—'}
        </td>
      </tr>`;
    }).join('')}
  </table></div>`;
  renderPagination(pg,total,perPage,pAppPage,n=>{pAppPage=n;showAppPage();});
}
function resolveApp(ev,id,outcome){
  const row=ev.target.closest('tr'); if(!row) return;
  row.children[5].innerHTML=outcome==='approved'?bx('Approved','g'):bx('Rejected','r');
  row.children[7].innerHTML=`<span class="bx ${outcome==='approved'?'bx-g':'bx-r'}">Resolved</span>`;
  toast(outcome==='approved'?`Appeal ${id} approved — citation voided`:`Appeal ${id} rejected — citation upheld`);
}

/* ══════════════════════════════════════════════
   PAGE: ZONES
══════════════════════════════════════════════ */
function pgZones(c){
  const d=D;
  const totalS=(d.occStatus.Occupied||0)+(d.occStatus.Vacant||0);
  const occPct=totalS>0?((d.occStatus.Occupied/totalS)*100).toFixed(2):'0.00';
  const zoneOcc={Z005:{p:91,cls:'zt-hi',col:C.red,tag:'Near capacity'},Z007:{p:88,cls:'zt-hi',col:C.red,tag:'Near capacity'},Z008:{p:79,cls:'zt-hi',col:C.amber,tag:'High'},Z002:{p:74,cls:'zt-md',col:C.amber,tag:'Moderate'},Z004:{p:68,cls:'zt-md',col:C.amber,tag:'Moderate'},Z001:{p:62,cls:'zt-md',col:C.amber,tag:'Moderate'},Z006:{p:48,cls:'zt-lo',col:C.green,tag:'Available'},Z003:{p:41,cls:'zt-lo',col:C.green,tag:'Available'}};
  c.innerHTML=`
  <div class="kpi-row">
    <div class="kpi k-neutral"><div class="kpi-val">${occPct}%</div>                          <div class="kpi-lbl">Overall Occupancy</div><div class="kpi-d">${fmt(d.occStatus.Occupied||0)} occupied</div></div>
    <div class="kpi k-green">  <div class="kpi-val">${fmt(d.occStatus.Vacant||0)}</div>       <div class="kpi-lbl">Vacant Spaces</div></div>
    <div class="kpi k-red">    <div class="kpi-val">3</div>                                    <div class="kpi-lbl">Critical Zones</div><div class="kpi-d dr">&gt;80% capacity</div></div>
    <div class="kpi k-green">  <div class="kpi-val">&lt;30s</div>                              <div class="kpi-lbl">Sensor Sync Lag</div></div>
  </div>
  <div class="card">
    <div class="ch">
      <div><div class="ct">Live zone occupancy — ${fmt(totalS)} sensors from Audit_Status_Table</div></div>
      <div style="display:flex;gap:.7rem;font-size:11px;color:var(--t3)">
        <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:50%;background:${C.red};display:inline-block"></span>&gt;80%</span>
        <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:50%;background:${C.amber};display:inline-block"></span>50–80%</span>
        <span style="display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border-radius:50%;background:${C.green};display:inline-block"></span>&lt;50%</span>
      </div>
    </div>
    <div class="zone-grid">${Object.entries(zoneOcc).map(([zid,z])=>`
      <div class="zone-tile ${z.cls}">
        <div class="z-name">${d.zoneNames[zid]||zid}</div>
        <div class="z-id">${zid}</div>
        <div class="z-pct" style="color:${z.col}">${z.p}%</div>
        <div class="z-bar" style="background:${z.col};width:${z.p}%"></div>
        <div class="z-tag" style="color:${z.col}">${z.tag}</div>
        <div class="z-tx">${fmt(d.zoneVol[zid]||0)} transactions</div>
      </div>`).join('')}
    </div>
  </div>
  <div class="card">
    <div class="ch"><div class="ct">Zone occupancy % comparison</div></div>
    ${leg([[C.red,'High (&gt;80%)'],[C.amber,'Moderate (50–80%)'],[C.green,'Available (&lt;50%)']])}
    <div class="chart-wrap" style="height:165px"><canvas id="ch_zo"></canvas></div>
  </div>`;
  setTimeout(()=>{
    const zIds=Object.keys(zoneOcc);
    mkChart('ch_zo',{type:'bar',data:{labels:zIds.map(z=>`${z}·${d.zoneNames[z]||z}`),datasets:[{label:'Occupancy %',data:Object.values(zoneOcc).map(z=>z.p),backgroundColor:Object.values(zoneOcc).map(z=>z.col),borderRadius:5,borderSkipped:false}]},options:{...CB,scales:{y:{beginAtZero:false,min:30,max:100,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick,callback:v=>v+'%'}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
  },80);
}

/* ══════════════════════════════════════════════
   PAGE: SYNC  (officer has extra lookup)
══════════════════════════════════════════════ */
function pgSync(c){
  const d=D;
  const isOfficer=role==='officer';
  const totalSync=d.syncOk+d.syncFail;
  const sfPct=totalSync>0?((d.syncFail/totalSync)*100).toFixed(1):'0.0';
  c.innerHTML=`
  ${isOfficer?`
  <div class="lookup-box">
    <div class="lookup-title">⚡ Permit Lookup — checks all ${fmt(d.totalTx)} records</div>
    <div class="lookup-row"><input class="lookup-inp" id="lu-inp" placeholder="Enter any Vehicle ID, e.g. V93810"/><button class="lookup-btn" onclick="doLookup()">Check</button></div>
    <div id="lu-res"></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">My device sync status</div></div>
      <div style="display:flex;align-items:center;gap:1rem;padding:.5rem 0">
        <div style="width:50px;height:50px;border-radius:50%;background:var(--amber-s);border:3px solid var(--amber);display:flex;align-items:center;justify-content:center;font-size:19px">🔄</div>
        <div><div style="font-size:14px;font-weight:700;color:var(--amber)">Degraded</div><div style="font-size:12px;color:var(--t2);margin-top:2px">Last sync: 8 min ago</div></div>
      </div>
      <button class="btn btn-pri" style="width:100%;margin-top:.7rem" onclick="toast('Device synced — latest permit records loaded')">Force Device Sync</button>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">My citations today</div></div>
      <div class="tbl"><table><tr><th>Time</th><th>Vehicle</th><th>Zone</th><th>Type</th><th>Synced</th></tr>
        <tr><td>08:14</td><td>V93810</td><td>Z007</td><td>No Permit</td>       <td>${bx('Yes','g')}</td></tr>
        <tr><td>09:32</td><td>V21395</td><td>Z003</td><td>Overtime Parking</td><td>${bx('Yes','g')}</td></tr>
        <tr><td>10:47</td><td>V40495</td><td>Z008</td><td>Overtime Parking</td><td>${bx('Yes','g')}</td></tr>
        <tr><td>11:22</td><td>V88907</td><td>Z003</td><td>Expired Meter</td>   <td>${bx('Pending','a')}</td></tr>
      </table></div>
    </div>
  </div>
  `:''}
  <div class="alert alert-r"><span class="alert-icon">⚠</span>
    <div><strong>${fmt(d.syncFail)} sync failures (${sfPct}%) — Data_Sync_Status from your Audit CSV.</strong> Primary sources: Enforcement App + Sensor Network. Directly causes wrongful citations.</div>
    <span class="alert-act" onclick="forceSync()">Force Sync →</span>
  </div>
  <div class="kpi-row">
    <div class="kpi k-green"> <div class="kpi-val">${fmt(d.syncOk)}</div>                  <div class="kpi-lbl">Synced OK</div>         <div class="kpi-d dg">${d.syncRate}%</div></div>
    <div class="kpi k-red">   <div class="kpi-val">${fmt(d.syncFail)}</div>                 <div class="kpi-lbl">Sync Failures</div>     <div class="kpi-d dr">${sfPct}%</div></div>
    <div class="kpi k-amber"> <div class="kpi-val">${fmt(d.recStatus.Duplicate||0)}</div>       <div class="kpi-lbl">Duplicates</div></div>
    <div class="kpi k-amber"> <div class="kpi-val">${fmt(d.recStatus['Review Needed']||0)}</div><div class="kpi-lbl">Review Needed</div></div>
    <div class="kpi k-amber"> <div class="kpi-val">${fmt(d.recStatus.Pending||0)}</div>         <div class="kpi-lbl">Pending</div></div>
    <div class="kpi k-green"> <div class="kpi-val">${fmt(d.recStatus.Matched||0)}</div>          <div class="kpi-lbl">Clean Records</div>  <div class="kpi-d dg">${pct(d.recStatus.Matched||0,AUD.length)}</div></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Source system health</div><div class="cs">Data_Source_System · Data_Sync_Status</div></div>
      <div class="tbl"><table>
        <tr><th>System</th><th>Total</th><th>Synced</th><th>Failed</th><th>Fail %</th><th>Health</th><th>Action</th></tr>
        ${d.dataSources.map(s=>{
          const fp=s.total>0?((s.failed/s.total)*100).toFixed(1):'0.0';
          const h=s.failed>1000?'Critical':s.failed>500?'Degraded':'Healthy';
          const ht=h==='Critical'?'r':h==='Degraded'?'a':'g';
          const act=h!=='Healthy'?`<button class="btn btn-sec btn-sm" onclick="toast('${h==='Critical'?'Force Sync':'Restart'} — ${s.name}')">${h==='Critical'?'Sync':'Restart'}</button>`:'—';
          return `<tr><td>${s.name}</td><td>${fmt(s.total)}</td><td>${fmt(s.synced)}</td><td style="color:${ht==='g'?'inherit':'var(--red)'}">${fmt(s.failed)}</td><td style="color:${ht==='g'?'inherit':'var(--red)'}">${fp}%</td><td>${bx(h,ht)}</td><td>${act}</td></tr>`;
        }).join('')}
      </table></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Record quality — Record_Status field</div></div>
      ${leg([[C.green,'Matched'],[C.amber,'Pending'],[C.red,'Review Needed'],[C.purple,'Duplicate']])}
      <div class="chart-wrap" style="height:155px"><canvas id="ch_sq"></canvas></div>
      <button class="btn btn-pri" style="width:100%;margin-top:.75rem" onclick="forceSync()">Force Sync All Systems</button>
    </div>
  </div>
  <div class="card">
    <div class="ch"><div class="ct">Sync records — full audit table</div><div class="cs">Audit_Status_Table_Correct1.csv — filterable</div></div>
    <div class="filter-bar">
      <span class="filter-label">Filter:</span>
      <select id="f-syncs" onchange="renderSyncTable()"><option value="">All Sync Status</option><option>True</option><option>False</option></select>
      <select id="f-syncrec" onchange="renderSyncTable()"><option value="">All Record Status</option><option>Matched</option><option>Pending</option><option value="Review Needed">Review Needed</option><option>Duplicate</option></select>
      <select id="f-syncsrc" onchange="renderSyncTable()"><option value="">All Sources</option>${Object.keys(countBy(AUD,'Data_Source_System')).map(s=>`<option>${s}</option>`).join('')}</select>
      <span class="filter-clear" onclick="clearFilters('f-syncs','f-syncrec','f-syncsrc')">Clear</span>
      <span class="result-count" id="sync-count"></span>
    </div>
    <div id="sync-table"></div>
    <div id="sync-pages"></div>
  </div>`;
  setTimeout(()=>{
    mkChart('ch_sq',{type:'bar',data:{labels:['Matched','Pending','Review Needed','Duplicate'],datasets:[{label:'Records',data:[d.recStatus.Matched||0,d.recStatus.Pending||0,d.recStatus['Review Needed']||0,d.recStatus.Duplicate||0],backgroundColor:[C.green,C.amber,C.red,C.purple],borderRadius:5,borderSkipped:false}]},options:{...CB,scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
    renderSyncTable();
  },80);
}
function doLookup(){
  const val=document.getElementById('lu-inp')?.value?.trim();
  if(!val){toast('Enter a vehicle ID');return;}
  const r=vehicleMap[val.toUpperCase()];
  const el=document.getElementById('lu-res'); if(!el) return;
  if(r){
    const today=new Date();today.setHours(0,0,0,0);
    const end=new Date(r.Permit_End_Time);end.setHours(0,0,0,0);
    const valid=r.Permit_Status==='Active'&&end>=today;
    el.innerHTML=`<div class="lookup-result">
      <div class="lr-row"><span>Permit ID</span>  <span class="lr-val">${r.Permit_ID}</span></div>
      <div class="lr-row"><span>Zone</span>         <span class="lr-val">${r.Zone_ID} · ${r.Zone_Name}</span></div>
      <div class="lr-row"><span>Validity</span>     <span class="lr-val" style="color:${valid?'#22c55e':'#f87171'}">${valid?'✓ Active / Valid':'✗ Expired / Invalid'}</span></div>
      <div class="lr-row"><span>Status</span>       <span class="lr-val">${r.Permit_Status}</span></div>
      <div class="lr-row"><span>Expires</span>      <span class="lr-val">${r.Permit_End_Time.slice(0,10)}</span></div>
      <div class="lr-row"><span>Zone type</span>    <span class="lr-val">${r.Zone_Type}</span></div>
    </div>`;
  } else {
    el.innerHTML=`<div class="lookup-result"><div class="lr-row"><span style="color:#f87171">✗ No permit found for <strong>${val.toUpperCase()}</strong> — safe to issue citation.</span></div></div>`;
  }
}
function forceSync(){toast(`Force sync initiated — resolving ${fmt(D.syncFail)} failed records across ${D.dataSources.length} systems…`);}

let pSyncPage=0;
function renderSyncTable(){pSyncPage=0;showSyncPage();}
function showSyncPage(){
  const sync = document.getElementById('f-syncs')?.value||'';
  const rec  = document.getElementById('f-syncrec')?.value||'';
  const src  = document.getElementById('f-syncsrc')?.value||'';
  let rows=AUD;
  if(sync) rows=rows.filter(r=>r.Data_Sync_Status===sync);
  if(rec)  rows=rows.filter(r=>r.Record_Status===rec);
  if(src)  rows=rows.filter(r=>r.Data_Source_System===src);
  const total=rows.length,perPage=50,pages=Math.ceil(total/perPage);
  if(pSyncPage>=pages) pSyncPage=Math.max(0,pages-1);
  const slice=rows.slice(pSyncPage*perPage,(pSyncPage+1)*perPage);
  document.getElementById('sync-count').textContent=`${fmt(total)} records`;
  const tbl=document.getElementById('sync-table');
  const pg =document.getElementById('sync-pages');
  if(!slice.length){tbl.innerHTML=`<div style="padding:2rem;text-align:center;color:var(--t4)">No records match.</div>`;pg.innerHTML='';return;}
  tbl.innerHTML=`<div class="tbl"><table>
    <tr><th>Audit ID</th><th>Transaction</th><th>Data Source</th><th>Sync Status</th><th>Sync Time</th><th>Record Status</th><th>Sensor ID</th><th>Occupancy</th></tr>
    ${slice.map(r=>`<tr>
      <td class="mono">${r.Audit_ID}</td><td class="mono">${r.Transaction_ID}</td>
      <td style="font-size:11px">${r.Data_Source_System}</td>
      <td>${sbx(r.Data_Sync_Status)}</td>
      <td style="font-size:11px;color:var(--t3)">${r.Sync_Time?r.Sync_Time.slice(0,16):'—'}</td>
      <td>${sbx(r.Record_Status)}</td>
      <td class="mono" style="font-size:11px">${r.Sensor_ID||'—'}</td>
      <td>${sbx(r.Sensor_Occupancy_Status)}</td>
    </tr>`).join('')}
  </table></div>`;
  renderPagination(pg,total,perPage,pSyncPage,n=>{pSyncPage=n;showSyncPage();});
}

/* ══════════════════════════════════════════════
   PAGE: REPORTS
══════════════════════════════════════════════ */
function pgReports(c){
  const d=D;
  const appRate=d.totalTx>0?((d.totalAppeals/d.totalTx)*100).toFixed(2):'0.00';
  c.innerHTML=`
  <div class="rk-row">
    ${[['Transaction_Table',fmt(d.totalTx),'Total Transactions',`${Object.keys(d.zoneVol).length} zones`],
       ['Payment_Table',fmtK(d.totalFines),'Total Fines Levied',`${fmtK(d.uncollected)} uncollected`],
       ['Compliance',d.compRate+'%','Payment Compliance',`${fmt(d.payStatus.Unpaid||0)} still unpaid`],
       ['Audit_Table',d.appApprovalRate+'%','Appeal Approval Rate',`${fmt(d.totalAppeals)} total appeals`]
      ].map(([src,val,lbl,note])=>`<div class="rk"><div class="rk-src">${src}</div><div class="rk-val">${val}</div><div class="rk-lbl">${lbl}</div><div class="rk-note">${note}</div></div>`).join('')}
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct">Monthly KPI trend — violations &amp; appeals</div><div class="cs">From your actual CSV data</div></div>
      ${leg([[C.orange,'Violations'],[C.blue,'Appeals']])}
      <div class="chart-wrap" style="height:195px"><canvas id="ch_rt"></canvas></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct">Zone risk ranking</div><div class="cs">Transaction volume from Zone_ID</div></div>
      <div class="tbl"><table>
        <tr><th>#</th><th>Zone</th><th>Name</th><th>Transactions</th><th>Share</th><th>Risk</th></tr>
        ${Object.entries(d.zoneVol).sort((a,b)=>b[1]-a[1]).map(([zid,vol],i)=>{
          const s=pct(vol,d.totalTx);
          const risk=vol>=6300?['r','High']:vol>=6200?['a','Medium']:['n','Low'];
          return `<tr><td style="color:var(--t4);font-weight:600">${i+1}</td><td>${bx(zid,'b')}</td><td style="font-size:11px">${d.zoneNames[zid]||zid}</td><td>${fmt(vol)}</td><td>${s}</td><td>${bx(risk[1],risk[0])}</td></tr>`;
        }).join('')}
      </table></div>
    </div>
  </div>
  <div class="card">
    <div class="ch"><div class="ct">Export reports</div><div class="cs">Based on all 3 CSV tables</div></div>
    <div class="export-grid">
      ${[['📄','Violations Report',`${fmt(d.totalViol)} violations · ${Object.keys(d.violTypes).length} types`],
         ['💳','Revenue Report',`${fmtK(d.totalFines)} levied · ${fmtK(d.totalPaid)} collected`],
         ['🔍','Data Quality',`${fmt(d.syncFail)} failures · ${fmt(d.recStatus.Duplicate||0)} duplicates`],
         ['🗺️','Zone Occupancy',`${Object.keys(d.zoneVol).length} zones`],
         ['⚖️','Appeals Analysis',`${fmt(d.totalAppeals)} appeals · ${d.appStatus.Approved||0} wrongful`],
         ['📊','Executive Summary','All KPIs — board-ready']
        ].map(([ic,title,sub])=>`<div class="export-card" onclick="toast('${title} export initiated…')"><div class="ec-icon">${ic}</div><div class="ec-title">${title}</div><div class="ec-sub">${sub}</div></div>`).join('')}
    </div>
  </div>`;
  setTimeout(()=>{
    const months=Object.keys(d.monthlyViol);
    mkChart('ch_rt',{type:'line',data:{labels:months,datasets:[
      {label:'Violations',data:months.map(m=>d.monthlyViol[m]||0),borderColor:C.orange,tension:.4,pointRadius:3,borderWidth:2,backgroundColor:'transparent'},
      {label:'Appeals',   data:months.map(m=>d.monthlyAppeals[m]||0),borderColor:C.blue,tension:.4,pointRadius:3,borderWidth:1.5,borderDash:[4,3],backgroundColor:'transparent'}
    ]},options:{...CB,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:C.grid},ticks:{font:{size:10},color:C.tick}},x:{grid:{display:false},ticks:{font:{size:10},color:C.tick}}}}});
  },80);
}

/* ══════════════════════════════════════════════
   PERMIT MODAL
══════════════════════════════════════════════ */
function openPermitModal(){
  document.getElementById('modalTitle').textContent='New Permit Application';
  document.getElementById('modalBody').innerHTML=`
  <div class="alert alert-g" style="margin-bottom:.9rem"><span class="alert-icon">✓</span>
    <div>Permit syncs to all enforcement devices in &lt;30 seconds upon approval.</div>
  </div>
  <div class="form-row">
    <div><label class="form-lbl">Vehicle ID <span style="color:var(--red)">*</span></label><input class="form-inp" id="p-vid" placeholder="e.g. V93810"/><div class="form-hint">Duplicate check against all ${fmt(D.totalTx)} records</div></div>
    <div><label class="form-lbl">Permit type <span style="color:var(--red)">*</span></label><select class="form-sel" id="p-type"><option value="">Select type</option><option>Residential</option><option>Commercial</option><option>Visitor Pass</option><option>Contractor Temp</option><option>University Affiliate</option></select></div>
  </div>
  <div class="form-row">
    <div><label class="form-lbl">Zone <span style="color:var(--red)">*</span></label><select class="form-sel" id="p-zone"><option value="">Select zone</option>${Object.entries(D.zoneNames).map(([id,name])=>`<option>${id} — ${name}</option>`).join('')}</select></div>
    <div><label class="form-lbl">Parking Space ID</label><input class="form-inp" id="p-space" placeholder="e.g. S3613"/></div>
  </div>
  <div class="form-row">
    <div><label class="form-lbl">Start Date <span style="color:var(--red)">*</span></label><input class="form-inp" id="p-start" type="date"/></div>
    <div><label class="form-lbl">End Date <span style="color:var(--red)">*</span></label><input class="form-inp" id="p-end" type="date"/></div>
  </div>
  <div class="form-group"><label class="form-lbl">Applicant Full Name <span style="color:var(--red)">*</span></label><input class="form-inp" id="p-name" placeholder="Full legal name"/></div>
  <div class="form-actions"><button class="btn btn-sec" onclick="closeModal()">Cancel</button><button class="btn btn-pri" onclick="submitPermit()">Submit</button></div>`;
  openModal();
}
function submitPermit(){
  const req=['p-vid','p-type','p-zone','p-start','p-end','p-name'];let err=false;
  req.forEach(id=>{const e=document.getElementById(id);if(!e?.value){e?.classList.add('err');err=true;}else e.classList.remove('err');});
  if(err){toast('Please complete all required fields');return;}
  const vid=document.getElementById('p-vid').value.toUpperCase();
  const dup=vehicleMap[vid];
  if(dup&&dup.Permit_Status==='Active') toast(`⚠ Warning: active permit ${dup.Permit_ID} already exists for ${vid}`);
  document.getElementById('modalBody').innerHTML=`<div class="modal-success"><div class="ms-icon">✅</div><div class="ms-title">Permit Submitted!</div><div class="ms-sub">Application for <strong>${vid}</strong> submitted.<br/>Estimated approval: <strong>4.2 hours</strong>.<br/>Syncs instantly to all ${D.dataSources.length} source systems.</div><button class="btn btn-pri" style="margin-top:1rem" onclick="closeModal()">Done</button></div>`;
}
function openModal(){document.getElementById('modal').classList.add('open');}
function closeModal(){document.getElementById('modal').classList.remove('open');}

/* ══════════════════════════════════════════════
   PAGINATION HELPER
══════════════════════════════════════════════ */
function renderPagination(el, total, perPage, current, onPage) {
  const pages=Math.ceil(total/perPage);
  if(pages<=1){el.innerHTML='';return;}
  const start=current*perPage+1, end=Math.min((current+1)*perPage,total);
  let html=`<div class="pagination"><span class="pg-info">Showing ${fmt(start)}–${fmt(end)} of ${fmt(total)}</span>`;
  html+=`<button class="pg-btn" ${current===0?'disabled':''} onclick="(${onPage.toString()})(${current-1})">‹ Prev</button>`;
  const range=pageRange(current,pages);
  range.forEach(p=>{
    if(p==='…') html+=`<span class="pg-btn" style="cursor:default">…</span>`;
    else html+=`<button class="pg-btn${p===current?' active':''}" onclick="(${onPage.toString()})(${p})">${p+1}</button>`;
  });
  html+=`<button class="pg-btn" ${current===pages-1?'disabled':''} onclick="(${onPage.toString()})(${current+1})">Next ›</button></div>`;
  el.innerHTML=html;
}
function pageRange(cur,total){
  if(total<=7) return Array.from({length:total},(_,i)=>i);
  if(cur<4) return [0,1,2,3,4,'…',total-1];
  if(cur>total-5) return [0,'…',total-5,total-4,total-3,total-2,total-1];
  return [0,'…',cur-1,cur,cur+1,'…',total-1];
}

/* ══════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════ */
function clearFilters(...ids){
  ids.forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  // Re-render whichever table is active
  if(document.getElementById('perm-table'))  renderPermitTable();
  if(document.getElementById('viol-table'))  renderViolTable();
  if(document.getElementById('pay-table'))   renderPayTable();
  if(document.getElementById('app-table'))   renderAppTable();
  if(document.getElementById('sync-table'))  renderSyncTable();
}
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3200);
}

window.addEventListener('load', () => autoLoad());