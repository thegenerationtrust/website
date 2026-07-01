/* =========================================================
   The Generation Trust — Interactions
   ========================================================= */
(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header scroll state ---------- */
  const header = document.querySelector(".site-header");
  const onScroll = () => {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile nav ---------- */
  const toggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  if (toggle) {
    toggle.addEventListener("click", () => {
      document.body.classList.toggle("nav-open");
      const open = document.body.classList.contains("nav-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    if (navLinks) {
      navLinks.addEventListener("click", (e) => {
        if (e.target.closest("a")) document.body.classList.remove("nav-open");
      });
    }
  }

  /* ---------- Scroll reveal ---------- */
  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && !prefersReduced) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Animated number counters ---------- */
  const counters = document.querySelectorAll("[data-count]");
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || "";
    const prefix = el.dataset.prefix || "";
    const decimals = (el.dataset.count.split(".")[1] || "").length;
    const duration = 1600;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = (target * eased).toFixed(decimals);
      const group = el.dataset.nogroup === undefined;
      el.textContent = prefix + (group ? Number(val).toLocaleString("en-GB") : val) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (counters.length) {
    if ("IntersectionObserver" in window && !prefersReduced) {
      const co = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              runCounter(entry.target);
              co.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.6 }
      );
      counters.forEach((el) => co.observe(el));
    } else {
      counters.forEach((el) => {
        el.textContent =
          (el.dataset.prefix || "") +
          Number(el.dataset.count).toLocaleString("en-GB") +
          (el.dataset.suffix || "");
      });
    }
  }

  /* ---------- Card spotlight (pointer-follow glow) ---------- */
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  /* ---------- Donate widget ---------- */
  const donate = document.querySelector("[data-donate]");
  if (donate) {
    const amountBtns = donate.querySelectorAll(".amount-btn");
    const custom = donate.querySelector("#custom-amount");
    const freqBtns = donate.querySelectorAll(".freq-toggle button");
    const impactText = donate.querySelector("[data-impact]");
    const cta = donate.querySelector("[data-donate-cta]");
    let amount = 30;

    const impactFor = (amt) => {
      if (amt >= 100) return "helps fund lab consumables for early-career researchers";
      if (amt >= 30) return "supports a day of pioneering genomic analysis";
      if (amt >= 15) return "contributes to data and computing for gene discovery";
      return "helps us respond rapidly to urgent research needs";
    };
    const refresh = () => {
      if (impactText) impactText.textContent = impactFor(amount);
      if (cta) cta.textContent = `Donate £${amount.toLocaleString("en-GB")}`;
    };

    amountBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        amountBtns.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        amount = parseFloat(btn.dataset.amount);
        if (custom) custom.value = "";
        refresh();
      });
    });
    if (custom) {
      custom.addEventListener("input", () => {
        const v = parseFloat(custom.value);
        amountBtns.forEach((b) => b.classList.remove("is-active"));
        amount = isNaN(v) ? 0 : v;
        refresh();
      });
    }
    freqBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        freqBtns.forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
    });
    refresh();
  }

  /* ---------- Contact form (front-end only) ---------- */
  const form = document.querySelector("[data-contact-form]");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const status = form.querySelector("[data-form-status]");
      const btn = form.querySelector("button[type=submit]");
      if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
      setTimeout(() => {
        if (status) {
          status.textContent =
            "Thank you — your message has been noted. We'll be in touch at the email you provided.";
          status.style.color = "var(--cyan)";
        }
        form.reset();
        if (btn) { btn.disabled = false; btn.textContent = "Send message"; }
      }, 700);
    });
  }

  /* ---------- Footer year ---------- */
  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* =========================================================
     Animated DNA double-helix canvas (hero)
     ========================================================= */
  const canvas = document.getElementById("dna-canvas");
  if (canvas && !prefersReduced) {
    const ctx = canvas.getContext("2d");
    let w, h, dpr, t = 0, raf;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const lerpColor = (a, b, p) => {
      const c = (x, y) => Math.round(x + (y - x) * p);
      return `rgb(${c(a[0], b[0])},${c(a[1], b[1])},${c(a[2], b[2])})`;
    };
    const cyan = [34, 227, 192];
    const violet = [123, 92, 255];
    const indigo = [75, 107, 255];

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      t += 0.012;

      // Helix runs diagonally from lower-left toward upper-right on wide screens,
      // vertical on narrow screens.
      const vertical = w < 820;
      const strands = 2;
      const count = 46;
      const amp = vertical ? w * 0.22 : Math.min(h, 560) * 0.30;
      const cx = vertical ? w * 0.5 : w * 0.72;
      const cy = h * 0.5;
      const spanLen = vertical ? h * 1.05 : Math.min(h * 1.05, 780);

      const points = [];
      for (let s = 0; s < strands; s++) {
        points[s] = [];
        const phase = s * Math.PI;
        for (let i = 0; i < count; i++) {
          const f = i / (count - 1);
          const along = (f - 0.5) * spanLen;
          const angle = f * Math.PI * 4 + t + phase;
          const off = Math.sin(angle) * amp;
          const depth = Math.cos(angle); // -1..1 for pseudo 3D
          let x, y;
          if (vertical) {
            x = cx + off;
            y = cy + along;
          } else {
            // rotate axis slightly for a dynamic diagonal
            const ang = -0.5;
            x = cx + off * Math.cos(ang) - along * Math.sin(ang);
            y = cy + off * Math.sin(ang) + along * Math.cos(ang);
          }
          const scale = 0.5 + (depth + 1) / 2 * 0.9;
          points[s].push({ x, y, depth, scale, f });
        }
      }

      // Rungs (base pairs)
      for (let i = 0; i < count; i++) {
        const a = points[0][i];
        const b = points[1][i];
        const midDepth = (a.depth + b.depth) / 2;
        const alpha = 0.10 + (midDepth + 1) / 2 * 0.25;
        ctx.strokeStyle = `rgba(160, 190, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Nodes
      for (let s = 0; s < strands; s++) {
        for (let i = 0; i < count; i++) {
          const p = points[s][i];
          const alpha = 0.35 + (p.depth + 1) / 2 * 0.55;
          const rad = 2 + p.scale * 2.6;
          const col = s === 0
            ? lerpColor(cyan, indigo, (p.f))
            : lerpColor(violet, indigo, 1 - p.f);
          // glow
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 4);
          g.addColorStop(0, col.replace("rgb", "rgba").replace(")", `,${alpha * 0.5})`));
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad * 4, 0, Math.PI * 2);
          ctx.fill();
          // core
          ctx.fillStyle = col.replace("rgb", "rgba").replace(")", `,${alpha})`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    const start = () => { resize(); cancelAnimationFrame(raf); draw(); };
    window.addEventListener("resize", start);
    start();

    // Pause when tab hidden
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else draw();
    });
  }
})();
