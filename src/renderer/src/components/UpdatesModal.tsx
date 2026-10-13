import {useEffect,useRef,useState} from 'react'
import {check,type Update} from '@tauri-apps/plugin-updater'
import {isTauri} from '@tauri-apps/api/core'
import {useUIStore} from '../stores/useUIStore'
import {useTabStore} from '../stores/useTabStore'
import {closeDocument} from '../lib/documentActions'
import {Icon} from './Icon'

export default function UpdatesModal():React.JSX.Element{
  const close=useUIStore(s=>s.setActiveModal),update=useRef<Update|null>(null),generation=useRef(0),downloadedUpdate=useRef(false)
  const [result,setResult]=useState<Awaited<ReturnType<typeof window.api.checkForUpdates>>|null>(null),[busy,setBusy]=useState(false),[installing,setInstalling]=useState(false),[message,setMessage]=useState(''),[progress,setProgress]=useState<number|null>(null),[available,setAvailable]=useState(false)
  const checking=async():Promise<void>=>{const version=++generation.current;setBusy(true);setMessage('');setAvailable(false);downloadedUpdate.current=false;try{
    await update.current?.close();update.current=null
    const info=await window.api.checkForUpdates();if(version!==generation.current)return;setResult(info)
    if(info.available&&isTauri()){try{const found=await check({timeout:20000});if(version!==generation.current){await found?.close();return}update.current=found;setAvailable(!!found);if(!found)setMessage('The release is available, but no compatible automatic update was found.')}catch{if(version===generation.current)setMessage('The GitHub release does not yet provide a compatible signed update. You can open its download page below.')}}
  }catch(error){if(version===generation.current)setMessage(`Unable to check for updates: ${String(error)}`)}finally{if(version===generation.current)setBusy(false)}}
  useEffect(()=>{void checking();return()=>{generation.current++;void update.current?.close();update.current=null}},[])
  const install=async():Promise<void>=>{const candidate=update.current;if(!candidate)return;setInstalling(true);setProgress(0);setMessage('Downloading update…');let downloaded=0,total=0;try{
    if(!downloadedUpdate.current){await candidate.download(event=>{if(event.event==='Started')total=event.data.contentLength||0;else if(event.event==='Progress'){downloaded+=event.data.chunkLength;setProgress(total?Math.min(100,downloaded/total*100):null)}else setMessage('Download verified. Preparing to install…')});downloadedUpdate.current=true}
    for(const tab of [...useTabStore.getState().tabs])if(!(await closeDocument(tab.id))){setMessage('Installation cancelled. Your downloaded update is ready when you are.');return}
    setMessage('Installing update…');await candidate.install();await window.api.restartApp?.()
  }catch(error){setMessage(`Update failed: ${String(error)}`)}finally{setInstalling(false)}}
  return <div className="modal-overlay"><section className="print-dialog update-dialog" role="dialog" aria-modal="true" aria-label="App updates">
    <header className="operation-dialog-header"><div><h2>App updates</h2><p>Re-Edit PDF</p></div><button className="tb-btn" title="Close updates" disabled={installing} onClick={()=>close('none')}><Icon name="close"/></button></header>
    <div className="update-content"><h3>{busy?'Checking GitHub Releases…':!result?'Update check unavailable':result.available?'A new version is available':'You’re up to date'}</h3><p>{message||result?.message}</p>{result&&<p className="operation-caption">Installed: {result.current}{result.latest&&` · Latest release: ${result.latest}`}</p>}
    {update.current?.body&&<pre className="update-notes">{update.current.body}</pre>}
    {installing&&<progress aria-label="Update download" max={100} value={progress??undefined}/>}
    </div><footer className="operation-dialog-footer"><button className="operation-secondary" disabled={busy||installing} onClick={()=>void checking()}>Check again</button><button className="operation-secondary" disabled={installing} onClick={()=>void window.api.openReleases()}>Release notes</button>{available&&<button className="operation-primary" disabled={installing||busy} onClick={()=>void install()}>Download and install</button>}</footer>
  </section></div>
}
