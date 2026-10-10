Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*moltmoney*' -and ($_.CommandLine -like '*tsx*' -or $_.CommandLine -like '*next*') } |
  ForEach-Object { Write-Output ("Stopping " + $_.ProcessId + " " + $_.CommandLine.Substring(0,[Math]::Min(80,$_.CommandLine.Length))); Stop-Process -Id $_.ProcessId -Force }
