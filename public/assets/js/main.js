/**
 * Sentimo Website – Main JavaScript
 * Handles: mobile menu, scroll animations, counter, video modal, nav highlighting, FAQ accordion
 */

(function () {
    "use strict";

    // ===================== DOM REFERENCES =====================
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const mobileMenu = document.getElementById("mobile-menu");
    const navbar = document.getElementById("navbar");
    const videoBtn = document.getElementById("watch-video-btn");
    const videoModal = document.getElementById("video-modal");
    const closeModal = document.getElementById("close-modal");
    const navLinks = document.querySelectorAll(".nav-link");

    // ===================== MOBILE MENU =====================
    function initMobileMenu() {
        mobileMenuBtn?.addEventListener("click", () => {
            const isOpen = !mobileMenu.classList.contains("hidden");
            if (isOpen) {
                mobileMenu.classList.add("hidden");
                mobileMenuBtn.querySelector(".material-icons-round").textContent = "menu";
            } else {
                mobileMenu.classList.remove("hidden");
                mobileMenuBtn.querySelector(".material-icons-round").textContent = "close";
            }
        });

        // Close mobile menu when a link is clicked
        mobileMenu?.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                mobileMenu.classList.add("hidden");
                mobileMenuBtn.querySelector(".material-icons-round").textContent = "menu";
            });
        });
    }

    // ===================== NAVBAR SCROLL EFFECT =====================
    function initNavbarScroll() {
        let lastScroll = 0;

        window.addEventListener("scroll", () => {
            const currentScroll = window.pageYOffset;

            if (currentScroll > 50) {
                navbar?.classList.add("nav-scrolled");
            } else {
                navbar?.classList.remove("nav-scrolled");
            }

            lastScroll = currentScroll;
        }, { passive: true });
    }

    // ===================== SCROLL REVEAL =====================
    function initScrollReveal() {
        const elements = document.querySelectorAll(".scroll-reveal");
        if (!elements.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        // Respect the animation-delay set via inline style
                        const delay = entry.target.style.animationDelay || "0s";
                        const delayMs = parseFloat(delay) * 1000;

                        setTimeout(() => {
                            entry.target.classList.add("revealed");
                        }, delayMs);

                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                threshold: 0.15,
                rootMargin: "0px 0px -50px 0px",
            }
        );

        elements.forEach((el) => observer.observe(el));
    }

    // ===================== COUNTER ANIMATION =====================
    function initCounters() {
        const counters = document.querySelectorAll(".counter");
        if (!counters.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        animateCounter(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.5 }
        );

        counters.forEach((counter) => observer.observe(counter));
    }

    function animateCounter(el) {
        const target = parseInt(el.dataset.target, 10);
        const prefix = el.dataset.prefix || "";
        const suffix = el.dataset.suffix || "";
        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(eased * target);

            el.textContent = prefix + current.toLocaleString() + suffix;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = prefix + target.toLocaleString() + suffix;
            }
        }

        requestAnimationFrame(update);
    }

    // ===================== ACTIVE NAV HIGHLIGHTING =====================
    function initActiveNav() {
        const sections = document.querySelectorAll("section[id]");
        if (!sections.length || !navLinks.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.getAttribute("id");
                        navLinks.forEach((link) => {
                            link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
                        });
                    }
                });
            },
            {
                threshold: 0.3,
                rootMargin: "-80px 0px -40% 0px",
            }
        );

        sections.forEach((section) => observer.observe(section));
    }

    // ===================== VIDEO MODAL =====================
    function initVideoModal() {
        videoBtn?.addEventListener("click", () => {
            videoModal?.classList.remove("hidden");
            videoModal?.classList.add("flex");
            document.body.style.overflow = "hidden";
        });

        function closeVideoModal() {
            videoModal?.classList.add("hidden");
            videoModal?.classList.remove("flex");
            document.body.style.overflow = "";
        }

        closeModal?.addEventListener("click", closeVideoModal);

        videoModal?.addEventListener("click", (e) => {
            if (e.target === videoModal) {
                closeVideoModal();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !videoModal?.classList.contains("hidden")) {
                closeVideoModal();
            }
        });
    }

    // ===================== SMOOTH SCROLL FOR ANCHOR LINKS =====================
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
            anchor.addEventListener("click", function (e) {
                const targetId = this.getAttribute("href");
                if (targetId === "#") return;

                const targetEl = document.querySelector(targetId);
                if (targetEl) {
                    e.preventDefault();
                    const navHeight = navbar?.offsetHeight || 80;
                    const targetPosition = targetEl.getBoundingClientRect().top + window.pageYOffset - navHeight;

                    smoothScrollTo(targetPosition, 900);

                    // Update URL hash without jumping
                    history.pushState(null, null, targetId);
                }
            });
        });
    }

    /**
     * Custom smooth scroll with easing (ease-in-out cubic)
     */
    function smoothScrollTo(targetY, duration) {
        const startY = window.pageYOffset;
        const diff = targetY - startY;
        const startTime = performance.now();

        function easeInOutCubic(t) {
            return t < 0.5
                ? 4 * t * t * t
                : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        function step(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeInOutCubic(progress);

            window.scrollTo(0, startY + diff * eased);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    }

    // ===================== FAQ ACCORDION =====================
    function initFaqAccordion() {
        const faqItems = document.querySelectorAll(".faq-item");
        if (!faqItems.length) return;

        faqItems.forEach((item) => {
            const trigger = item.querySelector(".faq-trigger");

            trigger?.addEventListener("click", () => {
                const isOpen = item.classList.contains("open");

                // Close all other FAQ items
                faqItems.forEach((other) => {
                    if (other !== item) {
                        other.classList.remove("open");
                    }
                });

                // Toggle current item
                item.classList.toggle("open", !isOpen);
            });
        });
    }

    // ===================== INIT =====================
    function init() {
        initMobileMenu();
        initNavbarScroll();
        initScrollReveal();
        initCounters();
        initActiveNav();
        initVideoModal();
        initSmoothScroll();
        initFaqAccordion();
    }

    // Run when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
