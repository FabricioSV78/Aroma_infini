import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pruneBuiltinAssets} from '../scripts/prune-builtin-assets.mjs'
const origin='https://abcdefghijklmnopqrst.supabase.co'
const inventory=[{path:'/images/original.webp'},{path:'/videos/original.mp4'}]
const config={env:{staging:{vars:{APP_ENVIRONMENT:'staging',SUPABASE_URL:origin,MEDIA_BUILTIN_STORAGE:'r2'}},production:{vars:{APP_ENVIRONMENT:'production'}}}}
const publicEnv={VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}
async function fixture(work){
const directory=await mkdtemp(join(tmpdir(),'aroma-default-prune-'))
try{for(const name of ['images','videos','assets'])await mkdir(join(directory,name));for(const item of inventory)await writeFile(directory+item.path,'unchanged pixels');await writeFile(join(directory,'assets','app.js'),'app');return await work(directory)}
finally{await rm(directory,{recursive:true,force:true})}
}
const ready=()=>Response.json({items:inventory.map(({path})=>({path,status:'ready'}))})
test('only verified generated defaults are omitted; application code is preserved',()=>fixture(async directory=>{
const result=await pruneBuiltinAssets({directory,mode:'staging',config,publicEnv,inventory,transport:async(url,options)=>{assert.equal(url,origin+'/rest/v1/rpc/builtin_media_build_state');assert.equal(options.redirect,'error');return ready()}})
assert.equal(result.pruned,2);await assert.rejects(readFile(directory+inventory[0].path),{code:'ENOENT'});assert.equal(await readFile(join(directory,'assets','app.js'),'utf8'),'app')
}))
test('unknown migration status fails before deleting any generated image',()=>fixture(async directory=>{
await assert.rejects(pruneBuiltinAssets({directory,mode:'staging',config,publicEnv,inventory,transport:async()=>Response.json({items:[{path:inventory[0].path,status:'ready'},{path:inventory[1].path,status:'unavailable'}]})}));assert.equal(await readFile(directory+inventory[0].path,'utf8'),'unchanged pixels')
}))
test('retired paths are accepted without recreating removed original bytes',()=>fixture(async directory=>{
const result=await pruneBuiltinAssets({directory,mode:'staging',config,publicEnv,inventory,transport:async()=>Response.json({items:inventory.map(({path})=>({path,status:'retired'}))})});assert.equal(result.pruned,2)
}))
test('production remains unchanged until its managed-original mode is enabled',()=>fixture(async directory=>{
const result=await pruneBuiltinAssets({directory,mode:'production',config,publicEnv,inventory,transport:async()=>{throw Error('Production must not query development')}});assert.equal(result.pruned,0);assert.equal(await readFile(directory+inventory[0].path,'utf8'),'unchanged pixels')
}))
test('wrong project, duplicate inventory and provider failures preserve files',()=>fixture(async directory=>{
for(const override of [{publicEnv:{...publicEnv,VITE_SUPABASE_URL:'https://zyxwvutsrqponmlkjihg.supabase.co'}},{inventory:[inventory[0],inventory[0]]},{transport:async()=>new Response('unavailable',{status:503})}])await assert.rejects(pruneBuiltinAssets({directory,mode:'staging',config,publicEnv,inventory,transport:async()=>ready(),...override}));assert.equal(await readFile(directory+inventory[0].path,'utf8'),'unchanged pixels')
}))
