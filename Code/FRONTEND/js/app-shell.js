const NAV={
  student:[["student-dashboard","Dashboard","▣"],["lab-resources","Lab resources","⚗"],["book-resource","Book a resource","＋"],["my-bookings","My bookings","▤"],["lost-and-found","Lost & Found","⌕"],["report-item","Report an item","✎"],["my-claims","My claims","✔"],["profile","Profile","☺"]],
  assistant:[["assistant-dashboard","Dashboard","▣"],["booking-resource-overview","Booking overview","▤"],["lab-resources","Lab resources","⚗"],["lost-and-found","Lost & Found","⌕"],["profile","Profile","☺"]],
  admin:[["admin-dashboard","Dashboard","▣"],["booking-resource-overview","Booking overview","▤"],["lab-resources","Lab resources","⚗"],["claim-management","Claim management","✔"],["lab-utilization-analytics","Lab utilization","▥"],["user-role-overview","Users & roles","☻"],["lost-and-found","Lost & Found","⌕"],["profile","Profile","☺"]]
};
const HOME={
  student:"student-dashboard",assistant:"assistant-dashboard",admin:"admin-dashboard"
};
const ROLE_LABEL={
  student:"Student",assistant:"Lab Assistant",admin:"Administrator"
};
let CURRENT_USER=null;
const getRole=()=>CURRENT_USER?CURRENT_USER.role:null;
async function loadCurrentUser(){
  try{CURRENT_USER=(await api.get("/me")).user}catch(e){CURRENT_USER=null}
  if(CURRENT_USER)DIR[String(CURRENT_USER.id)]={name:CURRENT_USER.name,email:CURRENT_USER.email,rollNo:CURRENT_USER.rollNo,department:CURRENT_USER.department};
  return CURRENT_USER
}
// Staff (lab assistant / admin) need student names, roll numbers and emails for the booking and claim tables.
async function loadDirectory(){
  if(!CURRENT_USER||!["assistant","admin"].includes(CURRENT_USER.role))return;
  try{(await api.get("/directory")).users.forEach(u=>{DIR[String(u.id)]={name:u.name,email:u.email,rollNo:u.rollNo,department:u.department}})}catch(e){}
}
function renderIdentity(){
  if(!$("#who"))return;
  $("#who").textContent=CURRENT_USER.name+" · "+ROLE_LABEL[CURRENT_USER.role];
  $("#av").textContent=CURRENT_USER.name.trim()[0].toUpperCase()
}
function buildShell(){
  const body=document.body,need=body.dataset.role,role=getRole();
  if(!role){
    location.replace("index.html");
    return false
  }
  // UI-only routing hint. This is NOT security; the real backend must enforce roles.
  if(need!=="any"&&!need.split(",").includes(role)){
    location.replace("access-denied.html");
    return false
  }
  const page=body.dataset.page,view=$("#view");
  body.insertAdjacentHTML("afterbegin",`<div class="app"><aside class="sidebar"><div class="brand"><img src="assets/logo.jpg" alt="CampusPulse"></div><nav class="nav" aria-label="Main">${NAV[role].map(n=>`<a href="${n[0]}.html" class="${n[0]===page?"on":""}"><i>${n[2]}</i><span>${n[1]}</span></a>`).join("")}</nav><div class="sidebar-note">Smart Laboratory Resource Allocation &amp; Asset Recovery</div></aside><div class="main"><header class="topbar"><button class="btn ghost sm" id="tog" aria-label="Toggle sidebar">☰</button><span class="sp"></span><span class="badge b-info" id="who"></span><div class="menu"><button class="avatar" id="av" aria-label="Profile menu">${ROLE_LABEL[role][0]}</button><div class="menu-list"><a href="profile.html">Profile</a><button id="out">Sign out</button></div></div></header><main class="content" id="slot"></main></div></div>`);
  $("#slot").appendChild(view);
  renderIdentity();
  $("#tog").onclick=()=>{
    innerWidth<=760?body.classList.toggle("mobile-open"):body.classList.toggle("collapsed")
  };
  $("#av").onclick=e=>{
    e.stopPropagation();
    $(".menu").classList.toggle("open")
  };
  document.onclick=()=>$(".menu")?.classList.remove("open");
  $("#out").onclick=async()=>{
    await api.post("/logout").catch(()=>{});
    location.href="index.html"
  };
  return true
}
document.addEventListener("DOMContentLoaded",async()=>{
  const fn=PAGES[document.body.dataset.page];
  if(!fn)return;
  const user=await loadCurrentUser();
  if(document.body.classList.contains("auth")){
    if(user){location.replace(HOME[user.role]+".html");return}
    fn($("#view"));return
  }
  if(buildShell()){
    await loadDirectory();
    await Store.sweepNow().catch(()=>{});   // expire / complete bookings from their saved timestamps before drawing
    fn($("#view"));
    LIVE.start()
  }
});
// Pressing Back after signing out must not show a cached private page.
addEventListener("pageshow",e=>{if(e.persisted)location.reload()});
