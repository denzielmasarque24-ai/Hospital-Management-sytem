import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
function imageHarness(sources) {
 let state; const exports={};
 vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/products/ProductImage.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>{
  if(name==='react') return {useState:initial=>{state??=initial;return [state,next=>{state=typeof next==='function'?next(state):next}];}};
  if(name==='next/image')return {default:'image',__esModule:true};
  if(name==='@/lib/products/product-images')return {getProductImageSources:()=>sources};
  return require(name);
 }});
 const outer=exports.ProductImage({src:sources[0],alt:'Test product'});
 return {render:()=>outer.type(outer.props)};
}
test('optimizer failure retries the same valid local file directly',()=>{
 const f=imageHarness(['/images/products/photo.png']);const optimized=f.render();assert.equal(optimized.props.unoptimized,false);
 optimized.props.onError();const direct=f.render();assert.equal(direct.props.src,optimized.props.src);assert.equal(direct.props.unoptimized,true);
 optimized.props.onError();assert.equal(f.render().props.unoptimized,true);
 direct.props.onError();assert.notEqual(f.render().type,'image');
});
test('duplicate upload errors cannot skip the matching local fallback',()=>{
 const f=imageHarness(['https://example.com/broken-upload.png','/images/products/photo.png']);const upload=f.render();upload.props.onError();upload.props.onError();
 const local=f.render();assert.equal(local.props.src,'/images/products/photo.png');assert.equal(local.props.unoptimized,false);
 local.props.onError();const direct=f.render();assert.equal(direct.props.src,local.props.src);assert.equal(direct.props.unoptimized,true);
});
