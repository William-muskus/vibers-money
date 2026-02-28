@echo off
REM Wrapper to run vibe with stdin from NUL (avoids blocking on sys.stdin.read)
set "VIBE=%1"
shift
"%VIBE%" %* < NUL
