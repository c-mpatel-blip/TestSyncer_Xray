# Test Scenario: Multiple Bugs Linked to Same Test Case

## Scenario Overview

This demonstrates the new validation that prevents marking a test as Passed when multiple bugs are linked to it.

## Setup

**Test Case:** Test #31834450 - "A - There is no meaningful page title in plain language"

**Multiple Bugs:**
1. ROLL-1396: "508C | Page Titled | Page title is not meaningful"
2. ROLL-1398: "Page title missing company name"
3. ROLL-1399: "Page title not descriptive enough"

All three bugs are linked to the same test case because they all relate to the page title issue.

## Test Flow

### Step 1: Create First Bug (ROLL-1396)
1. Status: Ready for Dev
2. **Expected:** Service marks test as Failed, adds ROLL-1396 to defects field
3. **Defects field:** `ROLL-1396`

### Step 2: Create Second Bug (ROLL-1398)
1. Status: Ready for Dev
2. **Expected:** Service marks test as Failed again, adds ROLL-1398 to defects field
3. **Defects field:** `ROLL-1396, ROLL-1398`

### Step 3: Create Third Bug (ROLL-1399)
1. Status: Ready for Dev
2. **Expected:** Service marks test as Failed again, adds ROLL-1399 to defects field
3. **Defects field:** `ROLL-1396, ROLL-1398, ROLL-1399`

### Step 4: Resolve First Bug (ROLL-1396)
1. Status: Queued merge to Release
2. **New Validation Kicks In:**
   - Service fetches ALL test results for test #31834450
   - Parses defects field from each result:
     - Result 1 (latest): `ROLL-1396, ROLL-1398, ROLL-1399`
     - Result 2 (previous): `ROLL-1396, ROLL-1398`
     - Result 3 (older): `ROLL-1396`
   - Collects unique bugs: `ROLL-1396, ROLL-1398, ROLL-1399`
   - Excludes current bug: `ROLL-1398, ROLL-1399`
   - Checks status of ROLL-1398 → "Ready for Dev" (still open!)
   - Checks status of ROLL-1399 → "Ready for Dev" (still open!)
3. **Expected:** Service BLOCKS the Passed status
4. **JIRA Comment:**
   ```
   ⚠️ Cannot Mark Test as Passed

   This test case has other bugs that are still open:
   - ROLL-1398: Ready for Dev - Page title missing company name
   - ROLL-1399: Ready for Dev - Page title not descriptive enough

   All linked bugs must be resolved before marking test as Passed.
   (Checked 2 bug(s) across all test results)
   ```

### Step 5: Resolve Second Bug (ROLL-1398)
1. Status: Queued merge to Release
2. **Validation:**
   - Checks ROLL-1399 → "Ready for Dev" (still open!)
3. **Expected:** Still BLOCKED
4. **JIRA Comment:** Similar warning about ROLL-1399

### Step 6: Resolve Third Bug (ROLL-1399)
1. Status: Queued merge to Release
2. **Validation:**
   - Checks all other bugs
   - ROLL-1396 → "Queued merge to Release" ✓
   - ROLL-1398 → "Queued merge to Release" ✓
   - All bugs resolved!
3. **Expected:** Service marks test as Passed
4. **Defects field:** Cleared (empty)
5. **JIRA Comment:**
   ```
   ✅ TestRail Updated
   Status: Passed (Bug Fixed)
   Test ID: 31834450
   All linked bugs have been resolved.
   ```

## Why This Matters

**Real-World Example:**
- Test Case: "Verify login page accessibility"
- **January**: Bug 1 found: "Login button has no aria-label" → Test marked Failed
- **February**: Bug 2 found: "Password field missing required indicator" → Test marked Failed again
- **March**: Bug 3 found: "Error messages not announced to screen readers" → Test marked Failed again

All three bugs are tracked in the test results history. When Bug 1 is fixed:
- ❌ **Without this feature**: Test marked as Passed (incorrect! Bugs 2 & 3 still broken)
- ✅ **With this feature**: Service checks ALL results, finds Bugs 2 & 3 still open, blocks Passed status

**Key Benefit:** The service maintains awareness of ALL bugs ever linked to a test case, not just the current state. This ensures:
- Complete historical bug tracking
- No bugs slip through the cracks
- Test only passes when genuinely all issues are resolved

## How It Works: Checking All Test Results

**Scenario:**
Test #31834450 has 5 test results over time:

| Result | Date | Status | Defects Field |
|--------|------|--------|---------------|
| Result 5 (latest) | June 2024 | Failed | ROLL-1396, ROLL-1398 |
| Result 4 | May 2024 | Failed | ROLL-1396, ROLL-1398, ROLL-1399 |
| Result 3 | April 2024 | Failed | ROLL-1396, ROLL-1398 |
| Result 2 | March 2024 | Failed | ROLL-1396 |
| Result 1 (oldest) | Feb 2024 | Passed | (empty) |

**When ROLL-1396 is resolved:**
1. Service fetches all 5 results
2. Parses defects from each: `{ROLL-1396, ROLL-1398, ROLL-1399}`
3. Removes current bug: `{ROLL-1398, ROLL-1399}`
4. Checks both bugs' status in JIRA
5. If any are Open/Reopened/Ready for Dev → Blocks Passed

**Advantage:** Even if ROLL-1399 was removed from the latest result (Result 5), it's still caught because it exists in Result 4!

## Open Bug Statuses

The service checks for these "open" statuses:
- `Open`
- `Reopened`
- `Ready for Dev`

Any other status (In Progress, QA In Progress, Queued merge to Release, Done, Closed) is considered "resolved" or "in progress towards resolution".

## Configuration

Add to `.env` if your JIRA uses different status names:

```env
STATUS_OPEN=Open
STATUS_READY_FOR_DEV=Ready for Dev
```

## Testing This Feature

**Manual Test:**
```powershell
# Create test with multiple bugs linked (do this in TestRail UI)
# Then try to resolve one bug via webhook or script:

.\scripts\Trigger-BugResolved.ps1 -IssueKey "ROLL-1396"

# Expected: Error response with list of other open bugs
```

**Expected Response:**
```json
{
    "success": false,
    "error": "Test has other open bugs",
    "testId": "31834450",
    "openBugs": [
        {
            "key": "ROLL-1398",
            "status": "Ready for Dev",
            "summary": "Page title missing company name"
        },
        {
            "key": "ROLL-1399",
            "status": "Ready for Dev",
            "summary": "Page title not descriptive enough"
        }
    ]
}
```

## Edge Cases Handled

1. **Can't fetch bug status:** Treats as "open" (safe approach)
2. **Empty defects field:** Allows Passed
3. **Only current bug in defects:** Allows Passed
4. **Unknown status:** Treats as "open" (safe approach)
5. **JIRA API error:** Blocks Passed (safe approach)

## Benefits

✅ Prevents premature test passing
✅ Ensures test quality
✅ Forces complete resolution of all related bugs
✅ Provides clear feedback on what's blocking
✅ Maintains data integrity in TestRail
