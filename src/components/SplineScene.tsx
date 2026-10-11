"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type RefObject } from "react";

const SplineCanvas = dynamic(() => import("@splinetool/react-spline/next"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse rounded-[2rem] bg-[#101010]" />,
});

interface FallbackUniverseProps {
  interactionRef: RefObject<HTMLDivElement | null>;
}

function FallbackUniverse({ interactionRef }: FallbackUniverseProps) {
  return <div className="relative grid h-full w-full place-items-center overflow-hidden rounded-[2rem] border border-[#292929] bg-[#0a0a0a]">
    <div ref={interactionRef} className="cq-interaction relative aspect-square w-[88%] max-w-[34rem]">
      <div className="cq-sphere-float absolute inset-0">
        <div className="cq-orbit-forward absolute left-1/2 top-1/2 h-[54%] w-[88%]"><div className="cq-orbit-forward-spin absolute inset-0 rounded-[50%] border border-[#737373]" /></div>
        <div className="cq-orbit-reverse absolute left-1/2 top-1/2 h-[42%] w-[70%]"><div className="cq-orbit-reverse-spin absolute inset-0 rounded-[50%] border border-[#404040]" /></div>
        <div className="cq-sphere-core absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 sm:size-64"><div className="cq-sphere-core-spin size-full rounded-full border border-[#a3a3a3] bg-[#191919] shadow-[inset_18px_18px_0_#242424,inset_-18px_-18px_0_#050505,0_0_0_14px_#0d0d0d,0_24px_42px_rgba(0,0,0,.75)]"><span className="absolute left-[22%] top-[18%] size-10 rounded-full border border-white/70 bg-[#737373] shadow-[0_0_0_7px_#2a2a2a] sm:size-14" /><span className="absolute bottom-[20%] right-[16%] size-3 rounded-full bg-[#a3a3a3]" /></div></div>
        <span className="absolute left-[8%] top-[19%] size-1.5 rounded-full bg-[#a3a3a3]" /><span className="absolute right-[8%] top-[31%] size-1 rounded-full bg-white" /><span className="absolute bottom-[17%] left-[18%] size-1 rounded-full bg-[#737373]" />
      </div>
    </div>
    <span className="absolute bottom-5 left-5 rounded-lg border border-[#292929] bg-black/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#737373]">scene fallback / ready</span>
  </div>;
}

export function SplineScene() {
  const [loaded, setLoaded] = useState(false);
  const interactionRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const reducedMotionRef = useRef(false);
  const sceneUrl = process.env.NEXT_PUBLIC_SPLINE_SCENE_URL;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mediaQuery.matches;
    const handleMotionPreference = (event: MediaQueryListEvent) => { reducedMotionRef.current = event.matches; if (event.matches) targetRef.current = { x: 0, y: 0 }; };
    const animatePointer = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      current.x += (target.x - current.x) * 0.1;
      current.y += (target.y - current.y) * 0.1;
      const element = interactionRef.current;
      if (element) {
        element.style.setProperty("--cq-shift-x", `${current.x * 12}px`);
        element.style.setProperty("--cq-shift-y", `${current.y * 9}px`);
        element.style.setProperty("--cq-tilt-x", `${current.x * 3.5}deg`);
        element.style.setProperty("--cq-tilt-y", `${current.y * -3.5}deg`);
      }
      const settled = Math.abs(target.x - current.x) < 0.01 && Math.abs(target.y - current.y) < 0.01;
      if (!settled) frameRef.current = window.requestAnimationFrame(animatePointer);
      else frameRef.current = null;
    };
    const startAnimation = () => { if (frameRef.current === null && !reducedMotionRef.current) frameRef.current = window.requestAnimationFrame(animatePointer); };
    const handlePointerMove = (event: PointerEvent) => {
      if (reducedMotionRef.current || event.pointerType === "touch") return;
      const element = interactionRef.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      targetRef.current = { x: Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)), y: Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)) };
      startAnimation();
    };
    const handlePointerLeave = () => { targetRef.current = { x: 0, y: 0 }; startAnimation(); };
    const element = interactionRef.current;
    element?.addEventListener("pointermove", handlePointerMove, { passive: true });
    element?.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    mediaQuery.addEventListener("change", handleMotionPreference);
    return () => { element?.removeEventListener("pointermove", handlePointerMove); element?.removeEventListener("pointerleave", handlePointerLeave); mediaQuery.removeEventListener("change", handleMotionPreference); if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current); };
  }, []);

  if (!sceneUrl) return <FallbackUniverse interactionRef={interactionRef} />;
  return <div className="relative h-full w-full overflow-visible rounded-[2rem] border border-[#292929] bg-[#0a0a0a]"><div className="absolute inset-0 z-0"><FallbackUniverse interactionRef={interactionRef} /></div><SplineCanvas scene={sceneUrl} onLoad={() => setLoaded(true)} className={`relative z-10 h-full w-full transition-opacity duration-700 ${loaded ? "opacity-100" : "opacity-0"}`} />{!loaded && <div className="absolute inset-x-0 bottom-5 z-20 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[#737373]">loading scene…</div>}</div>;
}
