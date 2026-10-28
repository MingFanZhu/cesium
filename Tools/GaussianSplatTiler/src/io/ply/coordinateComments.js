// Coordinate comments describe source provenance, never an implicit transform.
export function collectPlyCoordinateComments(headers) {
  const coordinates = new Map();
  for (const header of headers) {
    for (const comment of header.comments ?? []) {
      const match = /^(epsg|offsetx|offsety|offsetz)\s+(.+)$/i.exec(
        comment.trim(),
      );
      if (!match) {
        continue;
      }
      const key = match[1].toLowerCase();
      const value = Number(match[2]);
      if (
        !Number.isFinite(value) ||
        (coordinates.has(key) && coordinates.get(key) !== value)
      ) {
        throw new Error(
          `Conflicting or invalid PLY coordinate metadata: ${key}`,
        );
      }
      coordinates.set(key, value);
    }
  }
  return Object.fromEntries(coordinates);
}
