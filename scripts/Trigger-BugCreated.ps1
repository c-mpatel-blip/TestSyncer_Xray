# PowerShell Script - Trigger Bug Created Workflow
# Usage: .\Trigger-BugCreated.ps1 -IssueKey "PROJ-123"

param(
    [Parameter(Mandatory=$true)]
    [string]$IssueKey,
    
    [string]$ServerUrl = "http://localhost:3000"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "JIRA-TestRail Integration Service" -ForegroundColor Cyan
Write-Host "Trigger: Bug Created Workflow" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Issue Key: $IssueKey" -ForegroundColor Yellow
Write-Host "Server: $ServerUrl" -ForegroundColor Yellow
Write-Host ""

try {
    # Prepare request body
    $body = @{
        issueKey = $IssueKey
    } | ConvertTo-Json

    Write-Host "Sending request..." -ForegroundColor Gray

    # Call API
    $response = Invoke-RestMethod -Uri "$ServerUrl/api/trigger/bug-created" `
        -Method Post `
        -Body $body `
        -ContentType "application/json"

    Write-Host ""
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor White
    Write-Host ($response | ConvertTo-Json -Depth 10) -ForegroundColor Gray

    if ($response.match) {
        Write-Host ""
        Write-Host "Match Details:" -ForegroundColor Cyan
        Write-Host "  Test ID: $($response.match.test_id)" -ForegroundColor White
        Write-Host "  Title: $($response.match.title)" -ForegroundColor White
        Write-Host "  Confidence: $([math]::Round($response.match.confidence * 100, 1))%" -ForegroundColor White
        Write-Host "  Reasoning: $($response.match.reasoning)" -ForegroundColor White
    }
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
