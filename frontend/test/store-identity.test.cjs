const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
function load(file){const sandbox={exports:{},Uint8ClampedArray,Uint8Array,Uint32Array};vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve(file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
const {removeUniformBackground}=load('../app/logo-background.ts');
const {onColor}=load('../app/store-colors.ts');
function whiteImage(){const a=new Uint8ClampedArray(7*7*4).fill(255);for(let y=2;y<5;y++)for(let x=2;x<5;x++){const i=(y*7+x)*4;a[i]=a[i+1]=a[i+2]=0;}return a;}
test('logo extraction removes border background without altering source or dark lettering',()=>{const input=whiteImage(),result=removeUniformBackground(input,7,7);assert.equal(result[3],0);assert.equal(result[(3*7+3)*4+3],255);assert.equal(input[3],255);});
test('enclosed matching colors are preserved unless explicitly selected',()=>{const input=whiteImage(),center=(3*7+3)*4;input[center]=input[center+1]=input[center+2]=255;assert.equal(removeUniformBackground(input,7,7)[center+3],255);assert.equal(removeUniformBackground(input,7,7,32,true)[center+3],0);});
test('transparent uploads preserve opacity and textured edges are rejected',()=>{const input=whiteImage();for(let x=0;x<7;x++){input[x*4+3]=0;input[(42+x)*4+3]=0;}for(let y=0;y<7;y++){input[y*7*4+3]=0;input[(y*7+6)*4+3]=0;}assert.deepEqual(removeUniformBackground(input,7,7),input);const textured=whiteImage();for(let x=0;x<7;x++)for(let c=0;c<3;c++)textured[x*4+c]=0;assert.throws(()=>removeUniformBackground(textured,7,7),/textura/);});
test('navigation contrast switches for light and dark brand colors',()=>{assert.equal(onColor('#ffffff'),'#111111');assert.equal(onColor('#ffe600'),'#111111');assert.equal(onColor('#000000'),'#ffffff');assert.equal(onColor('#245ce6'),'#ffffff');});
