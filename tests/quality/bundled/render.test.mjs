import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
test('production source renders shared ROS panel with local flag disabled',async()=>{
 const server=await createServer({configFile:false,envDir:false,plugins:[react()],define:{'import.meta.env.LOCAL_QUALITY_ENABLED':'false'},resolve:{alias:{'@':resolve('src')}},server:{middlewareMode:true,watch:null},appType:'custom'});
 try {
  const {default:Panel}=await server.ssrLoadModule('/src/components/waiver-ros-assets.tsx');
  const {makeBundledQualitySnapshot}=await server.ssrLoadModule('/tests/browser/fixture.ts');
  const {projectedWaivers}=await server.ssrLoadModule('/src/lib/sleeper/waiver-valuation.ts');
  const snapshot=makeBundledQualitySnapshot();
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-11-18T12:00:00Z'])); } static now() { return RealDate.parse('2026-11-18T12:00:00Z'); } };
  let html;
  try { html=renderToStaticMarkup(React.createElement(Panel,{snapshot,projected:projectedWaivers(snapshot),children:(_annotation,panel)=>panel})); }
  finally { globalThis.Date = RealDate; }
  for(const text of ['Best ROS Assets','Decision context','Nov 17, 2026','Show more','30 ranked of 30'])assert.ok(html.includes(text),text);
  assert.equal((html.match(/<li class=/g)||[]).length,10);
  assert.doesNotMatch(html,/Reload local capture|Local development|__local-quality/);
 }finally{await server.close();}
});
