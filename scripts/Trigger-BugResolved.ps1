# PowerShell Script - Trigger Bug Resolved Workflow
param(
    [Parameter(Mandatory=$true)]
    [string]$IssueKey,
    [string]$ServerUrl = "http://localhost:3000"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "JIRA-TestRail Integration Service" -ForegroundColor Cyan
Write-Host "Trigger: Bug Resolved Workflow" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Issue Key: $IssueKey" -ForegroundColor Yellow
Write-Host "Server: $ServerUrl" -ForegroundColor Yellow
Write-Host ""

try {
    $body = @{
        issueKey = $IssueKey
    } | ConvertTo-Json

    Write-Host "Sending request..." -ForegroundColor Gray

    $response = Invoke-RestMethod -Uri "$ServerUrl/api/trigger/bug-resolved" -Method Post -Body $body -ContentType "application/json"

    Write-Host ""
    Write-Host "SUCCESS" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor White
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor Gray

    if ($response.testId) {
        Write-Host ""
        Write-Host "Details:" -ForegroundColor Cyan
        Write-Host "  Test ID: $($response.testId)" -ForegroundColor White
        Write-Host "  Run ID: $($response.runId)" -ForegroundColor White
        Write-Host "  Status: Passed" -ForegroundColor Green
    }
}
catch {
    Write-Host ""
    Write-Host "ERROR" -ForegroundColor Red
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
