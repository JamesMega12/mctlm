// Browser-side helpers for getting files out of a file picker or a drop,
// including whole folders. Kept apart from read.ts so they're easy to follow.

type WithPath = File & { webkitRelativePath?: string };

export const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';

/** Path of a file as picked: "folder/sub/name.pdf" for a folder pick, else the name. */
export const filePath = (f: File) => (f as WithPath).webkitRelativePath || f.name;

/** Identifies a picked file so the same one isn't queued twice. Deliberately
 * ignores the folder it was picked from: choosing a folder and then its parent
 * must not queue the same documents again. */
export const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

const readAllEntries = (reader: FileSystemDirectoryReader) =>
  new Promise<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    // readEntries returns a batch at a time and signals the end with an empty one.
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length) {
          all.push(...batch);
          next();
        } else resolve(all);
      }, reject);
    next();
  });

async function walk(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))];
  }
  if (entry.isDirectory) {
    const kids = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    return (await Promise.all(kids.map(walk))).flat();
  }
  return [];
}

/** Every file in a drop, with folders expanded recursively. The entries must be
 * read before the first await (the browser clears them once the drop event ends). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].flatMap((i) => (i.kind === 'file' ? [i.webkitGetAsEntry()] : [])).filter((e) => e !== null);
  if (!entries.length) return [...dt.files];
  return (await Promise.all(entries.map(walk))).flat();
}

/** Stable order for a batch: by path, numbers compared as numbers. */
export const byPath = (a: File, b: File) => filePath(a).localeCompare(filePath(b), undefined, { numeric: true });
