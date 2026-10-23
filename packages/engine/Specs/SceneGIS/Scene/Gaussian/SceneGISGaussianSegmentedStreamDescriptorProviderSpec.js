import { PAGE_ALIGNMENT } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import _SceneGISGaussianSegmentedStreamDescriptorProvider from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedStreamDescriptorProvider.js";

describe("SceneGIS/Scene/SceneGISGaussianSegmentedStreamDescriptorProvider", function () {
  it("keeps a procedural million-Page source compact while demanding a few rows", function () {
    const pageCount = 1_000_000;
    const branded = new WeakSet();
    let pageReads = 0;
    let packReads = 0;
    const index = Object.freeze({
      artifactIdentityHex: "procedural-a4-artifact",
      mciChecksum: 1234,
      byteLength: 60_000_824,
      pageCount,
      packCount: 1,
      readPage(pageId, scratch) {
        pageReads++;
        scratch.set([
          pageId,
          0,
          1,
          1,
          1,
          1,
          0,
          PAGE_ALIGNMENT + pageId * PAGE_ALIGNMENT,
          32,
          32,
          pageId,
        ]);
        return scratch;
      },
      readPack(packId, scratch) {
        packReads++;
        scratch.set([
          1,
          1,
          0,
          pageCount,
          pageCount,
          pageCount * PAGE_ALIGNMENT + 32,
          9,
        ]);
        return scratch;
      },
    });
    branded.add(index);
    const provider = new _SceneGISGaussianSegmentedStreamDescriptorProvider({
      runtimeIndex: index,
      validateRuntimeIndex(value) {
        if (!branded.has(value)) {
          throw new TypeError("foreign procedural index");
        }
        return value;
      },
      packFileName: ({ id }) => `packs/scene.core.${id}.gsp`,
    });
    expect(provider.readPageRequest(7).index).toBe(7);
    expect(provider.readPageRequest(999999).offset).toBe(
      pageCount * PAGE_ALIGNMENT,
    );
    const pack = provider.readPackRequest(0);
    expect(pack.payloadOffset).toBe(PAGE_ALIGNMENT);
    expect(pack.payloadBytes).toBe(pack.fileBytes - PAGE_ALIGNMENT);
    expect(pack.fileName).toBe("packs/scene.core.0.gsp");
    expect(pageReads).toBe(4);
    expect(packReads).toBe(1);
    expect(provider.statistics).toEqual({
      descriptorPageReads: 2,
      descriptorPackReads: 1,
      residentDescriptorCount: 0,
    });
    expect(Object.keys(provider)).toEqual([]);
    expect(function () {
      provider.readPageRequest(pageCount);
    }).toThrowDeveloperError();
    expect(function () {
      return new _SceneGISGaussianSegmentedStreamDescriptorProvider({
        runtimeIndex: { ...index },
        validateRuntimeIndex(value) {
          if (!branded.has(value)) {
            throw new TypeError("foreign procedural index");
          }
          return value;
        },
        packFileName: () => "packs/foreign.gsp",
      });
    }).toThrowError(/foreign procedural index/);
  });
});
