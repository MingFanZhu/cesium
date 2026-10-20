# S3M decoder provenance

Source: [SuperMap/s3m-spec](https://github.com/SuperMap/s3m-spec),
commit `462cf06b95857fe2410dce9aecbfd8e4c16e84fc`.

The Apache-2.0 SDK source under `S3M_SDK/S3M_JS/S3M_module/S3MParser/`
provides the binary layout (`S3ModelParser.js`) and BC1/BC3 reconstruction
(`DXTTextureDecode.js`) adapted by the SceneGIS private parser and texture decoder.
Copyright belongs to the original SuperMap contributors. See `LICENSE.txt`.
The separately licensed specification is not reproduced here.

Changes: accept the qualified 1.0 standard-vertex / DXT profile, remove global
Cesium dependencies and unused decoders, transfer decoding to a Worker, correct
RGBA row indexing, emit PNG / native glTF metadata and GPU instancing.
The official legacy renderer and its global Scene prototype override are not used.

On upstream updates, compare binary layout, material and selection semantics
against this pinned source and re-run all three qualified sample categories.
