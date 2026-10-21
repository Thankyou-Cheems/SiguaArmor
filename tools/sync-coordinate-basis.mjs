// Small build-time algorithm source, never a game-data fallback or snapshot.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'lib/shared/coordinate-basis.js');
const receiptPath=path.join(root,'lib/shared/coordinate-basis-source.json');
const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2);
if(args.some((v,i)=>!['--source','--write'].includes(v)&&args[i-1]!=='--source'))throw Error('Use [--source <Wiki root>] [--write]');
const index=args.indexOf('--source'), source=index<0?null:args[index+1];
if(index>=0&&(!source||source.startsWith('--')))throw Error('--source needs a Wiki root');
if(receipt.schemaVersion!=='sigua-shared-coordinate-basis-source/v1'||receipt.owner!=='SiguaWiki'||receipt.sourcePath!=='algorithms/coordinates/basis.js')throw Error('Invalid coordinate source receipt');
const local=await readFile(target);
if(hash(local)!==receipt.sha256)throw Error('Coordinate source differs from its receipt');
if(source){
  const bytes=await readFile(path.join(path.resolve(source),receipt.sourcePath));
  if(args.includes('--write')){
    await writeFile(target,bytes);
    await writeFile(receiptPath,JSON.stringify({...receipt,sha256:hash(bytes)},null,2)+'\n');
  }else if(!bytes.equals(local))throw Error('Coordinate source differs from Wiki; review then sync with --write');
}else if(args.includes('--write'))throw Error('--write requires an explicit Wiki source');
console.log('Coordinate source SHA-256 verified: '+hash(await readFile(target)));
