/** Small uncompressed SQCP container. HTTP handles transfer compression.
 * Numeric arrays are views of one shared allocation; no per-instance copies. */
export function decodeSchoolQueryPacket(buffer: ArrayBuffer) {
  const view=new DataView(buffer),bytes=new Uint8Array(buffer);
  if (bytes.length<12 || String.fromCharCode(...bytes.subarray(0,4))!=="SQCP" || view.getUint32(4,true)!==1) throw new Error("Invalid school query packet");
  const length=view.getUint32(8,true),start=Math.ceil((12+length)/8)*8;
  if (start>bytes.length || length>1024*1024) throw new Error("Invalid school packet metadata");
  const header=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+length))) as {
    metadata:unknown; sections:Record<string,[string,number,number,number]>;
  };
  const constructors={f:Float32Array,H:Uint16Array,i:Int32Array,I:Uint32Array};
  const arrays:Record<string,Float32Array|Uint16Array|Int32Array|Uint32Array>={},spans:Array<[number,number]>=[];
  for (const [name,[kind,count,offset,size]] of Object.entries(header.sections)) {
    const Constructor=constructors[kind as keyof typeof constructors];
    if (!Constructor || ![count,offset,size].every(n=>Number.isSafeInteger(n)&&n>=0) || offset%8 || size!==count*Constructor.BYTES_PER_ELEMENT || start+offset+size>bytes.length || spans.some(([a,b])=>offset<b&&a<offset+size)) throw new Error("Invalid school packet section");
    spans.push([offset,offset+size]);
    const values=new Constructor(buffer,start+offset,count);
    if (!values.every(Number.isFinite)) throw new Error("Non-finite school packet");
    arrays[name]=values;
  }
  return {metadata:header.metadata,arrays};
}
