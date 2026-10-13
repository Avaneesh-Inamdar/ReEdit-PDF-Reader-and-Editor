import type { PrinterOption } from '../../../shared/printing'
export const PDF_DESTINATION='save-pdf'
export function connectedPrinter(printers:PrinterOption[]):string {
  const physical=printers.filter(p=>p.available!==false && !(p.isVirtual??/pdf|xps|onenote|fax/i.test(p.name)))
  return (physical.find(p=>p.isDefault)||physical[0])?.name || PDF_DESTINATION
}
