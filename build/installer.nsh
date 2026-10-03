!include "LogicLib.nsh"
!include "nsProcess.nsh"

; Updates can be launched by older game versions that only wait a fixed
; amount of time before starting the silent installer. Instead of aborting
; when Infinity Castle Elements is still shutting down, wait for the old
; process to leave. This keeps 0.0.2 -> newer upgrades from looping.
!macro customCheckAppRunning
  StrCpy $R8 0
  ${Do}
    nsProcess::_FindProcess "${APP_EXECUTABLE_FILENAME}"
    Pop $R9
    ${If} $R9 != 0
      ${ExitDo}
    ${EndIf}

    Sleep 500
    IntOp $R8 $R8 + 1

    ; 60 seconds is far longer than a normal Electron shutdown.
    ; If it is still alive, the user explicitly requested an update,
    ; so close the stale process and let the installer replace it.
    ${If} $R8 >= 120
      nsProcess::_KillProcess "${APP_EXECUTABLE_FILENAME}"
      Pop $R9
      Sleep 800
      ${ExitDo}
    ${EndIf}
  ${Loop}
!macroend
