import { renderSVG } from "uqr";

export function generateQrSvg(url: string, size: number = 240): string {
  const rawSvg = renderSVG(url, {
    border: 2,
    ecc: "M",
  });
  return rawSvg.replace("<svg ", `<svg width="${size}" height="${size}" `);
}
