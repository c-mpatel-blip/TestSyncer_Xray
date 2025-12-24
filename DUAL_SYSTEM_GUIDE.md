# Dual Test Management System Support

TestSyncer now supports both **TestRail** and **Xray** (Jira's native test management) as test management systems. You can choose which system to use via configuration.

## Quick Start

### 1. Choose Your Test Management System

Set the `TEST_MANAGEMENT_SYSTEM` environment variable:

```bash
# For TestRail
TEST_MANAGEMENT_SYSTEM=testrail

# For Xray  
TEST_MANAGEMENT_SYSTEM=xray
```

### 2. Configure Your Chosen System

#### For TestRail

```bash
TESTRAIL_BASE_URL=https://your-company.testrail.io
TESTRAIL_USERNAME=your-email@company.com
TESTRAIL_API_KEY=your_api_key
TESTRAIL_RATE_LIMIT_MS=250
```

#### For Xray

Xray uses your Jira credentials (it's a Jira plugin):

```bash
XRAY_BASE_URL=https://your-company.atlassian.net
XRAY_EMAIL=your-email@company.com
XRAY_API_TOKEN=your_jira_api_token
XRAY_RATE_LIMIT_MS=250
```

Or simply use your existing Jira credentials:
```bash
# Xray will use these by default
JIRA_BASE_URL=...
JIRA_EMAIL=...
JIRA_API_TOKEN=...
```

## Key Differences

### TestRail
- **Runs**: Identified by numeric Run ID (e.g., `R123`)
- **Tests**: Identified by numeric Test ID (e.g., `31834485`)
- **Bug Linking**: Uses a text "defects" field (comma-separated bug IDs)
- **Separate System**: Requires separate credentials and API access

### Xray
- **Test Executions**: Identified by Jira issue key (e.g., `TEXEC-123`)
- **Tests**: Identified by Jira issue key (e.g., `TEST-456`)
- **Bug Linking**: Uses Jira's native issue linking
- **Integrated**: Part of Jira, uses same credentials

## How It Works

The tool uses an **adapter pattern** that automatically routes to the correct service based on your configuration:

```javascript
// services/testManagementAdapter.js
// Automatically uses TestRail or Xray based on TEST_MANAGEMENT_SYSTEM
const testMgmt = require('./testManagementAdapter');

// Works with both systems
await testMgmt.getTestsWithDetails(runOrExecutionKey);
await testMgmt.markAsFailed(testKey, runKey, comment, defects);
```

## Workflow Behavior

Both systems follow the same workflow logic:

### 1. Bug Created Workflow
**Trigger**: Bug moves to "Ready for Dev"

**Actions**:
- Find Run/Execution from parent task
- Get test cases
- AI matches bug to test case(s)
- Mark test(s) as Failed
- Link bug to test
- Add comment to Jira

### 2. Bug Resolved Workflow
**Trigger**: Bug moves to "Queued Merged to Release"

**Actions**:
- Find linked test cases
- Check for other active bugs
- Mark as Passed (if no other bugs) or keep Failed
- Add comment to Jira

### 3. Bug Re-opened Workflow
**Trigger**: Bug moves back to "Ready for Dev"

**Actions**:
- Find previously linked tests
- Re-mark as Failed
- Re-link bug
- Add comment to Jira

## Setup Instructions

### For TestRail Users

1. Set environment variables:
   ```bash
   TEST_MANAGEMENT_SYSTEM=testrail
   TESTRAIL_BASE_URL=...
   TESTRAIL_USERNAME=...
   TESTRAIL_API_KEY=...
   ```

2. Configure Run ID in Jira:
   - Add Run ID to parent task comment: `Run: R123`
   - Or use custom field: `JIRA_TESTRAIL_RUN_FIELD=customfield_xxxxx`

3. Workflow continues as before

### For Xray Users

1. Install Xray plugin in Jira (if not already installed)

2. Set environment variable:
   ```bash
   TEST_MANAGEMENT_SYSTEM=xray
   ```

3. Configure Test Execution linking:
   - **Option A**: Link Test Execution to parent task as related issue
   - **Option B**: Add Test Execution as subtask
   - **Option C**: Set custom field with Test Execution key

4. Create Test Executions in Xray:
   ```
   Test Execution (TEXEC-123)
   ├── TEST-456: Test case 1
   ├── TEST-457: Test case 2
   └── TEST-458: Test case 3
   ```

5. When bugs are created, they'll be linked to tests via Jira issue links

## API Differences Handled by Adapter

| Operation | TestRail | Xray |
|-----------|----------|------|
| Get Run/Execution | `GET /get_run/{id}` | `GET /rest/api/3/issue/{key}` |
| Get Tests | `GET /get_tests/{runId}` | `GET /rest/raven/1.0/api/testexec/{key}/test` |
| Add Result | `POST /add_result/{testId}` | `POST /rest/raven/1.0/import/execution` |
| Link Bug | Update defects field | `POST /rest/api/3/issueLink` |

## Benefits of Each System

### TestRail Benefits
- Dedicated test management features
- Advanced reporting and analytics
- Test case reusability across projects
- Mature API and integrations
- Independent of Jira

### Xray Benefits  
- Native Jira integration
- Single tool for QA team
- No separate login/credentials
- Jira's powerful JQL queries
- Direct issue linking (no text parsing)
- Familiar Jira interface
- Better traceability

## Migration

### From TestRail to Xray

1. Export test cases from TestRail
2. Import into Xray (manually or via script)
3. Create Test Executions in Xray
4. Update environment variable: `TEST_MANAGEMENT_SYSTEM=xray`
5. Update parent tasks to link Test Executions
6. Restart service

### From Xray to TestRail

1. Create Runs in TestRail
2. Import test cases
3. Update environment variable: `TEST_MANAGEMENT_SYSTEM=testrail`
4. Update parent tasks with Run IDs
5. Restart service

## Troubleshooting

### TestRail Issues
- **429 Rate Limit**: Increase `TESTRAIL_RATE_LIMIT_MS`
- **Run Not Found**: Check `JIRA_TESTRAIL_RUN_FIELD` or parent task comments
- **Authentication Failed**: Verify `TESTRAIL_USERNAME` and `TESTRAIL_API_KEY`

### Xray Issues
- **Execution Not Found**: Check issue links, subtasks, or custom field
- **Permission Denied**: Ensure Jira user has Xray permissions
- **Rate Limit**: Increase `XRAY_RATE_LIMIT_MS` or reduce concurrent requests
- **Test Not Found**: Verify test is added to Test Execution

### General Issues
- **Wrong System**: Check `TEST_MANAGEMENT_SYSTEM` environment variable
- **Service Not Starting**: Check all required env vars for your chosen system
- **Tests Not Updating**: Enable `DRY_RUN_MODE=true` and check logs

## Example Configurations

### TestRail Only
```bash
TEST_MANAGEMENT_SYSTEM=testrail
TESTRAIL_BASE_URL=https://company.testrail.io
TESTRAIL_USERNAME=qa@company.com
TESTRAIL_API_KEY=abc123xyz
```

### Xray Only
```bash
TEST_MANAGEMENT_SYSTEM=xray
# Uses Jira credentials automatically
JIRA_BASE_URL=https://company.atlassian.net
JIRA_EMAIL=qa@company.com
JIRA_API_TOKEN=abc123xyz
```

### Switching Between Systems
Simply change the environment variable and restart:
```bash
# Switch to Xray
export TEST_MANAGEMENT_SYSTEM=xray
npm restart

# Switch back to TestRail
export TEST_MANAGEMENT_SYSTEM=testrail
npm restart
```

## Support

For questions or issues:
1. Check logs for detailed error messages
2. Verify environment variables are set correctly
3. Test API connectivity manually
4. Enable DRY_RUN_MODE for safe testing
5. Check the XRAY_MIGRATION.md document for technical details

## Architecture

```
┌─────────────────┐
│  workflowService│
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│testManagementAdapter│  ◄─── Configured via TEST_MANAGEMENT_SYSTEM
└────────┬────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌──────┐   ┌──────┐
│TestRail   │ Xray │
│Service│   │Service│
└──────┘   └──────┘
```

The adapter provides a unified interface, routing calls to the appropriate service based on configuration. This allows the workflow logic to remain unchanged regardless of which test management system is in use.
