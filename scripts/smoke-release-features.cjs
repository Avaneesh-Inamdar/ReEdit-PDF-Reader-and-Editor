const {app,BrowserWindow,dialog}=require('electron')
const {readFileSync,writeFileSync,existsSync,mkdirSync,unlinkSync}=require('node:fs')
const {resolve,join}=require('node:path')
const assert=require('node:assert/strict')
const forge=require('node-forge')
const {unzipSync}=require('fflate')
const {extractSignature}=require('@signpdf/utils')
const directory=resolve(process.env.READIT_FEATURE_OUTPUT || 'release/release-features')
mkdirSync(directory,{recursive:true});app.setPath('userData',join(directory,'profile'))
let window,picked=[],destination=null
const errors=[]
dialog.showOpenDialog=async()=>({canceled:!picked.length,filePaths:picked})
dialog.showSaveDialog=async()=>({canceled:!destination,filePath:destination})
dialog.showMessageBox=async()=>({response:1})
dialog.showErrorBox=(title,message)=>errors.push(title+': '+message)
process.on('unhandledRejection',(reason)=>{try{writeFileSync(join(directory,'result.json'),JSON.stringify({passed:false,error:String(reason && reason.stack ? reason.stack : reason)},null,2))}catch{};app.exit(1)})
app.on('browser-window-created',(_,candidate)=>{if(!window)window=candidate})
require(process.env.READIT_FEATURE_APP ? resolve(process.env.READIT_FEATURE_APP,'out/main/index.js') : '../out/main/index.js')
async function wait(expression,timeout=45000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await window.webContents.executeJavaScript(expression))return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('Timed out: '+expression)}
async function waitFile(path){const deadline=Date.now()+45000;while(Date.now()<deadline){if(existsSync(path))return;await new Promise(resolve=>setTimeout(resolve,100))}throw new Error('File not saved: '+path)}
app.whenReady().then(async()=>{
 let certificatePath
 try {
  await wait('!!window.api && document.body.innerText.includes("Home")')
  await window.webContents.executeJavaScript('void(window.alert=message=>{throw new Error(message)})')
  window.webContents.send('menu:action','updates');await wait('document.body.innerText.includes("Check for Updates")');await wait('!document.body.innerText.includes("Checking GitHub Releases")',25000)
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.modal-card button')).find(button=>button.textContent==='Close').click()`)
  const data=readFileSync(resolve('test-fixtures/simple-text.pdf'));const path=join(directory,'original.pdf');writeFileSync(path,data)
  window.webContents.send('file:opened',{filePath:path,data:data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)})
  await wait('!!document.querySelector("#page-1 [data-pdf-run]")')
  destination=join(directory,'export.docx');window.webContents.send('menu:action','exportWord');await waitFile(destination)
  const xml=new TextDecoder().decode(unzipSync(readFileSync(destination))['word/document.xml']);assert.ok(xml.includes('Simple Text PDF'))
  const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();cert.publicKey=keys.publicKey;cert.serialNumber='01';cert.validity.notBefore=new Date();cert.validity.notAfter=new Date(Date.now()+86400000);const attrs=[{name:'commonName',value:'Automated test certificate'}];cert.setSubject(attrs);cert.setIssuer(attrs);cert.sign(keys.privateKey,forge.md.sha256.create())
  certificatePath=join(directory,'temporary-test-certificate.p12');writeFileSync(certificatePath,Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'test-password',{algorithm:'3des'})).getBytes(),'binary'))
  picked=[certificatePath];destination=join(directory,'signed.pdf');window.webContents.send('menu:action','certificate');await wait('document.body.innerText.includes("Sign with a certificate")')
  await window.webContents.executeJavaScript(`(()=>{const inputs=document.querySelectorAll('.modal-card input');for(const [input,value] of [[inputs[0],'Test'],[inputs[2],'test-password']]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}})()`)
  await new Promise(resolve=>setTimeout(resolve,100));await window.webContents.executeJavaScript('document.querySelector("form.modal-card").requestSubmit()');await waitFile(destination);assert.ok(extractSignature(readFileSync(destination)).signature.length>0)
  await wait('document.body.innerText.includes("Signed copy saved:")');assert.equal(await window.webContents.executeJavaScript('document.querySelector("input[type=password]").value'),'')
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.modal-card button')).find(button=>button.textContent==='Close').click()`)
  await window.webContents.executeJavaScript('document.querySelector("[title=Redact]").click()');await wait('document.body.innerText.includes("Mark area for redaction")');await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Mark area for redaction')).click()`)
  const box=await window.webContents.executeJavaScript(`(()=>{const r=document.querySelector('#page-1 [data-pdf-run]').getBoundingClientRect();return {x:Math.round(r.left-2),y:Math.round(r.top-2),right:Math.round(r.right+2),bottom:Math.round(r.bottom+2)}})()`)
  window.focus();window.webContents.sendInputEvent({type:'mouseDown',x:box.x,y:box.y,button:'left',clickCount:1});await new Promise(resolve=>setTimeout(resolve,100));window.webContents.sendInputEvent({type:'mouseMove',x:box.right,y:box.bottom,button:'left'});await new Promise(resolve=>setTimeout(resolve,100));window.webContents.sendInputEvent({type:'mouseUp',x:box.right,y:box.bottom,button:'left',clickCount:1})
  await wait('!!document.querySelector("#page-1 [data-anno-id]")');destination=join(directory,'redacted.pdf');window.webContents.send('menu:action','saveAs');await waitFile(destination)
  const m=await import('mupdf');const redacted=new m.PDFDocument(readFileSync(destination));const p=redacted.loadPage(0),s=p.toStructuredText('');assert.ok(!s.asText().includes('Simple Text PDF'));s.destroy();p.destroy();redacted.destroy();assert.deepEqual(errors,[])
  writeFileSync(join(directory,'result.json'),JSON.stringify({passed:true,checks:['update dialog','editable Word export through UI','P12 certificate signing through UI','password cleared','draw and save genuine redaction']},null,2));if(certificatePath && existsSync(certificatePath))unlinkSync(certificatePath);console.log('Release feature checks passed');app.exit(0)
 } catch(error){console.error(error);try{writeFileSync(join(directory,'failure.png'),(await window.webContents.capturePage()).toPNG())}catch{};console.log(await window.webContents.executeJavaScript('JSON.stringify({title:document.body.innerText.slice(-1800),svgs:Array.from(document.querySelectorAll("#page-1 svg")).map(s=>({rect:s.getBoundingClientRect().toJSON(),pointer:s.style.pointerEvents}))})'));writeFileSync(join(directory,'result.json'),JSON.stringify({passed:false,error:String(error)},null,2));app.exit(1)}
 finally{if(certificatePath && existsSync(certificatePath))unlinkSync(certificatePath)}
})
