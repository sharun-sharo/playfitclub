"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Reveal({
  children,
  className = "",
  stagger = false,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: boolean;
  delay?: 0 | 1 | 2;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const armed = !!document.head.querySelector("style[data-fp-motion=boot]");
    if (reduce || !armed) {
      setVisible(true);
      return;
    }

    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          setVisible(true);
          observer?.disconnect();
        },
        { threshold: 0, rootMargin: "0px 0px -8% 0px" },
      );
      observer.observe(node);
    } catch {
      setVisible(true);
    }
    return () => observer?.disconnect();
  }, []);

  const classes = ["fp-reveal", stagger ? "fp-reveal-stagger" : "", visible ? "is-in" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} data-delay={delay > 0 ? delay : undefined}>
      {children}
    </div>
  );
}
