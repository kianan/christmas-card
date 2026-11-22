import type { ComponentType } from "react";

/**
 * Looping, muted background video. Expects `<dir>/loop.webm`, `<dir>/loop.mp4`
 * (fallback) and `<dir>/poster.jpg` (shown while loading) under /public.
 */
export function videoBackground(dir: string): ComponentType {
  function VideoBackground() {
    return (
      <video
        className="bg-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={`${dir}/poster.jpg`}
        aria-hidden
      >
        <source src={`${dir}/loop.webm`} type="video/webm" />
        <source src={`${dir}/loop.mp4`} type="video/mp4" />
      </video>
    );
  }
  return VideoBackground;
}
