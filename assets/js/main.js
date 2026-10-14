// JSが無くても全内容が読める作りにしてある(問診票は全回答が並ぶ)。ここでは操作性だけ足す。
document.documentElement.classList.add("js");

// スマホのメニュー開閉
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

// 問診票: 悩みを選ぶと、合う施術だけを表示する
const concerns = [...document.querySelectorAll(".concern")];
const answers = [...document.querySelectorAll(".answer")];
function choose(id) {
  concerns.forEach((c) => c.setAttribute("aria-selected", String(c.dataset.target === id)));
  answers.forEach((a) => { a.hidden = a.id !== id; });
}
if (concerns.length) {
  concerns.forEach((c) => c.addEventListener("click", () => choose(c.dataset.target)));
  choose(concerns[0].dataset.target);
}

// 問い合わせフォーム: 送信先が未設定ならメールアプリを開く
const form = document.querySelector("[data-enquiry]");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = form.querySelector(".form-status");
    const data = new FormData(form);
    const endpoint = form.dataset.endpoint;
    if (!endpoint) {
      const body = [...data.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
      location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent(form.dataset.subject)}&body=${encodeURIComponent(body)}`;
      status.textContent = form.dataset.msgMail;
      return;
    }
    try {
      const res = await fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      status.textContent = form.dataset.msgOk;
    } catch (err) {
      status.textContent = form.dataset.msgNg;
    }
  });
}
