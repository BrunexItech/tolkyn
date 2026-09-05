/** Lightweight dominant-color extraction from an image, done entirely in the
 * browser via canvas — no server round trip, no new dependency. Buckets
 * pixels into coarse RGB bins and returns the most common bins as hex,
 * skipping near-white/near-black/near-transparent pixels so a logo on a
 * plain background doesn't just return "white". */
export async function extractDominantColors(imageUrl: string, count = 3): Promise<string[]> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  const size = 64; // downsample — we only need the palette, not precision
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return []; // canvas tainted (cross-origin without CORS headers) — fail quietly
  }

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  const STEP = 32; // quantize each channel into ~8 buckets

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue; // transparent
    const brightness = (r + g + b) / 3;
    if (brightness > 245 || brightness < 12) continue; // near-white / near-black background

    const key = `${Math.round(r / STEP)}-${Math.round(g / STEP)}-${Math.round(b / STEP)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, count)
    .map((b) => rgbToHex(b.r / b.count, b.g / b.count, b.b / b.count));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
