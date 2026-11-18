import assert from 'node:assert/strict'
import {lstat,readFile,unlink} from 'node:fs/promises'
import {dirname,resolve,sep} from 'node:path'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import {loadEnv} from 'vite'

/** Static Assets is immutable. Only verified R2 defaults may be omitted from a
 * new deployment; runtime cleanup then owns their actual 24-hour lifecycle. */
export async function pruneBuiltinAssets({directory,mode,config,publicEnv,inventory,transport=fetch}) {
  assert(['staging','production'].includes(mode))
  const selected=config.env?.[mode]
  if(selected?.vars?.MEDIA_BUILTIN_STORAGE!=='r2')return {mode,pruned:0,storage:'assets'}
  assert.equal(selected.vars.APP_ENVIRONMENT,mode)
  const origin=selected.vars.SUPABASE_URL
  assert(/^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin))
  assert.equal(publicEnv.VITE_SUPABASE_URL,origin)
  const key=publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY
  assert(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))
  assert(Array.isArray(inventory)&&inventory.length>0&&inventory.length<=500)
  const paths=inventory.map(item=>item.path)
  assert.equal(new Set(paths).size,paths.length)
  assert(paths.every(path=>/^\/(images|videos|brand)\/[A-Za-z0-9_.-]+\.(webp|mp4|svg)$/.test(path)))
  const response=await transport(origin+'/rest/v1/rpc/builtin_media_build_state',{
    method:'POST',headers:{apikey:key,'Content-Type':'application/json','Accept-Profile':'api','Content-Profile':'api'},
    body:'{}',redirect:'error',signal:AbortSignal.timeout(10000),
  })
  assert.equal(response.status,200,'Verify default migration before removing deployed copies')
  assert(response.body)
  const reader=response.body.getReader(),parts=[];let total=0
  try{for(;;){const part=await reader.read();if(part.done)break;total+=part.value.length;assert(total<=256*1024);parts.push(part.value)}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  const state=JSON.parse(Buffer.concat(parts).toString('utf8'))
  assert(Array.isArray(state.items)&&state.items.length===paths.length)
  const verified=new Map(state.items.map(item=>[item.path,item.status]))
  assert.equal(verified.size,paths.length)
  assert(paths.every(path=>['ready','retired'].includes(verified.get(path))),
    'Every default must be verified in R2 or safely retired; never deploy broken fallbacks')
  const root=resolve(directory)
  assert((await lstat(root)).isDirectory()&&!(await lstat(root)).isSymbolicLink())
  const files=[]
  // Validate the complete set before changing any generated file.
  for(const source of paths){
    const file=resolve(root,'.'+source);assert(file.startsWith(root+sep))
    let stat;try{stat=await lstat(file)}catch(error){if(error.code==='ENOENT')continue;throw error}
    const parent=await lstat(dirname(file));assert(parent.isDirectory()&&!parent.isSymbolicLink())
    assert(stat.isFile()&&!stat.isSymbolicLink())
    files.push(file)
  }
  for(const file of files)await unlink(file)
  return {mode,pruned:files.length,storage:'r2',verified:verified.size}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [mode,...extra]=process.argv.slice(2);assert.equal(extra.length,0)
    const parsed=ts.parseConfigFileTextToJson('wrangler.jsonc',await readFile('wrangler.jsonc','utf8'));assert(!parsed.error)
    const inventory=JSON.parse(await readFile('src/content/media-default-inventory.json','utf8'))
    console.log(JSON.stringify(await pruneBuiltinAssets({directory:'dist',mode,config:parsed.config,publicEnv:loadEnv(mode,process.cwd(),'VITE_'),inventory})))
  }catch{
    console.error('No se pudo verificar la migración de las imágenes originales. No se retiraron archivos de origen ni se autorizó el despliegue.')
    process.exitCode=1
  }
}
