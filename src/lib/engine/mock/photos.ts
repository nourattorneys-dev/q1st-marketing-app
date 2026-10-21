import type { Photo } from "../schemas";

const PER_PAGE = 6;

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

function hashOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash;
}

/** An offline stand-in for a photo: an SVG data URL, so tests and previews never call the internet. */
export function placeholderPhoto(label: string, hue: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="427" viewBox="0 0 640 427">` +
    `<rect width="640" height="427" fill="hsl(${hue} 35% 55%)"/>` +
    `<text x="320" y="224" font-family="sans-serif" font-size="28" fill="white" text-anchor="middle">${escapeXml(label)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** GET …/photos/search in the mock: the same words always give the same photos. */
export function searchMockPhotos(query: string, page: number): Photo[] {
  const words = query.trim() || "photo";
  const seed = hashOf(words.toLowerCase());
  return Array.from({ length: PER_PAGE }, (_, index) => {
    const n = (page - 1) * PER_PAGE + index + 1;
    const url = placeholderPhoto(`${words} ${n}`, (seed + n * 47) % 360);
    return {
      pexelsId: 100_000 + ((seed + n * 7_919) % 900_000),
      thumb: url,
      full: url,
      width: 640,
      height: 427,
      photographer: `Mock Photographer ${n}`,
      photographerUrl: "https://www.pexels.com",
      alt: `${words} ${n}`,
    };
  });
}
