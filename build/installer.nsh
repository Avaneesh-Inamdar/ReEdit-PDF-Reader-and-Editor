!macro customHeader
  ; Custom header - set installer branding
!macroend

!macro customInstall
  ; Associate PDF file icon refresh after install
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  System::Call 'Shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
