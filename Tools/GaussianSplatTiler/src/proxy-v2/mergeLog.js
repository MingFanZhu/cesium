import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { PROXY_V2_MERGE_LOG_RECORD_BYTES } from "./constants.js";

export class ProxyV2MergeLogDigest {
  constructor() {
    this.buffer = Buffer.allocUnsafe(PROXY_V2_MERGE_LOG_RECORD_BYTES);
    this.records = 0;
    this.hash = createHash("sha256");
    this.closed = false;
  }

  append(record) {
    const values = [
      record.mergeOrdinal,
      record.parentClusterId,
      record.leftClusterId,
      record.rightClusterId,
      record.ownerSlot,
      record.retiredSlot,
      record.activeCountAfterMerge,
      record.marginalDistortion,
    ];
    for (let index = 0; index < values.length; index++) {
      if (!Number.isFinite(values[index])) {
        throw new Error("Proxy v2 merge log contains a non-finite field");
      }
      this.buffer.writeDoubleLE(values[index], index * 8);
    }
    this.hash.update(this.buffer);
    this.records++;
  }

  close() {
    if (this.closed) {
      throw new Error("Proxy v2 merge log is already closed");
    }
    this.closed = true;
    return {
      recordCount: this.records,
      byteLength: this.records * PROXY_V2_MERGE_LOG_RECORD_BYTES,
      sha256: this.hash.digest("hex"),
    };
  }
}
