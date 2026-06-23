# Kill ports used by pnpm dev: Next.js (3000), API (3001), crawl4ai (11235)
$ports = @(3000, 3001, 11235)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        if ($p -eq 0 -or $p -eq 4) { continue }
        $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Killing PID $($proc.Id) ($($proc.ProcessName)) on port $port"
            Stop-Process -Id $proc.Id -Force
        }
    }
}

Write-Host "Done."
