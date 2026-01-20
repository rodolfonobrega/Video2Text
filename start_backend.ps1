$EnvName = "youtube_extension"
$Port = 8000

Write-Host "Starting Backend..."
# Check if Conda is available
if (!(Get-Command conda -ErrorAction SilentlyContinue)) {
    Write-Error "Conda not found. Please ensure Conda is in your PATH."
    exit 1
}

# Check if ffmpeg is available
if (!(Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error "ffmpeg not found. Please ensure ffmpeg is installed and in your PATH."
    exit 1
}

# Activate Conda environment and run Uvicorn
# We use a trick to run it in the current shell or a new one. 
# Ideally, we just call the python executable directly to avoid activation issues in scripts.

$CondaPath = (conda info --base) | Out-String
$CondaPath = $CondaPath.Trim()
$PythonPath = Join-Path $CondaPath "envs\$EnvName\python.exe"

if (!(Test-Path $PythonPath)) {
    Write-Error "Python executable not found at $PythonPath. Check your environment name."
    exit 1
}

Write-Host "Using Python at: $PythonPath"

# Start Uvicorn in a new window so this script doesn't block
Start-Process -FilePath $PythonPath -ArgumentList "-m uvicorn main:app --reload --host 0.0.0.0 --port $Port" -WorkingDirectory "$PSScriptRoot\backend"

# Wait a bit and check health
Start-Sleep -Seconds 5
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$Port/docs" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "Backend is running successfully!" -ForegroundColor Green
    } else {
        Write-Warning "Backend responded with status $($response.StatusCode)"
    }
} catch {
    Write-Error "Failed to connect to backend. It might still be starting or failed to start."
}
