export function appChoice(title:string,message:string,choices:{value:string;label:string;primary?:boolean}[],cancelValue='cancel'):Promise<string>{
  return new Promise(resolve=>{
    const focus=document.activeElement as HTMLElement|null,dialog=document.createElement('dialog'),heading=document.createElement('h2'),body=document.createElement('p'),actions=document.createElement('div')
    dialog.className='app-dialog';heading.textContent=title;body.textContent=message;actions.className='operation-dialog-footer'
    const finish=(value:string):void=>{dialog.close();dialog.remove();focus?.focus();resolve(value)}
    for(const choice of choices){const button=document.createElement('button');button.textContent=choice.label;button.className=choice.primary?'operation-primary':'operation-secondary';button.onclick=()=>finish(choice.value);actions.append(button)}
    dialog.oncancel=event=>{event.preventDefault();finish(cancelValue)};dialog.append(heading,body,actions);document.body.append(dialog);dialog.showModal()
  })
}
export const appConfirm=(message:string):Promise<boolean>=>appChoice('Confirm',message,[{value:'cancel',label:'Cancel'},{value:'yes',label:'Continue',primary:true}]).then(value=>value==='yes')
export function appNotice(message:string):void{void appChoice('Re-Edit PDF',message,[{value:'ok',label:'OK',primary:true}],'ok')}
