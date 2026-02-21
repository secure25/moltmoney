Write-Host "Fixing Prisma Client..." -ForegroundColor Cyan
Write-Host ""

Write-Host "Step 1: Stopping any running Node.js processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Step 2: Cleaning Prisma cache..." -ForegroundColor Yellow
$prismaPath = "node_modules\.prisma"
if (Test-Path $prismaPath) {
    Remove-Item -Path $prismaPath -Recurse -Force
    Write-Host "Prisma cache cleaned" -ForegroundColor Green
} else {
    Write-Host "No Prisma cache found" -ForegroundColor Gray
}

Write-Host "Step 3: Regenerating Prisma client..." -ForegroundColor Yellow
Set-Location packages\database
npx prisma generate
Set-Location ..\..

Write-Host "Step 4: Rebuilding packages..." -ForegroundColor Yellow
npm run build

Write-Host ""
Write-Host "Done! You can now restart your servers." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to continue"
