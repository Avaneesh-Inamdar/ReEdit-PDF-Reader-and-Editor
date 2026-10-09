import { create } from 'zustand'

export interface FormField {
  name: string
  type: string
  value: string
  required?: boolean
  readOnly?: boolean
  options?: string[]
  multiple?: boolean
}

interface FormState {
  fields: FormField[]
  hasXfa: boolean
  hasAcroForm: boolean
  isEncrypted: boolean
  setFields: (f: FormField[]) => void
  setFlags: (flags: { hasXfa: boolean; hasAcroForm: boolean; isEncrypted: boolean }) => void
  updateField: (name: string, value: string) => void
}

export const useFormStore = create<FormState>((set, get) => ({
  fields: [],
  hasXfa: false,
  hasAcroForm: false,
  isEncrypted: false,
  setFields: (fields) => set({ fields }),
  setFlags: ({ hasXfa, hasAcroForm, isEncrypted }) => set({ hasXfa, hasAcroForm, isEncrypted }),
  updateField: (name, value) => set({ fields: get().fields.map((f) => (f.name === name ? { ...f, value } : f)) })
}))
