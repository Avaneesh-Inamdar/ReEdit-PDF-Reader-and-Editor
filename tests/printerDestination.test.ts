import {describe,it,expect} from 'vitest'
import {connectedPrinter,PDF_DESTINATION} from '../src/renderer/src/lib/printerDestination'
describe('printer connectivity',()=>{
  it('uses PDF when only offline or virtual printers exist, then switches to a connected printer',()=>{
    const virtual={name:'Microsoft Print to PDF',displayName:'PDF',isDefault:true,isVirtual:true,available:true}
    const hardware={name:'Office printer',displayName:'Office printer',isDefault:false,available:false}
    expect(connectedPrinter([virtual,hardware])).toBe(PDF_DESTINATION)
    expect(connectedPrinter([virtual,{...hardware,available:true}])).toBe(hardware.name)
    expect(connectedPrinter([virtual,hardware])).toBe(PDF_DESTINATION)
  })
  it('prefers the connected system default and tolerates an empty printer list',()=>{
    expect(connectedPrinter([])).toBe(PDF_DESTINATION)
    expect(connectedPrinter([{name:'A',displayName:'A',isDefault:false},{name:'B',displayName:'B',isDefault:true,available:true}])).toBe('B')
  })
})
