import path from "node:path";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

async function writeFully(file, bytes, position) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await file.write(
      bytes,
      offset,
      bytes.byteLength - offset,
      position + offset,
    );
    if (bytesWritten === 0) {
      throw new Error("Encoded Page spool write made no progress");
    }
    offset += bytesWritten;
  }
}

export async function createEncodedPageSpool(options = {}) {
  const directory = await mkdtemp(
    path.join(options.temporaryDirectory ?? tmpdir(), "gsp-encoded-pages-"),
  );
  const file = await open(path.join(directory, "pages.bin"), "w+");
  let byteLength = 0;
  let cleanupPromise;
  return {
    directory,
    get byteLength() {
      return byteLength;
    },
    async append(page) {
      const offset = byteLength;
      await writeFully(file, page.bytes, offset);
      byteLength += page.bytes.byteLength;
      return Object.freeze({
        payloadId: page.payloadId,
        kind: page.kind,
        start: page.start,
        count: page.count,
        offset,
        byteLength: page.bytes.byteLength,
      });
    },
    async read(record) {
      const bytes = new Uint8Array(record.byteLength);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const { bytesRead } = await file.read(
          bytes,
          offset,
          bytes.byteLength - offset,
          record.offset + offset,
        );
        if (bytesRead === 0) {
          throw new Error("Unexpected end of encoded Page spool");
        }
        offset += bytesRead;
      }
      return bytes;
    },
    cleanup() {
      cleanupPromise ??= file
        .close()
        .then(() => rm(directory, { recursive: true, force: true }));
      return cleanupPromise;
    },
  };
}
