import { useState } from 'react'
import { prepareDocument } from '../lib/documentActions'
import { useUIStore } from '../stores/useUIStore'

export default function CertificateModal(): React.JSX.Element {
  const close=useUIStore(s=>s.setActiveModal)
  const [password,setPassword]=useState(''),[name,setName]=useState(''),[reason,setReason]=useState('Approved'),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
  const sign=async ():Promise<void> => {
    setBusy(true);setMessage('')
    try {const path=await window.api.signCertificate(await prepareDocument(true),password,name,reason);if(path) setMessage('Signed copy saved: '+path)}
    catch(error) {setMessage(String(error))} finally {setPassword('');setBusy(false)}
  }
  return <div className="modal-overlay"><form className="modal-card p-6" style={{width:440}} onSubmit={e=>{e.preventDefault();void sign()}}>
    <h2 className="text-sm font-bold">Sign with a certificate</h2>
    <p className="text-xs mt-3">Choose your P12/PFX certificate after clicking Sign. This saves a separate signed copy. Later edits invalidate its signature. Certificate trust depends on the recipient’s trust store; timestamping and additional signatures are not supported.</p>
    <label className="block text-xs mt-3">Signer name<input className="block w-full mt-1 p-2" value={name} onChange={e=>setName(e.target.value)} required /></label>
    <label className="block text-xs mt-3">Reason<input className="block w-full mt-1 p-2" value={reason} onChange={e=>setReason(e.target.value)} /></label>
    <label className="block text-xs mt-3">Certificate password<input className="block w-full mt-1 p-2" type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} /></label>
    {message && <p className="text-xs mt-3" role="status">{message}</p>}
    <div className="flex gap-4 mt-4"><button type="submit" disabled={busy}>{busy?'Signing…':'Sign and save copy'}</button><button type="button" disabled={busy} onClick={()=>close('none')}>Close</button></div>
  </form></div>
}
