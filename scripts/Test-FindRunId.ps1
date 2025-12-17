# PowerShell Script - Test Run ID Discovery
# Usage: .\Test-FindRunId.ps1 -IssueKey "PROJ-123"

param(
    [Parameter(Mandatory=$true)]
    [string]$IssueKey,
    
    [string]$ServerUrl = "http://localhost:3000"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "JIRA-TestRail Integration Service" -ForegroundColor Cyan
Write-Host "Test: Find Run ID" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Issue Key: $IssueKey" -ForegroundColor Yellow
Write-Host "Server: $ServerUrl" -ForegroundColor Yellow
Write-Host ""

try {
    Write-Host "Searching for Run ID..." -ForegroundColor Gray

    # Call API
    $response = Invoke-RestMethod -Uri "$ServerUrl/api/test/find-run/$IssueKey" -Method Get

    Write-Host ""
    
    if ($response.found) {
        Write-Host "✅ Run ID Found!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Run ID: " -NoNewline -ForegroundColor White
        Write-Host $response.runId -ForegroundColor Yellow
        
        # Try to get test count
        try {
            Write-Host ""
            Write-Host "Fetching test cases from run..." -ForegroundColor Gray
            $tests = Invoke-RestMethod -Uri "$ServerUrl/api/test/run/$($response.runId)/tests" -Method Get
            
            Write-Host "Test Cases in Run: " -NoNewline -ForegroundColor White
            Write-Host $tests.count -ForegroundColor Yellow
        }
        catch {
            Write-Host "Could not fetch test cases" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "❌ Run ID Not Found" -ForegroundColor Red
        Write-Host ""
        Write-Host "Possible reasons:" -ForegroundColor Yellow
        Write-Host "  1. No parent task found" -ForegroundColor Gray
        Write-Host "  2. Run ID not in custom field" -ForegroundColor Gray
        Write-Host "  3. Run ID not in parent task comments" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Solution: Add Run ID to parent task" -ForegroundColor Cyan
        Write-Host "  Format: 'Run: 12345' or 'TestRail Run: 12345'" -ForegroundColor Gray
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
