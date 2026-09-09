/**
 * Converts binary data to base64 in 8192-byte chunks.
 * Chunking avoids blowing the call stack (and freezing the tab) on large PDFs.
 * Single source of truth — do not duplicate this helper.
 */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK_SIZE = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(chunks.join(""));
};
