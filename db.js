/* שכבת הנתונים. כרגע רק מצב הדגמה מקומי (localStorage).
   בשלב הבא נוסיף CloudDB עם Supabase באותו ממשק בדיוק, והאתר עצמו לא ישתנה.
   כל פעולה קוראת מחדש מהאחסון (בלי זיכרון פנימי), כדי ששתי לשוניות לא ידרסו זו את זו. */
(function (root) {
  "use strict";
  const D = root.Domain;
  const KEY = "pandaCamp.v1";
  const SESSION = "pandaCamp.session";

  const now = () => new Date().toISOString();
  const newId = p => p + "_" + (root.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
  const deny = () => { throw new Error("אין הרשאה לפעולה הזו."); };

  // עדכון נתונים שנשמרו בגרסה קודמת של האתר
  function migrate(s) {
    if ((s.version || 1) < 2) {
      // הקאמפ נקרא פנדהאוס (Pandhouse), ולא "הפנדות"
      if (!s.settings.campName || s.settings.campName === "הפנדות") s.settings.campName = "פנדהאוס";
      if (!s.settings.campNameEn) s.settings.campNameEn = "Pandhouse";
      s.version = 2;
      write(s);
    }
    return s;
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) { /* אחסון חסום או פגום: מתחילים מנתוני הדגמה */ }
    const s = root.demoSeed();
    write(s);
    return s;
  }
  function write(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { throw new Error("לא הצלחנו לשמור בדפדפן הזה."); }
  }
  function getSession() { try { return localStorage.getItem(SESSION); } catch (e) { return null; } }
  function setSession(v) { try { v ? localStorage.setItem(SESSION, v) : localStorage.removeItem(SESSION); } catch (e) { /* ignore */ } }

  function authOf(s) {
    const sid = getSession();
    if (!sid) return null;
    if (sid.startsWith("as:")) {
      const memberId = sid.slice(3);
      return s.members.some(m => m.id === memberId) ? { uid: sid, email: "", memberId } : null;
    }
    const acc = s.accounts[sid];
    if (!acc) return null;
    const memberId = acc.memberId && s.members.some(m => m.id === acc.memberId) ? acc.memberId : null;
    return { uid: sid, email: acc.email, name: acc.name, memberId };
  }
  function meOf(s) {
    const a = authOf(s);
    return a && a.memberId ? s.members.find(m => m.id === a.memberId) : null;
  }
  function log(s, actorId, text) {
    s.activity.push({ id: newId("a"), at: now(), actorId, text });
    if (s.activity.length > 300) s.activity = s.activity.slice(-300);
  }
  // קריאה, בדיקה שהמשתמש מחובר ושייך לקאמפ, שינוי, כתיבה
  function mutate(fn) {
    const s = read();
    const me = meOf(s);
    if (!me) throw new Error("צריך להתחבר מחדש.");
    const out = fn(s, me);
    write(s);
    return out;
  }
  const teamName = id => (D.TEAM[id] || {}).name || id;

  const LocalDB = {
    mode: "local",

    async auth() { return authOf(read()); },

    async signInWithGoogle() {
      const s = read();
      const id = newId("g");
      s.accounts[id] = { email: "demo.panda@gmail.com", name: "", memberId: null };
      write(s);
      setSession(id);
    },
    async signInAs(memberId) { setSession("as:" + memberId); },
    async signOut() { setSession(null); },

    async join(code) {
      const s = read();
      const a = authOf(s);
      if (!a) throw new Error("צריך להתחבר קודם.");
      if (String(code || "").trim().toUpperCase() !== String(s.settings.joinCode).toUpperCase())
        throw new Error("הקוד לא נכון. הקוד נמצא בקבוצת הוואטסאפ של הקאמפ.");
      // במצב הדגמה, מי שנרשם דרך "גוגל" הוא המנהל/ת, כדי שאפשר יהיה לראות גם את מסכי הניהול
      const firstReal = !s.members.some(m => !m.demo);
      const m = {
        id: newId("m"), name: a.name || "", phone: "", status: "in", ticket: false, teams: [],
        arrive: s.settings.eventStart, leave: s.settings.eventEnd, shiftCoord: false, isAdmin: firstReal,
        joinedAt: now(), onboarded: false
      };
      s.members.push(m);
      s.privates.push({ memberId: m.id, diets: [], allergies: "", needs: "" });
      s.accounts[a.uid].memberId = m.id;
      write(s);
      return m;
    },

    async load() {
      const s = read();
      const auth = authOf(s);
      const me = meOf(s);
      if (!me) {
        const { joinCode, ...pub } = s.settings;
        return { auth, me: null, settings: pub };
      }
      // סינון מידע אישי, כמו ש-RLS יעשה בענן
      const privates = s.privates
        .filter(p => D.Can.seeDiet(me, p.memberId) || D.Can.seeNeeds(me, p.memberId))
        .map(p => {
          const diet = D.Can.seeDiet(me, p.memberId), needs = D.Can.seeNeeds(me, p.memberId);
          return { memberId: p.memberId, diets: diet ? p.diets : null, allergies: diet ? p.allergies : null, needs: needs ? p.needs : null };
        });
      const settings = { ...s.settings };
      if (!me.isAdmin) delete settings.joinCode;
      return {
        auth, me, settings, privates,
        members: s.members, tasks: s.tasks, shifts: s.shifts,
        activity: s.activity.slice(-80),
        dietSummary: D.dietSummary(s.privates, s.members)
      };
    },

    async saveProfile(patch, priv, truckShiftIds) {
      return mutate((s, me) => {
        const before = { teams: me.teams.map(t => ({ ...t })), shiftCoord: me.shiftCoord, onboarded: me.onboarded };
        for (const k of ["name", "phone", "status", "ticket", "teams", "shiftCoord", "arrive", "leave", "onboarded"])
          if (k in patch) me[k] = patch[k];
        me.teams = (me.teams || []).filter(t => D.TEAM[t.team]);

        for (const team of D.TEAMS) {
          const was = before.teams.some(t => t.team === team.id && t.lead);
          const is = me.teams.some(t => t.team === team.id && t.lead);
          if (!was && is) log(s, me.id, `הצהרה על הובלת צוות ${team.name}`);
          if (was && !is) log(s, me.id, `סיום הובלת צוות ${team.name}`);
        }
        if (!before.shiftCoord && me.shiftCoord) log(s, me.id, "הצהרה על אחריות למשמרות של כל הקאמפ");
        if (before.shiftCoord && !me.shiftCoord) log(s, me.id, "סיום אחריות למשמרות");
        if (!before.onboarded && me.onboarded) log(s, me.id, "הצטרפות לקאמפ");

        if (priv) {
          let p = s.privates.find(x => x.memberId === me.id);
          if (!p) { p = { memberId: me.id, diets: [], allergies: "", needs: "" }; s.privates.push(p); }
          for (const k of ["diets", "allergies", "needs"]) if (k in priv) p[k] = priv[k];
        }

        if (truckShiftIds) {
          const want = new Set(truckShiftIds);
          for (const sh of s.shifts) {
            if (sh.kind === "team") continue;
            const has = sh.memberIds.includes(me.id);
            if (want.has(sh.id) && !has) sh.memberIds.push(me.id);
            if (!want.has(sh.id) && has) sh.memberIds = sh.memberIds.filter(x => x !== me.id);
          }
        }
        return me;
      });
    },

    async saveTask(input) {
      return mutate((s, me) => {
        const fields = {
          title: String(input.title || "").trim(),
          ownerId: input.ownerId || null,
          helperIds: [...new Set(input.helperIds || [])],
          status: input.status,
          blockedReason: input.status === "blocked" ? String(input.blockedReason || "").trim() : "",
          cost: input.cost > 0 ? Math.round(input.cost) : null,
          deps: [...new Set(input.deps || [])]
        };
        if (!fields.title) throw new Error("חסר שם למשימה.");
        if (!D.TASK_STATUS[fields.status]) fields.status = "idea";
        const byId = Object.fromEntries(s.tasks.map(t => [t.id, t]));
        let task;
        if (input.id) {
          task = byId[input.id];
          if (!task) throw new Error("המשימה לא נמצאה, אולי נמחקה.");
          if (!D.Can.editTask(me, task)) deny();
          if (input.team && input.team !== task.team) {
            if (!D.Can.isLead(me, input.team) || !D.Can.isLead(me, task.team)) deny();
            task.team = input.team;
          }
          const prev = task.status;
          // מי שהציע/ה רעיון ואינו מוביל/ה או אחראי/ת, יכול/ה לערוך אותו אבל לא לקדם אותו
          if (!D.Can.isLead(me, task.team) && task.ownerId !== me.id) { fields.status = prev; fields.blockedReason = task.blockedReason; }
          Object.assign(task, fields, { updatedAt: now() });
          if (prev !== task.status && task.status === "done") log(s, me.id, `משימה הושלמה: ${task.title}`);
          if (prev !== task.status && task.status === "blocked") log(s, me.id, `משימה נתקעה: ${task.title}`);
        } else {
          if (!D.TEAM[input.team]) throw new Error("צריך לבחור צוות.");
          if (!D.Can.addTaskAnyStatus(me, input.team)) fields.status = "idea";
          task = { id: newId("t"), team: input.team, ...fields, createdBy: me.id, createdAt: now(), updatedAt: now() };
          s.tasks.push(task);
          byId[task.id] = task;
          log(s, me.id, fields.status === "idea"
            ? `רעיון חדש ב${teamName(task.team)}: ${task.title}`
            : `משימה חדשה ב${teamName(task.team)}: ${task.title}`);
        }
        // תלויות: רק משימות קיימות, בלי תלות בעצמה ובלי מעגלים
        task.deps = task.deps.filter(d => byId[d] && !D.dependsOn(d, task.id, byId));
        return task;
      });
    },

    async deleteTask(id) {
      return mutate((s, me) => {
        const task = s.tasks.find(t => t.id === id);
        if (!task) return;
        if (!D.Can.deleteTask(me, task)) deny();
        s.tasks = s.tasks.filter(t => t.id !== id);
        for (const t of s.tasks) t.deps = (t.deps || []).filter(d => d !== id);
      });
    },

    // משימה בלי אחראי/ת: כל אחד יכול לקחת אותה
    async claimTask(taskId) {
      return mutate((s, me) => {
        const task = s.tasks.find(t => t.id === taskId);
        if (!task) throw new Error("המשימה לא נמצאה.");
        if (!D.Can.claimTask(me, task)) throw new Error("כבר יש למשימה הזו אחראי/ת.");
        task.ownerId = me.id;
        task.helperIds = task.helperIds.filter(x => x !== me.id);
        task.updatedAt = now();
        log(s, me.id, `לקיחת אחריות על משימה: ${task.title}`);
      });
    },

    async toggleHelper(taskId) {
      return mutate((s, me) => {
        const task = s.tasks.find(t => t.id === taskId);
        if (!task) throw new Error("המשימה לא נמצאה.");
        const on = !task.helperIds.includes(me.id);
        task.helperIds = on ? [...task.helperIds, me.id] : task.helperIds.filter(x => x !== me.id);
        return on;
      });
    },

    async saveShift(input) {
      return mutate((s, me) => {
        const fields = {
          team: input.team,
          kind: input.team === "logistics" && D.TRUCK_KIND[input.kind] ? input.kind : "team",
          title: String(input.title || "").trim(),
          date: input.date || "", start: input.start || "", end: input.end || "",
          place: String(input.place || "").trim(),
          capacity: input.capacity > 0 ? Math.round(input.capacity) : null,
          notes: String(input.notes || "").trim()
        };
        if (Array.isArray(input.memberIds)) fields.memberIds = [...new Set(input.memberIds)];
        if (!fields.title) throw new Error("חסר שם למשמרת.");
        if (!D.TEAM[fields.team]) throw new Error("צריך לבחור צוות.");
        if (!D.Can.addShift(me, fields.team)) deny();
        if (input.id) {
          const sh = s.shifts.find(x => x.id === input.id);
          if (!sh) throw new Error("המשמרת לא נמצאה, אולי נמחקה.");
          if (!D.Can.editShift(me, sh)) deny();
          Object.assign(sh, fields);
          return sh;
        }
        const sh = { id: newId("s"), memberIds: [], ...fields, createdBy: me.id };
        s.shifts.push(sh);
        log(s, me.id, `משמרת חדשה ב${teamName(sh.team)}: ${sh.title}`);
        return sh;
      });
    },

    async deleteShift(id) {
      return mutate((s, me) => {
        const sh = s.shifts.find(x => x.id === id);
        if (!sh) return;
        if (!D.Can.editShift(me, sh)) deny();
        s.shifts = s.shifts.filter(x => x.id !== id);
      });
    },

    // הרשמה או ביטול. מישהו אחר מלבדי: רק מי שמנהל את המשמרת
    async toggleSignup(shiftId, memberId) {
      return mutate((s, me) => {
        const sh = s.shifts.find(x => x.id === shiftId);
        if (!sh) throw new Error("המשמרת לא נמצאה.");
        const who = memberId || me.id;
        if (who !== me.id && !D.Can.editShift(me, sh)) deny();
        const on = !sh.memberIds.includes(who);
        if (on && sh.capacity && sh.memberIds.length >= sh.capacity) throw new Error("המשמרת כבר מלאה.");
        sh.memberIds = on ? [...sh.memberIds, who] : sh.memberIds.filter(x => x !== who);
        return on;
      });
    },

    async saveSettings(patch) {
      return mutate((s, me) => {
        if (!D.Can.admin(me)) deny();
        for (const k of ["campName", "campNameEn", "eventStart", "eventEnd", "place", "joinCode"])
          if (k in patch && String(patch[k]).trim()) s.settings[k] = String(patch[k]).trim();
      });
    },

    async revokeLead(memberId, teamId) {
      return mutate((s, me) => {
        if (!D.Can.admin(me)) deny();
        const m = s.members.find(x => x.id === memberId);
        if (!m) return;
        m.teams = m.teams.map(t => (t.team === teamId ? { ...t, lead: false } : t));
        log(s, me.id, `ביטול הובלת צוות ${teamName(teamId)} של ${m.name}`);
      });
    },

    async removeMember(memberId) {
      return mutate((s, me) => {
        if (!D.Can.admin(me)) deny();
        if (memberId === me.id) throw new Error("אי אפשר להסיר את עצמך.");
        const m = s.members.find(x => x.id === memberId);
        if (!m) return;
        s.members = s.members.filter(x => x.id !== memberId);
        s.privates = s.privates.filter(p => p.memberId !== memberId);
        for (const t of s.tasks) {
          if (t.ownerId === memberId) t.ownerId = null;
          t.helperIds = t.helperIds.filter(x => x !== memberId);
        }
        for (const sh of s.shifts) sh.memberIds = sh.memberIds.filter(x => x !== memberId);
        for (const acc of Object.values(s.accounts)) if (acc.memberId === memberId) acc.memberId = null;
        log(s, me.id, `הסרה מהקאמפ: ${m.name}`);
      });
    },

    async resetDemo() {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      setSession(null);
    },

    demoMembers() { return read().members.filter(m => m.demo); },

    // שינוי מלשונית אחרת
    onExternalChange(cb) {
      root.addEventListener("storage", e => { if (e.key === KEY || e.key === SESSION) cb(); });
    }
  };

  root.DB = LocalDB;
})(window);
