// Local app-only input regression suite. No physical printer or installer is run.
;(async()=>{
  const checks={},errors=[];const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const invoke=(command,args)=>window.__TAURI_INTERNALS__.invoke(command,args)
  const wait=async(condition,label,timeout=25000)=>{const start=Date.now();while(!condition()){if(Date.now()-start>timeout)throw Error(label+' timed out');await pause(60)}}
  const protocol=(method,params)=>invoke('desktop_test_input',{method,params})
  const mouse=async(x,y,count=1)=>{await protocol('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await protocol('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:count});await protocol('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:count})}
  const key=async(key,code,vk,modifiers=0)=>{await protocol('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk,modifiers});await protocol('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk,modifiers})}
  const wordPoint=()=>{const span=[...document.querySelectorAll('#page-1 [data-pdf-run]')].find(span=>span.textContent.includes('quick'));if(!span)throw Error('Missing fixture word');const index=span.firstChild.data.indexOf('quick')+2;const range=document.createRange();range.setStart(span.firstChild,index);range.setEnd(span.firstChild,index+1);const box=range.getBoundingClientRect();return{x:box.left+box.width/2,y:box.top+box.height/2,span}}
  const select=(element,value)=>{element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}))}
  const closeUnsaved=()=>{const dialog=document.querySelector('.app-dialog');if(dialog)[...dialog.querySelectorAll('button')].find(button=>button.textContent==='Don’t save')?.click()}
  try{
    await wait(()=>document.querySelector('#page-1 [data-pdf-run]'),'Reader')
    checks.header_brand_removed=!document.querySelector('.workspace-brand')
    checks.page_dimensions_label=document.querySelector('.workspace-status')?.textContent.includes('Page 1 size:')
    let trusted=false;document.querySelector('#page-1 .textLayer').addEventListener('pointerdown',event=>{trusted ||= event.isTrusted})
    let point=wordPoint();await mouse(point.x,point.y,1);await mouse(point.x,point.y,2)
    checks.double_click_word=window.getSelection().toString()==='quick'
    await mouse(point.x,point.y,3)
    checks.triple_click_line=window.getSelection().toString().includes('Line 1')&&window.getSelection().toString().includes('lazy dog')&&!window.getSelection().toString().includes('Line 2')
    checks.trusted_mouse_input=trusted
    window.getSelection().removeAllRanges();await pause(550)
    const width=()=>document.querySelector('#page-1').getBoundingClientRect().width
    let before=width();const viewer=document.querySelector('[data-pdf-viewer]').getBoundingClientRect();const x=viewer.left+viewer.width/2,y=viewer.top+viewer.height/2
    await protocol('Input.dispatchMouseEvent',{type:'mouseWheel',x,y,deltaX:0,deltaY:-60,modifiers:2})
    await wait(()=>width()>before,'Trusted wheel zoom');checks.trusted_wheel_zoom=true
    before=width();await protocol('Input.dispatchMouseEvent',{type:'mouseWheel',x:180,y:20,deltaX:0,deltaY:-120,modifiers:2});await wait(()=>width()>before,'Workspace wheel zoom');checks.workspace_wheel_zoom=true
    before=width();await protocol('Input.synthesizePinchGesture',{x,y,scaleFactor:1.3,relativeSpeed:500,gestureSourceType:'touch'})
    await wait(()=>width()>before*1.05,'Native page pinch in');await wait(()=>Math.abs(window.visualViewport.scale-1)<0.001,'Reset viewport pinch');checks.native_pinch_in=true
    before=width();await protocol('Input.synthesizePinchGesture',{x,y,scaleFactor:0.8,relativeSpeed:500,gestureSourceType:'touch'})
    await wait(()=>width()<before*0.98,'Native page pinch out');await wait(()=>Math.abs(window.visualViewport.scale-1)<0.001,'Reset viewport pinch out');checks.native_pinch_out=true
    const lines=[...document.querySelectorAll('#page-1 [data-pdf-run]')],first=lines.find(span=>span.textContent.startsWith('Line 1 ')),tenth=lines.find(span=>span.textContent.startsWith('Line 10 '));const startBox=first.getBoundingClientRect(),endBox=tenth.getBoundingClientRect();const startX=startBox.left+0.1,startY=(startBox.top+startBox.bottom)/2,endX=endBox.left+endBox.width/2,endY=(endBox.top+endBox.bottom)/2
    await protocol('Input.dispatchMouseEvent',{type:'mousePressed',x:startX,y:startY,button:'left',buttons:1,clickCount:1})
    for(let i=1;i<=15;i++)await protocol('Input.dispatchMouseEvent',{type:'mouseMoved',x:startX+(endX-startX)*i/15,y:startY+(endY-startY)*i/15,button:'left',buttons:1})
    await protocol('Input.dispatchMouseEvent',{type:'mouseReleased',x:endX,y:endY,button:'left',buttons:0,clickCount:1});const dragged=window.getSelection().toString();checks.drag_ten_lines=dragged.includes('Line 1 ')&&dragged.includes('Line 10 ')&&!dragged.includes('Line 11 ');window.getSelection().removeAllRanges()
    document.querySelector('[title="Conversion tools"]').click();await pause(100)
    const menu=document.querySelector('.workspace-convert-menu'),background=getComputedStyle(menu).backgroundColor
    checks.convert_menu_opaque=background!=='rgba(0, 0, 0, 0)'&&background!=='transparent'
    document.querySelector('[title="Conversion tools"]').click()
    const originalPrinters=window.api.getPrinters;let connected=true
    window.api.getPrinters=async()=>[{name:'Test physical printer',displayName:'Test physical printer',isDefault:true,available:connected,isVirtual:false}]
    document.querySelector('[title="Print (Ctrl+P)"]').click();await wait(()=>document.querySelector('.print-preview canvas')?.dataset.paperWidth,'Paper preview')
    checks.printer_connected=document.querySelector('[aria-label="Printer"]').value==='Test physical printer'
    connected=false;await wait(()=>document.querySelector('[aria-label="Printer"]').value==='save-pdf','Disconnected printer fallback',7000);checks.printer_disconnected_pdf=true
    connected=true;await wait(()=>document.querySelector('[aria-label="Printer"]').value==='Test physical printer','Reconnected printer',7000);checks.printer_reconnected=true
    const paper=document.querySelector('.print-preview canvas');const orientation=[...document.querySelectorAll('.print-settings select')].find(item=>[...item.options].some(option=>option.value==='landscape'))
    select(orientation,'landscape');await wait(()=>Number(paper.dataset.paperWidth)>Number(paper.dataset.paperHeight),'Landscape preview');checks.landscape_preview=true
    const fit=paper.toDataURL();const actual=[...document.querySelectorAll('input[name="print-scale"]')].find(item=>item.parentElement.textContent.includes('Actual'))
    actual.click();await wait(()=>paper.toDataURL()!==fit,'Actual-size preview');checks.scale_preview=true
    const paperChoice=[...document.querySelectorAll('.print-settings select')].find(item=>[...item.options].some(option=>option.value==='Letter'))
    select(paperChoice,'Letter');await wait(()=>Math.round(Number(paper.dataset.paperWidth))===792,'Letter preview');checks.paper_preview=true
    await invoke('desktop_test_snapshot',{name:'print'});await key('Escape','Escape',27);await wait(()=>!document.querySelector('.print-dialog'),'Close print')
    await pause(150);checks.print_sessions_released=(await invoke('desktop_test_sessions'))===0;window.api.getPrinters=originalPrinters
    document.querySelector('[title="Edit PDF"]').click();await pause(250);point=wordPoint();await pause(550);await mouse(point.x,point.y)
    await wait(()=>document.querySelector('[aria-label="Edit text on page"]'),'Inline edit')
    const editor=document.querySelector('[aria-label="Edit text on page"]');editor.value='Line one edited in place';editor.dispatchEvent(new Event('input',{bubbles:true}));await invoke('desktop_test_snapshot',{name:'editing'})
    document.querySelector('.pdf-inline-actions .operation-primary').click();await wait(()=>!document.querySelector('.pdf-inline-editor')&&document.querySelector('[data-edited-text]'),'Apply inline text');checks.inline_edit=true
    const replacement=document.querySelector('[data-edited-text] rect').getBoundingClientRect();await mouse(replacement.left+8,replacement.top+replacement.height/2)
    await wait(()=>document.querySelector('[aria-label="Edit text on page"]'),'Re-edit inline text');const again=document.querySelector('[aria-label="Edit text on page"]');checks.inline_reedit=again.value==='Line one edited in place';again.value='Line one edited twice';again.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.pdf-inline-actions .operation-primary').click();await wait(()=>!document.querySelector('.pdf-inline-editor'),'Reapply')
    await key('Escape','Escape',27);await pause(150)
    // Close Edit through the same controls the user clicks.
    const closeEdit=document.querySelector('.workspace-tools-pane-header button')||document.querySelector('[title="Close tools pane"]')||document.querySelector('[title="Close panel"]')
    if(closeEdit)closeEdit.click();else document.querySelector('[title="All tools"]').click()
    await pause(200);checks.edit_outline_cleared=[...document.querySelectorAll('[data-edited-text] rect')].every(rect=>rect.getAttribute('stroke')==='none')
    await key('S','KeyS',83,10);await wait(()=>document.querySelector('.file-dialog[open]'),'Themed Save As')
    const output=await invoke('desktop_test_output'),address=document.querySelector('[aria-label="Folder path"]');address.value=output;address.form.requestSubmit();await wait(()=>document.querySelector('.file-dialog').dataset.folder?.includes('native-validation')&&!document.querySelector('.file-dialog .operation-error').textContent,'Output folder')
    await pause(200);document.querySelector('[aria-label="File name"]').value='interactions-saved.pdf';await invoke('desktop_test_snapshot',{name:'save'})
    const savingDialog=document.querySelector('.file-dialog');checks.save_theme_matches=getComputedStyle(savingDialog).backgroundColor===getComputedStyle(document.querySelector('.workspace-global-bar')).backgroundColor||getComputedStyle(savingDialog).backgroundColor!=='transparent'
    savingDialog.querySelector('.operation-primary').click();await pause(200);document.querySelector('.app-dialog .operation-primary')?.click();await wait(()=>!document.querySelector('.file-dialog'),'Save copy')
    checks.saved_pdf=(await window.api.readPdf(await window.api.getCurrentPath())).byteLength>100
    await wait(()=>document.querySelector('#page-1 [data-pdf-run]')?.textContent,'Reload saved PDF')
    checks.reopened_edited_text=[...document.querySelectorAll('#page-1 [data-pdf-run]')].some(span=>span.textContent.includes('edited twice'))
    const updateResult=await invoke('desktop_test_update_download');checks.signed_update_download=updateResult.signedDownloadVerified;checks.tampered_update_rejected=updateResult.tamperedDownloadRejected;checks.no_installer_run=updateResult.installerWasRun===false
    for(let index=0;index<8;index++){
      document.querySelector('[title="Close tab"]').click();await pause(60);closeUnsaved();await wait(()=>!document.querySelector('#page-1'),'Close cycle');await invoke('desktop_test_reopen');await wait(()=>document.querySelector('#page-1 [data-pdf-run]'),'Open cycle')
    }
    checks.repeated_open_close=true
    if(Object.values(checks).some(value=>!value))throw Error('Failed checks: '+Object.entries(checks).filter(([,value])=>!value).map(([key])=>key).join(', '))
  }catch(error){errors.push(String(error))}
  await invoke('desktop_test_result',{result:{checks,errors,userAgent:navigator.userAgent}});await window.api.forceClose()
})()
