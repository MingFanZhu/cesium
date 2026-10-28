# Deterministic voxel fixture

Eight closed analytic boxes grouped into four glTF content tiles under one REPLACE root.
Coordinates are local meters, Z-up. Each building is an ordinary static mesh node with affine
translation/scale; there is no precomputed voxel mask. The same tileset is placed by a rigid
matrix in Globe ENU or Planar World. Leaf geometricError is 0 because the analytic mesh itself
is the source reference, not because arbitrary real-world accuracy has been established.

Created for this repository and distributed under its license. Contains no third-party city data,
credentials or network dependencies. The example's region includes padding below and above
the boxes so the closed surfaces are not cut by the domain boundary.
