import { renderSVG } from "uqr";

export function generateQrSvg(url: string, size: number = 280): string {
  const rawSvg = renderSVG(url, {
    border: 2,
    ecc: "M",
  });
  return rawSvg
    .replace('width="270"', `width="${size}"`)
    .replace('height="270"', `height="${size}"`);
}
