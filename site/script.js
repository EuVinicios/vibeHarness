/* VibeHarness landing — vanilla JS (no frameworks) */
(function () {
  "use strict";

  /* ---------- Theme toggle ---------- */
  var root = document.documentElement;
  var themeBtn = document.getElementById("theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("vh-theme", next); } catch (e) { /* private mode */ }
    });
  }

  /* ---------- Mobile nav ---------- */
  var navToggle = document.getElementById("nav-toggle");
  var navMenu = document.getElementById("nav-menu");
  if (navToggle && navMenu) {
    navToggle.addEventListener("click", function () {
      var open = navMenu.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });
    navMenu.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        navMenu.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Copy buttons (terminal 1-click) ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  var timers = new WeakMap();
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var label = btn.querySelector(".copy-label");
      var original = label ? label.textContent : null;
      copyText(btn.getAttribute("data-copy"))
        .then(function () {
          btn.classList.add("copied");
          if (label) label.textContent = "Copiado! ✅";
          var prev = timers.get(btn);
          if (prev) clearTimeout(prev);
          timers.set(btn, setTimeout(function () {
            btn.classList.remove("copied");
            if (label) label.textContent = original;
          }, 1800));
        })
        .catch(function () {
          if (label) label.textContent = "Erro 😕";
        });
    });
  });

  /* ---------- CLI simulator (hero) ---------- */
  var sim = document.getElementById("sim-body");
  if (sim) {
    var lines = [
      { html: '<span class="sim-prompt">$</span> vibe-harness install', delay: 400 },
      { html: '<span class="sim-dim">→ configurando regras · conectando MCP no seu cliente de IA…</span>', delay: 900 },
      { html: '<span class="sim-ok">✔</span> pronto: IA conectada, projeto guiado', delay: 700 },
      { html: '<span class="sim-prompt">$</span> vibe-harness prd', delay: 1100 },
      { html: '<span class="sim-dim">→ sua especificação gerada e revisada em chat…</span>', delay: 900 },
      { html: '<span class="sim-ok">✔</span> spec + stack curada travadas', delay: 700 },
      { html: '<span class="sim-prompt">$</span> vibe-harness pack', delay: 1100 },
      { html: '<span class="sim-warn">⚠</span> <span class="sim-dim">.env sanitizado · 3 segredos protegidos do prompt</span>', delay: 800 },
      { html: '<span class="sim-prompt">$</span> vibe-harness audit', delay: 1100 },
      { html: '<span class="sim-dim">→ segurança · boas práticas · arquitetura…</span>', delay: 900 },
      { html: '<span class="sim-score">▶ score de produção: 98/100</span> <span class="sim-dim">— pode deployar com confiança</span>', delay: 800 },
    ];

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cursor = document.createElement("span");
    cursor.className = "sim-cursor";
    cursor.setAttribute("aria-hidden", "true");

    function renderAll() {
      sim.textContent = "";
      lines.forEach(function (l) {
        var div = document.createElement("div");
        div.innerHTML = l.html;
        sim.appendChild(div);
      });
      sim.appendChild(cursor);
    }

    if (reduced) {
      renderAll();
    } else {
      var i = 0;
      function next() {
        if (i >= lines.length) {
          sim.appendChild(cursor);
          return;
        }
        var l = lines[i++];
        var div = document.createElement("div");
        div.innerHTML = l.html;
        div.appendChild(cursor);
        sim.appendChild(div);
        sim.scrollTop = sim.scrollHeight;
        setTimeout(next, l.delay);
      }
      var obs = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          obs.disconnect();
          setTimeout(next, 350);
        }
      }, { threshold: 0.35 });
      obs.observe(sim);
    }
  }

  /* ---------- Footer year ---------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
