$redisUrl = "https://github.com/microsoftarchive/redis/releases/download/win-3.0.504/Redis-x64-3.0.504.msi"
$redisInstaller = "Redis-x64-3.0.504.msi"

# Download Redis
Invoke-WebRequest -Uri $redisUrl -OutFile $redisInstaller

# Install Redis
Start-Process msiexec.exe -Wait -ArgumentList "/i $redisInstaller /quiet"

# Clean up
Remove-Item $redisInstaller

Write-Host "Redis installation complete!"
