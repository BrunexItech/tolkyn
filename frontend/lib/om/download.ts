/** Forces a real file download, even for cross-origin URLs (like our media
 * server on a different port) where a plain `<a download>` gets silently
 * ignored by the browser and just opens the file in a new tab instead. */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}
