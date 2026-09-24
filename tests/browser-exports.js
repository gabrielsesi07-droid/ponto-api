// Run with agent-browser eval --stdin against the local Vite preview.
(async () => {
  const [{exportReport},{demoState},{calculate}] = await Promise.all([
    import('/lib/export.ts'), import('/lib/demo.ts'), import('/lib/domain.ts'),
  ]);
  const state=demoState(),rows=calculate(state.entries).filter(e=>e.user_id===state.me.id).slice(-3);
  const originalURL=URL.createObjectURL, originalClick=HTMLAnchorElement.prototype.click,blobs=[];
  URL.createObjectURL=blob=>{blobs.push(blob);return originalURL(blob)};
  HTMLAnchorElement.prototype.click=function(){};
  try {
    for(const type of ['csv','xlsx','pdf']) await exportReport(type,rows,state,'2026-09');
    const results=await Promise.all(blobs.map(async blob=>({type:blob.type,size:blob.size,signature:Array.from(new Uint8Array(await blob.slice(0,5).arrayBuffer()))})));
    if(results.length!==3||results.some(b=>b.size<100)) throw Error('Exportação vazia');
    if(results[1].signature[0]!==80||results[1].signature[1]!==75) throw Error('Excel inválido');
    if(results[2].signature.slice(0,4).join(',')!=='37,80,68,70') throw Error('PDF inválido');
    return results;
  } finally {URL.createObjectURL=originalURL;HTMLAnchorElement.prototype.click=originalClick}
})()
