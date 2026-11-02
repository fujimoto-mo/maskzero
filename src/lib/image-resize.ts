/**
 * Shrinks a photo in the browser before upload: the longest side becomes at most `maxSide` and the
 * result is a JPEG. JPEG and PNG files that already fit are returned unchanged. 2576px is the
 * largest side Claude reads at full detail, so résumé photos lose nothing the AI could use.
 */
export async function shrinkImage(
  file: File,
  { maxSide = 2576, maxBytes = 4 * 1024 * 1024, quality = 0.85 } = {},
): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const supported = file.type === "image/jpeg" || file.type === "image/png";
    if (scale === 1 && supported && file.size <= maxBytes) return file;

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    context.fillStyle = "#fff"; // JPEG has no transparency
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Could not encode the image");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
