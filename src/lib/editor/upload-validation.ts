export const resourceMimeTypes = {
  "image/png": { extension: "png", resourceType: "image" },
  "image/jpeg": { extension: "jpg", resourceType: "image" },
  "image/webp": { extension: "webp", resourceType: "image" },
  "application/pdf": { extension: "pdf", resourceType: "document" },
} as const;

export type ResourceMimeType = keyof typeof resourceMimeTypes;

export function isResourceMimeType(value: string): value is ResourceMimeType {
  return Object.hasOwn(resourceMimeTypes, value);
}

export function hasResourceSignature(type: ResourceMimeType, bytes: Uint8Array): boolean {
  const starts = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  switch (type) {
    case "image/png":
      return starts([137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/jpeg":
      return starts([255, 216, 255]);
    case "image/webp":
      return starts([82, 73, 70, 70]) &&
        [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte);
    case "application/pdf":
      return starts([37, 80, 68, 70, 45]);
  }
}
