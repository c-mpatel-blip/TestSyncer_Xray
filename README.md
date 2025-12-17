# JIRA-TestRail Integration Service

AI-powered automation service that intelligently links JIRA accessibility bugs to TestRail test cases, with automatic learning from corrections.

## 🎯 Key Features

- **AI-Powered Matching**: Uses OpenAI GPT-4o to match bugs to test cases with 95%+ confidence
- **Smart Caching**: Caches test cases for 24 hours - reduces API calls and speeds up matching from ~2 minutes to 2 seconds
- **Duplicate Detection**: Prevents redundant updates - checks if bug is already linked or test already has correct status
- **Auto Run Discovery**: Automatically finds TestRail Run ID from parent tasks via custom fields or comments
- **Learning System**: Improves accuracy over time from user corrections
- **Dual Workflows**: Handles bug creation (Failed) and resolution (Passed)
- **Multiple Triggers**: Webhooks, PowerShell scripts, or REST API
- **Rate Limiting**: Configurable delays to prevent TestRail 429 errors
- **508c Optimized**: Built for accessibility testing workflows

## 📋 Prerequisites

- Node.js 16+ and npm
- JIRA account with API access
- TestRail account with API access
- OpenAI API key (GPT-4o access)

## 🚀 Quick Start

### 1. Install Dependencies

```powershell
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```powershell
Copy-Item .env.example .env
```

Edit `.env` with your settings:

```env
# JIRA Configuration
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your_jira_api_token

# TestRail Configuration
TESTRAIL_BASE_URL=https://your-company.testrail.io
TESTRAIL_USERNAME=your_username
TESTRAIL_PASSWORD=your_api_key
TESTRAIL_RATE_LIMIT_MS=250

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### 3. Get API Credentials

**JIRA API Token:**
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Copy the token to `.env`

**TestRail API Key:**
1. Go to TestRail → My Settings → API Keys
2. Generate new API key
3. Copy to `.env`

**OpenAI API Key:**
1. Go to https://platform.openai.com/api-keys
2. Create new secret key
3. Copy to `.env`

### 4. Start the Service

**Development mode (with auto-reload):**
```powershell
npm run dev
```

**Production mode:**
```powershell
npm start
```

The service will start on `http://localhost:3000`

## 📖 Usage

### Method 1: PowerShell Scripts (Recommended for Testing)

**Trigger Bug Created Workflow:**
```powershell
.\scripts\Trigger-BugCreated.ps1 -IssueKey "PROJ-123"
```

**Trigger Bug Resolved Workflow:**
```powershell
.\scripts\Trigger-BugResolved.ps1 -IssueKey "PROJ-123"
```

**Submit a Correction:**
```powershell
.\scripts\Trigger-Correction.ps1 -IssueKey "PROJ-123" -CaseId "1234567"
```

**Get Learning Statistics:**
```powershell
.\scripts\Get-Stats.ps1
```

**Test Run ID Discovery:**
```powershell
.\scripts\Test-FindRunId.ps1 -IssueKey "PROJ-123"
```

**View Cache Statistics:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cache/stats"
```

**Clear Cache:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cache/clear" -Method Post
```

### Method 2: REST API

**Bug Created:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/trigger/bug-created" `
    -Method Post `
    -Body '{"issueKey": "PROJ-123"}' `
    -ContentType "application/json"
```

**Bug Resolved:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/trigger/bug-resolved" `
    -Method Post `
    -Body '{"issueKey": "PROJ-123"}' `
    -ContentType "application/json"
```

### Method 3: JIRA Webhooks (Automatic)

**Setup Instructions:**

1. **Configure ngrok for local testing:**
   ```powershell
   # Download and authenticate ngrok (free account: https://ngrok.com)
   .\ngrok.exe config add-authtoken YOUR_TOKEN
   
   # Start ngrok tunnel
   .\ngrok.exe http 3000
   ```
   Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.dev`)

2. **Create JIRA Webhook:**
   - Go to JIRA Settings → System → WebHooks
   - Click "Create a WebHook"
   - **Name**: `TestRail Integration`
   - **Status**: Enabled
   - **URL**: `https://YOUR-NGROK-URL.ngrok-free.dev/webhook/jira`
   - **Events**: Issue → updated
   - **JQL** (optional): `project = YOUR_PROJECT`

3. **Test the webhook:**
   - Change a bug status to "Ready for Dev" (triggers Bug Created)
   - Change a bug status to "Queued merge to Release" (triggers Bug Resolved)
   - Check logs for webhook activity

See [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md) for production deployment options.

## 🔄 Workflows

### Workflow 1: Bug Created → TestRail Failed

**Trigger:** Bug status changes to "Ready for Dev"

**Process:**
1. Detects bug status change to "Ready for Dev"
2. Finds parent task/story via "Bonfire Testing" link or Parent field
3. Discovers Run ID from custom field (ADF format) or parent comments
4. **Checks cache** - if test cases cached (24hr TTL), loads instantly
5. **If not cached** - fetches all test cases from the run (with 250ms rate limiting)
6. **Caches test cases** for future use
7. **Duplicate check** - verifies bug is not already linked to any test
8. Uses AI to match bug to most relevant test case
9. Marks test as Failed in TestRail with bug ID in defects field
10. Adds comment to JIRA with match details

**Example JIRA Comment:**
```
✅ TestRail Updated

Test Case: A - There is no meaningful page title in plain language
Status: Failed
Run: 59535
Test ID: 31834450
AI Confidence: 95.0%
Reasoning: The bug report indicates that the page title is not meaningful, which directly 
aligns with the test case that checks for the presence of a meaningful page title in plain 
language. This test case would have caught the issue described in the bug report.
```

**Duplicate Prevention:**
If the bug is already linked to a test case, you'll see:
```
⚠️ Test case already has this bug linked in defects field
Test ID: 31834450
Skipping update to avoid duplicates
```

### Workflow 2: Bug Resolved → TestRail Passed

**Trigger:** Bug status changes to "Queued merge to Release"

**Process:**
1. Detects bug status change to "Queued merge to Release"
2. Finds previously linked test case from JIRA comments
3. **Duplicate check** - verifies test is not already marked as Passed
4. Marks test as Passed in TestRail with empty defects field
5. Adds confirmation comment to JIRA

**Duplicate Prevention:**
If test is already Passed, you'll see:
```
✅ TestRail Updated (Skipped)
Test is already marked as Passed
Test ID: 31834450
No update needed
```

## 🧠 Learning System

### How It Works

1. **Initial Match**: AI matches bug to test case with confidence score
2. **User Correction**: If match is wrong, user provides correction
3. **Cleanup**: System removes bug from incorrect test case
4. **Re-link**: Links bug to correct test case
5. **Learning**: Stores correction for future use
6. **Improvement**: Similar bugs use learned patterns with higher confidence

### Making Corrections

If AI match is incorrect, you have two options:

**Option 1: JIRA Comment (via webhook)**
Add a comment to the JIRA issue:
```
CORRECT: C1234567
```
Where `1234567` is the TestRail **Case ID** (not Test ID)

**Option 2: PowerShell Script**
```powershell
.\scripts\Trigger-Correction.ps1 -IssueKey "ROLL-1396" -CaseId "1099797"
```

**What happens:**
1. ✅ Finds previously linked (incorrect) test
2. ✅ Marks incorrect test as Passed and clears defects field
3. ✅ Marks correct test as Failed and adds bug to defects field
4. ✅ Stores correction for AI learning
5. ✅ Posts confirmation comment with details

**Example JIRA Response:**
```
✅ Correction Applied

Thank you! The AI has learned from this correction.
Correct Test: A - There is no meaningful page title in plain language
Case ID: C1099797
Test ID: 31834450
✓ TestRail updated with correct test
✓ Cleared bug link from previous test (ID: 31834451)

This pattern will be used for future similar bugs.
```

## 🎓 Run ID Discovery

The service automatically finds TestRail Run IDs using two methods (in priority order):

### Option A: Custom Field (Recommended)

1. Create a custom field in JIRA for the Run ID
2. Add field ID to `.env`: `JIRA_TESTRAIL_RUN_FIELD=customfield_23973`
3. Set Run ID value in parent Story/Task (supports ADF format: `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"59535"}]}]}`)
4. All linked bugs inherit the Run ID automatically

### Option B: Parent Task Comments

Add a comment to the parent Story/Task with one of these formats:
- `Run: 47681`
- `TestRail Run: 47681`
- `Run ID: 47681`

**Parent Task Detection:**
The service finds parent tasks via:
- JIRA "Parent" field (for subtasks)
- Issue links with types: "Bonfire Testing", "blocks", "is blocked by", "testing"
- Link direction: Inward links with "discovered while testing"

**Benefits:**
- ✅ Add Run ID once to parent task
- ✅ All linked bugs automatically discover it
- ✅ No need to specify Run ID per bug
- ✅ Supports ADF (Atlassian Document Format) custom fields

## 🧪 Testing & Validation

### Dry Run Mode

Test workflows without updating TestRail:

```env
DRY_RUN_MODE=true
```

Logs will show what WOULD happen without making actual changes.

### Test Endpoints

**Check health:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health"
```

**Get statistics:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/stats"
```

**Get cache statistics:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cache/stats"
```

**Clear cache:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cache/clear" -Method Post
```

**Test Run ID discovery:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/test/find-run/PROJ-123"
```

## 📊 Monitoring

### Logs

Logs are stored in the `logs/` directory:
- `combined.log` - All log entries
- `error.log` - Errors only

### Statistics

**View learning progress:**
```powershell
.\scripts\Get-Stats.ps1
```

Returns:
- Total matches performed
- Total user corrections
- Correction rate
- Last match/correction timestamps

**View cache statistics:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/cache/stats" | ConvertTo-Json
```

Returns:
- Total cached runs
- Cache keys and expiration times
- Data size per cache
- Cache hit/miss metrics

### Cache Management

**Cache Features:**
- ✅ 24-hour TTL (configurable)
- ✅ Persists to disk (`cache/` directory)
- ✅ Survives server restarts
- ✅ Automatic cleanup of expired caches
- ✅ Per-run caching (each Run ID cached separately)

**Cache Benefits:**
- 🚀 ~2 minutes → 2 seconds matching speed
- 💾 Reduces TestRail API calls by 98%+
- 🛡️ Prevents rate limiting (429 errors)
- ⚡ Instant responses for subsequent bugs in same run

## ⚙️ Configuration

### Status Mappings

Adjust JIRA status names in `.env` to match your workflow:

```env
STATUS_READY_FOR_DEV=Ready for Dev
STATUS_QUEUED_MERGED=Queued merge to Release
```

**Note:** Status names must match **exactly** as they appear in JIRA (case-sensitive).

### TestRail Status IDs

Check your TestRail instance for correct status IDs:

```env
TESTRAIL_STATUS_PASSED=1
TESTRAIL_STATUS_FAILED=5
```

### TestRail Rate Limiting

Adjust delay between API calls to prevent 429 errors:

```env
TESTRAIL_RATE_LIMIT_MS=250
```

**Recommended values:**
- Small runs (<50 tests): 100ms
- Medium runs (50-100 tests): 250ms (default)
- Large runs (100+ tests): 500ms

### Cache TTL

Adjust cache expiration time (in minutes):

```env
CACHE_TTL_MINUTES=1440  # 24 hours
```

### AI Confidence Threshold

Adjust minimum confidence for auto-approval:

```env
AI_CONFIDENCE_THRESHOLD=0.7
```

Matches below threshold will prompt for user verification.

## 🔒 Security

### API Credentials

- Never commit `.env` file
- Use strong API tokens
- Rotate credentials regularly

### Webhook Security (Optional)

Add webhook secret for authentication:

```env
WEBHOOK_SECRET=your_random_secret_here
```

JIRA webhooks must include header:
```
X-Webhook-Secret: your_random_secret_here
```

## 🚢 Deployment Options

### Local Development with ngrok (Recommended for Testing)

**Free tier benefits:**
- ✅ No session timeouts (can run 24/7)
- ✅ 1 free static domain (URL stays the same)
- ✅ 20,000 requests/month
- ✅ Perfect for testing webhooks

**Setup:**
```powershell
# 1. Sign up at https://ngrok.com (free)
# 2. Get your authtoken from dashboard
# 3. Configure ngrok
.\ngrok.exe config add-authtoken YOUR_TOKEN

# 4. Start ngrok tunnel
.\ngrok.exe http 3000

# 5. Copy the HTTPS URL (e.g., https://abc123.ngrok-free.dev)
# 6. Use URL in JIRA webhook: https://abc123.ngrok-free.dev/webhook/jira
```

**Optional: Run as Windows Service**
```powershell
# Create ngrok config file: ngrok.yml
# Then install as service
.\ngrok.exe service install --config ngrok.yml
.\ngrok.exe service start
```

### Azure App Service

1. Create Azure Web App (Node.js)
2. Configure environment variables
3. Deploy code via Git or Azure DevOps
4. Set JIRA webhook to Azure URL

### Docker

```dockerfile
FROM node:16
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

## 🐛 Troubleshooting

### "Run ID not found"

**Solutions:**
1. Check parent task has Run ID in custom field or comments
2. Verify custom field ID is correct: `JIRA_TESTRAIL_RUN_FIELD=customfield_23973`
3. Check parent task link type (should be "Bonfire Testing", "blocks", etc.)
4. Use test script: `.\scripts\Test-FindRunId.ps1 -IssueKey "PROJ-123"`
5. Check if custom field contains ADF format - service handles this automatically

### "No test cases found in run"

**Solutions:**
1. Verify Run ID is correct
2. Check TestRail credentials
3. Ensure run has test cases assigned
4. Clear cache and retry: `Invoke-RestMethod -Uri "http://localhost:3000/api/cache/clear" -Method Post`

### TestRail 429 Rate Limiting

**Symptoms:**
- Errors after ~60-65 test case fetches
- "Request failed with status code 429"

**Solutions:**
1. Increase rate limit in `.env`: `TESTRAIL_RATE_LIMIT_MS=250` (or 500)
2. Clear cache and retry (caching prevents rate limits)
3. Wait a few minutes and retry

### Duplicate updates / Bug already linked

**This is expected behavior!** The service prevents:
- ❌ Marking test as Failed if bug already in defects field
- ❌ Marking test as Passed if already Passed
- ❌ Creating multiple identical test results

**You'll see warnings like:**
```
⚠️ Test case already has this bug linked
⚠️ Test is already marked as Passed
```

This is **not an error** - it's duplicate prevention working correctly!

### Cache not working

**Solutions:**
1. Check `cache/` directory exists and is writable
2. Check server logs for cache errors
3. View cache stats: `Invoke-RestMethod -Uri "http://localhost:3000/api/cache/stats"`
4. Manual cache clear: `Invoke-RestMethod -Uri "http://localhost:3000/api/cache/clear" -Method Post`

### Slow matching (>30 seconds)

**Causes:**
- Cache not loaded (first run for a Run ID)
- TestRail rate limiting active
- Large test run (100+ cases)

**Solutions:**
1. Wait for first run to complete - subsequent runs will be cached and instant
2. Check cache stats to verify caching is working
3. Increase rate limit delay if getting 429 errors

### Webhook not triggering

**Solutions:**
1. Check JIRA webhook configuration matches exact status names
2. Verify ngrok URL is accessible and tunnel is running
3. Check server logs: `Get-Content logs\combined.log -Tail 50`
4. Test webhook manually with PowerShell scripts first
5. Verify status names in `.env` match JIRA exactly (case-sensitive)

Example: If JIRA status is "Queued merge to Release", config must be:
```env
STATUS_QUEUED_MERGED=Queued merge to Release
```
NOT: `Queued Merged to Release`

## 📚 Additional Documentation

- [COMMAND_REFERENCE.md](COMMAND_REFERENCE.md) - Complete command reference
- [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md) - Detailed webhook setup guide

## 🤝 Support

For issues or questions:
1. Check logs in `logs/` directory
2. Test with dry-run mode enabled
3. Use test scripts to validate configuration

## 📄 License

MIT License - See LICENSE file for details
