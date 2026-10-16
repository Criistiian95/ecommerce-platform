// Pick the foreground with the greater contrast against the merchant's color.
export function onColor(hex: string) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  const l=rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  return (l+0.05)/0.05 >= 1.05/(l+0.05) ? '#111111' : '#ffffff';
}
