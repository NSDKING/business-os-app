// Shrinks a chosen photo to a small square JPEG so it stays light on cheap phones and weak networks.
export async function toAvatar(file: File, size = 96): Promise<string> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.7);
}

// Shrinks a company logo to at most 360 px wide, keeping its proportions and transparency (PNG).
export async function toLogo(file: File, maxW = 360): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxW / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}
