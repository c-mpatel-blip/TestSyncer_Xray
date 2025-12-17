param(
    [Parameter(Mandatory=$true)]
    [string]$IssueKey,
    
    [Parameter(Mandatory=$true)]
    [string]$CaseId,
    
    [string]$Server = "http://localhost:3000"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "JIRA-TestRail Integration Service" -ForegroundColor Cyan
Write-Host "Trigger: Correction Workflow" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Issue Key: $IssueKey" -ForegroundColor Yellow
Write-Host "Correct Case ID: $CaseId" -ForegroundColor Yellow
Write-Host "Server: $Server" -ForegroundColor Gray
Write-Host ""
Write-Host "Sending correction..." -ForegroundColor White

$body = @{
    issueKey = $IssueKey
    correction = "CORRECT: C$CaseId"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$Server/api/trigger/correction" -Method Post -Body $body -ContentType "application/json"
    
    Write-Host ""
    Write-Host "✅ SUCCESS" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor White
    $response | ConvertTo-Json -Depth 5 | Write-Host
    Write-Host ""
    Write-Host "The AI has learned from this correction!" -ForegroundColor Green
    Write-Host "Future similar bugs will be matched to case $CaseId" -ForegroundColor Green
    
} catch {
    Write-Host ""
    Write-Host "❌ ERROR" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
