"use client";

import { useEffect, type ReactNode } from "react";

export default function LandingMotion({ children }: { children: ReactNode }) {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sections = Array.from(document.querySelectorAll<HTMLElement>("#main section"));
    const visuals = Array.from(document.querySelectorAll<HTMLElement>("#main section[id] > div > div:last-child"));
    if (reduce.matches) {
      sections.forEach((section) => section.classList.add("landing-in-view"));
      return;
    }
    sections.forEach((section, index) => { if (index > 0) section.classList.add("landing-reveal"); });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("landing-in-view");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    visuals.forEach((visual) => visual.classList.add("landing-visual"));
    sections.slice(1).forEach((section) => observer.observe(section));
    const handlePointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const target = (event.target as HTMLElement).closest<HTMLElement>(".landing-visual");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      target.style.setProperty("--tilt-x", (-y * 4).toFixed(2) + "deg");
      target.style.setProperty("--tilt-y", (x * 5).toFixed(2) + "deg");
      target.style.setProperty("--pointer-x", ((x + 0.5) * 100).toFixed(1) + "%");
      target.style.setProperty("--pointer-y", ((y + 0.5) * 100).toFixed(1) + "%");
    };
    const resetPointer = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".landing-visual");
      if (target) {
        target.style.setProperty("--tilt-x", "0deg");
        target.style.setProperty("--tilt-y", "0deg");
      }
    };
    const handleScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty("--landing-scroll-progress", String(max > 0 ? window.scrollY / max : 0));
    };
    document.addEventListener("pointermove", handlePointer, { passive: true });
    document.addEventListener("pointerout", resetPointer, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      observer.disconnect();
      document.removeEventListener("pointermove", handlePointer);
      document.removeEventListener("pointerout", resetPointer);
      window.removeEventListener("scroll", handleScroll);
      document.documentElement.style.removeProperty("--landing-scroll-progress");
    };
  }, []);
  return <><div className="landing-scroll-progress" aria-hidden="true" />{children}</>;
}
