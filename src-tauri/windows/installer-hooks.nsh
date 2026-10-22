; Run before Tauri's running-app check, which may otherwise offer to kill it.
!define FOCUS_MATRIX_HOOK_DIR "${__FILEDIR__}"

!macro FOCUS_MATRIX_PREPARE _MODE
  InitPluginsDir
  File "/oname=$PLUGINSDIR\focus-matrix-prepare.ps1" "${FOCUS_MATRIX_HOOK_DIR}\..\..\scripts\prepare-installer.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\focus-matrix-prepare.ps1" -DataDirectory "$APPDATA\com.focusmatrix.desktop" -InstallDirectory "$INSTDIR" ${_MODE}'
  Pop $R0
  Pop $R1
  ; Optional local diagnostics contain only the helper's status/message.
  ReadEnvStr $R2 "FOCUS_MATRIX_INSTALL_LOG"
  ${If} $R2 != ""
    FileOpen $R3 "$R2" a
    FileWrite $R3 "prepare ${_MODE}: $R0 $R1$\r$\n"
    FileClose $R3
  ${EndIf}
  ${If} $R0 != 0
    DetailPrint "$R1"
    IfSilent +2
    MessageBox MB_OK|MB_ICONSTOP "$R1"
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend

; utils.nsh is included before this file by the pinned Tauri CLI template.
; Replace its kill-capable check as well: an app can start during the backup.
!macroundef CheckIfAppIsRunning
!macro CheckIfAppIsRunning _EXE _NAME
  !insertmacro FOCUS_MATRIX_PREPARE "-CheckOnly"
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro FOCUS_MATRIX_PREPARE ""
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro FOCUS_MATRIX_PREPARE ""
  ; Content, credentials, history and backups must survive every uninstall.
  StrCpy $DeleteAppDataCheckboxState 0
!macroend
