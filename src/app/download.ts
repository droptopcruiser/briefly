/** Trigger a browser download of a blob (client-only). */
function triggerDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a browser download of text content (client-only). */
export function downloadText(fileName: string, content: string): void {
  triggerDownload(fileName, new Blob([content], { type: "text/plain;charset=utf-8" }));
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Decode a base64 .docx from the server action and download it as a Word file. */
export function downloadDocx(fileName: string, base64: string): void {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  triggerDownload(fileName, new Blob([bytes], { type: DOCX_MIME }));
}
