; Keep the PDF document icon distinct from the application icon. Do not change
; the protected Windows UserChoice setting; users choose their default app.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\ReEditPDF.Document\DefaultIcon" "" "$INSTDIR\document.ico,0"
  WriteRegStr SHCTX "Software\Classes\ReEditPDF.Document\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities" "ApplicationName" "Re-Edit PDF"
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities" "ApplicationDescription" "Read and edit PDF documents"
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities" "ApplicationIcon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\ReEditPDF\Capabilities\FileAssociations" ".pdf" "ReEditPDF.Document"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Re-Edit PDF" "Software\ReEditPDF\Capabilities"
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Re-Edit PDF"
  DeleteRegKey SHCTX "Software\ReEditPDF"
!macroend
