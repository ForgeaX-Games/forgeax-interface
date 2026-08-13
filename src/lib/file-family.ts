/**
 * Shared file-family taxonomy used by the interface file tree and chat assets.
 *
 * Keep this module free of React and CSS imports.  The family key is the
 * contract; visual consumers map it to `--fx-family-*` tokens.
 */

export type FileFamily =
  | 'code'
  | 'config'
  | 'doc'
  | 'scene'
  | 'pack'
  | 'meta'
  | 'image'
  | 'audio'
  | 'model'
  | 'data';

export interface FileFamilyDefinition {
  readonly key: FileFamily;
  readonly label: string;
  readonly extensions: readonly string[];
}

export const FAMILY_ORDER: readonly FileFamilyDefinition[] = [
  { key: 'code', label: 'CODE', extensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'] },
  { key: 'config', label: 'CFG', extensions: ['json', 'json5', 'jsonc', 'lock', 'yaml', 'yml', 'toml', 'ini', 'env'] },
  { key: 'doc', label: 'DOC', extensions: ['md', 'markdown', 'txt', 'rst', 'adoc'] },
  { key: 'scene', label: 'SCENE', extensions: ['scene', 'fxscene'] },
  { key: 'pack', label: 'PACK', extensions: ['pack', 'fxpack', 'zip', 'tar', 'gz'] },
  { key: 'meta', label: 'META', extensions: ['meta'] },
  { key: 'image', label: 'IMG', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico', 'avif'] },
  { key: 'audio', label: 'AUD', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] },
  { key: 'model', label: 'MODEL', extensions: ['glb', 'gltf', 'fbx', 'obj', 'dae', 'blend', '3ds'] },
  { key: 'data', label: 'DATA', extensions: ['csv', 'tsv', 'xml', 'bin', 'dat', 'db', 'sqlite', 'sqlite3'] },
];

const EXTENSION_TO_FAMILY = new Map<string, FileFamily>(
  FAMILY_ORDER.flatMap(({ key, extensions }) => extensions.map((extension): [string, FileFamily] => [extension, key])),
);

/** Classify a file path by its final extension. Unknown files are `data`. */
export function familyOf(path: string): FileFamily {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path;
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
  return EXTENSION_TO_FAMILY.get(extension) ?? 'data';
}
