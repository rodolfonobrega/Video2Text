$Port = 8000

Write-Host "Stopping Backend on port $Port..."

# Find process listening on the port
$Process = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($Process) {
    Stop-Process -Id $Process -Force
    Write-Host "Backend stopped (PID: $Process)." -ForegroundColor Green
} else {
    Write-Warning "No process found listening on port $Port."
}
