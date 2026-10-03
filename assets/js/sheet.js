// 料金・営業時間・お知らせを Google スプレッドシートから読み直して描き直す。
// 読めなかったときは、ページに最初から入っている内容（ビルド時の data/*.csv）がそのまま表示される。
// 描き方は sheetdata.py と同じにしてある。片方を直したら、もう片方も直すこと。
(() => {
  const cfg = window.SHEET || {};
  if (!cfg.id) return;
  const ja = document.documentElement.lang === "ja";
  const t = (en, jp) => (ja ? jp : en);
  const MINS = [30, 45, 60, 75, 90];
  const TABS = ["マッサージ料金", "その他の料金", "営業時間", "お知らせ"];

  const url = (tab) =>
    cfg.id === "local"
      ? `${cfg.root}data/${encodeURIComponent(tab)}.csv?ts=${Date.now()}`
      : `https://docs.google.com/spreadsheets/d/${cfg.id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;

  // CSV を行の配列（見出しをキーにしたオブジェクト）にする
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const head = (rows.shift() || []).map((h) => h.trim());
    return rows
      .filter((r) => r.some((v) => v.trim() !== ""))
      .map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const num = (v) => { const d = String(v || "").replace(/\D/g, ""); return d ? parseInt(d, 10) : null; };
  const money = (n) => `$${n}`;
  const mins = (n) => t(`${n} min`, `${n}分`);
  const hhmm = (v) => { const p = String(v || "").split(":"); return p.length >= 2 ? `${p[0]}:${p[1]}` : v; };
  const pm = (v) => { const [h, m] = String(v).split(":").map(Number); if (isNaN(h)) return v; return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")}${h < 12 ? "am" : "pm"}`; };
  function claim(v) {
    if (v === "できる") return `<span class="claim">${t("Health fund claimable", "保険請求できます")}</span>`;
    if (v === "できない") return `<span class="claim no">${t("Not claimable", "保険請求の対象外")}</span>`;
    return `<span class="note">${t("Ask us", "お尋ねください")}</span>`;
  }

  function priceOf(D, ref) {
    if (ref.includes("@")) {
      const [id, m] = ref.split("@");
      const r = D["マッサージ料金"].find((x) => x.ID === id);
      return r ? num(r[`${m}分`]) : null;
    }
    const r = D["その他の料金"].find((x) => x.ID === ref);
    return r ? num(r["料金($)"]) : null;
  }

  function matrixBody(D) {
    return D["マッサージ料金"].filter((r) => r["施術名"]).map((r) => {
      const name = t(r.Treatment || r["施術名"], r["施術名"]);
      const sub = t(r.Note || "", r["補足"] || "");
      const tds = MINS.map((m) => { const p = num(r[`${m}分`]); return p !== null ? `<td data-label="${mins(m)}">${money(p)}</td>` : `<td class="none" data-label="${mins(m)}">—</td>`; }).join("");
      return `<tr><th scope="row">${esc(name)}<small>${esc(sub)}</small></th>${tds}<td class="claim-cell">${claim(r["保険請求"])}</td></tr>`;
    }).join("");
  }

  function otherList(rows) {
    const groups = [];
    rows.forEach((r) => {
      const key = `${r["名前"]}\u0000${r["説明"] || ""}`;
      if (groups.length && groups[groups.length - 1].key === key) groups[groups.length - 1].rs.push(r);
      else groups.push({ key, rs: [r] });
    });
    return groups.map(({ rs }) => {
      const r = rs[0];
      const name = t(r.Name || r["名前"], r["名前"]);
      const desc = t(r.Description || "", r["説明"] || "");
      const d = desc ? `<span class="desc">${esc(desc)}</span>` : "";
      if (rs.length > 1) {
        const opts = rs.map((x) => `<span><span class="time">${mins(num(x["時間(分)"]) || 0)}</span>${money(num(x["料金($)"]) || 0)}</span>`).join("");
        return `<li><span class="name">${esc(name)}</span>${d}<span class="opts">${opts}</span></li>`;
      }
      const tmin = num(r["時間(分)"]);
      const tm = tmin ? `<span class="time">${mins(tmin)}</span>` : "";
      const p = num(r["料金($)"]);
      return `<li><span class="name">${esc(name)}</span><span class="price">${tm}${p !== null ? money(p) : "—"}</span>${d}</li>`;
    }).join("");
  }

  function hoursRows(D) {
    return D["営業時間"].filter((r) => r["曜日"]).map((r) => [t(r.Day || r["曜日"], r["曜日"]), hhmm(r["開店"]), hhmm(r["閉店"]), hhmm(r["最終受付"])]);
  }

  function apply(D) {
    document.querySelectorAll('[data-sheet="matrix"]').forEach((el) => { el.innerHTML = matrixBody(D); });
    document.querySelectorAll('[data-sheet="list"]').forEach((el) => {
      const kubun = (el.dataset.kubun || "").split("|").filter(Boolean);
      const ids = (el.dataset.ids || "").split("|").filter(Boolean);
      const rows = D["その他の料金"].filter((r) => r["名前"] && (kubun.includes(r["区分"]) || ids.includes(r.ID)));
      el.innerHTML = otherList(rows);
    });
    document.querySelectorAll("[data-ref]").forEach((el) => { const p = priceOf(D, el.dataset.ref); if (p !== null) el.textContent = money(p); });
    const hr = hoursRows(D);
    document.querySelectorAll('[data-sheet="hours"]').forEach((el) => {
      el.innerHTML = hr.map(([day, op, cl, last]) => op
        ? `<span>${esc(day)}</span><span>${op}–${cl}${last ? ` <span class="note">${t(`(last booking ${pm(last)})`, `（最終受付 ${last}）`)}</span>` : ""}</span>`
        : `<span class="closed">${esc(day)}</span><span class="closed">${t("Closed", "定休")}</span>`).join("");
    });
    document.querySelectorAll('[data-sheet="hours-short"]').forEach((el) => {
      el.innerHTML = hr.map(([day, op, cl]) => `<li>${esc(day)} ${op ? `${op}–${cl}` : t("closed", "定休")}</li>`).join("");
    });
    const n = D["お知らせ"].find((r) => r["表示"] === "はい" && (r["お知らせ"] || r.Notice));
    document.querySelectorAll('[data-sheet="notice"]').forEach((el) => {
      if (!n) { el.hidden = true; el.innerHTML = ""; return; }
      const text = esc(t(n.Notice || n["お知らせ"], n["お知らせ"]));
      let link = n["リンク"] || "";
      if (link && !/^https?:/.test(link)) link = cfg.root + (ja ? "ja/" : "") + link;
      el.innerHTML = `<div class="wrap">${link ? `<a href="${esc(link)}">${text}</a>` : text}</div>`;
      el.hidden = false;
    });
  }

  Promise.all(TABS.map((tab) => fetch(url(tab), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })))
    .then((texts) => {
      const D = Object.fromEntries(TABS.map((tab, i) => [tab, parseCSV(texts[i])]));
      // 見出しが変わっている（列を消した・名前を変えた）表は使わず、元の表示を残す
      const ok = D["マッサージ料金"].length && "施術名" in D["マッサージ料金"][0] && D["その他の料金"].length && "料金($)" in D["その他の料金"][0];
      if (!ok) { console.warn("スプレッドシートの見出しが想定と違うため、元の表示のままにします"); return; }
      apply(D);
      document.documentElement.dataset.sheet = "loaded";
    })
    .catch((err) => console.warn("スプレッドシートを読めなかったので、元の表示のままにします", err));
})();
