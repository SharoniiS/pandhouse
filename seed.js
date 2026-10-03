/* נתוני דוגמה למצב הדגמה בלבד. אנשים ומשימות מומצאים, כדי לראות איך האתר נראה עם קאמפ מלא. */
(function (root) {
  "use strict";

  const M = (id, name, phone, status, ticket, teams, arrive, leave, extra = {}) => ({
    id, name, phone, status, ticket, arrive, leave, shiftCoord: false, isAdmin: false,
    teams: teams.map(t => (typeof t === "string" ? { team: t, lead: false } : t)),
    joinedAt: "2026-09-20T10:00:00.000Z", onboarded: true, demo: true, ...extra
  });
  const L = team => ({ team, lead: true });

  function demoSeed() {
    const members = [
      M("m_noa", "נועה ברק", "050-000-0101", "in", true, [L("kitchen"), "gift"], "2026-11-01", "2026-11-07"),
      M("m_itai", "איתי לוי", "050-000-0102", "in", true, [L("logistics")], "2026-10-31", "2026-11-08"),
      M("m_maya", "מאיה כהן", "050-000-0103", "in", true, [L("art"), "gift"], "2026-11-01", "2026-11-07"),
      M("m_omer", "עומר חדד", "050-000-0104", "in", true, ["logistics", L("moop")], "2026-11-01", "2026-11-07"),
      M("m_shira", "שירה אלון", "050-000-0105", "in", true, [L("gift"), "kitchen"], "2026-11-02", "2026-11-07"),
      M("m_daniel", "דניאל פרץ", "050-000-0106", "maybe", false, [L("finance")], "2026-11-03", "2026-11-06"),
      M("m_tamar", "תמר שגיא", "050-000-0107", "in", true, ["art"], "2026-11-02", "2026-11-07"),
      M("m_yonatan", "יונתן רז", "050-000-0108", "in", false, ["kitchen"], "2026-11-01", "2026-11-06"),
      M("m_lia", "ליה מזרחי", "050-000-0109", "in", true, ["moop", "art"], "2026-11-02", "2026-11-07"),
      M("m_ori", "אורי גולן", "050-000-0110", "in", true, ["logistics"], "2026-10-31", "2026-11-07", { shiftCoord: true }),
      M("m_hadas", "הדס נחום", "050-000-0111", "maybe", false, ["gift"], "2026-11-04", "2026-11-07"),
      M("m_gil", "גיל אברהם", "050-000-0112", "in", true, ["kitchen", "logistics"], "2026-11-01", "2026-11-08"),
      M("m_roni", "רוני דיין", "050-000-0113", "maybe", false, [], "2026-11-03", "2026-11-07"),
      M("m_adi", "עדי שמש", "050-000-0114", "out", false, ["art"], "", "")
    ];

    const privates = [
      { memberId: "m_noa", diets: ["צמחוני"], allergies: "", needs: "" },
      { memberId: "m_itai", diets: [], allergies: "", needs: "מגיע עם טנדר, יש מקום לציוד" },
      { memberId: "m_maya", diets: ["טבעוני"], allergies: "", needs: "" },
      { memberId: "m_omer", diets: [], allergies: "", needs: "" },
      { memberId: "m_shira", diets: ["ללא גלוטן"], allergies: "אגוזים", needs: "" },
      { memberId: "m_daniel", diets: [], allergies: "", needs: "צריך טרמפ מתל אביב" },
      { memberId: "m_tamar", diets: ["טבעוני"], allergies: "", needs: "" },
      { memberId: "m_yonatan", diets: [], allergies: "", needs: "" },
      { memberId: "m_lia", diets: ["צמחוני"], allergies: "סומסום", needs: "" },
      { memberId: "m_ori", diets: [], allergies: "", needs: "" },
      { memberId: "m_hadas", diets: ["צמחוני", "ללא לקטוז"], allergies: "", needs: "ישנה בקרוואן, צריכה חיבור לחשמל בלילה" },
      { memberId: "m_gil", diets: ["כשר"], allergies: "", needs: "" },
      { memberId: "m_roni", diets: [], allergies: "", needs: "" },
      { memberId: "m_adi", diets: [], allergies: "", needs: "" }
    ];

    const T = (id, team, title, status, ownerId, extra = {}) => ({
      id, team, title, status, ownerId, helperIds: [], cost: null, deps: [], blockedReason: "",
      createdBy: ownerId || "m_noa", createdAt: "2026-09-25T12:00:00.000Z", updatedAt: "2026-09-25T12:00:00.000Z", ...extra
    });
    const tasks = [
      T("t_k1", "kitchen", "תפריט לחמישה ימים", "doing", "m_noa", { helperIds: ["m_shira"] }),
      T("t_k2", "kitchen", "קניות יבשות בסיטונאות", "todo", "m_yonatan", { helperIds: ["m_gil"], cost: 3800, deps: ["t_k1"] }),
      T("t_k3", "kitchen", "קירור: קרח יומי או מקרר גז", "blocked", "m_gil", { cost: 1200, blockedReason: "צריך לדעת כמה אנשים בקאמפ בכל יום" }),
      T("t_k4", "kitchen", "גז, מבערים ובדיקת תקינות", "todo", null, { cost: 400 }),
      T("t_k5", "kitchen", "כלים רב פעמיים לכל הקאמפ", "idea", null, { cost: 600, createdBy: "m_shira" }),
      T("t_a1", "art", "פנדה ענקית מוארת בכניסה לקאמפ", "doing", "m_maya", { helperIds: ["m_tamar", "m_lia"], cost: 2200, deps: ["t_l3"] }),
      T("t_a2", "art", "רשתות צל צבעוניות", "todo", "m_tamar", { cost: 900 }),
      T("t_a3", "art", "תאורת לד לשבילים", "idea", null, { cost: 350, createdBy: "m_lia" }),
      T("t_g1", "gift", "בר תה במבוק בשקיעה", "todo", "m_shira", { helperIds: ["m_hadas"], cost: 700, deps: ["t_k2"] }),
      T("t_g2", "gift", "סדנת ציור פנים פנדה", "idea", null, { cost: 150, createdBy: "m_hadas" }),
      T("t_g3", "gift", "כוסות רב פעמיות לאורחים", "todo", "m_noa", { cost: 300 }),
      T("t_l1", "logistics", "הזמנת משאית", "done", "m_itai", { cost: 4800 }),
      T("t_l2", "logistics", "רשימת ציוד במחסן", "doing", "m_ori", { helperIds: ["m_omer"] }),
      T("t_l3", "logistics", "גנרטור וסולר", "blocked", "m_itai", { cost: 2500, blockedReason: "מחכים להצעת מחיר שנייה" }),
      T("t_l4", "logistics", "מפת קאמפ ומיקום אוהלים", "todo", "m_ori"),
      T("t_m1", "moop", "שקיות לשלושה זרמי פסולת", "todo", "m_omer", { cost: 250 }),
      T("t_m2", "moop", 'סבב חשל"ש יומי', "todo", "m_lia"),
      T("t_m3", "moop", "מיכל למים אפורים", "idea", null, { cost: 400, createdBy: "m_omer" }),
      T("t_f1", "finance", "דמי קאמפ למשתתף", "doing", "m_daniel"),
      T("t_f2", "finance", "טבלת הוצאות והחזרים", "todo", "m_daniel")
    ];

    const S = (id, team, kind, title, date, start, end, place, capacity, memberIds) =>
      ({ id, team, kind, title, date, start, end, place, capacity, notes: "", memberIds, createdBy: "m_ori" });
    const shifts = [
      S("s_load", "logistics", "load_warehouse", "העמסת המשאית במחסן", "", "", "", "המחסן", 8, ["m_ori", "m_omer", "m_gil"]),
      S("s_desert", "logistics", "unload_desert", "פריקה והקמה במדבר", "", "", "", "הר צין", 10, ["m_itai", "m_noa", "m_yonatan", "m_maya"]),
      S("s_back", "logistics", "unload_warehouse", "פריקה חזרה במחסן", "", "", "", "המחסן", 8, ["m_tamar"]),
      S("s_dinner3", "kitchen", "team", "ארוחת ערב", "2026-11-03", "18:00", "21:00", "המטבח", 4, ["m_noa", "m_yonatan"]),
      S("s_dish3", "kitchen", "team", "שטיפת כלים אחרי ערב", "2026-11-03", "21:00", "22:00", "המטבח", 3, []),
      S("s_bfast4", "kitchen", "team", "ארוחת בוקר", "2026-11-04", "08:30", "10:30", "המטבח", 3, ["m_gil"]),
      S("s_tea4", "gift", "team", "בר תה בשקיעה", "2026-11-04", "16:30", "18:30", "הבר", 3, ["m_shira", "m_hadas"]),
      S("s_moop5", "moop", "team", 'סבב חשל"ש בוקר', "2026-11-05", "09:00", "10:00", "כל הקאמפ", 4, ["m_lia"])
    ];

    const A = (at, actorId, text) => ({ id: "a_" + at, at, actorId, text });
    const activity = [
      A("2026-09-21T09:00:00.000Z", "m_noa", "הצהרה על הובלת צוות מטבח"),
      A("2026-09-21T11:30:00.000Z", "m_itai", "הצהרה על הובלת צוות לוגיסטיקה"),
      A("2026-09-24T18:10:00.000Z", "m_itai", "משימה הושלמה: הזמנת משאית"),
      A("2026-09-28T20:40:00.000Z", "m_itai", "משימה נתקעה: גנרטור וסולר"),
      A("2026-09-30T08:15:00.000Z", "m_hadas", "רעיון חדש בגיפט: סדנת ציור פנים פנדה")
    ];

    return {
      version: 2,
      settings: { campName: "פנדהאוס", campNameEn: "Pandhouse", eventStart: "2026-11-02", eventEnd: "2026-11-07", place: "הר צין", joinCode: "PANDA" },
      members, privates, tasks, shifts, activity,
      accounts: {}
    };
  }

  root.demoSeed = demoSeed;
})(window);
