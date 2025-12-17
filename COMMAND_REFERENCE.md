# Command Reference

Complete reference for all commands, scripts, and API endpoints in the JIRA-TestRail Integration Service.

## Table of Contents

- [PowerShell Scripts](#powershell-scripts)
- [REST API Endpoints](#rest-api-endpoints)
- [Webhook Events](#webhook-events)
- [JIRA Comment Commands](#jira-comment-commands)

---

## PowerShell Scripts

All scripts are located in the `scripts/` directory.

### Trigger-BugCreated.ps1

Manually trigger the Bug Created workflow.

**Usage:**
```powershell
.\scripts\Trigger-BugCreated.ps1 -IssueKey "PROJ-123" [-ServerUrl "http://localhost:3000"]
```

**Parameters:**
- `IssueKey` (required): JIRA issue key (e.g., "PROJ-123")
- `ServerUrl` (optional): Service URL (default: http://localhost:3000)

**What it does:**
1. Finds Run ID from parent task
2. Matches bug to test case using AI
3. Marks test as Failed in TestRail
4. Adds comment to JIRA with match details

**Example:**
```powershell
.\scripts\Trigger-BugCreated.ps1 -IssueKey "ACC-456"
```

**Output:**
```
========================================
JIRA-TestRail Integration Service
Trigger: Bug Created Workflow
========================================

Issue Key: ACC-456
Server: http://localhost:3000

Sending request...

✅ SUCCESS

Match Details:
  Test ID: 12345
  Title: Verify keyboard navigation in search form
  Confidence: 92.5%
  Reasoning: Bug describes keyboard navigation issue matching test case
```

---

### Trigger-BugResolved.ps1

Manually trigger the Bug Resolved workflow.

**Usage:**
```powershell
.\scripts\Trigger-BugResolved.ps1 -IssueKey "PROJ-123" [-ServerUrl "http://localhost:3000"]
```

**Parameters:**
- `IssueKey` (required): JIRA issue key
- `ServerUrl` (optional): Service URL

**What it does:**
1. Finds previously linked test case
2. Marks test as Passed in TestRail
3. Adds confirmation comment to JIRA

**Example:**
```powershell
.\scripts\Trigger-BugResolved.ps1 -IssueKey "ACC-456"
```

---

### Get-Stats.ps1

Retrieve learning system statistics.

**Usage:**
```powershell
.\scripts\Get-Stats.ps1 [-ServerUrl "http://localhost:3000"]
```

**Parameters:**
- `ServerUrl` (optional): Service URL

**What it shows:**
- Total AI matches performed
- Total user corrections
- Correction rate percentage
- Last match timestamp
- Last correction timestamp

**Example:**
```powershell
.\scripts\Get-Stats.ps1
```

**Output:**
```
📊 Statistics

Total Matches: 47
Total Corrections: 8
Correction Rate: 17.02%

Last Match: 2024-12-17T10:30:45.123Z
Last Correction: 2024-12-17T09:15:22.456Z
```

---

### Test-FindRunId.ps1

Test Run ID discovery for an issue.

**Usage:**
```powershell
.\scripts\Test-FindRunId.ps1 -IssueKey "PROJ-123" [-ServerUrl "http://localhost:3000"]
```

**Parameters:**
- `IssueKey` (required): JIRA issue key
- `ServerUrl` (optional): Service URL

**What it does:**
- Searches for parent task
- Checks custom field and comments for Run ID
- Shows test case count if Run ID found

**Example:**
```powershell
.\scripts\Test-FindRunId.ps1 -IssueKey "ACC-456"
```

**Output (Success):**
```
✅ Run ID Found!

Run ID: 47681
Test Cases in Run: 125
```

**Output (Not Found):**
```
❌ Run ID Not Found

Possible reasons:
  1. No parent task found
  2. Run ID not in custom field
  3. Run ID not in parent task comments

Solution: Add Run ID to parent task
  Format: 'Run: 12345' or 'TestRail Run: 12345'
```

---

## REST API Endpoints

All endpoints use JSON request/response format.

### Health Check

**Endpoint:** `GET /health`

**Description:** Check service status

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

**Response:**
```json
{
  "status": "ok",
  "service": "JIRA-TestRail Integration",
  "dryRunMode": false
}
```

---

### Get Statistics

**Endpoint:** `GET /api/stats`

**Description:** Get learning system statistics

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/stats"
```

**Response:**
```json
{
  "total_matches": 47,
  "total_corrections": 8,
  "correction_rate": "17.02%",
  "last_match": "2024-12-17T10:30:45.123Z",
  "last_correction": "2024-12-17T09:15:22.456Z"
}
```

---

### Trigger Bug Created

**Endpoint:** `POST /api/trigger/bug-created`

**Description:** Manually trigger Bug Created workflow

**Request Body:**
```json
{
  "issueKey": "PROJ-123"
}
```

**Request:**
```powershell
$body = @{ issueKey = "PROJ-123" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/trigger/bug-created" `
    -Method Post -Body $body -ContentType "application/json"
```

**Response (Success):**
```json
{
  "success": true,
  "runId": "47681",
  "match": {
    "test_id": "12345",
    "case_id": "678",
    "title": "Verify keyboard navigation",
    "confidence": 0.925,
    "reasoning": "Bug describes keyboard navigation issue...",
    "learned": false
  },
  "testResult": {
    "id": "98765",
    "status_id": 5,
    "comment": "Bug filed: PROJ-123 - ..."
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Could not find TestRail Run ID"
}
```

---

### Trigger Bug Resolved

**Endpoint:** `POST /api/trigger/bug-resolved`

**Description:** Manually trigger Bug Resolved workflow

**Request Body:**
```json
{
  "issueKey": "PROJ-123"
}
```

**Request:**
```powershell
$body = @{ issueKey = "PROJ-123" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/trigger/bug-resolved" `
    -Method Post -Body $body -ContentType "application/json"
```

**Response:**
```json
{
  "success": true,
  "runId": "47681",
  "testId": "12345",
  "testResult": {
    "id": "98766",
    "status_id": 1,
    "comment": "Bug resolved: PROJ-123 - ..."
  }
}
```

---

### Process Correction

**Endpoint:** `POST /api/trigger/correction`

**Description:** Manually process a user correction

**Request Body:**
```json
{
  "issueKey": "PROJ-123",
  "comment": "CORRECT: 12346 - Correct test case title"
}
```

**Request:**
```powershell
$body = @{
    issueKey = "PROJ-123"
    comment = "CORRECT: 12346 - Correct test case title"
} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/trigger/correction" `
    -Method Post -Body $body -ContentType "application/json"
```

**Response:**
```json
{
  "success": true,
  "correctTestId": "12346",
  "correctTitle": "Correct test case title"
}
```

---

### Test: Find Run ID

**Endpoint:** `GET /api/test/find-run/:issueKey`

**Description:** Test Run ID discovery for an issue

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/test/find-run/PROJ-123"
```

**Response:**
```json
{
  "issueKey": "PROJ-123",
  "runId": "47681",
  "found": true
}
```

---

### Test: Get Test Cases

**Endpoint:** `GET /api/test/run/:runId/tests`

**Description:** Get test cases from a run (preview first 10)

**Request:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/test/run/47681/tests"
```

**Response:**
```json
{
  "runId": "47681",
  "count": 125,
  "tests": [
    {
      "id": "12345",
      "case_id": "678",
      "title": "Verify keyboard navigation"
    }
  ]
}
```

---

## Webhook Events

### JIRA Webhook Configuration

**Webhook URL:** `http://your-server:3000/webhook/jira`

**Events to Subscribe:**
- Issue: Updated
- Comment: Created

**Optional Header:**
```
X-Webhook-Secret: your_webhook_secret
```

### Supported Webhook Events

#### Issue Updated - Status Change

**Event:** `jira:issue_updated`

**Triggers when:**
- Bug status changes to "Ready for Dev" → Bug Created workflow
- Bug status changes to "Queued Merged to Release" → Bug Resolved workflow

**Webhook Payload (example):**
```json
{
  "webhookEvent": "jira:issue_updated",
  "issue": {
    "key": "PROJ-123",
    "fields": {
      "summary": "Bug title",
      "status": { "name": "Ready for Dev" }
    }
  },
  "changelog": {
    "items": [
      {
        "field": "status",
        "fromString": "To Do",
        "toString": "Ready for Dev"
      }
    ]
  }
}
```

#### Comment Created

**Event:** `comment_created`

**Triggers when:**
- Comment contains "CORRECT:" → Process correction

**Webhook Payload (example):**
```json
{
  "webhookEvent": "comment_created",
  "issue": {
    "key": "PROJ-123"
  },
  "comment": {
    "body": {
      "content": [
        {
          "content": [
            {
              "type": "text",
              "text": "CORRECT: 12346 - Correct test title"
            }
          ]
        }
      ]
    }
  }
}
```

---

## JIRA Comment Commands

Commands that users can add as JIRA comments to trigger actions.

### Correction Command

**Format:**
```
CORRECT: <test_id> - <test_case_title>
```

**Description:** Correct an AI match and teach the system

**Examples:**
```
CORRECT: 12346 - Verify screen reader announces form errors
```

```
CORRECT: 54321 - Test keyboard trap in modal dialog
```

**What happens:**
1. System validates test ID exists in the run
2. Updates TestRail with correct test
3. Stores correction in learning data
4. Adds acknowledgment comment to JIRA
5. Future similar bugs use this pattern

**Response Comment:**
```
✅ Correction Applied

Thank you! The AI has learned from this correction.
Correct Test: Verify screen reader announces form errors
Test ID: 12346

This pattern will be used for future similar bugs.
```

---

## Environment Variables Reference

Complete list of configuration options in `.env`:

```env
# JIRA
JIRA_BASE_URL=https://company.atlassian.net
JIRA_EMAIL=user@company.com
JIRA_API_TOKEN=your_token
JIRA_RUN_ID_CUSTOM_FIELD=customfield_12345
JIRA_STATUS_READY_FOR_DEV=Ready for Dev
JIRA_STATUS_QUEUED_MERGED=Queued Merged to Release

# TestRail
TESTRAIL_BASE_URL=https://company.testrail.io
TESTRAIL_USERNAME=username
TESTRAIL_PASSWORD=api_key
TESTRAIL_STATUS_PASSED=1
TESTRAIL_STATUS_FAILED=5

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
AI_CONFIDENCE_THRESHOLD=0.7

# Server
PORT=3000
DRY_RUN_MODE=false
WEBHOOK_SECRET=optional_secret
```

---

## Error Codes

Common error messages and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Could not find TestRail Run ID" | No Run ID in parent task | Add Run ID to parent comments or custom field |
| "No test cases found in Run" | Invalid Run ID or empty run | Verify Run ID is correct |
| "Could not find linked test case" | Bug not processed through Bug Created | Run Bug Created workflow first |
| "Invalid correction format" | Wrong CORRECT: syntax | Use format: `CORRECT: <id> - <title>` |
| "Test ID not found in run" | Test doesn't exist in run | Verify test ID is correct |
| "Unauthorized" | Invalid webhook secret | Check WEBHOOK_SECRET matches |

---

## Workflow Diagrams

### Bug Created Workflow

```
1. Bug status → "Ready for Dev"
2. ↓
3. Find parent task
4. ↓
5. Discover Run ID (custom field or comments)
6. ↓
7. Fetch test cases from TestRail
8. ↓
9. AI matches bug to test case
10. ↓
11. Mark test as Failed in TestRail
12. ↓
13. Add comment to JIRA with match details
```

### Bug Resolved Workflow

```
1. Bug status → "Queued Merged to Release"
2. ↓
3. Find linked test ID from previous workflow
4. ↓
5. Mark test as Passed in TestRail
6. ↓
7. Add confirmation comment to JIRA
```

### Correction Workflow

```
1. User adds comment: "CORRECT: <id> - <title>"
2. ↓
3. Validate test ID exists
4. ↓
5. Update TestRail with correct test
6. ↓
7. Store correction in learning data
8. ↓
9. Add acknowledgment comment
10. ↓
11. Future similar bugs use this pattern
```

---

## Tips & Best Practices

### For Best AI Matching

1. **Write detailed bug summaries** - Include keywords like "keyboard", "screen reader", "focus"
2. **Reference specific UI elements** - "Search button", "Login form", etc.
3. **Describe the expected behavior** - Helps match to test expectations
4. **Use consistent terminology** - Match language used in test cases

### For Run ID Management

1. **Use custom field** - More reliable than comments
2. **Add Run ID early** - Before bugs are created
3. **One Run ID per parent** - All child bugs inherit it
4. **Use comments as fallback** - If custom field not available

### For Learning System

1. **Correct mistakes promptly** - Improves future matches
2. **Use full test titles** - Helps keyword matching
3. **Review low-confidence matches** - Below 70% threshold
4. **Check statistics regularly** - Monitor improvement

---

## Quick Reference Card

**Start Server:**
```powershell
npm run dev
```

**Trigger Workflows:**
```powershell
.\scripts\Trigger-BugCreated.ps1 -IssueKey "PROJ-123"
.\scripts\Trigger-BugResolved.ps1 -IssueKey "PROJ-123"
```

**Test Setup:**
```powershell
.\scripts\Test-FindRunId.ps1 -IssueKey "PROJ-123"
.\scripts\Get-Stats.ps1
```

**Check Health:**
```powershell
Invoke-RestMethod http://localhost:3000/health
```

**Make Correction (in JIRA):**
```
CORRECT: 12346 - Correct test case title
```
