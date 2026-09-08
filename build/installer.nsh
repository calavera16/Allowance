!macro customUnInstall
  ${ifNot} ${isUpdated}
    ; Run before the executable is removed. This only removes an owned hook.
    ExecWait '"$INSTDIR\Allowance.exe" --remove-claude-hook' $0
    ${if} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "Allowance could not remove its Claude hook. Your settings were left intact. See the hook removal instructions in the README." /SD IDOK
    ${endif}
  ${endif}
!macroend
