import React from "react";
import { startCoreLoopApiCall, stopCoreLoopApiCall } from "../apis";

/**
 * Two fully transparent, large tap targets at the very top.
 * - Each takes ~25% of screen width.
 * - Does not block the rest of the UI (uses pointer-events layering).
 */
export default function TransparentButtons() {
  function onStart() {
    startCoreLoopApiCall()
  }

  function onStop() {
    stopCoreLoopApiCall()
  }

  return (
    <div className="absolute inset-0 z-50 pointer-events-none">
      {/* START area (top-left 25% width) */}
      <button
        aria-label="Start"
        onClick={onStart}
        className="pointer-events-auto absolute top-0 left-0 w-[45%] h-20 bg-transparent"
      // Optional debug outline while coding: add 'outline outline-1 outline-emerald-400'
      />

      {/* STOP area (top-right 25% width) */}
      <button
        aria-label="Stop"
        onClick={onStop}
        className="pointer-events-auto absolute top-0 right-0 w-[45%] h-20 bg-transparent"
      />
    </div>
  );
}
