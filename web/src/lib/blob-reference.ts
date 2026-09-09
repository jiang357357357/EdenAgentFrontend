export type BlobReference = { origin: "mon" | "local"; id: string }

export function blobReference(origin: BlobReference["origin"], id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Invalid blob ID")
  return `eden-blob://${origin}/${id}`
}

export function parseBlobReference(value: string): BlobReference | undefined {
  const match = /^eden-blob:\/\/(mon|local)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value)
  if (!match) return undefined
  return { origin: match[1]!.toLowerCase() as BlobReference["origin"], id: match[2]! }
}
