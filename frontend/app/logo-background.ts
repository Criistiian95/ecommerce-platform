// Conservative, local extraction for uniform backgrounds. Never edits the source.
export function removeUniformBackground(source: Uint8ClampedArray, width: number, height: number, tolerance=32, includeInside=false) {
  const pixels=new Uint8ClampedArray(source);
  const edge:number[]=[];
  for(let x=0;x<width;x++){edge.push(x,(height-1)*width+x);}
  for(let y=1;y<height-1;y++){edge.push(y*width,y*width+width-1);}
  const opaque=edge.filter(i=>source[i*4+3]>240);
  if(opaque.length<edge.length*0.25) return pixels; // Already transparent.
  const bins=new Map<string,number[]>();
  for(const i of opaque){const p=i*4;const key=[source[p],source[p+1],source[p+2]].map(c=>Math.round(c/24)).join(',');const values=bins.get(key)||[];values.push(i);bins.set(key,values);}
  const group=[...bins.values()].sort((a,b)=>b.length-a.length)[0];
  const background=[0,1,2].map(c=>group.reduce((sum,i)=>sum+source[i*4+c],0)/group.length);
  const distance=(i:number)=>Math.hypot(...background.map((c,j)=>source[i*4+j]-c));
  if(opaque.filter(i=>distance(i)<=tolerance).length<opaque.length*0.8) throw Error('El fondo tiene textura o varios colores. Usá un PNG transparente para conservar bien el logo.');
  const visited=new Uint8Array(width*height),queue=new Uint32Array(width*height);let head=0,tail=0;
  const push=(i:number)=>{if(!visited[i]){visited[i]=1;if(source[i*4+3]<8||distance(i)<=tolerance){queue[tail++]=i;pixels[i*4+3]=0;}}};
  if(includeInside){for(let i=0;i<width*height;i++)if(distance(i)<=tolerance)pixels[i*4+3]=0;}
  else {
    edge.forEach(push);
    while(head<tail){const i=queue[head++],x=i%width,y=Math.floor(i/width);if(x>0)push(i-1);if(x<width-1)push(i+1);if(y>0)push(i-width);if(y<height-1)push(i+width);}
  }
  let foreground=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>8)foreground++;
  if(foreground<Math.max(4,width*height*0.001)) throw Error('No pudimos distinguir el logo del fondo. Probá con una imagen de mayor contraste.');
  return pixels;
}

export async function transparentLogo(src:string,tolerance=32,includeInside=false){
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.onload=()=>resolve(image);image.onerror=()=>reject(Error('No se pudo leer el logo. Subilo como archivo para quitar el fondo.'));image.src=src;});
  const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Este navegador no permite procesar imágenes.');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let data:ImageData;try{data=ctx.getImageData(0,0,canvas.width,canvas.height);}catch{throw Error('La URL no permite editar la imagen. Descargá el logo y subilo como archivo.');}
  data.data.set(removeUniformBackground(data.data,canvas.width,canvas.height,tolerance,includeInside));ctx.putImageData(data,0,0);
  let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data.data[(y*canvas.width+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left)throw Error('La imagen no contiene un logo visible.');
  const cropped=document.createElement('canvas');cropped.width=right-left+9;cropped.height=bottom-top+9;
  cropped.getContext('2d')!.drawImage(canvas,left,top,right-left+1,bottom-top+1,4,4,right-left+1,bottom-top+1);
  const result=cropped.toDataURL('image/png');
  if(result.length>2796200)throw Error('El resultado supera 2 MB. Subí un logo más pequeño.');
  return result;
}
