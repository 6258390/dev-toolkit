import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

_applyPatches(_loadPatches());

// Implementation
function _loadPatches() {
  const dirs = [join(dirname(fileURLToPath(import.meta.url)), 'patches'), join(process.cwd(), 'patches')];
  return dirs.filter(existsSync).flatMap(dir =>
    readdirSync(dir).filter(f => f.endsWith('.patches')).map(file => _parsePatchFile(join(dir, file))),
  ).reduce((all, patches) => ({ ...all, ...patches }), {});
}

function _parsePatchFile(filePath) {
  const patches = {};
  const sections = readFileSync(filePath, 'utf-8').split(/^=== (.+?) ===$/gm).slice(1);
  for (let i = 0; i < sections.length; i += 2) {
    if (!sections[i + 1]) continue;
    const patchList = sections[i + 1].split(/^---/gm).slice(1).map(part => {
      const [find, replaceWith] = part.split(/^\+\+\+/gm);
      return find && replaceWith ? { find: find.trim(), replaceWith: replaceWith.trim() } : null;
    }).filter(Boolean);
    if (patchList.length > 0) patches[sections[i].trim()] = patchList;
  }
  return patches;
}

function _applyPatches(patches) {
  const nodeModules = _findNodeModules(process.cwd());
  if (!nodeModules) return;
  for (const [relativePath, patchList] of Object.entries(patches)) {
    const filePath = join(nodeModules, relativePath);
    if (!existsSync(filePath) || existsSync(filePath + '.dev-toolkit-patched')) continue;
    let content = readFileSync(filePath, 'utf-8');
    for (const { find, replaceWith } of patchList) content = content.replaceAll(find, replaceWith);
    writeFileSync(filePath, content, 'utf-8');
    writeFileSync(filePath + '.dev-toolkit-patched', `Patched at ${new Date().toISOString()}\n`);
  }
}

function _findNodeModules(dir) {
  while (dir !== dirname(dir)) {
    const nm = join(dir, 'node_modules');
    if (existsSync(nm)) return nm;
    dir = dirname(dir);
  }
  return null;
}
