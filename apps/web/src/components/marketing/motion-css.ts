export const motionBootCss =
  "@media (prefers-reduced-motion:no-preference){.fp-reveal:not(.fp-reveal-stagger):not(.is-in),.fp-reveal-stagger:not(.is-in)>*{opacity:0;transform:translateY(20px)}}";

export const heroSeenCss =
  "@media (prefers-reduced-motion:no-preference){.fp-hero-line,.fp-hero-rise,.fp-hero-cta,.fp-hero-lead{animation:none!important;opacity:1!important;transform:none!important}}";

export function motionBootScript() {
  return `try{var reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;if(reduce){}else{if(!document.head.querySelector("style[data-fp-motion=boot]")){var boot=document.createElement("style");boot.setAttribute("data-fp-motion","boot");boot.textContent=${JSON.stringify(motionBootCss)};document.head.appendChild(boot)}if(sessionStorage.getItem("fp-hero-seen")==="1"&&!document.head.querySelector("style[data-fp-hero=seen]")){var lock=document.createElement("style");lock.setAttribute("data-fp-hero","seen");lock.textContent=${JSON.stringify(heroSeenCss)};document.head.appendChild(lock)}}}catch(e){}`;
}

export function ensureMotionStyles(seen: boolean) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!document.head.querySelector("style[data-fp-motion=boot]")) {
    const boot = document.createElement("style");
    boot.setAttribute("data-fp-motion", "boot");
    boot.textContent = motionBootCss;
    document.head.appendChild(boot);
  }
  if (seen && !document.head.querySelector("style[data-fp-hero=seen]")) {
    const lock = document.createElement("style");
    lock.setAttribute("data-fp-hero", "seen");
    lock.textContent = heroSeenCss;
    document.head.appendChild(lock);
  }
}
