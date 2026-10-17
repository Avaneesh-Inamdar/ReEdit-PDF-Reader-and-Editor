import { PermissionFlag } from 'pdfjs-dist'
export function securityPermissions(
  flags: number[] | null | undefined
): { label: string; value: string }[] {
  const allowed = (flag: number): boolean => flags === null || !!flags?.includes(flag)
  const status = (flag: number): string =>
    flags === undefined ? 'Not assessed' : allowed(flag) ? 'Allowed' : 'Not allowed'
  return [
    {
      label: 'Printing',
      value:
        flags === undefined
          ? 'Not assessed'
          : allowed(PermissionFlag.PRINT_HIGH_QUALITY)
            ? 'High resolution'
            : allowed(PermissionFlag.PRINT)
              ? 'Low resolution only'
              : 'Not allowed'
    },
    { label: 'Changing the document', value: status(PermissionFlag.MODIFY_CONTENTS) },
    { label: 'Copying text and images', value: status(PermissionFlag.COPY) },
    { label: 'Accessibility extraction', value: status(PermissionFlag.COPY_FOR_ACCESSIBILITY) },
    { label: 'Comments and annotations', value: status(PermissionFlag.MODIFY_ANNOTATIONS) },
    { label: 'Filling form fields', value: status(PermissionFlag.FILL_INTERACTIVE_FORMS) },
    { label: 'Assembling pages', value: status(PermissionFlag.ASSEMBLE) }
  ]
}
