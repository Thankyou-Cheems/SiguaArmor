// Build-time algorithm source only. No network, game-data snapshot or fallback.
import {access,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const defaultRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePath='algorithms/coordinates/basis.js';
const exists=async p=>access(p).then(()=>true,()=>false);

export async function discoverCoordinateSource(root, explicit, env=process.env) {
  const requested=explicit||env.SIGUA_WIKI_COORDINATE_SOURCE;
  if(requested) {
    const source=path.resolve(requested);
    await access(path.join(source,sourcePath));
    return source;
  }
  const normalized=root.replaceAll('\\','/'), marker='/.local/worktrees/';
  const split=normalized.lastIndexOf(marker);
  const repository=split<0?root:normalized.slice(0,split);
  const sibling=path.resolve(repository,'../SiguaWiki');
  const candidates=split<0?[sibling]:[path.join(sibling,'.local/worktrees',normalized.slice(split+marker.length)),sibling];
  for(const candidate of candidates) if(await exists(path.join(candidate,sourcePath))) return candidate;
  return null;
}

export async function verifyCoordinateBasis(root=defaultRoot,{source,write=false,env=process.env}={}) {
  const target=path.join(root,'lib/shared/coordinate-basis.js');
  const receiptPath=path.join(root,'lib/shared/coordinate-basis-source.json');
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  if(receipt.schemaVersion!=='sigua-shared-coordinate-basis-source/v1'||receipt.owner!=='SiguaWiki'||receipt.sourcePath!==sourcePath)throw Error('Invalid coordinate source receipt');
  const local=await readFile(target);
  if(hash(local)!==receipt.sha256)throw Error('Coordinate source differs from its receipt');
  const owner=await discoverCoordinateSource(root,source,env);
  if(write&&!source&&!env.SIGUA_WIKI_COORDINATE_SOURCE)throw Error('--write requires an explicit reviewed Wiki source');
  if(owner) {
    const bytes=await readFile(path.join(owner,sourcePath));
    if(write){
      await writeFile(target,bytes);
      await writeFile(receiptPath,JSON.stringify({...receipt,sha256:hash(bytes)},null,2)+'\n');
    }else if(!bytes.equals(local))throw Error('Coordinate source differs from Wiki; review then sync with --source <Wiki root> --write');
  }
  return {mode:owner?'source-checked':'receipt-only',source:owner,sha256:hash(await readFile(target))};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2);
  let source,write=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--write')write=true;
    else if(args[i]==='--source'&&args[i+1]&&!args[i+1].startsWith('--'))source=args[++i];
    else throw Error('Use [--source <Wiki root>] [--write]');
  }
  console.log('Coordinate source '+JSON.stringify(await verifyCoordinateBasis(defaultRoot,{source,write})));
}
