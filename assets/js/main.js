(function () {
  "use strict";

  var doc = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Header: scroll state ---------- */
  var header = $(".header");
  var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 10); };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile menu ---------- */
  var burger = $(".burger");
  var nav = $("#nav");
  var setMenu = function (open) {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Menyuni yopish" : "Menyuni ochish");
    nav.classList.toggle("is-open", open);
    header.classList.toggle("menu-open", open);
  };
  burger.addEventListener("click", function () { setMenu(burger.getAttribute("aria-expanded") !== "true"); });
  $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = $$(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    doc.classList.add("js");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealEls.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 70 + "ms";
      io.observe(el);
    });
  }

  /* ---------- Sticky CTA (mobile) ---------- */
  var sticky = $("#sticky-cta");
  var hero = $(".hero");
  var leadSec = $("#ariza");
  if ("IntersectionObserver" in window) {
    var heroOut = false, leadIn = false;
    var update = function () { sticky.classList.toggle("is-visible", heroOut && !leadIn); };
    new IntersectionObserver(function (e) { heroOut = !e[0].isIntersecting; update(); }).observe(hero);
    new IntersectionObserver(function (e) { leadIn = e[0].isIntersecting; update(); }, { threshold: 0.15 }).observe(leadSec);
  }

  /* ---------- Course preselect ---------- */
  var courseInput = $("#course");
  var courseBox = $("#form-course");
  var courseName = $("#form-course-name");
  var setCourse = function (val) {
    courseInput.value = val || "";
    courseName.textContent = val || "";
    courseBox.hidden = !val;
  };
  $$("[data-course]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setCourse(btn.getAttribute("data-course"));
      setTimeout(function () { $("#name").focus({ preventScroll: true }); }, reduceMotion ? 0 : 650);
    });
  });
  $("#form-course-clear").addEventListener("click", function () { setCourse(""); });

  /* ---------- Form ---------- */
  // Reklama manbasi (UTM / Facebook) — arizaga qo'shib yuboriladi
  var SRC=(function(){var K=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'],o={},has=false,q;
    try{q=new URLSearchParams(location.search)}catch(_){q=null}
    if(q){K.forEach(function(k){var v=q.get(k);if(v){o[k]=v.slice(0,100);has=true}});if(q.get('fbclid')){o.fbclid='1';has=true}}
    if(!has&&document.referrer){try{var rh=new URL(document.referrer).host;if(rh&&rh!==location.host){o.ref=rh;has=true}}catch(_){}}
    try{if(has)sessionStorage.setItem('icz_src',JSON.stringify(o));else o=JSON.parse(sessionStorage.getItem('icz_src')||'{}')||{}}catch(_){}
    return o}());
  var form = $("#lead-form");
  var nameEl = $("#name");
  var phoneEl = $("#phone");
  var errBox = $("#form-error");
  var success = $("#success");
  $("#ts").value = String(Date.now());

  var digits = function (v) { return (v || "").replace(/\D/g, ""); };
  var formatPhone = function (d) {
    d = d.slice(0, 9);
    var out = d.slice(0, 2);
    if (d.length > 2) out += " " + d.slice(2, 5);
    if (d.length > 5) out += " " + d.slice(5, 7);
    if (d.length > 7) out += " " + d.slice(7, 9);
    return out;
  };

  phoneEl.addEventListener("input", function () {
    var d = digits(phoneEl.value);
    if (d.length > 9 && d.indexOf("998") === 0) d = d.slice(3); // pasted with country code
    phoneEl.value = formatPhone(d);
    clearErr(phoneEl);
  });
  nameEl.addEventListener("input", function () { clearErr(nameEl); });

  function fieldOf(el) { return el.closest(".field"); }
  function setErr(el, msg) {
    var f = fieldOf(el);
    f.classList.add("is-invalid");
    el.setAttribute("aria-invalid", "true");
    $(".field__err", f).textContent = msg;
  }
  function clearErr(el) {
    var f = fieldOf(el);
    f.classList.remove("is-invalid");
    el.removeAttribute("aria-invalid");
    $(".field__err", f).textContent = "";
  }

  var NAME_RE;
  try { NAME_RE = new RegExp("^[\\p{L}\\s'’‘ʻʼ`.-]{2,50}$", "u"); }
  catch (_) { NAME_RE = /^[^0-9<>@#$%^&*()_+=\[\]{}|\\\/:;"?!]{2,50}$/; }

  function validate() {
    var ok = true;
    var name = nameEl.value.trim().replace(/\s+/g, " ");
    nameEl.value = name;
    if (name.length < 2) { setErr(nameEl, "Iltimos, ismingizni kiriting."); ok = false; }
    else if (!NAME_RE.test(name)) { setErr(nameEl, "Ismda faqat harflar bo‘lishi kerak."); ok = false; }
    var d = digits(phoneEl.value);
    if (d.length !== 9) { setErr(phoneEl, "Telefon raqamni to‘liq kiriting: 9 ta raqam."); ok = false; }
    if (!ok) { var first = $(".is-invalid input", form); if (first) first.focus(); }
    return ok;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errBox.hidden = true;
    if (form.classList.contains("is-loading") || !validate()) return;

    form.classList.add("is-loading");
    var payload = {
      name: nameEl.value.trim(),
      phone: "998" + digits(phoneEl.value),
      course: courseInput.value,
      website: $("#website").value,
      ts: $("#ts").value,
      src: SRC
    };

    var ctrl = "AbortController" in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);

    fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, data: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.data.ok) throw new Error((res.data && res.data.error) || "error");
        showSuccess(payload.name);
      })
      .catch(function (err) {
        var msg = err && err.message && err.message !== "error" && err.name !== "AbortError" && err.message.length < 140
          ? err.message
          : "Ariza yuborilmadi. Internetni tekshirib, qayta urinib ko‘ring.";
        errBox.innerHTML = "";
        errBox.appendChild(document.createTextNode(msg + " Yoki qo‘ng‘iroq qiling: "));
        var a = document.createElement("a");
        a.href = "tel:+998874007711";
        a.textContent = "+998 87 400 77 11";
        errBox.appendChild(a);
        errBox.hidden = false;
      })
      .then(function () {
        clearTimeout(timer);
        form.classList.remove("is-loading");
      });
  });

  function showSuccess(name) {
    var first = name.split(" ")[0];
    $("#success-text").textContent = "Rahmat, " + first + "! Mutaxassisimiz tez orada siz bilan bog‘lanadi.";
    form.hidden = true;
    success.hidden = false;
    success.focus({ preventScroll: true });
    if (!reduceMotion) confetti($(".confetti", success));
  }

  $("#success-again").addEventListener("click", function () {
    form.reset();
    setCourse("");
    $("#ts").value = String(Date.now());
    success.hidden = true;
    form.hidden = false;
    nameEl.focus();
  });

  function confetti(box) {
    box.innerHTML = "";
    var colors = ["#a001fc", "#5a0dff", "#0041fc", "#2ee59d", "#ffb020", "#ff4d8d"];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 42; i++) {
      var p = document.createElement("i");
      var ang = Math.random() * Math.PI * 2;
      var dist = 110 + Math.random() * 170;
      p.style.setProperty("--x", Math.cos(ang) * dist + "px");
      p.style.setProperty("--y", Math.sin(ang) * dist - 40 + "px");
      p.style.setProperty("--r", (Math.random() * 720 - 360) + "deg");
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (0.45 + Math.random() * 0.25) + "s";
      if (i % 3 === 0) { p.style.width = "8px"; p.style.height = "8px"; p.style.borderRadius = "50%"; }
      frag.appendChild(p);
    }
    box.appendChild(frag);
  }

  /* ---------- Year ---------- */
  $("#year").textContent = String(new Date().getFullYear());
})();
