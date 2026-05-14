
(function () {
  var navToggle = document.getElementById("navToggle");
  var siteNav = document.getElementById("siteNav");
  var navBackdrop = document.getElementById("navBackdrop");

  /** Toggles drawer nav + backdrop; syncs aria on the menu button for screen readers. */
  function setNavOpen(open) {
    document.body.classList.toggle("nav-open", open);
    if (navToggle) {
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }
    if (navBackdrop) {
      navBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
  }

  if (navToggle && siteNav) {
    // Hamburger toggles drawer; link clicks close it for predictable in-page navigation.
    navToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setNavOpen(!document.body.classList.contains("nav-open"));
    });
    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setNavOpen(false);
      });
    });
    if (navBackdrop) {
      navBackdrop.addEventListener("click", function () {
        setNavOpen(false);
      });
    }
  }

  /* =============================================================================
   * STICKY HEADER DOCK
   * -----------------------------------------------------------------------------
   * When scroll position passes ~one viewport (`fold`), `body.header-docked`
   * fixes `#siteHeaderDock` to the top. A spacer (`#siteHeaderSpacer`) gets the
   * same pixel height so the page does not jump.
   *
   * The navy `.sticky-context-bar` is optional chrome: `body.header-context-visible`
   * shows it when the user scrolls down, hides it when they scroll up (small `dy`
   * threshold avoids jitter). Near the top (`y < fold * 0.42`) everything undocks.
   * ============================================================================= */
  (function initHeaderDock() {
    var dock = document.getElementById("siteHeaderDock");
    var spacer = document.getElementById("siteHeaderSpacer");
    var ctx = document.getElementById("stickyContextBar");
    if (!dock || !spacer) return;

    var lastY = window.scrollY || 0;
    // "First fold" threshold (~one viewport); min avoids tiny viewports breaking logic.
    var fold = Math.max(120, Math.floor(window.innerHeight * 0.92));
    var ticking = false;

    /** Mirrors fixed header height in document flow so content does not jump. */
    function updateSpacer() {
      if (!document.body.classList.contains("header-docked")) {
        spacer.style.height = "0px";
        return;
      }
      spacer.style.height = dock.offsetHeight + "px";
    }

    /** Hides collapsed context strip from assistive tech when it is off-screen. */
    function syncContextAria() {
      if (!ctx) return;
      var vis = document.body.classList.contains("header-context-visible");
      ctx.setAttribute("aria-hidden", vis ? "false" : "true");
    }

    /**
     * body.header-docked: fixed nav past fold. body.header-context-visible: slim bar
     * above nav (show on scroll-down, hide on scroll-up). Hysteresis: undock near top.
     */
    function onScrollFrame() {
      var y = window.scrollY || 0;
      var dy = y - lastY;
      lastY = y;

      var wasDocked = document.body.classList.contains("header-docked");
      if (y < fold * 0.42) {
        document.body.classList.remove("header-docked", "header-context-visible");
      } else if (y >= fold) {
        document.body.classList.add("header-docked");
        if (!wasDocked && dy >= 0) {
          document.body.classList.add("header-context-visible");
        }
        if (dy > 5) {
          document.body.classList.add("header-context-visible");
        } else if (dy < -5) {
          document.body.classList.remove("header-context-visible");
        }
      } else {
        // Between hysteresis band and fold: treat as above-the-fold (no dock).
        document.body.classList.remove("header-docked", "header-context-visible");
      }

      syncContextAria();
      updateSpacer();
      ticking = false;
    }

    /** Coalesces scroll to one layout pass per frame (scroll handler stays cheap). */
    function requestTick() {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(onScrollFrame);
      }
    }

    /** Recompute fold on viewport changes (rotation, devtools dock, etc.). */
    function onResize() {
      fold = Math.max(120, Math.floor(window.innerHeight * 0.92));
      updateSpacer();
    }

    window.addEventListener("resize", onResize);
    /* passive: true — listener never calls preventDefault; improves scroll perf. */
    window.addEventListener("scroll", requestTick, { passive: true });

    /* Context bar animates height: without this, spacer could lag one frame behind. */
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () {
        updateSpacer();
      });
      ro.observe(dock);
    }

    onResize();
    onScrollFrame();
  })();

  /* =============================================================================
   * HERO IMAGE CAROUSEL
   * -----------------------------------------------------------------------------
   * Stacks all slides in `#heroPhotoTrack`; only `.is-active` is visible (CSS).
   * Prev/next buttons and dot tabs call the same `show(index)` with wrap-around.
   * ============================================================================= */
  (function initHeroCarousel() {
    var track = document.getElementById("heroPhotoTrack");
    var prev = document.getElementById("heroPhotoPrev");
    var next = document.getElementById("heroPhotoNext");
    if (!track) return;

    var imgs = [].slice.call(track.querySelectorAll(".hero__photo-img"));
    var dots = [].slice.call(document.querySelectorAll(".hero__photo-dot"));
    if (!imgs.length) return;

    var idx = 0;

    /** One visible slide; dots mirror selection for keyboard/AT users. */
    function show(i) {
      var n = imgs.length;
      idx = ((i % n) + n) % n;
      imgs.forEach(function (img, j) {
        img.classList.toggle("is-active", j === idx);
      });
      dots.forEach(function (d, j) {
        var on = j === idx;
        d.classList.toggle("is-active", on);
        d.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    if (prev) {
      prev.addEventListener("click", function () {
        show(idx - 1);
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        show(idx + 1);
      });
    }
    dots.forEach(function (d) {
      d.addEventListener("click", function () {
        var g = parseInt(d.getAttribute("data-hero-go"), 10);
        if (!isNaN(g)) show(g);
      });
    });
  })();

  /* =============================================================================
   * HOVER ZOOM PREVIEW (hero + applications)
   * -----------------------------------------------------------------------------
   * Desktop-style magnifier: disabled on touch / coarse pointers and when the
   * user prefers reduced motion (avoids unexpected motion for vestibular issues).
   *
   * @param {Object} cfg
   * @param {string} cfg.hostSelector   Elements that receive pointer events.
   * @param {string} cfg.popId          Fixed popover wrapper (`#…`).
   * @param {string} cfg.popImgId       `<img>` inside the popover (src swapped).
   * @param {number} [cfg.zoomScale]    CSS transform scale on the preview image.
   * @param {function(Element): HTMLImageElement|null} cfg.getSourceImg
   *        Given the hovered host, return the `<img>` to mirror (hero: active slide).
   * ============================================================================= */
  function initHoverImageZoom(cfg) {
    var hosts = document.querySelectorAll(cfg.hostSelector);
    var pop = document.getElementById(cfg.popId);
    var popImg = document.getElementById(cfg.popImgId);
    if (!hosts.length || !pop || !popImg) return;

    var mqFine = window.matchMedia("(hover: hover) and (pointer: fine)");
    var mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    /** Zoom UI is opt-in: real hover device and user has not asked OS to reduce motion. */
    function enabled() {
      return mqFine.matches && !mqReduce.matches;
    }

    var activeHost = null;

    /** Tear down popover state when pointer leaves the host. */
    function hidePop() {
      pop.classList.remove("is-visible");
      pop.setAttribute("aria-hidden", "true");
      activeHost = null;
    }

    /** Keep the preview on-screen (clamped to viewport with padding). */
    function positionPop(e) {
      var w = pop.offsetWidth || 280;
      var h = pop.offsetHeight || 200;
      var pad = 12;
      var left = Math.min(e.clientX + 18, window.innerWidth - w - pad);
      var top = Math.min(Math.max(pad, e.clientY - h * 0.42), window.innerHeight - h - pad);
      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }

    /**
     * Maps pointer position to normalized 0–1 coords on the host, then sets
     * `transform-origin` on the popover clone so the scaled image appears to
     * magnify the region under the cursor (classic “loupe” behaviour).
     */
    function updateMag(e, host) {
      var srcImg = cfg.getSourceImg(host);
      if (!srcImg || !srcImg.src) return;
      var nextSrc = srcImg.currentSrc || srcImg.src;
      /* Avoid resetting `src` every mousemove when unchanged (prevents flicker). */
      if (popImg.src !== nextSrc) {
        popImg.src = nextSrc;
        popImg.alt = srcImg.alt || "";
      }
      var rect = host.getBoundingClientRect();
      var x = (e.clientX - rect.left) / Math.max(1, rect.width);
      var y = (e.clientY - rect.top) / Math.max(1, rect.height);
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      var scale = cfg.zoomScale || 1.72;
      popImg.style.transformOrigin = x * 100 + "% " + y * 100 + "%";
      popImg.style.transform = "scale(" + scale + ")";
      positionPop(e);
    }

    [].forEach.call(hosts, function (host) {
      /* `pointer*` keeps one active host so rapid moves between cards do not fight. */
      host.addEventListener("pointerenter", function (e) {
        if (!enabled()) return;
        var srcImg = cfg.getSourceImg(host);
        if (!srcImg || !srcImg.src) return;
        activeHost = host;
        popImg.src = srcImg.currentSrc || srcImg.src;
        popImg.alt = srcImg.alt || "";
        pop.classList.add("is-visible");
        pop.setAttribute("aria-hidden", "false");
        updateMag(e, host);
      });

      host.addEventListener("pointermove", function (e) {
        if (!enabled() || activeHost !== host) return;
        updateMag(e, host);
      });

      host.addEventListener("pointerleave", function () {
        if (activeHost === host) hidePop();
      });
    });
  }

  /* Hero: host is the viewport; source image is whichever slide has `.is-active`. */
  initHoverImageZoom({
    hostSelector: "[data-zoom-host]",
    popId: "heroZoomPop",
    popImgId: "heroZoomPopImg",
    zoomScale: 1.68,
    getSourceImg: function (host) {
      var fig = host && host.closest ? host.closest(".hero__photo") : null;
      return fig ? fig.querySelector(".hero__photo-img.is-active") : null;
    }
  });

  /* Applications: each card’s `[data-carousel-zoom-host]` wraps a single `<img>`. */
  initHoverImageZoom({
    hostSelector: "[data-carousel-zoom-host]",
    popId: "applicationsZoomPop",
    popImgId: "applicationsZoomPopImg",
    zoomScale: 1.78,
    getSourceImg: function (host) {
      return host.querySelector("img");
    }
  });

  /* =============================================================================
   * MODALS — catalogue brochure + request callback
   * -----------------------------------------------------------------------------
   * Overlays use the boolean `hidden` attribute (see HTML). Opening one closes
   * the other. Click on the dimmed backdrop (`e.target === overlay`) dismisses.
   * ============================================================================= */
  var modalCatalogue = document.getElementById("modalCatalogue");
  var modalCallback = document.getElementById("modalCallback");

  /** Locks page scroll while a dialog is open (pairs with CSS body.modal-open). */
  function syncModalBody() {
    var open =
      (modalCatalogue && !modalCatalogue.hasAttribute("hidden")) ||
      (modalCallback && !modalCallback.hasAttribute("hidden"));
    document.body.classList.toggle("modal-open", open);
  }

  /** Returns true if a modal was closed (used so Escape prefers modals over nav). */
  function closeModalsIfOpen() {
    var cat = modalCatalogue && !modalCatalogue.hasAttribute("hidden");
    var cb = modalCallback && !modalCallback.hasAttribute("hidden");
    if (!cat && !cb) return false;
    if (modalCatalogue) modalCatalogue.setAttribute("hidden", "");
    if (modalCallback) modalCallback.setAttribute("hidden", "");
    syncModalBody();
    return true;
  }

  /** Opens catalogue modal exclusively; focuses email for keyboard users. */
  function openCatalogueModal() {
    if (modalCallback) modalCallback.setAttribute("hidden", "");
    if (modalCatalogue) modalCatalogue.removeAttribute("hidden");
    syncModalBody();
    setNavOpen(false);
    var email = document.getElementById("modal-catalogue-email");
    if (email) {
      email.focus();
      syncCatalogueSubmit();
    }
  }

  /** Opens callback modal exclusively; focuses first text field. */
  function openCallbackModal() {
    if (modalCatalogue) modalCatalogue.setAttribute("hidden", "");
    if (modalCallback) modalCallback.removeAttribute("hidden");
    syncModalBody();
    setNavOpen(false);
    var name = document.getElementById("modal-callback-name");
    if (name) name.focus();
  }

  /* Triggers: e.g. technical datasheet button (`data-modal-open="catalogue"`). */
  document.querySelectorAll("[data-modal-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var which = btn.getAttribute("data-modal-open");
      if (which === "catalogue") openCatalogueModal();
      else if (which === "callback") openCallbackModal();
    });
  });

  /* Close buttons inside each dialog (see `data-modal-close` on `.modal__close`). */
  document.querySelectorAll("[data-modal-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var which = btn.getAttribute("data-modal-close");
      if (which === "catalogue" && modalCatalogue) modalCatalogue.setAttribute("hidden", "");
      else if (which === "callback" && modalCallback) modalCallback.setAttribute("hidden", "");
      syncModalBody();
    });
  });

  /* Backdrop dismiss: only react if the click hit the overlay, not the inner `.modal`. */
  [modalCatalogue, modalCallback].forEach(function (overlay) {
    if (!overlay) return;
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        overlay.setAttribute("hidden", "");
        syncModalBody();
      }
    });
  });

  /** Brochure CTA stays disabled until native email validity passes (UX + a11y). */
  function syncCatalogueSubmit() {
    var email = document.getElementById("modal-catalogue-email");
    var submit = document.getElementById("modalCatalogueSubmit");
    if (!email || !submit) return;
    submit.disabled = !email.validity.valid;
  }

  var catalogueEmail = document.getElementById("modal-catalogue-email");
  if (catalogueEmail) {
    catalogueEmail.addEventListener("input", syncCatalogueSubmit);
    catalogueEmail.addEventListener("blur", syncCatalogueSubmit);
  }

  var modalCatalogueForm = document.getElementById("modalCatalogueForm");
  if (modalCatalogueForm) {
    modalCatalogueForm.addEventListener("submit", function (e) {
      e.preventDefault();
      /* Placeholder: POST email + optional phone to your API, then toast success. */
      closeModalsIfOpen();
    });
  }

  var modalCallbackForm = document.getElementById("modalCallbackForm");
  if (modalCallbackForm) {
    modalCallbackForm.addEventListener("submit", function (e) {
      e.preventDefault();
      /* Placeholder: POST lead payload; keep UX by closing or showing inline thank-you. */
      closeModalsIfOpen();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      // Close modal first if open, otherwise close mobile nav.
      if (closeModalsIfOpen()) return;
      setNavOpen(false);
    }
  });

  /* =============================================================================
   * HERO OTP-STYLE GRID (six single-character inputs)
   * -----------------------------------------------------------------------------
   * Mimics OTP UX: one digit per cell, auto-advance on type, backspace jumps back,
   * arrow keys move between cells, paste distributes digits across cells from index.
   * ============================================================================= */
  var otpRoot = document.getElementById("galleryOtp");
  if (otpRoot) {
    var otpInputs = [].slice.call(otpRoot.querySelectorAll(".hero__otp-input"));
    otpInputs.forEach(function (input, i) {
      input.addEventListener("keydown", function (e) {
        /* Empty cell + Backspace → focus previous and select for easy replace. */
        if (e.key === "Backspace" && !input.value && i > 0) {
          e.preventDefault();
          otpInputs[i - 1].focus();
          otpInputs[i - 1].select();
        }
        if (e.key === "ArrowLeft" && i > 0) {
          e.preventDefault();
          otpInputs[i - 1].focus();
        }
        if (e.key === "ArrowRight" && i < otpInputs.length - 1) {
          e.preventDefault();
          otpInputs[i + 1].focus();
        }
      });
      input.addEventListener("input", function () {
        /* Strip non-digits; keep last character only (handles mobile autofill quirks). */
        var v = input.value.replace(/\D/g, "").slice(-1);
        input.value = v;
        if (v && i < otpInputs.length - 1) {
          otpInputs[i + 1].focus();
        }
      });
      input.addEventListener("focus", function () {
        input.select();
      });
      input.addEventListener("paste", function (e) {
        e.preventDefault();
        var text = (e.clipboardData || window.clipboardData).getData("text") || "";
        var digits = text.replace(/\D/g, "").slice(0, otpInputs.length);
        digits.split("").forEach(function (ch, j) {
          if (otpInputs[i + j]) otpInputs[i + j].value = ch;
        });
        /* Land focus on last filled cell, or next empty after current. */
        var next = Math.min(i + Math.max(digits.length, 1), otpInputs.length - 1);
        otpInputs[next].focus();
      });
    });
  }

  /* FAQ accordion: native `<details>`; closing siblings avoids nested height jumps. */
  var faqRoot = document.getElementById("faqAccordion");
  if (faqRoot) {
    faqRoot.querySelectorAll(".faq-item").forEach(function (det) {
      det.addEventListener("toggle", function () {
        if (!det.open) return;
        faqRoot.querySelectorAll(".faq-item").forEach(function (other) {
          if (other !== det) other.open = false;
        });
      });
    });
  }

  var catForm = document.getElementById("catalogueForm");
  if (catForm) {
    catForm.addEventListener("submit", function (e) {
      e.preventDefault(); // Demo: wire to backend in production.
    });
  }

  /* Applications carousel: CSS `scroll-snap` on viewport; JS scrolls by one card + gap. */
  var appVp = document.getElementById("appCarouselViewport");
  var appPrev = document.getElementById("appCarouselPrev");
  var appNext = document.getElementById("appCarouselNext");
  /**
   * @param {number} dir  -1 = previous card, +1 = next card
   */
  function appScrollStep(dir) {
    if (!appVp) return;
    var track = document.getElementById("appCarouselTrack");
    var card = track && track.querySelector(".applications__card");
    if (!card) return;
    var styles = window.getComputedStyle(track);
    var gap = parseFloat(styles.gap || "20") || 20;
    var step = card.getBoundingClientRect().width + gap;
    appVp.scrollBy({ left: dir * step, behavior: "smooth" });
  }
  if (appPrev) appPrev.addEventListener("click", function () { appScrollStep(-1); });
  if (appNext) appNext.addEventListener("click", function () { appScrollStep(1); });

  /* Manufacturing process: tab `data-step` string must match pane `data-step`. */
  document.querySelectorAll(".process-tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var step = btn.getAttribute("data-step");
      if (step === null) return;
      document.querySelectorAll(".process-tab").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      document.querySelectorAll(".process-pane").forEach(function (pane) {
        var on = pane.getAttribute("data-step") === step;
        pane.classList.toggle("is-active", on);
      });
      /* When switching steps, every pane’s inner 2-image slider resets to first slide. */
      document.querySelectorAll(".process-pane__slider").forEach(function (slider) {
        var slides = slider.querySelectorAll(".process-pane__slide");
        slides.forEach(function (s, i) {
          s.classList.toggle("is-active", i === 0);
        });
      });
    });
  });

  /* Each pane’s prev/next is scoped to that pane only (closure over `slides`). */
  document.querySelectorAll(".process-pane__media").forEach(function (media) {
    var slider = media.querySelector(".process-pane__slider");
    var prevBtn = media.querySelector(".process-pane__nav--prev");
    var nextBtn = media.querySelector(".process-pane__nav--next");
    if (!slider || !prevBtn || !nextBtn) return;
    var slides = [].slice.call(slider.querySelectorAll(".process-pane__slide"));
    if (slides.length < 2) return;

    /** Index of slide with `.is-active`, or 0 if none (defensive). */
    function currentIndex() {
      var i = slides.findIndex(function (s) {
        return s.classList.contains("is-active");
      });
      return i < 0 ? 0 : i;
    }

    /** Wraps index modulo slide count so prev on first slide goes to last. */
    function showAt(index) {
      var n = slides.length;
      var i = ((index % n) + n) % n;
      slides.forEach(function (s, j) {
        s.classList.toggle("is-active", j === i);
      });
    }

    prevBtn.addEventListener("click", function () {
      showAt(currentIndex() - 1);
    });
    nextBtn.addEventListener("click", function () {
      showAt(currentIndex() + 1);
    });
  });

  /* Testimonials: same scroll-by-card pattern as applications (`testScrollStep`). */
  var testVp = document.getElementById("testimonialViewport");
  var testPrev = document.getElementById("testimonialPrev");
  var testNext = document.getElementById("testimonialNext");
  /** @param {number} dir  -1 | +1 passed through to `scrollBy` on the viewport. */
  function testScrollStep(dir) {
    if (!testVp) return;
    var track = document.getElementById("testimonialTrack");
    var card = track && track.querySelector(".testimonial-card");
    if (!card) return;
    var styles = window.getComputedStyle(track);
    var gap = parseFloat(styles.gap || "20") || 20;
    var step = card.getBoundingClientRect().width + gap;
    testVp.scrollBy({ left: dir * step, behavior: "smooth" });
  }
  if (testPrev) testPrev.addEventListener("click", function () { testScrollStep(-1); });
  if (testNext) testNext.addEventListener("click", function () { testScrollStep(1); });

  var contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault(); // Demo: replace with API POST when backend exists.
    });
  }
  /* All setup runs at parse time; nothing is attached to `window` intentionally. */
})();
