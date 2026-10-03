/* פנדות ב-SVG: אווטאר ייחודי לכל משתתף (נגזר מהמזהה שלו) ואיורים קטנים לאתר. */
(function (root) {
  "use strict";

  const INK = "#1e2320";
  // צבעי אביזרים לאווטאר כשאין למשתתף צוות
  const ACCENTS = ["#e0603a", "#7a4fd6", "#d9447f", "#3f9a45", "#2b78b5", "#b27a00", "#14a3a3", "#ef8f1f"];
  const SOFTS = ["#fde8df", "#ece5fb", "#fbe2ec", "#e2f2e2", "#deebf7", "#f8eccd", "#d9f2f1", "#fdebd4"];

  function rng(seed) {
    let s = seed || 1;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return s / 4294967296; };
  }
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  // ראש הפנדה עצמו, בלי רקע. נמצא במרחב 64x64.
  function face(r, opts) {
    const ear = 7.5 + r() * 2.5;
    const tilt = 22 + r() * 18;
    const patchRx = 5 + r() * 1.3, patchRy = 7 + r() * 1.5;
    const eyes = opts.sleepy ? "sleep" : pick(r, ["dot", "dot", "dot", "happy", "sparkle"]);
    const mouth = pick(r, ["smile", "smile", "w", "open"]);
    const blush = r() < 0.55;
    const acc = opts.accessory !== undefined ? opts.accessory : pick(r, ["goggles", "goggles", "flower", "bandana", "lights", "none"]);
    const c = opts.accent;

    let s = "";
    s += `<circle cx="15" cy="18" r="${ear.toFixed(1)}" fill="${INK}"/><circle cx="49" cy="18" r="${ear.toFixed(1)}" fill="${INK}"/>`;
    s += `<ellipse cx="32" cy="36" rx="21.5" ry="19.5" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
    s += `<ellipse cx="23.5" cy="35" rx="${patchRx.toFixed(1)}" ry="${patchRy.toFixed(1)}" transform="rotate(${tilt.toFixed(0)} 23.5 35)" fill="${INK}"/>`;
    s += `<ellipse cx="40.5" cy="35" rx="${patchRx.toFixed(1)}" ry="${patchRy.toFixed(1)}" transform="rotate(${(-tilt).toFixed(0)} 40.5 35)" fill="${INK}"/>`;

    if (eyes === "dot" || eyes === "sparkle") {
      s += `<circle cx="24.5" cy="34.5" r="2.3" fill="#fff"/><circle cx="39.5" cy="34.5" r="2.3" fill="#fff"/>`;
      s += `<circle cx="25" cy="35" r="1.25" fill="${INK}"/><circle cx="39" cy="35" r="1.25" fill="${INK}"/>`;
      if (eyes === "sparkle") s += `<circle cx="23.7" cy="33.6" r=".7" fill="#fff"/><circle cx="38.7" cy="33.6" r=".7" fill="#fff"/>`;
    } else if (eyes === "happy") {
      s += `<path d="M22 35.5q2.5-3 5 0M37 35.5q2.5-3 5 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    } else {
      s += `<path d="M22 34.5q2.5 2.5 5 0M37 34.5q2.5 2.5 5 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    }
    if (blush) s += `<circle cx="18.5" cy="43.5" r="2.6" fill="#f7a8bb" opacity=".75"/><circle cx="45.5" cy="43.5" r="2.6" fill="#f7a8bb" opacity=".75"/>`;
    s += `<ellipse cx="32" cy="42.5" rx="3" ry="2.1" fill="${INK}"/>`;
    if (mouth === "smile") s += `<path d="M28.6 46.2q3.4 3 6.8 0" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    else if (mouth === "w") s += `<path d="M28 46q2 2.2 4 0q2 2.2 4 0" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
    else s += `<path d="M29.4 45.6h5.2q-.4 3.6-2.6 3.6t-2.6-3.6z" fill="${INK}"/><path d="M30.6 47.7q1.4-1 2.8 0q-.5 1.1-1.4 1.1t-1.4-1.1z" fill="#f28da5"/>`;

    if (acc === "goggles") {
      s += `<path d="M11 25.5Q32 21 53 25.5" stroke="${INK}" stroke-width="2.2" fill="none"/>`;
      s += `<circle cx="25.5" cy="23.5" r="5.3" fill="${c}" stroke="${INK}" stroke-width="1.6"/><circle cx="38.5" cy="23.5" r="5.3" fill="${c}" stroke="${INK}" stroke-width="1.6"/>`;
      s += `<rect x="30.5" y="22.3" width="3" height="2.2" rx="1" fill="${INK}"/>`;
      s += `<ellipse cx="23.8" cy="21.8" rx="1.6" ry="1.1" fill="#fff" opacity=".8"/><ellipse cx="36.8" cy="21.8" rx="1.6" ry="1.1" fill="#fff" opacity=".8"/>`;
    } else if (acc === "flower") {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        s += `<circle cx="${(48 + Math.cos(a) * 3.6).toFixed(1)}" cy="${(14 + Math.sin(a) * 3.6).toFixed(1)}" r="2.9" fill="${c}"/>`;
      }
      s += `<circle cx="48" cy="14" r="2.3" fill="#ffd25e" stroke="${INK}" stroke-width=".8"/>`;
    } else if (acc === "bandana") {
      s += `<path d="M11.5 31Q12 15 32 15.5Q52 15 52.5 31Q32 23 11.5 31z" fill="${c}" stroke="${INK}" stroke-width="1.3"/>`;
      s += `<circle cx="22" cy="22" r="1.1" fill="#fff" opacity=".85"/><circle cx="32" cy="19.5" r="1.1" fill="#fff" opacity=".85"/><circle cx="42" cy="22" r="1.1" fill="#fff" opacity=".85"/>`;
      s += `<path d="M52 29l6 3-5 2z" fill="${c}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`;
    } else if (acc === "lights") {
      s += `<path d="M12.5 27Q32 13 51.5 27" stroke="${INK}" stroke-width="1.2" fill="none"/>`;
      const pts = [[16, 23.2], [23, 19.4], [32, 17.9], [41, 19.4], [48, 23.2]];
      const cols = [c, "#ffd25e", c, "#ffd25e", c];
      pts.forEach(([x, y], i) => { s += `<circle cx="${x}" cy="${y + 2}" r="2.2" fill="${cols[i]}" stroke="${INK}" stroke-width=".9"/>`; });
    }
    return s;
  }

  function colorsFor(seedNum, accent) {
    const i = seedNum % ACCENTS.length;
    return { accent: accent || ACCENTS[i], soft: SOFTS[ACCENTS.indexOf(accent)] || SOFTS[i] };
  }

  /* אווטאר עגול. seed הוא המזהה של המשתתף, accent צבע הצוות הראשון שלו (לא חובה). */
  function avatar(seed, { accent, soft, size = 40, label = "" } = {}) {
    const n = root.Domain.hashStr(String(seed));
    const col = colorsFor(n, accent);
    const r = rng(n);
    const bg = soft || col.soft;
    return `<svg class="panda-av" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="${label}">` +
      `<circle cx="32" cy="32" r="32" fill="${bg}"/>${face(r, { accent: col.accent })}</svg>`;
  }

  function logo(size = 36) {
    const r = rng(7);
    return `<svg class="panda-logo" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${face(r, { accent: "#3f9a45", accessory: "goggles" })}</svg>`;
  }

  // פנדה מציצה מעל דיונה, עם במבוק ושמש. לראש עמוד הבית.
  function hero() {
    const r = rng(11);
    return `<svg class="hero-art" viewBox="0 0 220 120" aria-hidden="true">
      <circle cx="176" cy="34" r="20" style="fill:var(--sun)"/>
      <path d="M0 86Q55 58 112 80T220 74V120H0z" style="fill:var(--dune-back)"/>
      <g transform="translate(70 30) scale(1.15)">${face(r, { accent: "#e0603a", accessory: "goggles" })}</g>
      <path d="M0 98Q70 74 130 94T220 92V120H0z" style="fill:var(--dune-front)"/>
      <g style="fill:var(--bamboo)">
        <rect x="22" y="22" width="6" height="84" rx="3"/><rect x="22" y="46" width="6" height="2.4" style="fill:var(--bamboo-dark)"/><rect x="22" y="72" width="6" height="2.4" style="fill:var(--bamboo-dark)"/>
        <rect x="34" y="40" width="5" height="66" rx="2.5"/><rect x="34" y="62" width="5" height="2.2" style="fill:var(--bamboo-dark)"/>
        <ellipse cx="16" cy="30" rx="9" ry="3.2" transform="rotate(-28 16 30)"/><ellipse cx="34" cy="26" rx="9" ry="3.2" transform="rotate(24 34 26)"/>
        <ellipse cx="45" cy="44" rx="8" ry="2.8" transform="rotate(20 45 44)"/>
      </g>
    </svg>`;
  }

  // פנדה ישנה למצבים ריקים
  function sleepy(size = 72) {
    const r = rng(3);
    return `<svg class="panda-empty" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
      ${face(r, { accent: "#7a4fd6", accessory: "none", sleepy: true })}
      <text x="52" y="12" font-size="9" font-weight="700" style="fill:var(--ink-3)">z</text><text x="58" y="5" font-size="6" font-weight="700" style="fill:var(--ink-3)">z</text>
    </svg>`;
  }

  root.Panda = { avatar, logo, hero, sleepy };
})(window);
