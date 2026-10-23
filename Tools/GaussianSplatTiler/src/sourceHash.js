import { createHash } from "node:crypto";

import { createReadStream } from "node:fs";

export const SOURCE_HASH_BUFFER_BYTES = 1024 * 1024;

export async function sha256FileBounded(filePath, options = {}) {
  const hash = createHash("sha256");
  const streamFactory = options.createReadStream ?? createReadStream;
  const stream = streamFactory(filePath, {
    highWaterMark: SOURCE_HASH_BUFFER_BYTES,
  });
  for await (const chunk of stream) {
    if (chunk.byteLength > SOURCE_HASH_BUFFER_BYTES) {
      throw new Error(
        "Source hash reader exceeded its bounded buffer contract",
      );
    }
    hash.update(chunk);
  }
  return hash.digest("hex");
}
