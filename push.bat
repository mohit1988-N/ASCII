@echo off
echo Initializing Git Repository...
if not exist .git (
    git init
)
echo Staging files...
git add index.html style.css app.js
echo Creating initial commit...
git commit -m "Initial commit of AsciiCat Studio"
echo Checking remote...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/mohit1988-N/ASCII.git
git branch -M main
echo Pushing to GitHub...
git push -u origin main
echo Done!
pause
