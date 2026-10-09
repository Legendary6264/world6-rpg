export const MAX_IMAGE_BYTES=8*1024*1024
export const MAX_IMAGE_PIXELS=16_000_000
export function imageDimensions(bytes:Uint8Array,mime:string):{width:number;height:number} {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),string=(start:number,count:number)=>String.fromCharCode(...bytes.slice(start,start+count))
 let width=0,height=0
 if(mime==='image/png'&&bytes.length>=24&&bytes[0]===137&&string(1,3)==='PNG'&&string(12,4)==='IHDR'){width=view.getUint32(16);height=view.getUint32(20)}
 if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
 let offset=2
 while(offset+8<bytes.length){if(bytes[offset]!==255)break;while(bytes[offset]===255)offset++;if(offset+8>=bytes.length)break;const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;const length=view.getUint16(offset);if(length<2)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){height=view.getUint16(offset+3);width=view.getUint16(offset+5);break}offset+=length}
 }
 if(mime==='image/webp'&&bytes.length>=30&&string(0,4)==='RIFF'&&string(8,4)==='WEBP'){
 const kind=string(12,4)
 if(kind==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)}
 else if(kind==='VP8L'&&bytes[20]===47){width=1+bytes[21]+((bytes[22]&63)<<8);height=1+(bytes[22]>>6)+(bytes[23]<<2)+((bytes[24]&15)<<10)}
 else if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383}
 }
 if(!width||!height)throw new Error('Заголовок не соответствует PNG, JPEG или WebP.')
 if(width>8192||height>8192||width*height>MAX_IMAGE_PIXELS)throw new Error('Изображение превышает 16 мегапикселей или 8192 пикселя по стороне.')
 return {width,height}
}
export async function validateImageFile(file:File) {
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>MAX_IMAGE_BYTES||file.size===0)throw new Error('Выбери PNG, JPEG или WebP до 8 МиБ.')
 return imageDimensions(new Uint8Array(await file.slice(0,1024*1024).arrayBuffer()),file.type)
}
