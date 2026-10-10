!macro customHeader
  ; Custom header - set installer branding
!macroend

; Override the legacy electron-builder per-user path reader before initialization.
; Backport upstream a356198ec7c54c7795659342bff36d9a5162cd93 (#9769).
!macro customInstallMode
  !include "safePerUserInstallMode.nsh"
!macroend

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\ReEdit.PDF" "" "Re-Edit PDF Document"
  WriteRegStr SHCTX "Software\Classes\ReEdit.PDF\DefaultIcon" "" '"$INSTDIR\resources\document.ico",0'
  WriteRegStr SHCTX "Software\Classes\ReEdit.PDF\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\ReEdit.PDF\shell\edit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\.pdf\OpenWithProgids" "ReEdit.PDF" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Re-Edit PDF"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pdf" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  ; Register capabilities so Windows lists Re-Edit PDF under Default apps.
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities" "ApplicationName" "Re-Edit PDF"
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities" "ApplicationDescription" "Open, annotate and edit PDF documents"
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities" "ApplicationIcon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities\FileAssociations" ".pdf" "ReEdit.PDF"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Re-Edit PDF" "Software\ReEditPDF\Capabilities"
  ; Notify Explorer asynchronously; Finish must not wait for a shell refresh or app startup.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x3000, p 0, p 0) v'
!macroend

!macro customUnInstall
  DeleteRegValue SHCTX "Software\Classes\.pdf\OpenWithProgids" "ReEdit.PDF"
  DeleteRegKey SHCTX "Software\Classes\ReEdit.PDF"
  DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Re-Edit PDF"
  DeleteRegKey SHCTX "Software\ReEditPDF\Capabilities"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x3000, p 0, p 0) v'
!macroend
