# Runs `cargo bench` pinned to logical CPU 0 at high priority (docs/BENCHMARKS.md, "Method").
# On a hybrid CPU an unpinned run can land on an efficiency core and read several times slower.
#   powershell -File scripts/bench.ps1 > bench.md
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$env:CARGO_INCREMENTAL = '0'
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH" }
# Through cmd: PowerShell 5.1 turns a native tool's stderr into errors.
$line = cmd /c 'cargo bench --locked --no-run 2>&1' | Select-String 'benches[\\/]solvers\.rs \((.+)\)'
if (-not $line) { throw 'bench executable not found in cargo output' }
$exe = (Resolve-Path $line.Matches[0].Groups[1].Value).Path
$out = New-TemporaryFile
$p = Start-Process -FilePath $exe -ArgumentList '--bench' -WorkingDirectory 'crates\core' `
  -RedirectStandardOutput $out -NoNewWindow -PassThru
$p.ProcessorAffinity = 1
$p.PriorityClass = 'High'
$p.WaitForExit()
Get-Content $out -Encoding utf8
Remove-Item $out
if ($p.ExitCode -ne 0) { exit $p.ExitCode }
