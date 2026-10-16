export const STORE_FONTS: Record<string,string> = {
 modern: 'Arial, Helvetica, sans-serif',
 classic: 'Georgia, "Times New Roman", serif',
 friendly: '"Trebuchet MS", Arial, sans-serif',
 mono: '"Courier New", monospace',
};
export const storeFont=(key?:string)=>STORE_FONTS[key||'modern']||STORE_FONTS.modern;
