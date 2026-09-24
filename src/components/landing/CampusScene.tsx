"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import CampusFallback from "./CampusFallback";

const CampusCanvas = dynamic(() => import("./CampusCanvas"), {
  ssr: false,
  loading: () => <CampusFallback />,
});

interface BoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

/** Catches WebGL render failures so the page never goes blank. */
class SceneErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    this.setState({ failed: true });
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Client boundary around the 3D campus: probes WebGL support up front,
 * honors prefers-reduced-motion, and falls back to a static illustration
 * whenever the GPU path is unavailable.
 */
export default function CampusScene() {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [webglOK, setWebglOK] = useState(true);

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time sync of
     device capabilities (matchMedia, WebGL probe); these cannot be derived
     during render because SSR has no window. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 500;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
      ?.saveData === true;
    setLowPower(coarse || small || saveData);

    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
      if (!gl) setWebglOK(false);
    } catch {
      setWebglOK(false);
    }

    return () => mq.removeEventListener("change", onChange);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!webglOK) return <CampusFallback />;

  return (
    <SceneErrorBoundary fallback={<CampusFallback />}>
      <CampusCanvas reducedMotion={reducedMotion} lowPower={lowPower || reducedMotion} />
    </SceneErrorBoundary>
  );
}
