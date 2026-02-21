@echo off
echo Fixing Prisma Client...
echo.

echo Step 1: Stopping any running processes...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo Step 2: Cleaning Prisma cache...
if exist "node_modules\.prisma" (
    rmdir /s /q "node_modules\.prisma"
    echo Prisma cache cleaned
) else (
    echo No Prisma cache found
)

echo Step 3: Regenerating Prisma client...
cd packages\database
call npx prisma generate
cd ..\..

echo Step 4: Rebuilding packages...
call npm run build

echo.
echo Done! You can now restart your servers.
echo.
pause
