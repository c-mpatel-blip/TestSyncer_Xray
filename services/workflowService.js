const jiraService = require('./jiraService');
const testRailService = require('./testRailService');
const aiService = require('./aiService');
const learningService = require('./learningService');
const logger = require('../logger');
const config = require('../config');

/**
 * Workflow Service - Orchestrates the main workflows
 */
class WorkflowService {
  /**
   * Handle Bug Re-opened workflow
   * Triggered when bug moves back to "Ready for Dev" from "Queued merge to Release"
   * Re-fails all test cases previously linked to this bug
   * @param {string} issueKey - JIRA issue key
   * @param {string} fromStatus - Previous status
   * @returns {Promise<Object>} Workflow result
   */
  async handleBugReopened(issueKey, fromStatus) {
    try {
      logger.info(`Starting Bug Re-opened workflow for ${issueKey} (from ${fromStatus})`);

      // Get test cases linked to this bug from learning data
      const linkedTests = await learningService.getTestCasesByBugKey(issueKey);
      
      if (linkedTests.length === 0) {
        logger.warn(`No previously linked test cases found for ${issueKey}, falling back to AI matching`);
        
        // Fallback: Use AI matching with smart section filtering
        logger.info(`Attempting AI match for re-opened bug ${issueKey}`);
        
        // Get bug details
        const bug = await jiraService.getIssue(issueKey);
        const bugData = {
          key: issueKey,
          summary: bug.fields.summary,
          description: jiraService.extractTextFromDescription(bug.fields.description)
        };

        // Find Run ID
        const runId = await jiraService.findRunId(issueKey);
        if (!runId) {
          const errorMsg = 'Could not find TestRail Run ID. Please add Run ID to parent task comments or custom field.';
          await jiraService.addComment(issueKey, `❌ ${errorMsg}`);
          return { success: false, error: errorMsg };
        }

        // Get test cases and match
        const testCases = await testRailService.getTestsWithDetails(runId);
        if (testCases.length === 0) {
          const errorMsg = `No test cases found in Run ${runId}`;
          await jiraService.addComment(issueKey, `❌ ${errorMsg}`);
          return { success: false, error: errorMsg };
        }

        // Use smart section-based matching
        const matchResult = await this.findMatchesWithSectionFiltering(bugData, testCases, runId);
        if (!matchResult || matchResult.matches.length === 0) {
          await jiraService.addComment(issueKey, `❌ Could not find matching test case for re-opened bug`);
          return { success: false, error: 'No matches found' };
        }

        // Re-fail the matched test cases
        let updatedCount = 0;
        let skippedCount = 0;
        const updatedTests = [];
        const skippedTests = [];
        
        for (const match of matchResult.matches) {
          try {
            // Check latest result and if bug is still linked
            const testResults = await testRailService.getResults(match.test_id);
            
            if (testResults && testResults.length > 0) {
              const latestResult = testResults[0]; // Results ordered by newest first
              
              // Check if latest result is Failed
              if (latestResult.status_id === 5) { // 5 = Failed
                // Check if this bug is still linked in any result
                const bugStillLinked = testResults.some(result => {
                  if (result.defects) {
                    const bugs = result.defects.split(',').map(d => d.trim());
                    return bugs.includes(issueKey);
                  }
                  return false;
                });
                
                if (bugStillLinked) {
                  logger.info(`Test ${match.test_id} is already Failed with bug ${issueKey}, skipping`);
                  skippedCount++;
                  skippedTests.push(match);
                  continue;
                }
              }
            }
            
            // Test is Passed or bug is not linked - re-fail it
            logger.info(`Re-failing matched test ${match.test_id}: ${match.title}`);
            
            await testRailService.addResult(
              match.test_id,
              5, // Status: Failed
              `Bug ${issueKey} re-opened and moved back to Ready for Dev`,
              issueKey
            );
            
            updatedCount++;
            updatedTests.push(match);
          } catch (error) {
            logger.error(`Failed to update test ${match.test_id}: ${error.message}`);
          }
        }

        // Add comment to JIRA
        let statusMessage = `🔄 Bug Re-opened - Test Cases Updated (AI Matched)\n\n`;
        
        if (updatedCount > 0) {
          const testList = updatedTests.map(m => `• ${m.title} (Test ID: ${m.test_id}, Confidence: ${(m.confidence * 100).toFixed(1)}%)`).join('\n');
          statusMessage += `${updatedCount} test case(s) marked as Failed:\n${testList}\n\n`;
        }
        
        if (skippedCount > 0) {
          const skippedList = skippedTests.map(m => `• ${m.title} (Test ID: ${m.test_id})`).join('\n');
          statusMessage += `${skippedCount} test case(s) already Failed with this bug:\n${skippedList}\n\n`;
        }
        
        statusMessage += matchResult.autoMatched ? '🎯 Auto-matched based on section' : '🤖 AI matched';
        
        await jiraService.addComment(issueKey, statusMessage);

        logger.info(`Bug Re-opened workflow completed for ${issueKey} - ${updatedCount} test(s) updated via AI matching, ${skippedCount} skipped`);
        return { success: true, testsUpdated: updatedCount, testsSkipped: skippedCount, aiMatched: true };
      }

      logger.info(`Found ${linkedTests.length} previously linked test case(s) for ${issueKey}`);

      // Re-fail each test case (only if needed)
      let updatedCount = 0;
      let skippedCount = 0;
      const updatedTests = [];
      const skippedTests = [];
      
      for (const test of linkedTests) {
        try {
          // Check latest result and if bug is still linked
          const testResults = await testRailService.getResults(test.test_id);
          
          if (testResults && testResults.length > 0) {
            const latestResult = testResults[0]; // Results ordered by newest first
            
            // Check if latest result is Failed
            if (latestResult.status_id === 5) { // 5 = Failed
              // Check if this bug is still linked in any result
              const bugStillLinked = testResults.some(result => {
                if (result.defects) {
                  const bugs = result.defects.split(',').map(d => d.trim());
                  return bugs.includes(issueKey);
                }
                return false;
              });
              
              if (bugStillLinked) {
                logger.info(`Test ${test.test_id} is already Failed with bug ${issueKey}, skipping`);
                skippedCount++;
                skippedTests.push(test);
                continue;
              }
            }
          }
          
          // Test is Passed or bug is not linked - re-fail it
          logger.info(`Re-failing test ${test.test_id}: ${test.title}`);
          
          await testRailService.addResult(
            test.test_id,
            5, // Status: Failed
            `Bug ${issueKey} re-opened and moved back to Ready for Dev`,
            issueKey
          );
          
          updatedCount++;
          updatedTests.push(test);
        } catch (error) {
          logger.error(`Failed to update test ${test.test_id}: ${error.message}`);
        }
      }

      // Add comment to JIRA
      let statusMessage = `🔄 Bug Re-opened - Test Cases Updated\n\n`;
      
      if (updatedCount > 0) {
        const testList = updatedTests.map(t => `• ${t.title} (Test ID: ${t.test_id})`).join('\n');
        statusMessage += `${updatedCount} test case(s) marked as Failed:\n${testList}\n\n`;
      }
      
      if (skippedCount > 0) {
        const skippedList = skippedTests.map(t => `• ${t.title} (Test ID: ${t.test_id})`).join('\n');
        statusMessage += `${skippedCount} test case(s) already Failed with this bug:\n${skippedList}`;
      }
      
      await jiraService.addComment(issueKey, statusMessage);

      logger.info(`Bug Re-opened workflow completed for ${issueKey} - ${updatedCount} test(s) updated, ${skippedCount} skipped`);
      return { success: true, testsUpdated: updatedCount, testsSkipped: skippedCount };
    } catch (error) {
      logger.error(`Bug Re-opened workflow failed for ${issueKey}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle Bug Created workflow
   * Triggered when bug status changes to "Ready for Dev"
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<Object>} Workflow result
   */
  async handleBugCreated(issueKey) {
    try {
      logger.info(`Starting Bug Created workflow for ${issueKey}`);

      // Step 1: Get bug details
      const bug = await jiraService.getIssue(issueKey);
      
      // Extract WCAG category if configured
      let wcagCategory = null;
      if (config.jira.wcagCategoryField && bug.fields[config.jira.wcagCategoryField]) {
        const categoryField = bug.fields[config.jira.wcagCategoryField];
        // Handle different field types (string, object with value, array, etc.)
        if (typeof categoryField === 'string') {
          wcagCategory = categoryField;
        } else if (categoryField.value) {
          wcagCategory = categoryField.value;
        } else if (Array.isArray(categoryField) && categoryField.length > 0) {
          wcagCategory = categoryField[0].value || categoryField[0];
        }
        if (wcagCategory) {
          logger.info(`WCAG Category: ${wcagCategory}`);
        }
      }
      
      const bugData = {
        key: issueKey,
        summary: bug.fields.summary,
        description: jiraService.extractTextFromDescription(bug.fields.description),
        wcagCategory: wcagCategory
      };

      logger.info(`Bug: ${bugData.summary}`);
      logger.info(`Description: ${bugData.description.substring(0, 200)}...`);

      // Step 2: Find Run ID
      const runId = await jiraService.findRunId(issueKey);
      if (!runId) {
        const errorMsg = 'Could not find TestRail Run ID. Please add Run ID to parent task comments or custom field.';
        await jiraService.addComment(issueKey, `❌ ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      logger.info(`Found Run ID: ${runId}`);

      // Step 3: Get test cases from TestRail
      const testCases = await testRailService.getTestsWithDetails(runId);
      if (testCases.length === 0) {
        const errorMsg = `No test cases found in Run ${runId}`;
        await jiraService.addComment(issueKey, `❌ ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      logger.info(`Found ${testCases.length} test cases in run`);

      // Step 3.5: Use smart section-based matching
      const matchResult = await this.findMatchesWithSectionFiltering(bugData, testCases, runId);
      const matches = matchResult.matches;
      
      logger.info(`Processing ${matches.length} test case match(es)`);

      // Step 5: Process each match
      const results = [];
      for (const match of matches) {
        // Check confidence
        const lowConfidence = !aiService.isConfidentMatch(match);
        
        // Check if bug is already linked
        const alreadyLinked = await testRailService.isBugAlreadyLinked(match.test_id, issueKey);
        
        let testResult;
        if (alreadyLinked) {
          logger.info(`Bug ${issueKey} is already linked to test ${match.test_id}, skipping update`);
          testResult = { 
            skipped: true, 
            reason: 'Bug already linked to this test case',
            test_id: match.test_id,
            match: match
          };
        } else {
          // Mark test as Failed in TestRail
          testResult = await testRailService.markAsFailed(
            match.test_id,
            `Bug filed: ${issueKey} - ${bugData.summary}`,
            issueKey  // Add bug ID to defects field for JIRA linking
          );
          testResult.match = match;
          testResult.lowConfidence = lowConfidence;
        }
        
        results.push(testResult);
      }

      // Step 6: Add comment(s) to JIRA
      if (matches.length === 1) {
        // Single match - use original format
        const match = matches[0];
        const result = results[0];
        const lowConfidence = !aiService.isConfidentMatch(match);
        
        if (lowConfidence) {
          const comment = `⚠️ AI Match (Low Confidence: ${(match.confidence * 100).toFixed(1)}%)
        
Matched to: ${match.title}
Test ID: ${match.test_id}
Reasoning: ${match.reasoning}

⚠️ Please verify this match is correct. If incorrect, reply with:
CORRECT: <test_id> - <test title>`;

          await jiraService.addComment(issueKey, comment);
          logger.warn(`Low confidence match: ${match.confidence}`);
        }
        
        const successComment = `✅ TestRail Updated

Test Case: ${match.title}
Status: ${result.skipped ? 'Already Linked' : 'Failed'}
Run: ${runId}
Test ID: ${match.test_id}
${match.autoMatched ? '🎯 Auto-matched' : `AI Confidence: ${(match.confidence * 100).toFixed(1)}%`}
Reasoning: ${match.reasoning}

${match.autoMatched ? '✨ Automatically matched - only test case in matching section' : ''}
${match.learned ? '🧠 Match based on previous learning' : ''}
${result.skipped ? '⚠️ Bug was already linked to this test case' : ''}
${config.server.dryRunMode ? '🔍 DRY RUN MODE - No actual TestRail update' : ''}`;

        await jiraService.addComment(issueKey, successComment);
      } else {
        // Multiple matches
        const linkedCount = results.filter(r => !r.skipped).length;
        const skippedCount = results.filter(r => r.skipped).length;
        
        const matchesText = matches.map((match, idx) => {
          const result = results[idx];
          const status = result.skipped ? '⚠️ Already Linked' : '✅ Failed';
          return `${idx + 1}. ${status} - ${match.title}
   Test ID: ${match.test_id} | Confidence: ${(match.confidence * 100).toFixed(1)}%
   Issue: ${match.reasoning}`;
        }).join('\n\n');
        
        const comment = `✅ TestRail Updated - Multiple Matches

This bug contains multiple accessibility issues. Linked to ${matches.length} test case(s):

${matchesText}

Run: ${runId}
Tests Linked: ${linkedCount} | Already Linked: ${skippedCount}
${config.openai.enableMultiMatch ? '\n🎯 Multi-match mode enabled' : ''}
${config.server.dryRunMode ? '\n🔍 DRY RUN MODE - No actual TestRail update' : ''}`;

        await jiraService.addComment(issueKey, comment);
      }

      logger.info(`Bug Created workflow completed successfully for ${issueKey} with ${matches.length} match(es)`);

      return {
        success: true,
        runId,
        matches: matches,
        results: results
      };
    } catch (error) {
      logger.error(`Bug Created workflow failed for ${issueKey}: ${error.message}`);
      await jiraService.addComment(issueKey, `❌ Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle Bug Resolved workflow
   * Triggered when bug status changes to "Queued Merged to Release"
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<Object>} Workflow result
   */
  async handleBugResolved(issueKey) {
    try {
      logger.info(`Starting Bug Resolved workflow for ${issueKey}`);

      // Step 1: Find Run ID
      const runId = await jiraService.findRunId(issueKey);
      if (!runId) {
        const errorMsg = 'Could not find TestRail Run ID';
        await jiraService.addComment(issueKey, `❌ ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      // Step 2: Find all test cases that have this bug linked in TestRail
      // This is more reliable than parsing JIRA comments
      const testIds = await testRailService.findTestsWithBug(runId, issueKey);
      if (testIds.length === 0) {
        const errorMsg = 'Could not find any test cases with this bug linked in TestRail. Was this bug processed through Bug Created workflow?';
        await jiraService.addComment(issueKey, `❌ ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      logger.info(`Found ${testIds.length} test(s) with bug ${issueKey}: ${testIds.join(', ')}`);

      // Step 3: Get bug details
      const bug = await jiraService.getIssue(issueKey);

      // Step 4: Mark each test as passed intelligently
      const results = [];
      for (const testId of testIds) {
        const result = await this.markTestAsPassedIntelligently(
          testId,
          issueKey,
          `Bug resolved: ${issueKey} - ${bug.fields.summary}`
        );
        
        logger.info(`Test ${testId} result: ${result.message}`);
        results.push({ testId, result });
      }

      // Step 5: Add comment to JIRA
      let statusMessage;
      
      if (testIds.length === 1) {
        // Single test case
        const result = results[0].result;
        if (result.skipped) {
          statusMessage = `✅ TestRail Already Passed\n\nTest ${testIds[0]} is already marked as Passed, no update needed.`;
        } else if (result.status === 'Failed') {
          // Get bug details for better comment
          const bugDetails = [];
          for (const bugId of result.activeBugs) {
            try {
              const bugIssue = await jiraService.getIssue(bugId);
              bugDetails.push(`- ${bugId}: ${bugIssue.fields.status.name} - ${bugIssue.fields.summary}`);
            } catch (error) {
              bugDetails.push(`- ${bugId}`);
            }
          }
          
          statusMessage = `✅ TestRail Updated\n\nTest ${testIds[0]} still has active bugs:\n${bugDetails.join('\n')}`;
        } else {
          statusMessage = `✅ TestRail Marked as Passed\n\nTest ${testIds[0]} marked as Passed.`;
        }
      } else {
        // Multiple test cases
        const passedCount = results.filter(r => r.result.status === 'Passed' || r.result.skipped).length;
        const failedCount = results.filter(r => r.result.status === 'Failed').length;
        
        const testSummary = results.map(r => {
          if (r.result.skipped) {
            return `• Test ${r.testId}: Already Passed`;
          } else if (r.result.status === 'Failed') {
            return `• Test ${r.testId}: Still Failed (${r.result.activeBugs.length} active bug(s))`;
          } else {
            return `• Test ${r.testId}: Marked as Passed`;
          }
        }).join('\n');
        
        statusMessage = `✅ TestRail Updated - Multiple Tests\n\n${testSummary}\n\nPassed: ${passedCount} | Still Failed: ${failedCount}`;
      }
      
      await jiraService.addComment(issueKey, statusMessage);

      logger.info(`Bug Resolved workflow completed successfully for ${issueKey}`);

      return {
        success: true,
        runId,
        testIds,
        results
      };
    } catch (error) {
      logger.error(`Bug Resolved workflow failed for ${issueKey}: ${error.message}`);
      await jiraService.addComment(issueKey, `❌ Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find all linked test IDs from previous workflow
   * Handles both single-match and multi-match scenarios
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<Array>} Array of test IDs
   */
  async findAllLinkedTestIds(issueKey, runId = null) {
    try {
      const response = await jiraService.getIssue(issueKey);
      const comments = response.fields.comment?.comments || [];

      const testIds = new Set();

      // Look for TestRail update comments
      for (const comment of comments.reverse()) {
        const text = jiraService.extractTextFromComment(comment.body);
        
        // Match single Test ID format: "Test ID: 31834485"
        const singleMatch = text.match(/Test ID:\s*(\d+)/g);
        if (singleMatch) {
          singleMatch.forEach(m => {
            const id = m.match(/Test ID:\s*(\d+)/)[1];
            testIds.add(id);
          });
        }
      }

      const result = Array.from(testIds);
      logger.info(`Found ${result.length} linked test ID(s): ${result.join(', ')}`);
      return result;
    } catch (error) {
      logger.error(`Failed to find linked test IDs: ${error.message}`);
      return [];
    }
  }

  /**
   * Find linked test ID from previous workflow (single match)
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<string|null>} Test ID or null
   */
  async findLinkedTestId(issueKey) {
    try {
      const testIds = await this.findAllLinkedTestIds(issueKey);
      return testIds.length > 0 ? testIds[0] : null;
    } catch (error) {
      logger.error(`Failed to find linked test ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if test case has other open bugs across all test results
   * @param {string} testId - TestRail Test ID
   * @param {string} currentBugKey - Current bug being resolved (to exclude from check)
   * @returns {Promise<Object>} { hasOpen: boolean, openBugs: Array }
   */
  async checkForOpenBugs(testId, currentBugKey) {
    try {
      // Get all test results for this test case
      const results = await testRailService.getTestResults(testId);
      
      if (!results || results.length === 0) {
        logger.info(`No test results found for test ${testId}`);
        return { hasOpen: false, openBugs: [] };
      }

      // Collect all unique bug IDs from all test results
      const allBugIds = new Set();
      
      for (const result of results) {
        const defects = result.defects || '';
        if (defects) {
          // Parse comma-separated bug IDs
          const bugIds = defects.split(',').map(id => id.trim()).filter(id => id);
          bugIds.forEach(id => allBugIds.add(id));
        }
      }

      // Remove current bug from the set
      allBugIds.delete(currentBugKey);

      if (allBugIds.size === 0) {
        logger.info(`No other bugs linked to test ${testId}`);
        return { hasOpen: false, openBugs: [] };
      }

      const bugIdArray = Array.from(allBugIds);
      logger.info(`Checking status of ${bugIdArray.length} other bugs linked to test ${testId}: ${bugIdArray.join(', ')}`);

      const openStatuses = [
        config.jira.statusOpen || 'Open',
        'Reopened',
        config.jira.statusReadyForDev
      ];

      const openBugs = [];

      // Check each bug's status
      for (const bugId of bugIdArray) {
        try {
          const bug = await jiraService.getIssue(bugId);
          const status = bug.fields.status.name;
          
          logger.info(`Bug ${bugId} status: ${status}`);
          
          if (openStatuses.includes(status)) {
            openBugs.push({
              key: bugId,
              status: status,
              summary: bug.fields.summary
            });
          }
        } catch (error) {
          logger.warn(`Failed to check bug ${bugId}: ${error.message}`);
          // If we can't check a bug, treat it as potentially open (safer approach)
          openBugs.push({
            key: bugId,
            status: 'Unknown',
            summary: 'Could not retrieve bug details'
          });
        }
      }

      return {
        hasOpen: openBugs.length > 0,
        openBugs,
        totalBugsChecked: bugIdArray.length
      };
    } catch (error) {
      logger.error(`Failed to check for open bugs: ${error.message}`);
      // On error, return safe default (assume has open bugs)
      return { hasOpen: true, openBugs: [{ key: 'Error', status: 'Unknown', summary: error.message }] };
    }
  }

  /**
   * Handle user correction
   * When user provides correct match in comments
   * @param {string} issueKey - JIRA issue key
   * @param {string} comment - Comment text with correction
   * @returns {Promise<Object>} Result
   */
  async handleCorrection(issueKey, comment) {
    try {
      logger.info(`Processing correction for ${issueKey}`);

      // Parse correction format: 
      // CORRECT: "CORRECT: C1234567" or "CORRECT: C1234567, C1234568" (replaces all old matches)
      // ADD: "ADD: C1234567" (keeps old matches, adds new one)
      
      const addMode = comment.toUpperCase().includes('ADD:');
      const keyword = addMode ? 'ADD' : 'CORRECT';
      
      // Extract all case IDs (supports comma-separated list)
      const caseIdPattern = new RegExp(`${keyword}:\\s*([C\\d,\\s]+)`, 'i');
      const match = comment.match(caseIdPattern);
      
      if (!match) {
        return { success: false, error: `Invalid correction format. Use: ${keyword}: C1234567 or ${keyword}: C1234567, C1234568` };
      }

      // Parse case IDs (remove C prefix, split by comma, trim whitespace)
      const correctCaseIds = match[1]
        .split(',')
        .map(id => id.trim().replace(/^C/i, ''))
        .filter(id => id.length > 0);

      if (correctCaseIds.length === 0) {
        return { success: false, error: 'No valid case IDs found' };
      }

      logger.info(`Processing ${correctCaseIds.length} correct case ID(s): ${correctCaseIds.join(', ')}`);

      // Get bug data
      const bug = await jiraService.getIssue(issueKey);
      const bugData = {
        key: issueKey,
        summary: bug.fields.summary,
        description: bug.fields.description?.content?.[0]?.content?.[0]?.text || ''
      };

      // Find the run ID
      const runId = await jiraService.findRunId(issueKey);
      if (!runId) {
        return { success: false, error: 'Could not find Run ID' };
      }

      // Get all tests in the run
      const tests = await testRailService.getTests(runId);
      
      // Find all correct test cases
      const correctTests = correctCaseIds.map(caseId => {
        const test = tests.find(t => t.case_id.toString() === caseId);
        if (!test) {
          logger.warn(`Test case ${caseId} not found in run ${runId}`);
        }
        return test;
      }).filter(t => t !== undefined);

      if (correctTests.length === 0) {
        return { success: false, error: `None of the specified test cases found in run ${runId}` };
      }

      // Find ALL previously linked test IDs
      const allPreviousTestIds = await this.findAllLinkedTestIds(issueKey, runId);
      logger.info(`Found ${allPreviousTestIds.length} previously linked test(s)`);
      
      let cleanupMessage = '';
      
      // Note: TestRail API does not support updating existing results
      // We can only add new results, not modify old ones
      // So we just log the previous links for reference
      if (!addMode && allPreviousTestIds.length > 0) {
        const correctTestIds = correctTests.map(t => t.id.toString());
        const testsToCleanup = allPreviousTestIds.filter(id => !correctTestIds.includes(id));
        
        if (testsToCleanup.length > 0) {
          logger.info(`Note: Bug was previously linked to ${testsToCleanup.length} incorrect test(s): ${testsToCleanup.join(', ')}`);
          logger.info(`TestRail does not support updating results, so old links will remain in history`);
          cleanupMessage = `\n⚠️ Note: Bug was previously linked to ${testsToCleanup.length} other test(s). Old results cannot be modified in TestRail.`;
        }
      }

      // Link bug to all correct test cases
      const linkedTests = [];
      for (const correctTest of correctTests) {
        // Store correction for each
        await learningService.storeCorrection({
          bug: bugData,
          correct_test_id: correctTest.id.toString(),
          correct_case_id: correctTest.case_id,
          correct_title: correctTest.title
        });

        // Check if already linked
        const alreadyLinked = await testRailService.isBugAlreadyLinked(correctTest.id, issueKey);
        
        if (!alreadyLinked) {
          await testRailService.markAsFailed(
            correctTest.id,
            `Bug filed (corrected): ${issueKey} - ${bugData.summary}`,
            issueKey
          );
          linkedTests.push({ ...correctTest, alreadyLinked: false });
          logger.info(`Linked bug to test ${correctTest.id}`);
        } else {
          linkedTests.push({ ...correctTest, alreadyLinked: true });
          logger.info(`Bug already linked to test ${correctTest.id}`);
        }
      }

      // Build response comment
      const mode = addMode ? 'ADD' : 'CORRECT';
      const testsList = linkedTests.map((t, idx) => 
        `${idx + 1}. ${t.title} (C${t.case_id})${t.alreadyLinked ? ' - Already linked' : ' - Linked'}`
      ).join('\n');

      await jiraService.addComment(
        issueKey,
        `✅ Correction Applied (${mode} Mode)

Thank you! The AI has learned from this correction.

Correct Test Case(s):
${testsList}
${cleanupMessage}

Mode: ${mode === 'ADD' ? 'Added to existing matches' : 'Replaced all previous matches'}
${linkedTests.length > 1 ? `\n🎯 Multi-test correction: ${linkedTests.length} test cases updated` : ''}

These patterns will be used for future similar bugs.`
      );

      logger.info(`Correction processed successfully for ${issueKey}: ${correctTests.length} test(s)`);

      return { 
        success: true, 
        correctTests: correctTests.map(t => ({
          testId: t.id,
          caseId: t.case_id,
          title: t.title
        })),
        mode: mode,
        cleanedUp: !addMode ? (allPreviousTestIds.length - correctTests.length) : 0
      };
    } catch (error) {
      logger.error(`Failed to process correction: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find all test IDs that have this bug linked
   * @param {string} issueKey - JIRA issue key
   * @param {string} runId - TestRail run ID
   * @returns {Promise<Array>} Array of test IDs
   */
  async findAllLinkedTestIds(issueKey, runId) {
    try {
      const tests = await testRailService.getTests(runId);
      const linkedTestIds = [];
      
      for (const test of tests) {
        const isLinked = await testRailService.isBugAlreadyLinked(test.id, issueKey);
        if (isLinked) {
          linkedTestIds.push(test.id.toString());
        }
      }
      
      return linkedTestIds;
    } catch (error) {
      logger.error(`Failed to find all linked test IDs: ${error.message}`);
      return [];
    }
  }

  /**
   * Check which bugs are still active (Open, Reopened, or Ready for Dev)
   * @param {Array<string>} bugIds - Array of bug IDs to check
   * @returns {Promise<Array<string>>} Array of bug IDs that are still active
   */
  async getActiveBugs(bugIds) {
    const activeBugs = [];
    const activeStatuses = ['open', 'reopened', 'ready for dev'];
    
    for (const bugId of bugIds) {
      try {
        const issue = await jiraService.getIssue(bugId);
        const status = issue.fields.status.name.toLowerCase();
        
        if (activeStatuses.includes(status)) {
          activeBugs.push(bugId);
          logger.info(`Bug ${bugId} is active (status: ${issue.fields.status.name})`);
        } else {
          logger.info(`Bug ${bugId} is not active (status: ${issue.fields.status.name})`);
        }
      } catch (error) {
        logger.warn(`Failed to check status of bug ${bugId}: ${error.message}`);
        // If we can't check, assume it's active to be safe
        activeBugs.push(bugId);
      }
    }
    
    return activeBugs;
  }

  /**
   * Remove a bug from a test by updating the result
   * Used during correction workflow to clean up incorrect matches
   * @param {string} testId - TestRail test ID
   * @param {string} bugIdToRemove - Bug ID to remove
   * @param {string} reason - Reason for removal
  /**
   * Intelligently mark a test as passed, checking if other active bugs still fail it
   * Checks ALL test results to find ALL bugs linked to this test case
   * @param {string} testId - TestRail test ID
   * @param {string} removedBugId - Bug ID being removed/resolved
   * @param {string} reason - Reason for the change
   * @returns {Promise<Object>} Result with status and message
   */
  async markTestAsPassedIntelligently(testId, removedBugId, reason) {
    try {
      // Get all test results
      const testResults = await testRailService.getResults(testId);
      
      if (!testResults || testResults.length === 0) {
        logger.warn(`No test results found for test ${testId}`);
        return {
          status: 'Passed',
          message: 'No test results found, cannot update'
        };
      }
      
      // Check if the latest result is already Passed
      const latestResult = testResults[0]; // Results are ordered by newest first
      if (latestResult.status_id === 1) { // 1 = Passed
        logger.info(`Latest test result for test ${testId} is already Passed, skipping update`);
        return {
          status: 'Passed',
          message: 'Test is already Passed, no update needed',
          skipped: true
        };
      }
      
      // Collect ALL bugs from ALL results (not just the one with the removed bug)
      const allBugsSet = new Set();
      let foundRemovedBug = false;
      
      for (const result of testResults) {
        if (result.defects) {
          const bugs = result.defects.split(',').map(d => d.trim()).filter(d => d);
          for (const bug of bugs) {
            if (bug === removedBugId) {
              foundRemovedBug = true;
              logger.info(`Found bug ${removedBugId} in result ${result.id}`);
            } else {
              allBugsSet.add(bug);
            }
          }
        }
      }
      
      if (!foundRemovedBug) {
        logger.warn(`Bug ${removedBugId} not found in any test result for test ${testId}`);
        return {
          status: 'Passed',
          message: `Bug ${removedBugId} not found in test results`
        };
      }
      
      const allOtherBugs = Array.from(allBugsSet);
      
      if (allOtherBugs.length > 0) {
        logger.info(`Test ${testId} has ${allOtherBugs.length} other bug(s) across all results: ${allOtherBugs.join(', ')}`);
        
        // Check which bugs are still active
        const activeBugs = await this.getActiveBugs(allOtherBugs);
        
        if (activeBugs.length > 0) {
          logger.info(`Test ${testId} has ${activeBugs.length} active bug(s), leaving test as Failed`);
          
          // Do NOT add a new result - test stays Failed with existing bugs
          return {
            status: 'Failed',
            message: `Test kept as Failed due to ${activeBugs.length} active bug(s): ${activeBugs.join(', ')}`,
            activeBugs: activeBugs
          };
        } else {
          logger.info(`Test ${testId} has no active bugs remaining, marking test as Passed`);
          
          // Add a new Passed result
          await testRailService.markAsPassed(testId, `${reason}. Removed bug ${removedBugId}. No active bugs remain.`, '');
        }
      } else {
        logger.info(`Test ${testId} has no other bugs, marking test as Passed`);
        
        // Add a new Passed result
        await testRailService.markAsPassed(testId, `${reason}. Removed bug ${removedBugId}.`, '');
      }
      
      return {
        status: 'Passed',
        message: 'No active bugs remain, test marked as Passed'
      };
    } catch (error) {
      logger.error(`Failed to intelligently mark test ${testId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract WCAG criterion from bug title
   * Extracts the criterion between the first and second pipe (|)
   * Example: "508c | Error identification | Test Project | ..." → "Error identification"
   * @param {string} title - Bug title/summary
   * @returns {string|null} Extracted criterion or null
   */
  extractCriterionFromTitle(title) {
    if (!title) return null;
    
    // Split by pipe and get the second element (index 1)
    const parts = title.split('|').map(p => p.trim());
    
    if (parts.length >= 2) {
      const criterion = parts[1];
      // Filter out common non-criterion words
      const ignoredWords = ['test', 'project', '508c', 'bug', 'issue'];
      if (!ignoredWords.includes(criterion.toLowerCase())) {
        return criterion;
      }
    }
    
    return null;
  }

  /**
   * Group test cases by their TestRail section
   * @param {Array} testCases - Array of test case objects
   * @param {string} runId - TestRail run ID
   * @returns {Promise<Array>} Array of {sectionId, sectionName, tests[]}
   */
  async groupTestCasesBySection(testCases, runId) {
    try {
      // Get run details to find project and suite IDs
      const run = await testRailService.getRun(runId);
      const projectId = run.project_id;
      const suiteId = run.suite_id;
      
      logger.info(`Fetching sections for project ${projectId}, suite ${suiteId}`);
      
      // Fetch all sections in the project/suite
      const sections = await testRailService.getSections(projectId, suiteId);
      
      logger.info(`Retrieved ${sections.length} sections from TestRail`);
      if (sections.length > 0) {
        logger.info(`Section examples: ${sections.slice(0, 5).map(s => `"${s.name}" (ID: ${s.id})`).join(', ')}`);
      }
      
      // Create a map of section ID to section details
      const sectionMap = new Map();
      for (const section of sections) {
        sectionMap.set(section.id, {
          id: section.id,
          name: section.name,
          depth: section.depth || 0,
          parent_id: section.parent_id || null
        });
        logger.debug(`Section ${section.id}: "${section.name}"`);
      }
      
      // Group test cases by section
      const sectionGroups = new Map();
      
      for (const test of testCases) {
        const sectionId = test.section_id;
        
        if (!sectionId) {
          // Add to "uncategorized" group
          if (!sectionGroups.has(null)) {
            sectionGroups.set(null, {
              sectionId: null,
              sectionName: 'Uncategorized',
              tests: []
            });
          }
          sectionGroups.get(null).tests.push(test);
          continue;
        }
        
        // Get section name
        const section = sectionMap.get(sectionId);
        const sectionName = section ? section.name : `Section ${sectionId}`;
        
        // Add to group
        if (!sectionGroups.has(sectionId)) {
          sectionGroups.set(sectionId, {
            sectionId,
            sectionName,
            tests: []
          });
        }
        sectionGroups.get(sectionId).tests.push(test);
      }
      
      // Convert to array
      const groups = Array.from(sectionGroups.values());
      
      // Log the grouping
      logger.info(`Grouped ${testCases.length} test cases into ${groups.length} sections`);
      groups.forEach(group => {
        logger.info(`  Section: "${group.sectionName}" (ID: ${group.sectionId}) - ${group.tests.length} test(s)`);
      });
      
      return groups;
    } catch (error) {
      logger.error(`Failed to group test cases by section: ${error.message}`);
      // Return all tests in a single group as fallback
      return [{
        sectionId: null,
        sectionName: 'All Tests',
        tests: testCases
      }];
    }
  }

  /**
   * Find matches using smart section-based filtering
   * @param {Object} bugData - Bug information
   * @param {Array} testCases - All test cases
   * @param {string} runId - TestRail run ID
   * @returns {Promise<Object>} { matches: [], autoMatched: boolean }
   */
  async findMatchesWithSectionFiltering(bugData, testCases, runId) {
    try {
      let filteredTestCases = testCases;
      let autoMatched = false;
      let matchReason = 'AI matching';
      
      // Extract criterion from bug title
      const criterion = this.extractCriterionFromTitle(bugData.summary);
      
      if (criterion) {
        logger.info(`Extracted criterion from title: "${criterion}"`);
        
        // Group test cases by section
        const sectionGroups = await this.groupTestCasesBySection(testCases, runId);
        
        // Find sections matching the criterion
        const matchingSections = sectionGroups.filter(group => {
          const sectionName = (group.sectionName || '').toLowerCase();
          const matches = sectionName.includes(criterion.toLowerCase());
          if (matches) {
            logger.info(`  ✓ Section "${group.sectionName}" matches criterion "${criterion}"`);
          }
          return matches;
        });
        
        if (matchingSections.length > 0) {
          filteredTestCases = matchingSections.flatMap(group => group.tests);
          logger.info(`Found ${matchingSections.length} matching section(s): ${matchingSections.map(s => s.sectionName).join(', ')}`);
          logger.info(`Filtered to ${filteredTestCases.length} test cases`);
          
          // Auto-match if only 1 test case in matching sections
          if (filteredTestCases.length === 1) {
            autoMatched = true;
            matchReason = `Auto-matched: Only test case in section "${matchingSections[0].sectionName}"`;
            logger.info(matchReason);
            
            const autoTest = filteredTestCases[0];
            return {
              matches: [{
                test_id: autoTest.test_id,
                case_id: autoTest.case_id,
                title: autoTest.title,
                confidence: 1.0,
                reasoning: matchReason,
                autoMatched: true
              }],
              autoMatched: true
            };
          }
        } else {
          logger.warn(`No sections match criterion "${criterion}", using all test cases`);
        }
      } else {
        logger.warn(`Could not extract criterion from title, using all test cases`);
      }

      // Use AI to match
      const matchResult = await aiService.matchBugToTestCase(bugData, filteredTestCases);
      const matches = Array.isArray(matchResult) ? matchResult : [matchResult];
      
      return {
        matches: matches,
        autoMatched: false
      };
    } catch (error) {
      logger.error(`Failed to find matches with section filtering: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new WorkflowService();
