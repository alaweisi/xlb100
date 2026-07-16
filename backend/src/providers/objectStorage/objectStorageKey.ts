export function assertSafeObjectKey(objectKey: string): void {
  if (!/^[a-z0-9][a-z0-9/_-]*\.(?:jpg|png|webp)$/.test(objectKey) || objectKey.includes("..")) {
    throw new Error("unsafe object storage key");
  }
}
