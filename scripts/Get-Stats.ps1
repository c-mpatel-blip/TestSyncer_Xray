# PowerShell Script - Get Learning Statistics
# Usage: .\Get-Stats.ps1

param(
    [string]$ServerUrl = "http://localhost:3000"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "JIRA-TestRail Integration Service" -ForegroundColor Cyan
Write-Host "Learning Statistics" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    Write-Host "Fetching statistics from $ServerUrl..." -ForegroundColor Gray
    Write-Host ""

    # Call API
    $stats = Invoke-RestMethod -Uri "$ServerUrl/api/stats" -Method Get

    Write-Host "📊 Statistics" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Total Matches: " -NoNewline -ForegroundColor White
    Write-Host $stats.total_matches -ForegroundColor Yellow
    
    Write-Host "Total Corrections: " -NoNewline -ForegroundColor White
    Write-Host $stats.total_corrections -ForegroundColor Yellow
    
    Write-Host "Correction Rate: " -NoNewline -ForegroundColor White
    Write-Host $stats.correction_rate -ForegroundColor Yellow
    
    Write-Host ""
    Write-Host "Last Match: " -NoNewline -ForegroundColor White
    Write-Host ($stats.last_match ? $stats.last_match : "None") -ForegroundColor Gray
    
    Write-Host "Last Correction: " -NoNewline -ForegroundColor White
    Write-Host ($stats.last_correction ? $stats.last_correction : "None") -ForegroundColor Gray

    Write-Host ""
    Write-Host "✅ Statistics retrieved successfully" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "❌ ERROR" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host ""
        Write-Host "Details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message -ForegroundColor Gray
    }
    
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
