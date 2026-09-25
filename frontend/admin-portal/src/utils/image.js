// Profile photos are stored as data URIs on the user row and sent with every
// user list, so their size is paid on every load of the Users page. A phone
// photo straight from the camera is 2-5 MB; shown at 36-64px it never needs
// to be more than a few kilobytes. Shrinking in the browser before upload
// keeps the list light whatever people pick, and lets a larger original
// through than the server would accept as-is.

export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const AVATAR_MAX_SIDE = 256; // 2x the largest avatar on screen

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file couldn't be read as an image."));
    img.src = url;
  });
}

/**
 * A data URI of `file`, scaled so its longer side is at most 256px.
 * WebP keeps transparency; a browser that can't encode it falls back to PNG.
 */
export async function resizeImageFile(file, maxSide = AVATAR_MAX_SIDE) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/webp", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
