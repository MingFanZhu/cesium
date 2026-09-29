# Lens frost texture

Generated for this project with the built-in image_gen tool. No third-party
texture, code or reference image was supplied. The exact prompt and image
metadata are recorded in manifest.json; the generated asset is copied without
editing. The requested size was 1024 square; the delivered PNG is 1254 square.

The red channel is a linear frost-density mask, not an albedo or normal map.
SceneGISSnowLensStage combines it with a static edge coverage mask and
visible-scene brightness. No animation, simulation, fixed glints or scene
lighting is baked into the runtime effect. Native image loading uses one RGBA8
texture without mipmaps, about 6 MiB; the post-process output target is separate.
