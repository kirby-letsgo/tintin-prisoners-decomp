const ROM = "4c859ad08f74bcc004f01a69a7d380cdcdea79eb731a09f935337921096e4c20";
export const MAX_SPRITE_FILE = 8 * 1024 * 1024;
const RECORD = 24 + 16 * 16 * 4;
type Entry = {
  key: string;
  x: number;
  y: number;
  flipX?: boolean;
  flipY?: boolean;
};

/** Decode a self-contained PNG sheet. No URLs, scripts or filesystem paths are followed. */
export async function compileSpritePack(
  bytes: Uint8Array,
): Promise<Uint8Array> {
  if (bytes.length > MAX_SPRITE_FILE)
    throw new Error("Sprite pack is too large.");
  const pack = JSON.parse(new TextDecoder().decode(bytes));
  if (
    pack?.format !== "tintin-sprites-v1" ||
    pack.romSha256 !== ROM ||
    pack.scale !== 2
  )
    throw new Error(
      "Choose a 2× Tintin sprite pack built with tools/sprite_pack.py.",
    );
  if (
    !Array.isArray(pack.entries) ||
    !pack.entries.length ||
    pack.entries.length > 1024
  )
    throw new Error("Sprite pack needs 1–1024 tiles.");
  if (
    typeof pack.png !== "string" ||
    pack.png.length > 5592408 ||
    pack.png.length % 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(pack.png)
  )
    throw new Error("Sprite pack has an invalid PNG.");
  const png = Uint8Array.from(atob(pack.png), (c) => c.charCodeAt(0));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    png.length < 33 ||
    signature.some((v, i) => png[i] !== v) ||
    new TextDecoder().decode(png.subarray(12, 16)) !== "IHDR"
  )
    throw new Error("Sprite pack has an invalid PNG header.");
  const header = new DataView(png.buffer);
  const width = header.getUint32(16),
    height = header.getUint32(20);
  if (!width || !height || width > 2048 || height > 2048)
    throw new Error("Sprite sheet must be at most 2048×2048.");
  const entries: Entry[] = pack.entries
    .map((e: Entry) => {
      if (
        !e ||
        typeof e.key !== "string" ||
        !/^[0-9a-f]{48}$/i.test(e.key) ||
        !Number.isInteger(e.x) ||
        !Number.isInteger(e.y) ||
        e.x < 0 ||
        e.y < 0 ||
        e.x + 16 > width ||
        e.y + 16 > height ||
        (e.flipX !== undefined && typeof e.flipX !== "boolean") ||
        (e.flipY !== undefined && typeof e.flipY !== "boolean")
      )
        throw new Error("Sprite pack contains an invalid tile mapping.");
      return { ...e, key: e.key.toLowerCase() };
    })
    .sort((a: Entry, b: Entry) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (entries.some((e, i) => i > 0 && e.key === entries[i - 1].key))
    throw new Error("Sprite pack contains duplicate tile keys.");
  const bitmap = await createImageBitmap(
    new Blob([png], { type: "image/png" }),
  );
  let pixels: Uint8ClampedArray;
  try {
    if (bitmap.width !== width || bitmap.height !== height)
      throw new Error("PNG dimensions do not match its header.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not decode the sprite sheet.");
    context.drawImage(bitmap, 0, 0);
    pixels = context.getImageData(0, 0, width, height).data;
  } finally {
    bitmap.close();
  }
  const result = new Uint8Array(12 + entries.length * RECORD);
  result.set(new TextEncoder().encode("TTSPK001"));
  new DataView(result.buffer).setUint32(8, entries.length, true);
  entries.forEach((entry, i) => {
    const offset = 12 + i * RECORD;
    for (let k = 0; k < 24; k++)
      result[offset + k] = parseInt(entry.key.slice(k * 2, k * 2 + 2), 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const source =
          ((entry.y + (entry.flipY ? 15 - y : y)) * width +
            entry.x +
            (entry.flipX ? 15 - x : x)) *
          4;
        const dest = offset + 24 + (y * 16 + x) * 4;
        const alpha = pixels[source + 3];
        if (alpha !== 0 && alpha !== 255)
          throw new Error(
            "Sprite pixels must be opaque or transparent, without partial alpha.",
          );
        if (alpha) result.set(pixels.subarray(source, source + 4), dest);
      }
  });
  return result;
}
