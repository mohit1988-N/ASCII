# PowerShell script to push project to GitHub
Write-Host "Initializing Git Repository..." -ForegroundColor Cyan
if (!(Test-Path .git)) {
    git init
}

Write-Host "Staging files..." -ForegroundColor Cyan
git add index.html style.css app.js

Write-Host "Creating initial commit..." -ForegroundColor Cyan
git commit -m "Initial commit of AsciiCat Studio"

# Check if origin remote already exists
$remoteExists = git remote | Where-Object { $_ -eq "origin" }
if ($remoteExists) {
    Write-Host "Setting remote origin URL..." -ForegroundColor Cyan
    git remote set-url origin https://github.com/mohit1988-N/ASCII.git
} else {
    Write-Host "Adding remote origin URL..." -ForegroundColor Cyan
    git remote add origin https://github.com/mohit1988-N/ASCII.git
}

Write-Host "Setting branch to main..." -ForegroundColor Cyan
git branch -M main

Write-Host "Pushing to GitHub (requires authentication)..." -ForegroundColor Cyan
git push -u origin main

Write-Host "Done!" -ForegroundColor Green
