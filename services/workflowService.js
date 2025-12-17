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
      const bugData = {
        key: issueKey,
        summary: bug.fields.summary,
        description: bug.fields.description?.content?.[0]?.content?.[0]?.text || ''
      };

      logger.info(`Bug: ${bugData.summary}`);

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

      // Step 4: Use AI to match bug to test case
      const match = await aiService.matchBugToTestCase(bugData, testCases);

      // Step 5: Check confidence
      if (!aiService.isConfidentMatch(match)) {
        const comment = `⚠️ AI Match (Low Confidence: ${(match.confidence * 100).toFixed(1)}%)
        
Matched to: ${match.title}
Test ID: ${match.test_id}
Reasoning: ${match.reasoning}

⚠️ Please verify this match is correct. If incorrect, reply with:
CORRECT: <test_id> - <test title>`;

        await jiraService.addComment(issueKey, comment);
        logger.warn(`Low confidence match: ${match.confidence}`);
      }

      // Step 6: Check if bug is already linked
      const alreadyLinked = await testRailService.isBugAlreadyLinked(match.test_id, issueKey);
      
      let testResult;
      if (alreadyLinked) {
        logger.info(`Bug ${issueKey} is already linked to test ${match.test_id}, skipping update`);
        testResult = { 
          skipped: true, 
          reason: 'Bug already linked to this test case',
          test_id: match.test_id 
        };
      } else {
        // Mark test as Failed in TestRail
        testResult = await testRailService.markAsFailed(
          match.test_id,
          `Bug filed: ${issueKey} - ${bugData.summary}`,
          issueKey  // Add bug ID to defects field for JIRA linking
        );
      }

      // Step 7: Add success comment to JIRA
      const successComment = `✅ TestRail Updated

Test Case: ${match.title}
Status: ${alreadyLinked ? 'Already Linked' : 'Failed'}
Run: ${runId}
Test ID: ${match.test_id}
AI Confidence: ${(match.confidence * 100).toFixed(1)}%
Reasoning: ${match.reasoning}

${match.learned ? '🧠 Match based on previous learning' : ''}
${alreadyLinked ? '⚠️ Bug was already linked to this test case' : ''}
${config.server.dryRunMode ? '🔍 DRY RUN MODE - No actual TestRail update' : ''}`;

      await jiraService.addComment(issueKey, successComment);

      logger.info(`Bug Created workflow completed successfully for ${issueKey}`);

      return {
        success: true,
        runId,
        match,
        testResult
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

      // Step 2: Find previously linked test case
      // Look in JIRA comments for test ID from Bug Created workflow
      const testId = await this.findLinkedTestId(issueKey);
      if (!testId) {
        const errorMsg = 'Could not find linked test case. Was this bug processed through Bug Created workflow?';
        await jiraService.addComment(issueKey, `❌ ${errorMsg}`);
        return { success: false, error: errorMsg };
      }

      logger.info(`Found linked test ID: ${testId}`);

      // Step 3: Get bug details
      const bug = await jiraService.getIssue(issueKey);

      // Step 4: Check latest test result status
      const results = await testRailService.getTestResults(testId);
      const latestResult = results && results.length > 0 ? results[0] : null;
      
      let testResult;
      let alreadyPassed = false;
      
      if (latestResult && latestResult.status_id === config.testRail.statusPassed) {
        logger.info(`Test ${testId} is already marked as Passed, skipping update`);
        alreadyPassed = true;
        testResult = latestResult;
      } else {
        // Mark test as passed
        logger.info(`Marking test ${testId} as Passed`);
        testResult = await testRailService.markAsPassed(
          testId,
          `Bug resolved: ${issueKey} - ${bug.fields.summary}`,
          ''  // Clear defects field for passed test
        );
      }

      // Step 5: Add success comment to JIRA
      const successComment = `✅ TestRail Updated

Status: Passed (Bug Fixed)
Run: ${runId}
Test ID: ${testId}
${alreadyPassed ? '⚠️ Test was already marked as Passed' : ''}

${config.server.dryRunMode ? '🔍 DRY RUN MODE - No actual TestRail update' : ''}`;

      await jiraService.addComment(issueKey, successComment);

      logger.info(`Bug Resolved workflow completed successfully for ${issueKey}`);

      return {
        success: true,
        runId,
        testId,
        testResult
      };
    } catch (error) {
      logger.error(`Bug Resolved workflow failed for ${issueKey}: ${error.message}`);
      await jiraService.addComment(issueKey, `❌ Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Find linked test ID from previous workflow
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<string|null>} Test ID or null
   */
  async findLinkedTestId(issueKey) {
    try {
      const response = await jiraService.getIssue(issueKey);
      const comments = response.fields.comment?.comments || [];

      for (const comment of comments.reverse()) {
        const text = jiraService.extractTextFromComment(comment.body);
        const match = text.match(/Test ID:\s*(\d+)/);
        if (match && match[1]) {
          return match[1];
        }
      }

      return null;
    } catch (error) {
      logger.error(`Failed to find linked test ID: ${error.message}`);
      return null;
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

      // Parse correction format: "CORRECT: C<case_id>" or "CORRECT: <test_id>"
      const match = comment.match(/CORRECT:\s*C?(\d+)/i);
      if (!match) {
        return { success: false, error: 'Invalid correction format. Use: CORRECT: C1234567' };
      }

      const correctCaseId = match[1];

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
      const correctTest = tests.find(t => t.case_id.toString() === correctCaseId);

      if (!correctTest) {
        return { success: false, error: `Test case ${correctCaseId} not found in run ${runId}` };
      }

      // Find previously linked (incorrect) test ID
      const previousTestId = await this.findLinkedTestId(issueKey);
      
      let cleanupMessage = '';
      if (previousTestId && previousTestId !== correctTest.id.toString()) {
        logger.info(`Found previously linked test ${previousTestId}, clearing defects field`);
        try {
          await testRailService.markAsPassed(
            previousTestId,
            `Correction applied: Bug was re-linked to correct test case C${correctCaseId}`,
            ''  // Clear defects field
          );
          cleanupMessage = `\n✓ Cleared bug link from previous test (ID: ${previousTestId})`;
        } catch (error) {
          logger.warn(`Failed to clear previous test ${previousTestId}: ${error.message}`);
          cleanupMessage = `\n⚠️ Warning: Could not clear previous test link`;
        }
      }

      // Store correction
      await learningService.storeCorrection({
        bug: bugData,
        correct_test_id: correctTest.id.toString(),
        correct_case_id: correctTest.case_id,
        correct_title: correctTest.title
      });

      // Check if bug is already linked to correct test
      const alreadyLinked = await testRailService.isBugAlreadyLinked(correctTest.id, issueKey);
      
      if (!alreadyLinked) {
        // Link bug to correct test case
        await testRailService.markAsFailed(
          correctTest.id,
          `Bug filed (corrected): ${issueKey} - ${bugData.summary}`,
          issueKey  // Add bug ID to defects field
        );
      } else {
        logger.info(`Bug ${issueKey} already linked to corrected test ${correctTest.id}`);
      }

      // Acknowledge correction
      await jiraService.addComment(
        issueKey,
        `✅ Correction Applied

Thank you! The AI has learned from this correction.
Correct Test: ${correctTest.title}
Case ID: C${correctTest.case_id}
Test ID: ${correctTest.id}
${alreadyLinked ? '\n⚠️ Note: Bug was already linked to this test case' : '\n✓ TestRail updated with correct test'}${cleanupMessage}

This pattern will be used for future similar bugs.`
      );

      logger.info(`Correction processed successfully for ${issueKey}`);

      return { 
        success: true, 
        correctTestId: correctTest.id, 
        correctCaseId: correctTest.case_id,
        correctTitle: correctTest.title,
        previousTestId 
      };
    } catch (error) {
      logger.error(`Failed to process correction: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new WorkflowService();
