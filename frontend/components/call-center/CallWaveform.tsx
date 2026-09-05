"use client";

const BARS = Array.from({ length: 32 }, (_, i) => i);

/** Faux live audio equalizer for an active call. */
export function CallWaveform({ paused }: { paused?: boolean }) {
  return (
    <div className="flex h-8 items-center justify-center gap-[3px]">
      {BARS.map((i) => (
        <span
          key={i}
          className="w-[3px] origin-center rounded-full bg-om-cyan/70"
          style={{
            height: "100%",
            animation: paused
              ? "none"
              : `om-wave ${0.5 + (i % 5) * 0.14}s ease-in-out ${i * 0.03}s infinite alternate`,
            transform: paused ? "scaleY(0.15)" : undefined,
            opacity: paused ? 0.3 : 1,
          }}
        />
      ))}
    </div>
  );
}
