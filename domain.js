/* קבועים, הרשאות וחישובים טהורים. בלי DOM ובלי אחסון, כדי שיהיה קל לבדוק. */
(function (root) {
  "use strict";

  // סדר הצבעים נבדק כפלטה קטגורית: זוגות סמוכים נבדלים גם לעיוורי צבעים
  const TEAMS = [
    { id: "kitchen",   name: "מטבח",     icon: "tools-kitchen-2", color: "#e0603a", soft: "#fde8df" },
    { id: "art",       name: "ארט",      icon: "palette",         color: "#7a4fd6", soft: "#ece5fb" },
    { id: "gift",      name: "גיפט",     icon: "gift",            color: "#d9447f", soft: "#fbe2ec" },
    { id: "logistics", name: "לוגיסטיקה", icon: "truck",          color: "#3f9a45", soft: "#e2f2e2" },
    { id: "moop",      name: 'חשל"ש',    icon: "recycle",         color: "#2b78b5", soft: "#deebf7" },
    { id: "finance",   name: "כספים",    icon: "coins",           color: "#b27a00", soft: "#f8eccd" }
  ];

  const TASK_STATUSES = [
    { id: "idea",    label: "רעיון",  icon: "bulb" },
    { id: "todo",    label: "לביצוע", icon: "circle-dashed" },
    { id: "doing",   label: "בעבודה", icon: "loader-2" },
    { id: "blocked", label: "תקוע",   icon: "hand-stop" },
    { id: "done",    label: "הושלם",  icon: "circle-check" }
  ];
  // סדר התצוגה בעמוד צוות: מה שצריך תשומת לב קודם
  const TASK_STATUS_VIEW_ORDER = ["blocked", "doing", "todo", "idea", "done"];

  const MEMBER_STATUSES = [
    { id: "in",    label: "בפנים",   icon: "circle-check" },
    { id: "maybe", label: "על הגדר", icon: "help-circle" },
    { id: "out",   label: "לא השנה", icon: "moon" }
  ];

  const DIETS = ["טבעוני", "צמחוני", "ללא גלוטן", "ללא לקטוז", "כשר"];

  // שלוש המשמרות הלוגיסטיות שכל משתתף בוחר מהן אחת
  const TRUCK_KINDS = [
    { id: "load_warehouse",   label: "העמסה במחסן",       short: "העמסה",       icon: "packages" },
    { id: "unload_desert",    label: "פריקה במדבר",       short: "פריקה במדבר", icon: "tent" },
    { id: "unload_warehouse", label: "פריקה חזרה במחסן",  short: "פריקה במחסן", icon: "building-warehouse" }
  ];

  const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
  const TEAM = byId(TEAMS);
  const TASK_STATUS = byId(TASK_STATUSES);
  const MEMBER_STATUS = byId(MEMBER_STATUSES);
  const TRUCK_KIND = byId(TRUCK_KINDS);

  /* ---------- הרשאות ----------
     אותן חוקים יאכפו ב-Supabase דרך RLS. כאן הם קובעים מה רואים בממשק. */
  const Can = {
    isLead(me, teamId) {
      return !!me && (me.isAdmin || (me.teams || []).some(t => t.team === teamId && t.lead));
    },
    isMember(me, teamId) {
      return !!me && (me.teams || []).some(t => t.team === teamId);
    },
    // כל משתתף יכול להוסיף משימה, אבל מי שאינו מוביל/ה מוסיף רק כרעיון
    addTask: me => !!me,
    addTaskAnyStatus: (me, teamId) => Can.isLead(me, teamId),
    editTask: (me, task) => !!me && (Can.isLead(me, task.team) || task.ownerId === me.id ||
      (task.createdBy === me.id && task.status === "idea")),
    claimTask: (me, task) => !!me && !task.ownerId && task.status !== "done",
    deleteTask: (me, task) => !!me && (Can.isLead(me, task.team) ||
      (task.createdBy === me.id && task.status === "idea")),
    editShift: (me, shift) => !!me && (me.isAdmin || me.shiftCoord || Can.isLead(me, shift.team)),
    addShift: (me, teamId) => !!me && (me.isAdmin || me.shiftCoord || Can.isLead(me, teamId)),
    addAnyShift: me => !!me && (me.isAdmin || me.shiftCoord || (me.teams || []).some(t => t.lead)),
    seeDiet: (me, memberId) => !!me && (me.id === memberId || Can.isLead(me, "kitchen")),
    seeNeeds: (me, memberId) => !!me && (me.id === memberId || Can.isLead(me, "logistics")),
    admin: me => !!me && !!me.isAdmin
  };

  /* ---------- תאריכים ---------- */
  const DAY_LETTERS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];

  function parseDate(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function isoDate(dt) {
    const p = n => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }
  const dayMonth = iso => { const d = parseDate(iso); return d ? `${d.getDate()}.${d.getMonth() + 1}` : ""; };
  function weekday(iso) {
    const d = parseDate(iso);
    if (!d) return "";
    const l = DAY_LETTERS[d.getDay()];
    return l === "שבת" ? "שבת" : `יום ${l}`;
  }
  function daysBetween(fromIso, toIso) {
    const a = parseDate(fromIso), b = parseDate(toIso);
    return Math.round((b - a) / 86400000);
  }
  function addDays(iso, n) {
    const d = parseDate(iso);
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  // מצב הספירה לאחור ביחס לאירוע
  function countdown(todayIso, startIso, endIso) {
    const toStart = daysBetween(todayIso, startIso);
    if (toStart > 1) return { phase: "before", days: toStart };
    if (toStart === 1) return { phase: "tomorrow", days: 1 };
    const toEnd = daysBetween(todayIso, endIso);
    if (toEnd >= 0) return { phase: "during", day: -toStart + 1 };
    return { phase: "after" };
  }

  /* ---------- חישובים ---------- */

  // כמה אנשים בקאמפ בכל יום, לפי תאריכי ההגעה והעזיבה של מי שבפנים / על הגדר
  function headcountByDay(members, fromIso, toIso) {
    const days = [];
    for (let d = fromIso; d <= toIso; d = addDays(d, 1)) {
      let sure = 0, maybe = 0;
      for (const m of members) {
        if (!m.arrive || !m.leave || m.arrive > d || m.leave < d) continue;
        if (m.status === "in") sure++;
        else if (m.status === "maybe") maybe++;
      }
      days.push({ date: d, sure, maybe });
    }
    return days;
  }

  // הטווח שמכסה את כל ההגעות והעזיבות, ולפחות את ימי האירוע
  function campRange(members, startIso, endIso) {
    let from = startIso, to = endIso;
    for (const m of members) {
      if (m.status === "out") continue;
      if (m.arrive && m.arrive < from) from = m.arrive;
      if (m.leave && m.leave > to) to = m.leave;
    }
    return { from, to };
  }

  function taskCounts(tasks) {
    const c = { idea: 0, todo: 0, doing: 0, blocked: 0, done: 0, total: 0 };
    for (const t of tasks) { c[t.status]++; c.total++; }
    return c;
  }

  // תקציב משוער: לפי צוות, וכמה ממנו כבר במשימות שהושלמו
  function budgetByTeam(tasks) {
    return TEAMS.map(team => {
      const list = tasks.filter(t => t.team === team.id && t.status !== "idea" && t.cost > 0);
      const total = list.reduce((s, t) => s + t.cost, 0);
      const done = list.filter(t => t.status === "done").reduce((s, t) => s + t.cost, 0);
      const ideas = tasks.filter(t => t.team === team.id && t.status === "idea" && t.cost > 0)
        .reduce((s, t) => s + t.cost, 0);
      return { team: team.id, total, done, ideas, count: list.length };
    });
  }

  // משימות שהמשימה הזו מחכה להן ועוד לא הושלמו
  function openDeps(task, tasksById) {
    return (task.deps || []).map(id => tasksById[id]).filter(d => d && d.status !== "done");
  }

  // מונע תלות מעגלית: האם candidate תלויה (ישירות או בעקיפין) ב-taskId
  function dependsOn(candidateId, taskId, tasksById, seen = new Set()) {
    if (candidateId === taskId) return true;
    if (seen.has(candidateId)) return false;
    seen.add(candidateId);
    const c = tasksById[candidateId];
    return !!c && (c.deps || []).some(d => dependsOn(d, taskId, tasksById, seen));
  }

  function dietSummary(privates, members) {
    const inIds = new Set(members.filter(m => m.status === "in").map(m => m.id));
    const counts = Object.fromEntries(DIETS.map(d => [d, 0]));
    let allergies = 0;
    for (const p of privates) {
      if (!inIds.has(p.memberId)) continue;
      for (const d of p.diets || []) if (d in counts) counts[d]++;
      if ((p.allergies || "").trim()) allergies++;
    }
    return { counts, allergies, people: inIds.size };
  }

  // מספר ישראלי לקישור וואטסאפ: 050-1234567 -> 972501234567
  function waNumber(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("972")) return digits;
    if (digits.startsWith("0")) return "972" + digits.slice(1);
    return digits;
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  root.Domain = {
    TEAMS, TEAM, TASK_STATUSES, TASK_STATUS, TASK_STATUS_VIEW_ORDER, MEMBER_STATUSES, MEMBER_STATUS,
    DIETS, TRUCK_KINDS, TRUCK_KIND, Can,
    parseDate, isoDate, dayMonth, weekday, daysBetween, addDays, countdown,
    headcountByDay, campRange, taskCounts, budgetByTeam, openDeps, dependsOn, dietSummary, waNumber, hashStr
  };
})(typeof window !== "undefined" ? window : globalThis);
