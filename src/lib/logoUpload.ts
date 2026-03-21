import sharp from "sharp";

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/avif",
]);

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_BOX_SIZE = 256;
const LOGO_JPEG_QUALITY = 96;

export { ALLOWED_LOGO_TYPES, MAX_LOGO_BYTES };

export async function normalizeLogoBuffer(source: Buffer, mimeType?: string | null) {
  try {
    void mimeType;
    return await sharp(source, { density: 300 })
      .resize(LOGO_BOX_SIZE, LOGO_BOX_SIZE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({
        quality: LOGO_JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();
  } catch {
    throw new Error("INVALID_IMAGE");
  }
}

export async function normalizeLogoUpload(file: File) {
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  const source = Buffer.from(await file.arrayBuffer());
  return normalizeLogoBuffer(source, file.type);
}
