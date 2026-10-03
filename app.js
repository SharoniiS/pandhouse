/* פנדהאוס: הממשק. ניתוב לפי hash, רינדור כ-HTML, ואירועים דרך האצלה על document. */
(function () {
  "use strict";
  const D = window.Domain, DB = window.DB, P = window.Panda, Can = D.Can;
  const $ = id => document.getElementById(id);
  const main = $("main");

  const S = {
    data: { auth: null, me: null, settings: {} },
    maps: null,
    people: { q: "", team: "", status: "" },
    shiftFilter: "",
    wizardStep: 0,
    dialogDone: null,
    toastTimer: null
  };

  /* ---------- עזרים ---------- */
  const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (name, cls) => `<i class="ti ti-${name}${cls ? " " + cls : ""}" aria-hidden="true"></i>`;
  const money = n => `<bdi dir="ltr" class="num">${Math.round(n).toLocaleString("he-IL")} ₪</bdi>`;
  const todayIso = () => D.isoDate(new Date());
  const teamStyle = id => { const t = D.TEAM[id]; return t ? `--team:${t.color};--team-soft:${t.soft}` : ""; };
  const firstName = n => String(n || "").trim().split(/\s+/)[0] || "";
  const MONTHS_IN = ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"];
  const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
  const campName = s => (s && s.campName) || "פנדהאוס";
  // "נועה", "נועה ושירה", "נועה, שירה ומאיה"
  const joinHe = list => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} ו${list[list.length - 1]}`);

  const member = id => S.maps.members[id];
  function av(m, size = 36) {
    if (!m) return "";
    const t = m.teams && m.teams[0] && D.TEAM[m.teams[0].team];
    return P.avatar(m.id, { accent: t && t.color, soft: t && t.soft, size, label: esc(m.name) });
  }
  const personHtml = (m, size = 28) => m ? `<span class="person">${av(m, size)}<span class="nm">${esc(m.name)}</span></span>` : "";
  function avStack(ids, max = 5, size = 28) {
    const list = ids.map(member).filter(Boolean);
    if (!list.length) return "";
    const more = list.length - max;
    return `<span class="av-stack" title="${esc(list.map(m => m.name).join(", "))}">${list.slice(0, max).map(m => av(m, size)).join("")}${more > 0 ? `<span class="av-more">+${more}</span>` : ""}</span>`;
  }
  function teamChip(teamId, lead) {
    const t = D.TEAM[teamId];
    if (!t) return "";
    return `<span class="team-chip${lead ? " lead" : ""}" style="${teamStyle(teamId)}"${lead ? ' title="מוביל/ה"' : ""}>${icon(lead ? "crown" : t.icon)}${esc(t.name)}</span>`;
  }
  const teamTag = teamId => `<span class="tag-team" style="${teamStyle(teamId)}"><span class="dot"></span>${esc(D.TEAM[teamId].name)}</span>`;
  const taskPill = st => { const s = D.TASK_STATUS[st]; return `<span class="pill st-${st}">${icon(s.icon)}${s.label}</span>`; };
  const memberPill = st => { const s = D.MEMBER_STATUS[st] || D.MEMBER_STATUS.maybe; return `<span class="pill ms-${s.id}">${icon(s.icon)}${s.label}</span>`; };
  const dateRange = m => (m.arrive && m.leave ? `${D.dayMonth(m.arrive)} עד ${D.dayMonth(m.leave)}` : "תאריכים עוד לא ידועים");
  const teamMembers = teamId => S.data.members.filter(m => m.teams.some(t => t.team === teamId));
  const teamLeads = teamId => S.data.members.filter(m => m.teams.some(t => t.team === teamId && t.lead));
  const sortByName = list => list.slice().sort((a, b) => a.name.localeCompare(b.name, "he"));

  function eventRange(s) {
    const a = D.parseDate(s.eventStart), b = D.parseDate(s.eventEnd);
    if (!a || !b) return "";
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} עד ${b.getDate()} ${MONTHS_IN[b.getMonth()]}`
      : `${a.getDate()} ${MONTHS_IN[a.getMonth()]} עד ${b.getDate()} ${MONTHS_IN[b.getMonth()]}`;
  }
  function timeAgo(iso) {
    const d = new Date(iso), now = new Date();
    const p = n => String(n).padStart(2, "0");
    if (D.isoDate(d) === D.isoDate(now)) return `היום ${p(d.getHours())}:${p(d.getMinutes())}`;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (D.isoDate(d) === D.isoDate(y)) return "אתמול";
    return `${d.getDate()}.${d.getMonth() + 1}`;
  }
  const shiftSort = (a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.start || "").localeCompare(b.start || "");

  /* ---------- טעינה וניתוב ---------- */
  async function reload() {
    S.data = await DB.load();
    const d = S.data;
    if (d.me) {
      // מי שהתחיל להירשם ולא סיים את האשף עוד לא מופיע ברשימות
      d.members = d.members.filter(m => m.onboarded !== false || m.id === d.me.id);
      S.maps = {
        members: Object.fromEntries(d.members.map(m => [m.id, m])),
        tasks: Object.fromEntries(d.tasks.map(t => [t.id, t])),
        priv: Object.fromEntries(d.privates.map(p => [p.memberId, p]))
      };
    }
    render();
  }

  function route() {
    const parts = (location.hash.replace(/^#\/?/, "") || "home").split("/");
    return { name: parts[0] || "home", arg: decodeURIComponent(parts[1] || ""), sub: parts[2] || "" };
  }

  function view(html, bare) {
    main.innerHTML = html;
    main.classList.toggle("bare", !!bare);
  }

  function render() {
    renderChrome();
    const d = S.data;
    if (!d.auth) return view(renderLogin(), true);
    if (!d.me) return view(renderJoin(), true);
    if (d.me.onboarded === false) return view(renderWizard(), true);
    const r = route();
    switch (r.name) {
      case "teams": return view(renderTeams());
      case "team": return view(renderTeam(r.arg, r.sub));
      case "shifts": return view(renderShifts());
      case "people": return view(renderPeople());
      case "me": return view(renderMe());
      default: return view(renderHome());
    }
  }

  const NAV = [
    { id: "home", label: "בית", icon: "home-2" },
    { id: "teams", label: "צוותים", icon: "users-group" },
    { id: "shifts", label: "משמרות", icon: "calendar-time" },
    { id: "people", label: "משתתפים", icon: "friends" },
    { id: "me", label: "אני", icon: null }
  ];

  function renderChrome() {
    const d = S.data, s = d.settings || {};
    const year = (s.eventStart || "2026").slice(0, 4);
    document.title = campName(s);
    $("brand").innerHTML = `${P.logo(38)}<span><span class="brand-name">${esc(campName(s))}</span><span class="brand-sub">מידברן ${year}</span></span>`;
    const show = !!(d.me && d.me.onboarded !== false);
    const r = route();
    const active = r.name === "team" ? "teams" : (NAV.some(n => n.id === r.name) ? r.name : "home");
    const link = n => `<a href="#/${n.id}" class="${n.id === active ? "active" : ""}"${n.id === active ? ' aria-current="page"' : ""}>${n.icon ? icon(n.icon) : av(d.me, 24)}<span>${n.label}</span></a>`;
    $("topnav").innerHTML = show ? NAV.map(link).join("") : "";
    $("bottomnav").innerHTML = show ? NAV.map(link).join("") : "";
    $("bottomnav").hidden = !show;

    const bar = $("demo-bar");
    if (DB.mode === "local") {
      bar.hidden = false;
      bar.innerHTML = `${icon("flask")}<span><b>מצב הדגמה.</b> האנשים והמשימות מומצאים, והכל נשמר רק בדפדפן הזה.</span><span class="spacer"></span>
        ${d.auth ? `<button type="button" class="linkbtn" data-demo="switch">החלפת משתמש</button>` : ""}
        <button type="button" class="linkbtn" data-demo="reset">איפוס ההדגמה</button>`;
    } else bar.hidden = true;
  }

  /* ---------- כניסה והצטרפות ---------- */
  const inAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|Telegram|; wv\)/i.test(navigator.userAgent);

  function renderLogin() {
    const s = S.data.settings || {};
    const demo = DB.mode === "local" ? DB.demoMembers() : [];
    return `<div class="auth">
      ${P.logo(116)}
      <div class="auth-name"><h1>${esc(campName(s))}</h1>${s.campNameEn ? `<p class="wordmark" lang="en" dir="ltr">${esc(s.campNameEn)}</p>` : ""}</div>
      <p class="lead">מידברן ${esc((s.eventStart || "2026").slice(0, 4))}, ${esc(eventRange(s))}${s.place ? `, ${esc(s.place)}` : ""}.<br>המשימות, המשמרות וכל הפנדות במקום אחד.</p>
      ${inAppBrowser() ? `<div class="warn-box">${icon("external-link")} גוגל לא מאפשר להתחבר מתוך הדפדפן של האפליקציה הזו. צריך לפתוח את הקישור בכרום או בספארי.</div>` : ""}
      <button type="button" class="btn primary" data-demo="google">${icon("brand-google")} כניסה עם Google</button>
      ${demo.length ? `<div class="divider">או להיכנס בתור מישהו מהדוגמה</div>
        <div class="demo-people">${demo.slice(0, 8).map(m => `<button type="button" data-demo-as="${m.id}">${P.avatar(m.id, { size: 28 })}${esc(firstName(m.name))}${m.teams.some(t => t.lead) ? " " + icon("crown") : ""}</button>`).join("")}</div>` : ""}
    </div>`;
  }

  function renderJoin() {
    return `<div class="auth">
      ${P.logo(96)}
      <h1>מה קוד הקאמפ?</h1>
      <p class="lead">הקוד נמצא בקבוצת הוואטסאפ של הקאמפ. ככה רק אנשי הקאמפ רואים את המידע.</p>
      <form id="join-form" novalidate>
        <input class="code" id="join-code" name="code" autocomplete="off" autocapitalize="characters" aria-label="קוד הקאמפ" required>
        <div class="form-error" id="join-error" hidden></div>
        <button type="submit" class="btn primary block">הצטרפות לקאמפ</button>
      </form>
      ${DB.mode === "local" ? `<p class="muted small">בהדגמה הקוד הוא PANDA</p>` : ""}
      <button type="button" class="linkbtn muted" data-signout>יציאה</button>
    </div>`;
  }

  /* ---------- פרופיל (משותף לאשף ולעמוד "אני") ---------- */
  function truckShifts() { return S.data.shifts.filter(s => s.kind !== "team").sort((a, b) => D.TRUCK_KINDS.findIndex(k => k.id === a.kind) - D.TRUCK_KINDS.findIndex(k => k.id === b.kind) || shiftSort(a, b)); }

  function profileSection(part, me) {
    const priv = S.maps.priv[me.id] || { diets: [], allergies: "", needs: "" };
    switch (part) {
      case "about": return `
        <div class="field"><label for="pf-name">שם</label><input id="pf-name" name="pname" type="text" value="${esc(me.name)}" autocomplete="name" required></div>
        <div class="field"><label for="pf-phone">טלפון</label><input id="pf-phone" name="phone" type="tel" inputmode="tel" dir="ltr" style="text-align:right" value="${esc(me.phone)}" autocomplete="tel" placeholder="050-0000000">
          <span class="hint">כדי שאפשר יהיה לשלוח לך וואטסאפ</span></div>
        <div class="field"><span class="lbl" id="pf-st-l">מגיעים?</span>
          <div class="seg" role="radiogroup" aria-labelledby="pf-st-l">${D.MEMBER_STATUSES.map(s => `<label><input type="radio" name="mstatus" value="${s.id}" ${me.status === s.id ? "checked" : ""}><span>${icon(s.icon)}${s.label}</span></label>`).join("")}</div></div>
        <label class="switch"><input type="checkbox" name="ticket" id="pf-ticket" ${me.ticket ? "checked" : ""}><span class="knob"></span><span class="txt">יש לי כרטיס</span></label>`;
      case "teams": return `
        <div class="field"><span class="lbl">באילו צוותים?</span>
          <div class="team-pick">${D.TEAMS.map(t => {
            const mine = me.teams.find(x => x.team === t.id);
            return `<div class="team-opt${mine ? " on" : ""}" style="${teamStyle(t.id)}">
              <label class="head"><input type="checkbox" name="team" value="${t.id}" ${mine ? "checked" : ""}>${icon(t.icon)}<b>${esc(t.name)}</b></label>
              <label class="leadline"${mine ? "" : " hidden"}><input type="checkbox" name="lead" value="${t.id}" ${mine && mine.lead ? "checked" : ""}>${icon("crown")} אני מוביל/ה את הצוות</label>
            </div>`;
          }).join("")}</div></div>
        <label class="switch"><input type="checkbox" name="shiftCoord" ${me.shiftCoord ? "checked" : ""}><span class="knob"></span>
          <span class="txt">אחראי/ת משמרות של כל הקאמפ<small>אפשר לערוך את כל המשמרות</small></span></label>`;
      case "truck": {
        const list = truckShifts();
        if (!list.length) return "";
        return `<div class="field"><span class="lbl">איזו משמרת לוגיסטית לוקחים?</span>
          <div class="truck-pick">${list.map(sh => {
            const k = D.TRUCK_KIND[sh.kind];
            return `<label class="truck-opt"><input type="checkbox" name="truck" value="${sh.id}" ${sh.memberIds.includes(me.id) ? "checked" : ""}>${icon(k.icon)}
              <span class="txt"><b>${esc(sh.title)}</b><small>${sh.date ? `${D.weekday(sh.date)} ${D.dayMonth(sh.date)}` : "תאריך ייקבע"}, ${sh.memberIds.length}${sh.capacity ? ` מתוך ${sh.capacity}` : ""} רשומים</small></span></label>`;
          }).join("")}</div></div>`;
      }
      case "arrival": return `
        <div class="row2">
          <div class="field"><label for="pf-arrive">מגיעים ב</label><input id="pf-arrive" name="arrive" type="date" value="${esc(me.arrive)}"></div>
          <div class="field"><label for="pf-leave">עוזבים ב</label><input id="pf-leave" name="leave" type="date" value="${esc(me.leave)}"></div>
        </div>`;
      case "food": return `
        <div class="field"><span class="lbl">העדפות אוכל</span>
          <div class="chip-pick">${D.DIETS.map(d => `<label><input type="checkbox" name="diet" value="${esc(d)}" ${(priv.diets || []).includes(d) ? "checked" : ""}><span>${esc(d)}</span></label>`).join("")}</div>
          <span class="lock-note">${icon("lock")} רק את/ה ומובילי המטבח רואים</span></div>
        <div class="field"><label for="pf-allergies">אלרגיות</label><input id="pf-allergies" name="allergies" type="text" value="${esc(priv.allergies)}" placeholder="למשל: אגוזים">
          <span class="lock-note">${icon("lock")} רק את/ה ומובילי המטבח רואים</span></div>
        <div class="field"><label for="pf-needs">צרכים להתארגנות</label><textarea id="pf-needs" name="needs" placeholder="למשל: צריך טרמפ, ישן בקרוואן">${esc(priv.needs)}</textarea>
          <span class="lock-note">${icon("lock")} רק את/ה ומובילי הלוגיסטיקה רואים</span></div>`;
    }
    return "";
  }

  function collectProfile(form) {
    const fd = new FormData(form);
    const has = n => !!form.querySelector(`[name="${n}"]`);
    const patch = {};
    if (has("pname")) patch.name = String(fd.get("pname") || "").trim();
    if (has("phone")) patch.phone = String(fd.get("phone") || "").trim();
    if (has("mstatus")) patch.status = fd.get("mstatus") || "maybe";
    if (has("ticket")) patch.ticket = form.querySelector('[name="ticket"]').checked;
    if (form.querySelector(".team-pick")) {
      const leads = new Set(fd.getAll("lead"));
      patch.teams = fd.getAll("team").map(t => ({ team: t, lead: leads.has(t) }));
    }
    if (has("shiftCoord")) patch.shiftCoord = form.querySelector('[name="shiftCoord"]').checked;
    if (has("arrive")) { patch.arrive = fd.get("arrive") || ""; patch.leave = fd.get("leave") || ""; }
    const priv = has("allergies") ? { diets: fd.getAll("diet"), allergies: String(fd.get("allergies") || "").trim(), needs: String(fd.get("needs") || "").trim() } : null;
    const truck = form.querySelector(".truck-pick") ? fd.getAll("truck") : null;
    return { patch, priv, truck };
  }

  function validateProfile(p) {
    if ("name" in p && !p.name) return "חסר שם.";
    if ("phone" in p && p.phone.replace(/\D/g, "").length < 9) return "מספר הטלפון לא נראה שלם.";
    if (p.arrive && p.leave && p.leave < p.arrive) return "תאריך העזיבה יוצא לפני תאריך ההגעה.";
    return "";
  }

  const WIZARD = [
    { title: "נעים להכיר", parts: ["about"] },
    { title: "צוותים ומשמרת", parts: ["teams", "truck"] },
    { title: "הגעה ואוכל", parts: ["arrival", "food"] }
  ];

  function renderWizard() {
    const me = S.data.me, i = S.wizardStep, step = WIZARD[i];
    return `<form class="wizard form" id="wizard-form" novalidate>
      <div class="steps" aria-hidden="true">${WIZARD.map((_, k) => `<span class="${k <= i ? "on" : ""}"></span>`).join("")}</div>
      <div class="profile-head">${av(me, 64)}<div><p class="eyebrow">שלב ${i + 1} מתוך ${WIZARD.length}</p><h1>${step.title}</h1></div></div>
      ${step.parts.map(p => profileSection(p, me)).join("")}
      <div class="form-error" id="form-error" hidden></div>
      <div class="sticky-actions">
        <button type="submit" class="btn primary">${i === WIZARD.length - 1 ? `${icon("check")} סיום` : `הבא ${icon("arrow-left")}`}</button>
        ${i > 0 ? `<button type="button" class="btn ghost" data-wizard-back>חזרה</button>` : ""}
      </div>
    </form>`;
  }

  async function submitProfile(form, isWizard) {
    const { patch, priv, truck } = collectProfile(form);
    const err = validateProfile(patch);
    const box = form.querySelector(".form-error");
    if (err) { box.textContent = err; box.hidden = false; return; }
    if (isWizard && S.wizardStep === WIZARD.length - 1) patch.onboarded = true;
    try {
      await DB.saveProfile(patch, priv, truck);
    } catch (e) { box.textContent = e.message; box.hidden = false; return; }
    if (isWizard) {
      if (S.wizardStep < WIZARD.length - 1) { S.wizardStep++; await reload(); window.scrollTo(0, 0); return; }
      S.wizardStep = 0;
      location.hash = "#/home";
      await reload();
      toast("ברוכים הבאים לקאמפ!");
      return;
    }
    await reload();
    toast("הפרופיל נשמר");
  }

  /* ---------- בית ---------- */
  // כרטיס צוות: צבע הצוות ברקע עדין, מי מוביל, כמה משימות פתוחות בכל סטטוס, וכמה הושלמו
  function teamTile(team) {
    const tasks = S.data.tasks.filter(t => t.team === team.id);
    const c = D.taskCounts(tasks);
    const ms = teamMembers(team.id).filter(m => m.status !== "out");
    const leads = teamLeads(team.id);
    const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
    const chips = ["blocked", "doing", "todo", "idea"].filter(s => c[s])
      .map(s => `<span class="mini-pill st-${s}">${icon(D.TASK_STATUS[s].icon)}${D.TASK_STATUS[s].label} <b>${c[s]}</b></span>`).join("");
    return `<a class="team-tile" href="#/team/${team.id}" style="${teamStyle(team.id)}">
      <span class="tile-mark" aria-hidden="true">${icon(team.icon)}</span>
      <div class="top"><span class="team-ico">${icon(team.icon)}</span>
        <div class="ttl"><h3>${esc(team.name)}</h3>${leads.length
          ? `<div class="lead-line">${avStack(leads.map(m => m.id), 3, 22)}<span>בהובלת ${esc(joinHe(leads.map(m => firstName(m.name))))}</span></div>`
          : `<div class="noleads">מחפשים מוביל/ה</div>`}</div></div>
      <div class="chips">${chips || `<span class="muted small">${c.total ? "כל המשימות הושלמו" : "עוד אין משימות"}</span>`}</div>
      <div class="foot">
        <span class="people">${ms.length ? `${avStack(ms.map(m => m.id), 4, 24)}<span>${ms.length} בצוות</span>` : `<span class="muted">עוד אין אנשים</span>`}</span>
        ${c.total ? `<span class="prog" title="${c.done} מתוך ${c.total} משימות הושלמו"><span class="track"><span style="width:${pct}%"></span></span>${c.done} מתוך ${c.total} הושלמו</span>` : ""}
      </div>
    </a>`;
  }

  function miniTaskRow(t) {
    const me = S.data.me;
    return `<button type="button" class="mini-row" data-task="${t.id}" style="${teamStyle(t.team)}"><span class="bar"></span>
      <span class="grow"><span class="t">${esc(t.title)}</span><span class="s">${esc(D.TEAM[t.team].name)}, ${t.ownerId === me.id ? "באחריותך" : "בעזרתך"}</span></span>${taskPill(t.status)}</button>`;
  }
  function miniShiftRow(sh) {
    const when = sh.date ? `${D.weekday(sh.date)} ${D.dayMonth(sh.date)}${sh.start ? `, ${sh.start}` : ""}` : "תאריך ייקבע";
    return `<a class="mini-row" href="#/shifts" style="${teamStyle(sh.team)};text-decoration:none;color:inherit"><span class="bar"></span>
      <span class="grow"><span class="t">${esc(sh.title)}</span><span class="s">${esc(when)}</span></span>${icon("chevron-left", "muted")}</a>`;
  }

  function renderHome() {
    const { me, settings, tasks, shifts, activity } = S.data;
    const cd = D.countdown(todayIso(), settings.eventStart, settings.eventEnd);
    const countLine = cd.phase === "before" ? (cd.days === 2 ? "עוד <b>יומיים</b> למידברן" : `עוד <b>${cd.days}</b> ימים למידברן`)
      : cd.phase === "tomorrow" ? "<b>מחר</b> יוצאים למדבר"
      : cd.phase === "during" ? `יום <b>${cd.day}</b> במידברן` : "נתראה במידברן הבא";

    const nags = [];
    if (!me.teams.length) nags.push({ ic: "users-plus", text: "עוד לא הצטרפת לאף צוות", go: "#/teams", btn: "לצוותים" });
    if (truckShifts().length && !shifts.some(s => s.kind !== "team" && s.memberIds.includes(me.id)))
      nags.push({ ic: "truck", text: "עוד לא בחרת משמרת לוגיסטית", go: "#/shifts", btn: "לבחירה" });

    const order = Object.fromEntries(D.TASK_STATUS_VIEW_ORDER.map((s, i) => [s, i]));
    const myTasks = tasks.filter(t => t.status !== "done" && (t.ownerId === me.id || t.helperIds.includes(me.id)))
      .sort((a, b) => order[a.status] - order[b.status]);
    const myShifts = shifts.filter(s => s.memberIds.includes(me.id)).sort(shiftSort);
    const blocked = tasks.filter(t => t.status === "blocked");
    const ownerless = tasks.filter(t => !t.ownerId && (t.status === "todo" || t.status === "doing"));
    const feed = activity.slice().reverse().slice(0, 6);

    return `
      <section class="hero">
        <div class="hero-text">
          <p class="eyebrow">${esc(eventRange(settings))}${settings.place ? `, ${esc(settings.place)}` : ""}</p>
          <h1>היי ${esc(firstName(me.name))}</h1>
          <p class="count">${countLine}</p>
        </div>
        ${P.hero()}
      </section>

      ${nags.map(n => `<div class="callout">${icon(n.ic)}<p>${n.text}</p><a class="btn small primary" href="${n.go}">${n.btn}</a></div>`).join("")}

      <section class="section">
        <div class="section-head"><h2>מה עליי</h2></div>
        <div class="mine">
          <div class="card"><div class="section-head"><h3>המשימות שלי</h3><span class="count-badge">${myTasks.length}</span></div>
            ${myTasks.length ? `<div class="mini-list">${myTasks.map(miniTaskRow).join("")}</div>` : `<p class="muted small" style="padding-top:8px">אין משימות פתוחות. אפשר להצטרף לעזור במשימה של אחד הצוותים.</p>`}</div>
          <div class="card"><div class="section-head"><h3>המשמרות שלי</h3><span class="count-badge">${myShifts.length}</span></div>
            ${myShifts.length ? `<div class="mini-list">${myShifts.map(miniShiftRow).join("")}</div>` : `<p class="muted small" style="padding-top:8px">עוד לא נרשמת למשמרות.</p>`}</div>
        </div>
      </section>

      ${blocked.length || ownerless.length ? `<section class="section">
        <div class="section-head"><h2>${icon("hand-stop")} צריך עזרה</h2></div>
        ${blocked.length ? `<div class="help-list">${blocked.map(t => taskCard(t, true)).join("")}</div>` : ""}
        ${ownerless.length ? `<div class="card"><div class="section-head"><h3>משימות בלי אחראי/ת</h3><span class="count-badge">${ownerless.length}</span></div>
          <div class="mini-list">${ownerless.map(t => `<button type="button" class="mini-row" data-task="${t.id}" style="${teamStyle(t.team)}"><span class="bar"></span><span class="grow"><span class="t">${esc(t.title)}</span><span class="s">${esc(D.TEAM[t.team].name)}</span></span>${taskPill(t.status)}</button>`).join("")}</div></div>` : ""}
      </section>` : ""}

      <section class="section">
        <div class="section-head"><h2>הצוותים</h2></div>
        <div class="teams-grid">${D.TEAMS.map(teamTile).join("")}</div>
      </section>

      ${feed.length ? `<section class="section">
        <div class="section-head"><h2>מה חדש בקאמפ</h2></div>
        <div class="card feed">${feed.map(feedRow).join("")}</div>
      </section>` : ""}`;
  }

  function feedRow(a) {
    const m = member(a.actorId);
    return `<div class="feed-row">${m ? av(m, 32) : P.avatar("x", { size: 32 })}
      <div class="txt"><b>${esc(m ? m.name : "מישהו שעזב")}</b><div>${esc(a.text)}</div></div><time datetime="${esc(a.at)}">${esc(timeAgo(a.at))}</time></div>`;
  }

  /* ---------- צוותים ---------- */
  function renderTeams() {
    return `<section class="section">
      <div class="section-head"><h1>צוותים</h1></div>
      <div class="teams-grid">${D.TEAMS.map(teamTile).join("")}</div>
    </section>`;
  }

  function taskCard(t, showTeam) {
    const owner = t.ownerId && member(t.ownerId);
    const deps = (t.deps || []).map(id => S.maps.tasks[id]).filter(Boolean);
    return `<div class="task-card" role="button" tabindex="0" data-task="${t.id}" style="${teamStyle(t.team)}">
      <div class="top"><span class="chips">${taskPill(t.status)}${showTeam ? teamTag(t.team) : ""}</span>${t.cost ? `<span class="cost">${money(t.cost)}</span>` : ""}</div>
      <h3>${esc(t.title)}</h3>
      ${t.status === "blocked" && t.blockedReason ? `<div class="blocked-note">${icon("alert-triangle")}<span><b>חסר:</b> ${esc(t.blockedReason)}</span></div>` : ""}
      ${deps.length ? `<div class="deps">${icon("link")}<span>מחכה ל:</span>${deps.map(depChip).join("")}</div>` : ""}
      <div class="meta">${owner ? personHtml(owner, 26) : `<span class="muted">${icon("user-question")} בלי אחראי/ת</span>`}${avStack(t.helperIds, 4, 24)}</div>
    </div>`;
  }
  const depChip = dep => `<span class="dep-chip${dep.status !== "done" ? " open" : ""}" style="${teamStyle(dep.team)}"><span class="dot"></span>${esc(dep.title)}${dep.status === "done" ? " " + icon("check") : ` <span class="muted">(${D.TASK_STATUS[dep.status].label})</span>`}</span>`;

  function renderTeam(teamId, tab) {
    const team = D.TEAM[teamId];
    if (!team) { location.hash = "#/teams"; return ""; }
    const me = S.data.me;
    const mine = me.teams.find(t => t.team === teamId);
    const leads = teamLeads(teamId);
    const tasks = S.data.tasks.filter(t => t.team === teamId);
    const shifts = S.data.shifts.filter(s => s.team === teamId).sort(shiftSort);
    const people = teamMembers(teamId);
    const tabs = [
      { id: "tasks", label: "משימות", n: tasks.length },
      { id: "shifts", label: "משמרות", n: shifts.length },
      { id: "people", label: "אנשים", n: people.length }
    ];
    if (teamId === "kitchen") tabs.push({ id: "food", label: "אוכל" });
    if (teamId === "finance") tabs.push({ id: "budget", label: "תקציב" });
    if (teamId === "logistics" && Can.isLead(me, "logistics")) tabs.push({ id: "needs", label: "צרכים" });
    const cur = tabs.some(t => t.id === tab) ? tab : "tasks";

    let body = "";
    if (cur === "tasks") body = teamTasksTab(team, tasks);
    else if (cur === "shifts") body = teamShiftsTab(team, shifts);
    else if (cur === "people") body = teamPeopleTab(team, people);
    else if (cur === "food") body = foodTab();
    else if (cur === "budget") body = budgetTab();
    else if (cur === "needs") body = needsTab();

    return `<div style="${teamStyle(teamId)};display:contents">
      <section class="team-head">
        <a class="back" href="#/teams">${icon("chevron-right")} כל הצוותים</a>
        <div class="row1"><span class="team-ico">${icon(team.icon)}</span><h1>${esc(team.name)}</h1></div>
        <div class="leads">${leads.length
          ? leads.map(m => `<button type="button" class="lead-badge" data-member="${m.id}" style="border:0;cursor:pointer">${av(m, 26)}${esc(m.name)} ${icon("crown")}</button>`).join("")
          : `<span>${icon("alert-triangle")} אין עדיין מוביל/ה לצוות</span>`}</div>
        <div class="actions">${mine
          ? `<span class="me-tag">${icon(mine.lead ? "crown" : "circle-check")} ${mine.lead ? "בהובלתך" : "חלק מהצוות"}</span>`
          : `<button type="button" class="btn solid small" data-join-team="${teamId}">${icon("user-plus")} הצטרפות לצוות</button>`}
          ${!mine || !mine.lead ? `<button type="button" class="btn small" data-lead-team="${teamId}">${icon("crown")} להוביל את הצוות</button>` : ""}</div>
      </section>
      <nav class="tabs" aria-label="חלקי הצוות">${tabs.map(t => `<a href="#/team/${teamId}/${t.id}" class="${t.id === cur ? "active" : ""}">${t.label}${t.n != null ? ` <span class="n">${t.n}</span>` : ""}</a>`).join("")}</nav>
      ${body}
    </div>`;
  }

  function emptyState(text, btn) {
    return `<div class="card empty">${P.sleepy(72)}<p>${text}</p>${btn || ""}</div>`;
  }

  function teamTasksTab(team, tasks) {
    const me = S.data.me;
    const lead = Can.addTaskAnyStatus(me, team.id);
    const addBtn = `<button type="button" class="btn ${lead ? "team" : ""} small" data-new-task="${team.id}">${icon(lead ? "plus" : "bulb")} ${lead ? "משימה חדשה" : "הצעת רעיון"}</button>`;
    if (!tasks.length) return emptyState("אין עדיין משימות בצוות הזה.", addBtn);
    const groups = D.TASK_STATUS_VIEW_ORDER.map(st => ({ st, list: tasks.filter(t => t.status === st) })).filter(g => g.list.length);
    return `<section class="section">
      <div class="section-head"><span class="muted small">${tasks.length} משימות</span>${addBtn}</div>
      ${groups.map(g => g.st === "done"
        ? `<details class="status-group"><summary class="group-head">${taskPill("done")}<span class="n">${g.list.length}</span>${icon("chevron-down", "muted")}</summary><div class="task-grid">${g.list.map(t => taskCard(t)).join("")}</div></details>`
        : `<div class="status-group"><div class="group-head">${taskPill(g.st)}<span class="n">${g.list.length}</span></div><div class="task-grid">${g.list.map(t => taskCard(t)).join("")}</div></div>`).join("")}
    </section>`;
  }

  function teamShiftsTab(team, shifts) {
    const me = S.data.me;
    const add = Can.addShift(me, team.id) ? `<button type="button" class="btn team small" data-new-shift="${team.id}">${icon("plus")} משמרת חדשה</button>` : "";
    if (!shifts.length) return emptyState("אין עדיין משמרות לצוות הזה.", add);
    return `<section class="section">
      <div class="section-head"><span class="muted small">${shifts.length} משמרות</span>${add}</div>
      <div class="shift-list">${shifts.map(sh => shiftCard(sh, true)).join("")}</div>
    </section>`;
  }

  function teamPeopleTab(team, people) {
    if (!people.length) return emptyState("עוד אין אנשים בצוות הזה.", `<button type="button" class="btn team small" data-join-team="${team.id}">${icon("user-plus")} הצטרפות לצוות</button>`);
    const isLead = m => m.teams.some(t => t.team === team.id && t.lead);
    const list = sortByName(people).sort((a, b) => isLead(b) - isLead(a));
    return `<div class="people-list">${list.map(personCard).join("")}</div>`;
  }

  /* ---------- אוכל, תקציב, צרכים ---------- */
  function headcountChart() {
    const { members, settings } = S.data;
    const r = D.campRange(members, settings.eventStart, settings.eventEnd);
    const days = D.headcountByDay(members, r.from, r.to);
    const max = Math.max(1, ...days.map(d => d.sure + d.maybe));
    const peak = days.reduce((a, b) => (b.sure > a.sure ? b : a), days[0]);
    const readout = peak && peak.sure ? `הכי הרבה: ${peak.sure} בפנים, ${D.weekday(peak.date)} ${D.dayMonth(peak.date)}` : "עוד אין תאריכי הגעה";
    const cols = days.map(d => {
      const inEvent = d.date >= settings.eventStart && d.date <= settings.eventEnd;
      const lbl = `${D.weekday(d.date)} ${D.dayMonth(d.date)}: ${d.sure} בפנים${d.maybe ? `, ועוד ${d.maybe} על הגדר` : ""}`;
      const h = n => (n ? Math.max(3, (n / max) * 100) : 0);
      return `<div class="hc-col${inEvent ? " evt" : ""}" tabindex="0" aria-label="${esc(lbl)}" data-readout="${esc(lbl)}">
        <div class="hc-plot">${d.maybe ? `<span class="maybe" style="height:${h(d.maybe)}%"></span>` : ""}${d.sure ? `<span class="sure${d.maybe ? "" : " top"}" style="height:${h(d.sure)}%"></span>` : ""}</div>
        <div class="hc-lbl"><b>${d.sure}</b>${D.weekday(d.date).replace("יום ", "")}<br>${D.dayMonth(d.date)}</div>
      </div>`;
    }).join("");
    return `<div class="card chart-card">
      <div class="section-head"><h3>כמה פנדות בקאמפ בכל יום</h3>
        <div class="legend"><span><i class="sw sw-sure"></i>בפנים</span><span><i class="sw sw-maybe"></i>על הגדר</span><span><i class="sw sw-event"></i>ימי האירוע</span></div></div>
      <p class="hc-readout" data-default="${esc(readout)}" aria-live="polite">${esc(readout)}</p>
      <div class="chart-wrap"><div class="hc">${cols}</div></div>
    </div>`;
  }

  function foodTab() {
    const me = S.data.me;
    const sum = S.data.dietSummary;
    const lead = Can.isLead(me, "kitchen");
    let detail;
    if (lead) {
      const rows = sortByName(S.data.members.filter(m => m.status !== "out"))
        .map(m => ({ m, p: S.maps.priv[m.id] }))
        .filter(x => x.p && ((x.p.diets || []).length || (x.p.allergies || "").trim()));
      detail = `<div class="card"><div class="section-head"><h3>פירוט לפי אנשים</h3><span class="lock-note">${icon("lock")} רק מובילי המטבח רואים</span></div>
        ${rows.length ? `<div class="table-wrap"><table class="plain"><thead><tr><th>שם</th><th>העדפות</th><th>אלרגיות</th></tr></thead><tbody>
          ${rows.map(({ m, p }) => `<tr><td>${personHtml(m, 24)}</td><td>${esc((p.diets || []).join(", ") || "הכל")}</td><td>${p.allergies ? `<b style="color:var(--st-blocked)">${esc(p.allergies)}</b>` : ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">אף אחד עוד לא סימן העדפות או אלרגיות.</p>`}</div>`;
    } else {
      detail = `<p class="lock-note">${icon("lock")} את הפירוט לפי שמות רואים רק מובילי המטבח.</p>`;
    }
    return `${headcountChart()}
      <div class="card"><div class="section-head"><h3>העדפות אוכל של מי שבפנים</h3><span class="muted small">${sum.people} אנשים</span></div>
        <div class="diet-grid" style="margin-top:10px">${D.DIETS.map(d => `<div class="stat"><b>${sum.counts[d]}</b><span>${esc(d)}</span></div>`).join("")}
          <div class="stat"><b style="color:var(--st-blocked)">${sum.allergies}</b><span>עם אלרגיה</span></div></div></div>
      ${detail}`;
  }

  function budgetTab() {
    const { tasks, members } = S.data;
    const rows = D.budgetByTeam(tasks);
    const total = rows.reduce((s, r) => s + r.total, 0);
    const ideas = rows.reduce((s, r) => s + r.ideas, 0);
    const max = Math.max(1, ...rows.map(r => r.total));
    const inCount = members.filter(m => m.status === "in").length;
    const costed = tasks.filter(t => t.cost > 0 && t.status !== "idea").sort((a, b) => b.cost - a.cost);
    return `<div class="card budget">
        <div><div class="muted small">עלות משוערת של כל המשימות (בלי רעיונות)</div><div class="big-num">${money(total)}</div>
          ${inCount ? `<p class="muted small">בחלוקה שווה בין ${inCount} שבפנים: ${money(total / inCount)} לכל אחד ואחת</p>` : ""}
          ${ideas ? `<p class="muted small">ועוד ${money(ideas)} ברעיונות שעוד לא אושרו</p>` : ""}</div>
        ${rows.map(r => { const t = D.TEAM[r.team]; return `<div class="budget-row" style="${teamStyle(r.team)}">
          <span class="lbl">${icon(t.icon)}${esc(t.name)}</span>
          <span class="track"><span style="width:${(r.total / max) * 100}%"${r.total ? "" : ' hidden'}></span></span>
          <span class="val">${money(r.total)}</span></div>`; }).join("")}
      </div>
      <div class="card"><div class="section-head"><h3>משימות עם עלות</h3></div>
        ${costed.length ? `<div class="table-wrap"><table class="plain"><thead><tr><th>משימה</th><th>צוות</th><th>סטטוס</th><th>עלות</th></tr></thead><tbody>
          ${costed.map(t => `<tr><td><button type="button" class="linkbtn" data-task="${t.id}" style="text-align:start">${esc(t.title)}</button></td><td>${teamTag(t.team)}</td><td>${taskPill(t.status)}</td><td class="num">${money(t.cost)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">עוד אין משימות עם עלות משוערת.</p>`}</div>`;
  }

  function needsTab() {
    const rows = sortByName(S.data.members.filter(m => m.status !== "out"))
      .map(m => ({ m, p: S.maps.priv[m.id] })).filter(x => x.p && (x.p.needs || "").trim());
    return `<div class="card"><div class="section-head"><h3>צרכים להתארגנות</h3><span class="lock-note">${icon("lock")} רק מובילי הלוגיסטיקה רואים</span></div>
      ${rows.length ? `<div class="table-wrap"><table class="plain"><thead><tr><th>שם</th><th>מתי</th><th>מה צריך</th></tr></thead><tbody>
        ${rows.map(({ m, p }) => `<tr><td>${personHtml(m, 24)}</td><td class="num">${esc(dateRange(m))}</td><td>${esc(p.needs)}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="muted">אף אחד עוד לא כתב צרכים.</p>`}</div>`;
  }

  /* ---------- משמרות ---------- */
  function shiftCard(sh, showDate) {
    const me = S.data.me;
    const n = sh.memberIds.length, cap = sh.capacity;
    const mine = sh.memberIds.includes(me.id);
    const full = !!cap && n >= cap;
    const need = cap ? Math.max(cap - n, 0) : 0;
    const k = D.TRUCK_KIND[sh.kind];
    const dateTxt = sh.date ? `${D.weekday(sh.date)} ${D.dayMonth(sh.date)}` : "";
    const timeBox = sh.start
      ? `<div class="shift-time">${showDate && dateTxt ? `<small>${esc(dateTxt)}</small>` : ""}<b>${esc(sh.start)}</b>${sh.end ? `<small>עד ${esc(sh.end)}</small>` : ""}</div>`
      : `<div class="shift-time">${icon(k ? k.icon : "calendar")}<small>${sh.date ? esc(dateTxt) : "תאריך ייקבע"}</small></div>`;
    return `<article class="shift-card" style="${teamStyle(sh.team)}">
      ${timeBox}
      <div class="shift-body">
        <div class="top"><h3>${esc(sh.title)}</h3>${Can.editShift(me, sh) ? `<button type="button" class="icon-btn" data-shift-edit="${sh.id}" aria-label="עריכת המשמרת">${icon("pencil")}</button>` : ""}</div>
        <div class="where">${teamTag(sh.team)}${sh.place ? `<span>${icon("map-pin")} ${esc(sh.place)}</span>` : ""}</div>
        ${sh.notes ? `<p class="small muted">${esc(sh.notes)}</p>` : ""}
        <div class="fill">${cap
          ? `<div class="fill-bar"><span style="width:${Math.min(100, (n / cap) * 100)}%"></span></div><span class="txt${need ? " need" : ""}">${n} מתוך ${cap}${need ? `, חסרים ${need}` : ", מלא"}</span>`
          : `<span class="txt">${n} נרשמו</span>`}</div>
        <div class="shift-actions">
          ${n ? `<button type="button" class="linkbtn" data-shift-people="${sh.id}" style="text-decoration:none" aria-label="מי במשמרת">${avStack(sh.memberIds, 6, 28)}</button>` : `<span class="muted small">עוד אין נרשמים</span>`}
          ${mine
            ? `<span><span class="signed">${icon("circle-check")} נרשמת</span> <button type="button" class="btn small ghost" data-signup="${sh.id}">ביטול</button></span>`
            : `<button type="button" class="btn small primary" data-signup="${sh.id}"${full ? " disabled" : ""}>${full ? "המשמרת מלאה" : "הרשמה"}</button>`}
        </div>
      </div>
    </article>`;
  }

  function renderShifts() {
    const { me, shifts } = S.data;
    const f = S.shiftFilter;
    const teamsWith = D.TEAMS.filter(t => shifts.some(s => s.team === t.id));
    const mineCount = shifts.filter(s => s.memberIds.includes(me.id)).length;
    const list = shifts.filter(s => !f || (f === "mine" ? s.memberIds.includes(me.id) : s.team === f));
    const truck = list.filter(s => s.kind !== "team").sort((a, b) => D.TRUCK_KINDS.findIndex(k => k.id === a.kind) - D.TRUCK_KINDS.findIndex(k => k.id === b.kind));
    const rest = list.filter(s => s.kind === "team").sort(shiftSort);
    const byDay = {};
    for (const s of rest) (byDay[s.date || ""] = byDay[s.date || ""] || []).push(s);
    const days = Object.keys(byDay).sort((a, b) => (a || "9999").localeCompare(b || "9999"));
    const noTruck = truckShifts().length && !shifts.some(s => s.kind !== "team" && s.memberIds.includes(me.id));
    const chip = (id, label, n, team) => `<button type="button" class="fchip" data-sf="${id}" aria-pressed="${f === id}"${team ? ` style="${teamStyle(team)}"` : ""}>${team ? `<span class="dot"></span>` : ""}${label}${n != null ? ` <span class="n">${n}</span>` : ""}</button>`;

    return `<section class="section">
      <div class="section-head"><h1>משמרות</h1>${Can.addAnyShift(me) ? `<button type="button" class="btn primary small" data-new-shift="">${icon("plus")} משמרת חדשה</button>` : ""}</div>
      <div class="filter-row">${chip("", "הכל", shifts.length)}${chip("mine", "שלי", mineCount)}${teamsWith.map(t => chip(t.id, esc(t.name), shifts.filter(s => s.team === t.id).length, t.id)).join("")}</div>
    </section>
    ${noTruck && !f ? `<div class="callout">${icon("truck")}<p>כל אחד לוקח לפחות משמרת לוגיסטית אחת. עוד לא נרשמת.</p></div>` : ""}
    ${truck.length ? `<section class="section"><div class="section-head"><h2>${icon("truck")} המשמרות הלוגיסטיות</h2></div>
      <div class="truck-row">${truck.map(sh => shiftCard(sh, true)).join("")}</div></section>` : ""}
    ${days.map(d => `<section class="section">
      <div class="day-head"><h2>${d ? esc(D.weekday(d)) : "בלי תאריך עדיין"}</h2>${d ? `<span class="muted">${esc(D.dayMonth(d))}</span>` : ""}</div>
      <div class="shift-list">${byDay[d].map(sh => shiftCard(sh, false)).join("")}</div></section>`).join("")}
    ${!list.length ? emptyState(f === "mine" ? "עוד לא נרשמת לאף משמרת." : "אין משמרות כאן עדיין.") : ""}`;
  }

  /* ---------- משתתפים ---------- */
  function personCard(m) {
    return `<div class="person-card" role="button" tabindex="0" data-member="${m.id}">
      ${av(m, 48)}
      <div class="info">
        <div class="line1"><span class="nm">${esc(m.name || "בלי שם")}</span>${memberPill(m.status)}${m.ticket ? `<span class="muted" title="יש כרטיס">${icon("ticket")}</span>` : ""}</div>
        ${m.teams.length ? `<div class="chips">${m.teams.map(t => teamChip(t.team, t.lead)).join("")}</div>` : ""}
        <div class="dates">${m.status !== "out" ? `<span>${icon("calendar")} ${esc(dateRange(m))}</span>` : ""}${m.shiftCoord ? `<span>${icon("calendar-time")} אחראי/ת משמרות</span>` : ""}</div>
      </div>
    </div>`;
  }

  function filteredPeople() {
    const f = S.people, q = f.q.trim();
    return sortByName(S.data.members).filter(m =>
      (!q || m.name.includes(q)) &&
      (!f.team || (f.team === "none" ? !m.teams.length : m.teams.some(t => t.team === f.team))) &&
      (!f.status || m.status === f.status));
  }

  function renderPeople() {
    const { members } = S.data;
    const f = S.people;
    const cnt = st => members.filter(m => m.status === st).length;
    const inCount = cnt("in");
    const tickets = members.filter(m => m.status === "in" && m.ticket).length;
    const list = filteredPeople();
    const schip = (id, label, n) => `<button type="button" class="fchip" data-pf-status="${id}" aria-pressed="${f.status === id}">${label} <span class="n">${n}</span></button>`;
    const tchip = (id, label, team) => `<button type="button" class="fchip" data-pf-team="${id}" aria-pressed="${f.team === id}"${team ? ` style="${teamStyle(team)}"` : ""}>${team ? `<span class="dot"></span>` : ""}${label}</button>`;
    return `<section class="section">
        <div class="section-head"><h1>משתתפים</h1><span class="muted">${members.length} פנדות נרשמו</span></div>
        <div class="stat-row">
          <div class="stat"><b>${inCount}</b><span>בפנים</span></div>
          <div class="stat"><b>${cnt("maybe")}</b><span>על הגדר</span></div>
          <div class="stat"><b>${tickets}<span class="muted" style="font-size:1rem"> מתוך ${inCount}</span></b><span>שבפנים עם כרטיס</span></div>
        </div>
      </section>
      ${headcountChart()}
      <section class="section">
        <div class="search">${icon("search")}<input id="people-q" type="search" placeholder="חיפוש לפי שם" aria-label="חיפוש לפי שם" value="${esc(f.q)}"></div>
        <div class="filter-row">${schip("", "כולם", members.length)}${D.MEMBER_STATUSES.map(s => schip(s.id, s.label, cnt(s.id))).join("")}</div>
        <div class="filter-row">${tchip("", "כל הצוותים")}${D.TEAMS.map(t => tchip(t.id, esc(t.name), t.id)).join("")}${tchip("none", "בלי צוות")}</div>
        <div id="people-list" class="people-list">${list.length ? list.map(personCard).join("") : ""}</div>
        ${list.length ? "" : `<p class="muted" id="people-empty">אין מי שמתאים לחיפוש.</p>`}
      </section>`;
  }

  /* ---------- אני ---------- */
  function renderMe() {
    const { me, settings } = S.data;
    return `<form class="form" id="profile-form" novalidate>
      <div class="profile-head">${av(me, 72)}<div><h1>${esc(me.name)}</h1>
        <div class="chips" style="margin-top:6px">${memberPill(me.status)}${me.isAdmin ? `<span class="pill" style="background:var(--ink);color:#fff">${icon("shield-check")} מנהל/ת</span>` : ""}</div></div></div>
      <div class="card form-section"><h2>${icon("user")} פרטים</h2>${profileSection("about", me)}</div>
      <div class="card form-section"><h2>${icon("users-group")} צוותים ותפקידים</h2>${profileSection("teams", me)}</div>
      ${truckShifts().length ? `<div class="card form-section"><h2>${icon("truck")} משמרת לוגיסטית</h2>${profileSection("truck", me)}</div>` : ""}
      <div class="card form-section"><h2>${icon("calendar")} הגעה ועזיבה</h2>${profileSection("arrival", me)}</div>
      <div class="card form-section"><h2>${icon("tools-kitchen-2")} אוכל וצרכים</h2>${profileSection("food", me)}</div>
      <div class="form-error" id="form-error" hidden></div>
      <div class="sticky-actions"><button type="submit" class="btn primary">${icon("device-floppy")} שמירה</button></div>
      ${me.isAdmin ? `<div class="card form-section"><h2>${icon("shield-check")} ניהול הקאמפ</h2>
        <dl class="kv"><dt>קוד הצטרפות</dt><dd><b dir="ltr" style="letter-spacing:.1em">${esc(settings.joinCode)}</b></dd>
          <dt>האירוע</dt><dd>${esc(eventRange(settings))}${settings.place ? `, ${esc(settings.place)}` : ""}</dd></dl>
        <div><button type="button" class="btn small" data-settings>${icon("settings")} הגדרות הקאמפ</button></div>
        <p class="muted small">כדי לבטל הצהרת הובלה או להסיר משתתף, פותחים את הכרטיס שלו בעמוד המשתתפים.</p></div>` : ""}
      <div><button type="button" class="btn ghost" data-signout>${icon("logout")} יציאה מהחשבון</button></div>
    </form>`;
  }

  /* ---------- חלוניות ---------- */
  function openSheet(title, inner, opts = {}) {
    const root = $("sheet-root");
    const tag = opts.onSubmit ? "form" : "div";
    root.innerHTML = `<div class="sheet-backdrop" data-sheet-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(opts.label || title.replace(/<[^>]+>/g, ""))}" style="${opts.style || ""}">
        <div class="sheet-head"><h2>${title}</h2><button type="button" class="icon-btn" data-sheet-close aria-label="סגירה">${icon("x")}</button></div>
        <${tag} class="form sheet-body" novalidate>${inner}</${tag}>
      </div>`;
    root.hidden = false;
    document.body.classList.add("sheet-open");
    const body = root.querySelector(".sheet-body");
    if (opts.onSubmit) body.addEventListener("submit", async e => {
      e.preventDefault();
      const err = body.querySelector(".form-error");
      try {
        const res = await opts.onSubmit(body);
        if (res === false) return;
        closeSheet();
        await reload();
        if (opts.done) toast(opts.done);
      } catch (ex) {
        if (err) { err.textContent = ex.message; err.hidden = false; } else notice(ex.message);
      }
    });
    if (opts.onMount) opts.onMount(body);
    const first = body.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea");
    if (first && opts.focus !== false) setTimeout(() => first.focus({ preventScroll: true }), 30);
    return body;
  }
  function closeSheet() {
    const root = $("sheet-root");
    root.hidden = true; root.innerHTML = "";
    document.body.classList.remove("sheet-open");
  }

  function ask(message, { title = "", ok = "אישור", cancel = "ביטול", danger = false } = {}) {
    return new Promise(resolve => {
      const root = $("dialog-root");
      root.innerHTML = `<div class="dlg-backdrop" data-dlg="0"></div>
        <div class="dlg" role="alertdialog" aria-modal="true">
          ${title ? `<h3>${esc(title)}</h3>` : ""}
          <div class="dlg-msg">${esc(message).replace(/\n/g, "<br>")}</div>
          <div class="dlg-actions">
            <button type="button" class="btn ${danger ? "danger" : "primary"}" data-dlg="1">${esc(ok)}</button>
            ${cancel ? `<button type="button" class="btn" data-dlg="0">${esc(cancel)}</button>` : ""}
          </div>
        </div>`;
      root.hidden = false;
      const done = v => { root.hidden = true; root.innerHTML = ""; root.onclick = null; S.dialogDone = null; resolve(v); };
      S.dialogDone = done;
      root.onclick = e => { const b = e.target.closest("[data-dlg]"); if (b) done(b.dataset.dlg === "1"); };
      root.querySelector('[data-dlg="1"]').focus();
    });
  }
  const notice = message => ask(message, { ok: "הבנתי", cancel: null });

  function toast(text) {
    const el = $("toast");
    clearTimeout(S.toastTimer);
    el.textContent = text;
    el.hidden = false;
    S.toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  async function act(fn, okMsg) {
    try {
      await fn();
      await reload();
      if (okMsg) toast(okMsg);
    } catch (e) { notice(e.message); }
  }

  /* בחירה מרובה עם חיפוש (אנשים או משימות) */
  function pickerHtml(name, options, selected, placeholder) {
    const sel = new Set(selected);
    let lastGroup = null;
    const rows = options.map(o => {
      const g = o.group && o.group !== lastGroup ? `<div class="pgroup">${esc(o.group)}</div>` : "";
      lastGroup = o.group || lastGroup;
      return `${g}<label class="popt" data-text="${esc(o.label)}" data-group="${esc(o.group || "")}"><input type="checkbox" name="${name}" value="${esc(o.value)}" ${sel.has(o.value) ? "checked" : ""}>${o.lead || ""}<span class="grow">${esc(o.label)}${o.sub ? ` <span class="muted small">${esc(o.sub)}</span>` : ""}</span></label>`;
    }).join("");
    return `<div class="picker"><input class="pfilter" type="search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}"><div class="plist">${rows || `<p class="muted small" style="padding:10px 12px">אין מה לבחור.</p>`}</div><div class="picked" data-picked>${sel.size ? `נבחרו ${sel.size}` : "לא נבחר אף אחד"}</div></div>`;
  }
  const peopleOptions = (exclude = []) => sortByName(S.data.members.filter(m => m.status !== "out" && !exclude.includes(m.id)))
    .map(m => ({ value: m.id, label: m.name, lead: av(m, 26) }));

  /* ---------- משימה ---------- */
  function openTask(taskId, teamId) {
    const me = S.data.me;
    const t = taskId ? S.maps.tasks[taskId] : null;
    if (taskId && !t) return;
    if (t && !Can.editTask(me, t)) return openTaskView(t);
    const team = t ? t.team : (teamId || (me.teams[0] && me.teams[0].team) || "kitchen");
    const leadHere = Can.isLead(me, team);
    const statusFree = t ? (leadHere || t.ownerId === me.id) : leadHere;
    const cur = t || { title: "", team, status: leadHere ? "todo" : "idea", ownerId: null, helperIds: [], cost: null, deps: [], blockedReason: "" };
    const teamSel = !t || me.isAdmin;
    const depOptions = D.TEAMS.flatMap(tm => S.data.tasks
      .filter(x => x.team === tm.id && (!t || (x.id !== t.id && !D.dependsOn(x.id, t.id, S.maps.tasks))))
      .map(x => ({ value: x.id, label: x.title, sub: D.TASK_STATUS[x.status].label, group: tm.name })));

    const inner = `
      <div class="field"><label for="tk-title">שם המשימה</label><input id="tk-title" name="title" type="text" value="${esc(cur.title)}" required placeholder="למשל: קניות יבשות"></div>
      ${teamSel ? `<div class="field"><label for="tk-team">צוות</label><select id="tk-team" name="team">${D.TEAMS.map(x => `<option value="${x.id}" ${x.id === cur.team ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>` : ""}
      <div class="field"><span class="lbl" id="tk-st-l">סטטוס</span>
        <div class="seg status" role="radiogroup" aria-labelledby="tk-st-l">${D.TASK_STATUSES.map(s => `<label><input type="radio" name="status" value="${s.id}" ${cur.status === s.id ? "checked" : ""} ${!statusFree && s.id !== cur.status ? "disabled" : ""}><span class="st-${s.id}">${icon(s.icon)}${s.label}</span></label>`).join("")}</div>
        ${!statusFree ? `<span class="hint">${t ? "רק מובילי הצוות והאחראי/ת משנים סטטוס." : "מי שלא מוביל/ה את הצוות מוסיף משימה כרעיון, ומובילי הצוות מקדמים אותה."}</span>` : ""}</div>
      <div class="field" id="tk-blocked"${cur.status === "blocked" ? "" : " hidden"}><label for="tk-reason">מה חסר כדי להתקדם?</label><textarea id="tk-reason" name="blockedReason" placeholder="למשל: מחכים להצעת מחיר">${esc(cur.blockedReason)}</textarea></div>
      <div class="field"><label for="tk-owner">אחראי/ת</label><select id="tk-owner" name="ownerId"><option value="">בלי אחראי/ת עדיין</option>
        ${sortByName(S.data.members.filter(m => m.status !== "out" || m.id === cur.ownerId)).map(m => `<option value="${m.id}" ${m.id === cur.ownerId ? "selected" : ""}>${esc(m.name)}${m.id === me.id ? " (אני)" : ""}</option>`).join("")}</select></div>
      <div class="field"><span class="lbl">עוזרים</span>${pickerHtml("helperIds", peopleOptions(), cur.helperIds, "חיפוש לפי שם")}</div>
      <div class="field"><label for="tk-cost">עלות משוערת (₪)</label><input id="tk-cost" name="cost" type="number" inputmode="numeric" min="0" step="10" value="${cur.cost || ""}" placeholder="0"></div>
      <div class="field"><span class="lbl">תלויה במשימות</span>${pickerHtml("deps", depOptions, cur.deps, "חיפוש משימה")}
        <span class="hint">המשימה מחכה שהמשימות האלה יסתיימו</span></div>
      <div class="form-error" hidden></div>
      <div class="sticky-actions">
        <button type="submit" class="btn primary">${t ? "שמירה" : (leadHere ? "הוספת המשימה" : "הוספת הרעיון")}</button>
        ${t && Can.deleteTask(me, t) ? `<button type="button" class="btn danger-ghost" data-del-task="${t.id}">${icon("trash")} מחיקה</button>` : ""}
      </div>`;

    openSheet(t ? `${icon(D.TEAM[team].icon)} עריכת משימה` : (leadHere ? "משימה חדשה" : "רעיון חדש"), inner, {
      style: teamStyle(team), label: t ? "עריכת משימה" : "משימה חדשה", focus: !t,
      done: t ? "המשימה נשמרה" : (leadHere ? "המשימה נוספה" : "הרעיון נוסף"),
      onSubmit: async form => {
        const fd = new FormData(form);
        const status = fd.get("status") || cur.status;
        if (status === "blocked" && !String(fd.get("blockedReason") || "").trim()) throw new Error("במשימה תקועה צריך לכתוב מה חסר כדי להתקדם.");
        await DB.saveTask({
          id: t && t.id, team: fd.get("team") || team, title: fd.get("title"), status,
          blockedReason: fd.get("blockedReason"), ownerId: fd.get("ownerId") || null,
          helperIds: fd.getAll("helperIds"), cost: Number(fd.get("cost")) || null, deps: fd.getAll("deps")
        });
      }
    });
  }

  function openTaskView(t) {
    const me = S.data.me;
    const owner = t.ownerId && member(t.ownerId);
    const deps = (t.deps || []).map(id => S.maps.tasks[id]).filter(Boolean);
    const helping = t.helperIds.includes(me.id);
    const inner = `
      <h3 style="font-size:1.3rem">${esc(t.title)}</h3>
      <dl class="kv">
        <dt>צוות</dt><dd>${teamChip(t.team)}</dd>
        <dt>סטטוס</dt><dd>${taskPill(t.status)}</dd>
        <dt>אחראי/ת</dt><dd>${owner ? `<button type="button" class="linkbtn" data-member="${owner.id}" style="text-decoration:none">${personHtml(owner, 26)}</button>` : `<span class="muted">עוד אין</span>`}</dd>
        <dt>עוזרים</dt><dd>${t.helperIds.length ? `<div class="chips">${t.helperIds.map(member).filter(Boolean).map(m => personHtml(m, 24)).join("")}</div>` : `<span class="muted">עוד אין</span>`}</dd>
        <dt>עלות משוערת</dt><dd>${t.cost ? money(t.cost) : `<span class="muted">לא הוערכה</span>`}</dd>
        ${deps.length ? `<dt>מחכה ל</dt><dd><div class="deps">${deps.map(depChip).join("")}</div></dd>` : ""}
      </dl>
      ${t.status === "blocked" && t.blockedReason ? `<div class="blocked-note">${icon("alert-triangle")}<span><b>חסר:</b> ${esc(t.blockedReason)}</span></div>` : ""}
      <div class="sticky-actions">
        ${Can.claimTask(me, t) ? `<button type="button" class="btn primary" data-claim="${t.id}">${icon("hand-grab")} לקחת אחריות</button>` : ""}
        ${t.status !== "done" ? `<button type="button" class="btn ${Can.claimTask(me, t) ? "" : "primary"}" data-help="${t.id}">${helping ? `${icon("x")} הפסקת עזרה` : `${icon("heart-handshake")} לעזור במשימה`}</button>` : ""}
      </div>
      <p class="lock-note">${icon("lock")} עריכה: מובילי ${esc(D.TEAM[t.team].name)} והאחראי/ת</p>`;
    openSheet(`${icon(D.TEAM[t.team].icon)} משימה`, inner, { style: teamStyle(t.team), label: "משימה", focus: false });
  }

  /* ---------- משמרת ---------- */
  function openShift(shiftId, teamId) {
    const me = S.data.me;
    const sh = shiftId ? S.data.shifts.find(s => s.id === shiftId) : null;
    if (shiftId && (!sh || !Can.editShift(me, sh))) return;
    const allowedTeams = D.TEAMS.filter(t => Can.addShift(me, t.id));
    if (!allowedTeams.length) return;
    const team = sh ? sh.team : (teamId && Can.addShift(me, teamId) ? teamId : allowedTeams[0].id);
    const cur = sh || { title: "", team, kind: "team", date: "", start: "", end: "", place: "", capacity: null, notes: "", memberIds: [] };
    const inner = `
      <div class="field"><label for="sh-team">צוות</label><select id="sh-team" name="team">${allowedTeams.map(t => `<option value="${t.id}" ${t.id === cur.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="field" id="sh-kind-f"${cur.team === "logistics" ? "" : " hidden"}><label for="sh-kind">סוג</label><select id="sh-kind" name="kind">
        <option value="team">משמרת רגילה</option>${D.TRUCK_KINDS.map(k => `<option value="${k.id}" ${cur.kind === k.id ? "selected" : ""}>${esc(k.label)}</option>`).join("")}</select>
        <span class="hint">משמרות העמסה ופריקה מופיעות בפרופיל של כולם לבחירה</span></div>
      <div class="field"><label for="sh-title">שם המשמרת</label><input id="sh-title" name="title" type="text" value="${esc(cur.title)}" required placeholder="למשל: ארוחת ערב"></div>
      <div class="row3">
        <div class="field"><label for="sh-date">תאריך</label><input id="sh-date" name="date" type="date" value="${esc(cur.date)}"></div>
        <div class="field"><label for="sh-start">משעה</label><input id="sh-start" name="start" type="time" value="${esc(cur.start)}"></div>
        <div class="field"><label for="sh-end">עד שעה</label><input id="sh-end" name="end" type="time" value="${esc(cur.end)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="sh-place">מקום</label><input id="sh-place" name="place" type="text" value="${esc(cur.place)}" placeholder="למשל: המטבח"></div>
        <div class="field"><label for="sh-cap">כמה אנשים צריך</label><input id="sh-cap" name="capacity" type="number" inputmode="numeric" min="1" value="${cur.capacity || ""}"></div>
      </div>
      <div class="field"><label for="sh-notes">הערות</label><input id="sh-notes" name="notes" type="text" value="${esc(cur.notes)}" placeholder="למשל: להביא כפפות"></div>
      <div class="field"><span class="lbl">מי במשמרת</span>${pickerHtml("memberIds", peopleOptions(), cur.memberIds, "חיפוש לפי שם")}</div>
      <div class="form-error" hidden></div>
      <div class="sticky-actions">
        <button type="submit" class="btn primary">${sh ? "שמירה" : "הוספת המשמרת"}</button>
        ${sh ? `<button type="button" class="btn danger-ghost" data-del-shift="${sh.id}">${icon("trash")} מחיקה</button>` : ""}
      </div>`;
    openSheet(sh ? "עריכת משמרת" : "משמרת חדשה", inner, {
      style: teamStyle(team), focus: !sh, done: sh ? "המשמרת נשמרה" : "המשמרת נוספה",
      onSubmit: async form => {
        const fd = new FormData(form);
        const cap = Number(fd.get("capacity")) || null;
        const ids = fd.getAll("memberIds");
        if (cap && ids.length > cap) throw new Error(`רשומים ${ids.length} אנשים, יותר מ ${cap} שצריך. אפשר להגדיל את המספר.`);
        if (fd.get("start") && fd.get("end") && fd.get("end") <= fd.get("start")) throw new Error("שעת הסיום צריכה להיות אחרי שעת ההתחלה.");
        await DB.saveShift({
          id: sh && sh.id, team: fd.get("team"), kind: fd.get("kind"), title: fd.get("title"),
          date: fd.get("date"), start: fd.get("start"), end: fd.get("end"), place: fd.get("place"),
          capacity: cap, notes: fd.get("notes"), memberIds: ids
        });
      }
    });
  }

  function openShiftPeople(shiftId) {
    const sh = S.data.shifts.find(s => s.id === shiftId);
    if (!sh) return;
    const list = sh.memberIds.map(member).filter(Boolean);
    openSheet(esc(sh.title), `<div class="mini-list">${list.map(m => `<button type="button" class="mini-row" data-member="${m.id}">${av(m, 36)}<span class="grow"><span class="t">${esc(m.name)}</span><span class="s">${esc(m.phone || "")}</span></span>${icon("chevron-left", "muted")}</button>`).join("")}</div>`,
      { style: teamStyle(sh.team), label: "מי במשמרת", focus: false });
  }

  /* ---------- כרטיס משתתף ---------- */
  function openMember(id) {
    const me = S.data.me;
    const m = member(id);
    if (!m) return;
    const p = S.maps.priv[id];
    const wa = D.waNumber(m.phone);
    const myShifts = S.data.shifts.filter(s => s.memberIds.includes(id)).sort(shiftSort);
    const owns = S.data.tasks.filter(t => t.ownerId === id && t.status !== "done");
    const seeDiet = p && p.diets !== null, seeNeeds = p && p.needs !== null;
    const inner = `
      <div class="profile-head">${av(m, 64)}<div><h3 style="font-size:1.35rem">${esc(m.name)}</h3><div class="chips" style="margin-top:4px">${memberPill(m.status)}${m.ticket ? `<span class="pill ms-in">${icon("ticket")} יש כרטיס</span>` : `<span class="pill ms-out">${icon("ticket-off")} בלי כרטיס עדיין</span>`}</div></div></div>
      ${m.phone ? `<div class="chips"><span class="btn small ghost" style="cursor:text"><bdi dir="ltr">${esc(m.phone)}</bdi></span>
        ${wa ? `<a class="btn small" href="https://wa.me/${wa}" target="_blank" rel="noopener">${icon("brand-whatsapp")} וואטסאפ</a>` : ""}
        <a class="btn small" href="tel:${esc(m.phone.replace(/[^\d+]/g, ""))}">${icon("phone")} חיוג</a></div>` : ""}
      <dl class="kv">
        <dt>צוותים</dt><dd>${m.teams.length ? `<div class="chips">${m.teams.map(t => teamChip(t.team, t.lead)).join("")}</div>` : `<span class="muted">עוד בלי צוות</span>`}</dd>
        ${m.shiftCoord ? `<dt>תפקיד</dt><dd>אחראי/ת משמרות</dd>` : ""}
        <dt>הגעה</dt><dd>${esc(dateRange(m))}</dd>
        <dt>משמרות</dt><dd>${myShifts.length ? myShifts.map(s => esc(s.title)).join(", ") : `<span class="muted">עוד לא</span>`}</dd>
        ${owns.length ? `<dt>באחריות</dt><dd>${owns.map(t => esc(t.title)).join(", ")}</dd>` : ""}
        ${seeDiet ? `<dt>${icon("lock")} אוכל</dt><dd>${esc((p.diets || []).join(", ") || "הכל")}${p.allergies ? `, <b style="color:var(--st-blocked)">אלרגיה: ${esc(p.allergies)}</b>` : ""}</dd>` : ""}
        ${seeNeeds && p.needs ? `<dt>${icon("lock")} צרכים</dt><dd>${esc(p.needs)}</dd>` : ""}
      </dl>
      ${m.id === me.id ? `<div><a class="btn small" href="#/me">${icon("pencil")} עריכת הפרופיל שלי</a></div>` : ""}
      ${me.isAdmin && m.id !== me.id ? `<div class="card form-section" style="box-shadow:none"><h3>${icon("shield-check")} ניהול</h3>
        <div class="chips">${m.teams.filter(t => t.lead).map(t => `<button type="button" class="btn small" data-revoke="${m.id}:${t.team}">${icon("crown-off")} ביטול הובלת ${esc(D.TEAM[t.team].name)}</button>`).join("")}
        <button type="button" class="btn small danger-ghost" data-remove-member="${m.id}">${icon("user-minus")} הסרה מהקאמפ</button></div></div>` : ""}`;
    openSheet("כרטיס משתתף", inner, { focus: false });
  }

  function openSettings() {
    const s = S.data.settings;
    const inner = `
      <div class="row2">
        <div class="field"><label for="st-name">שם הקאמפ</label><input id="st-name" name="campName" type="text" value="${esc(s.campName)}"></div>
        <div class="field"><label for="st-name-en">שם באנגלית</label><input id="st-name-en" name="campNameEn" type="text" dir="ltr" value="${esc(s.campNameEn)}"></div>
      </div>
      <div class="row2">
        <div class="field"><label for="st-start">האירוע מתחיל</label><input id="st-start" name="eventStart" type="date" value="${esc(s.eventStart)}"></div>
        <div class="field"><label for="st-end">האירוע נגמר</label><input id="st-end" name="eventEnd" type="date" value="${esc(s.eventEnd)}"></div>
      </div>
      <div class="field"><label for="st-place">מקום</label><input id="st-place" name="place" type="text" value="${esc(s.place)}"></div>
      <div class="field"><label for="st-code">קוד הצטרפות</label><input id="st-code" name="joinCode" type="text" dir="ltr" value="${esc(s.joinCode)}"><span class="hint">שינוי הקוד לא מוציא את מי שכבר בפנים</span></div>
      <div class="form-error" hidden></div>
      <div class="sticky-actions"><button type="submit" class="btn primary">שמירה</button></div>`;
    openSheet("הגדרות הקאמפ", inner, {
      done: "ההגדרות נשמרו",
      onSubmit: async form => {
        const fd = new FormData(form);
        if (fd.get("eventEnd") < fd.get("eventStart")) throw new Error("סוף האירוע לפני ההתחלה.");
        await DB.saveSettings(Object.fromEntries(fd.entries()));
      }
    });
  }

  function openDemoSwitch() {
    const all = sortByName(S.data.members || DB.demoMembers());
    const real = all.filter(m => !m.demo), demo = all.filter(m => m.demo);
    const role = m => {
      const leads = m.teams.filter(t => t.lead).map(t => D.TEAM[t.team].name);
      if (m.isAdmin) return "מנהל/ת";
      if (leads.length) return "מוביל/ה: " + leads.join(", ");
      if (m.shiftCoord) return "אחראי/ת משמרות";
      return m.teams.length ? "משתתף/ת בצוות" : "בלי צוות";
    };
    const row = m => `<button type="button" class="mini-row" data-demo-as="${m.id}">${P.avatar(m.id, { size: 36 })}<span class="grow"><span class="t">${esc(m.name || "בלי שם")}</span><span class="s">${esc(role(m))}</span></span>${S.data.me && S.data.me.id === m.id ? `<span class="pill ms-in">עכשיו</span>` : ""}</button>`;
    openSheet("החלפת משתמש", `
      <p class="muted small">כדי לראות מה כל אחד רואה ויכול לערוך.</p>
      ${real.length ? `<div class="card mini-list" style="padding:4px 12px">${real.map(row).join("")}</div>` : ""}
      <div class="card mini-list" style="padding:4px 12px">${demo.map(row).join("")}</div>
      <button type="button" class="btn" data-demo="google">${icon("user-plus")} כניסה כמשתתף חדש</button>`, { focus: false });
  }

  function askLead(teamId) {
    const team = D.TEAM[teamId];
    const extra = teamId === "kitchen" ? ", ורואים העדפות אוכל ואלרגיות של כולם"
      : teamId === "logistics" ? ", ורואים את הצרכים להתארגנות של כולם" : "";
    return ask(`מובילי ${team.name} יכולים להוסיף ולערוך את כל המשימות והמשמרות של הצוות${extra}.\nכל הקאמפ יראה שאת/ה מוביל/ה, וזה נרשם ביומן.`,
      { title: `להוביל את ${team.name}?`, ok: "כן, אני מוביל/ה" });
  }

  /* ---------- אירועים ---------- */
  document.addEventListener("click", async e => {
    const t = e.target;
    if (t.closest("[data-sheet-close]")) return closeSheet();
    const el = t.closest("[data-task],[data-new-task],[data-lead-team],[data-shift-edit],[data-new-shift],[data-signup],[data-member],[data-join-team],[data-sf],[data-pf-status],[data-pf-team],[data-demo],[data-demo-as],[data-signout],[data-settings],[data-shift-people],[data-help],[data-claim],[data-del-task],[data-del-shift],[data-revoke],[data-remove-member],[data-wizard-back]");
    if (!el || el.disabled) return;
    const ds = el.dataset;

    if (ds.task !== undefined) return openTask(ds.task);
    if (ds.newTask !== undefined) return openTask(null, ds.newTask);
    if (ds.shiftEdit !== undefined) return openShift(ds.shiftEdit);
    if (ds.newShift !== undefined) return openShift(null, ds.newShift);
    if (ds.shiftPeople !== undefined) return openShiftPeople(ds.shiftPeople);
    if (ds.member !== undefined) return openMember(ds.member);
    if (ds.settings !== undefined) return openSettings();

    if (ds.signup !== undefined) {
      const sh = S.data.shifts.find(s => s.id === ds.signup);
      const on = sh && !sh.memberIds.includes(S.data.me.id);
      return act(() => DB.toggleSignup(ds.signup), on ? `נרשמת: ${sh.title}` : "ההרשמה בוטלה");
    }
    if (ds.help !== undefined) {
      const on = !S.maps.tasks[ds.help].helperIds.includes(S.data.me.id);
      closeSheet();
      return act(() => DB.toggleHelper(ds.help), on ? "תודה! נוספת לעוזרים" : "יצאת מהעוזרים");
    }
    if (ds.claim !== undefined) { closeSheet(); return act(() => DB.claimTask(ds.claim), "המשימה באחריותך"); }
    if (ds.joinTeam !== undefined) {
      const me = S.data.me;
      return act(() => DB.saveProfile({ teams: [...me.teams, { team: ds.joinTeam, lead: false }] }), `הצטרפת לצוות ${D.TEAM[ds.joinTeam].name}`);
    }
    if (ds.leadTeam !== undefined) {
      if (!(await askLead(ds.leadTeam))) return;
      const me = S.data.me;
      const teams = me.teams.some(x => x.team === ds.leadTeam)
        ? me.teams.map(x => (x.team === ds.leadTeam ? { ...x, lead: true } : x))
        : [...me.teams, { team: ds.leadTeam, lead: true }];
      return act(() => DB.saveProfile({ teams }), `הובלת ${D.TEAM[ds.leadTeam].name} נרשמה`);
    }
    if (ds.delTask !== undefined) {
      const task = S.maps.tasks[ds.delTask];
      const used = S.data.tasks.filter(x => (x.deps || []).includes(ds.delTask)).length;
      if (!(await ask(`למחוק את "${task.title}"?${used ? `\n${plural(used, "משימה אחת תלויה בה", "משימות תלויות בה")}, והתלות תוסר.` : ""}`, { ok: "מחיקה", danger: true }))) return;
      closeSheet();
      return act(() => DB.deleteTask(ds.delTask), "המשימה נמחקה");
    }
    if (ds.delShift !== undefined) {
      const sh = S.data.shifts.find(s => s.id === ds.delShift);
      if (!(await ask(`למחוק את המשמרת "${sh.title}"?${sh.memberIds.length ? `\n${sh.memberIds.length} רשומים אליה.` : ""}`, { ok: "מחיקה", danger: true }))) return;
      closeSheet();
      return act(() => DB.deleteShift(ds.delShift), "המשמרת נמחקה");
    }
    if (ds.revoke !== undefined) {
      const [mid, team] = ds.revoke.split(":");
      if (!(await ask(`לבטל את ההובלה של ${member(mid).name} בצוות ${D.TEAM[team].name}? זה יופיע ביומן של הקאמפ.`, { ok: "ביטול ההובלה", danger: true }))) return;
      closeSheet();
      return act(() => DB.revokeLead(mid, team), "ההובלה בוטלה");
    }
    if (ds.removeMember !== undefined) {
      const m = member(ds.removeMember);
      if (!(await ask(`להסיר את ${m.name} מהקאמפ? המשימות שבאחריותו/ה יישארו בלי אחראי/ת.`, { ok: "הסרה", danger: true }))) return;
      closeSheet();
      return act(() => DB.removeMember(ds.removeMember), "הוסר/ה מהקאמפ");
    }

    if (ds.sf !== undefined) { S.shiftFilter = ds.sf; return render(); }
    if (ds.pfStatus !== undefined) { S.people.status = ds.pfStatus; return render(); }
    if (ds.pfTeam !== undefined) { S.people.team = ds.pfTeam; return render(); }
    if (ds.wizardBack !== undefined) { S.wizardStep = Math.max(0, S.wizardStep - 1); render(); return window.scrollTo(0, 0); }

    if (ds.signout !== undefined) { await DB.signOut(); S.wizardStep = 0; location.hash = "#/home"; return reload(); }
    if (ds.demoAs !== undefined) { closeSheet(); await DB.signInAs(ds.demoAs); S.wizardStep = 0; location.hash = "#/home"; return reload(); }
    if (ds.demo === "google") { closeSheet(); await DB.signInWithGoogle(); S.wizardStep = 0; location.hash = "#/home"; return reload(); }
    if (ds.demo === "switch") return openDemoSwitch();
    if (ds.demo === "reset") {
      if (!(await ask("לאפס את ההדגמה? כל מה שנוסף או שונה בדפדפן הזה יימחק ונתוני הדוגמה יחזרו.", { ok: "איפוס", danger: true }))) return;
      await DB.resetDemo(); S.wizardStep = 0; location.hash = "#/home"; return reload();
    }
  });

  // כרטיסים שהם role=button מגיבים גם למקלדת
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (S.dialogDone) return S.dialogDone(false);
      if (!$("sheet-root").hidden) return closeSheet();
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][tabindex]')) { e.preventDefault(); e.target.click(); }
  });

  document.addEventListener("submit", async e => {
    const f = e.target;
    if (f.id === "join-form") {
      e.preventDefault();
      const box = $("join-error");
      try { await DB.join(f.querySelector('[name="code"]').value); S.wizardStep = 0; await reload(); }
      catch (ex) { box.textContent = ex.message; box.hidden = false; }
    } else if (f.id === "wizard-form" || f.id === "profile-form") {
      e.preventDefault();
      submitProfile(f, f.id === "wizard-form");
    }
  });

  document.addEventListener("change", async e => {
    const t = e.target;
    // בחירת צוות פותחת את אפשרות ההובלה; ביטול צוות מבטל גם הובלה
    if (t.name === "team" && t.closest(".team-opt")) {
      const opt = t.closest(".team-opt");
      opt.classList.toggle("on", t.checked);
      const line = opt.querySelector(".leadline");
      line.hidden = !t.checked;
      if (!t.checked) line.querySelector("input").checked = false;
    }
    if (t.name === "lead" && t.checked) {
      if (!(await askLead(t.value))) t.checked = false;
    }
    if (t.id === "tk-team") {
      // מי שאינו מוביל/ה של הצוות שנבחר מוסיף רק רעיון
      const lead = Can.addTaskAnyStatus(S.data.me, t.value);
      t.closest("form").querySelectorAll('[name="status"]').forEach(r => {
        r.disabled = !lead && r.value !== "idea";
        if (!lead) r.checked = r.value === "idea";
      });
      t.closest(".sheet").setAttribute("style", teamStyle(t.value));
    }
    if (t.name === "shiftCoord" && t.checked) {
      const ok = await ask("אחראי/ת משמרות יכול/ה להוסיף, לערוך ולמחוק את כל המשמרות של הקאמפ ולשבץ אנשים.\nכל הקאמפ יראה את זה, וזה נרשם ביומן.", { title: "אחריות על המשמרות?", ok: "כן, אני אחראי/ת" });
      if (!ok) t.checked = false;
    }
    if (t.name === "status" && t.closest(".sheet")) {
      const box = t.closest("form").querySelector("#tk-blocked");
      if (box) box.hidden = t.value !== "blocked";
    }
    if (t.name === "team" && t.id === "sh-team") {
      const f = t.closest("form");
      f.querySelector("#sh-kind-f").hidden = t.value !== "logistics";
      f.closest(".sheet").setAttribute("style", teamStyle(t.value));
    }
    if (t.closest(".picker") && t.type === "checkbox") {
      const pk = t.closest(".picker");
      const n = pk.querySelectorAll("input[type=checkbox]:checked").length;
      pk.querySelector("[data-picked]").textContent = n ? `נבחרו ${n}` : "לא נבחר אף אחד";
    }
  });

  document.addEventListener("input", e => {
    const t = e.target;
    if (t.classList.contains("pfilter")) {
      const q = t.value.trim();
      const pk = t.closest(".picker");
      pk.querySelectorAll(".popt").forEach(o => { o.hidden = !!q && !o.dataset.text.includes(q); });
      pk.querySelectorAll(".pgroup").forEach(g => {
        let n = g.nextElementSibling, any = false;
        while (n && !n.classList.contains("pgroup")) { if (!n.hidden) any = true; n = n.nextElementSibling; }
        g.hidden = !any;
      });
    }
    if (t.id === "people-q") {
      S.people.q = t.value;
      const list = filteredPeople();
      $("people-list").innerHTML = list.map(personCard).join("");
      const empty = $("people-empty");
      if (empty) empty.hidden = !!list.length;
      else if (!list.length) $("people-list").insertAdjacentHTML("afterend", `<p class="muted" id="people-empty">אין מי שמתאים לחיפוש.</p>`);
    }
  });

  // הגרף של כמה אנשים בכל יום: מעבר עכבר או פוקוס על יום מציג את המספרים שלו בשורה מעל הגרף
  function chartReadout(e) {
    const card = e.target.closest && e.target.closest(".chart-card");
    if (!card) return;
    const out = card.querySelector(".hc-readout");
    const col = e.target.closest(".hc-col");
    out.textContent = col ? col.dataset.readout : out.dataset.default;
  }
  document.addEventListener("mouseover", chartReadout);
  document.addEventListener("focusin", chartReadout);

  window.addEventListener("hashchange", () => { closeSheet(); render(); window.scrollTo(0, 0); });
  if (DB.onExternalChange) DB.onExternalChange(() => { if ($("sheet-root").hidden) reload(); });

  reload().catch(e => { main.innerHTML = `<div class="card"><b>משהו השתבש בטעינה.</b><p class="muted">${esc(e.message)}</p></div>`; });
})();
