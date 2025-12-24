const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const cacheService = require('./cacheService');

/**
 * Xray Service - Handles all Xray (Jira Test Management) API interactions
 * Xray is integrated directly into Jira, so we use Jira's REST API
 */
class XrayService {
  constructor() {
    this.baseUrl = config.xray.baseUrl;
    this.auth = {
      username: config.xray.email,
      password: config.xray.apiToken
    };
  }

  /**
   * Get test execution details (replaces getRun)
   * @param {string} executionKey - Xray Test Execution issue key (e.g., "PROJ-123")
   * @returns {Promise<Object>} Execution data
   */
  async getTestExecution(executionKey) {
    try {
      logger.info(`Fetching Xray test execution: ${executionKey}`);
      const response = await axios.get(
        `${this.baseUrl}/rest/api/3/issue/${executionKey}`,
        { auth: this.auth }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch test execution ${executionKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all tests in a test execution (replaces getTests)
   * @param {string} executionKey - Xray Test Execution key
   * @returns {Promise<Array>} Array of test issues
   */
  async getTests(executionKey) {
    try {
      logger.info(`Fetching tests from execution: ${executionKey}`);
      const response = await axios.get(
        `${this.baseUrl}/rest/raven/1.0/api/testexec/${executionKey}/test`,
        { auth: this.auth }
      );
      
      // Xray returns array of test keys - fetch full details
      const testKeys = response.data;
      const tests = [];
      
      for (const testKey of testKeys) {
        const testDetails = await this.getTestDetails(testKey);
        tests.push({
          id: testKey,
          key: testKey,
          title: testDetails.fields.summary,
          description: testDetails.fields.description,
          case_id: testKey
        });
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, config.xray.rateLimitMs));
      }
      
      return tests;
    } catch (error) {
      logger.error(`Failed to fetch tests from execution ${executionKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get test details (replaces getTestDetails and getCase)
   * @param {string} testKey - Xray Test issue key
   * @returns {Promise<Object>} Test details
   */
  async getTestDetails(testKey) {
    try {
      logger.info(`Fetching test details: ${testKey}`);
      const response = await axios.get(
        `${this.baseUrl}/rest/api/3/issue/${testKey}`,
        { auth: this.auth }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch test details ${testKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get test runs/results for a test in an execution (replaces getResults)
   * @param {string} testKey - Test issue key
   * @param {string} executionKey - Test execution key
   * @returns {Promise<Array>} Array of test runs
   */
  async getTestRuns(testKey, executionKey) {
    try {
      logger.info(`Fetching test runs for test ${testKey} in execution ${executionKey}`);
      const response = await axios.get(
        `${this.baseUrl}/rest/raven/1.0/api/testrun?testIssueKey=${testKey}&testExecIssueKey=${executionKey}`,
        { auth: this.auth }
      );
      return response.data || [];
    } catch (error) {
      logger.error(`Failed to fetch test runs: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if a bug is already linked to a test
   * @param {string} testKey - Test issue key
   * @param {string} bugKey - Bug issue key to check
   * @returns {Promise<boolean>} True if bug is already linked
   */
  async isBugAlreadyLinked(testKey, bugKey) {
    try {
      // Get test issue links
      const testDetails = await this.getTestDetails(testKey);
      const issueLinks = testDetails.fields.issuelinks || [];
      
      // Check if bug is linked
      for (const link of issueLinks) {
        const linkedKey = link.outwardIssue?.key || link.inwardIssue?.key;
        if (linkedKey === bugKey) {
          logger.info(`Bug ${bugKey} is already linked to test ${testKey}`);
          return true;
        }
      }
      
      logger.info(`Bug ${bugKey} is not linked to test ${testKey}`);
      return false;
    } catch (error) {
      logger.error(`Failed to check bug link: ${error.message}`);
      return false;
    }
  }

  /**
   * Find all tests that have a specific bug linked
   * @param {string} executionKey - Test Execution key
   * @param {string} bugKey - Bug issue key to search for
   * @returns {Promise<Array>} Array of test keys that have this bug linked
   */
  async findTestsWithBug(executionKey, bugKey) {
    try {
      logger.info(`Searching execution ${executionKey} for tests with bug ${bugKey}`);
      
      // Get all tests in the execution
      const tests = await this.getTests(executionKey);
      const testKeysWithBug = [];
      
      // Check each test's links for the bug
      for (const test of tests) {
        const isLinked = await this.isBugAlreadyLinked(test.key, bugKey);
        if (isLinked) {
          testKeysWithBug.push(test.key);
          logger.info(`Found bug ${bugKey} linked to test ${test.key}`);
        }
      }
      
      logger.info(`Found ${testKeysWithBug.length} test(s) with bug ${bugKey}`);
      return testKeysWithBug;
    } catch (error) {
      logger.error(`Failed to find tests with bug ${bugKey}: ${error.message}`);
      return [];
    }
  }

  /**
   * Add test result to execution (replaces addResult)
   * @param {string} testKey - Test issue key
   * @param {string} executionKey - Test execution key
   * @param {string} status - Status: "PASS", "FAIL", "TODO", "EXECUTING", "ABORTED"
   * @param {string} comment - Optional comment
   * @param {Array} defects - Optional array of defect keys
   * @returns {Promise<Object>} Result data
   */
  async addTestRun(testKey, executionKey, status, comment = '', defects = []) {
    try {
      if (config.server.dryRunMode) {
        logger.info(`[DRY RUN] Would update test ${testKey} in execution ${executionKey} to status ${status}`);
        return { dry_run: true, test_key: testKey, status: status, defects: defects };
      }

      logger.info(`Updating test ${testKey} in execution ${executionKey} to status ${status}`);
      
      const payload = {
        testExecutionKey: executionKey,
        tests: [{
          testKey: testKey,
          status: status,
          comment: comment
        }]
      };
      
      // Add test run result
      const response = await axios.post(
        `${this.baseUrl}/rest/raven/1.0/import/execution`,
        payload,
        { 
          auth: this.auth,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      // Link defects if provided
      if (defects && defects.length > 0) {
        for (const defectKey of defects) {
          await this.linkIssue(testKey, defectKey, 'Blocks');
        }
      }
      
      logger.info(`Test ${testKey} updated successfully`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update test ${testKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Link a bug/defect to a test issue
   * @param {string} testKey - Test issue key
   * @param {string} bugKey - Bug issue key
   * @param {string} linkType - Link type (e.g., "Blocks", "Relates")
   * @returns {Promise<Object>} Link result
   */
  async linkIssue(testKey, bugKey, linkType = 'Blocks') {
    try {
      logger.info(`Linking bug ${bugKey} to test ${testKey} with type ${linkType}`);
      
      const payload = {
        type: { name: linkType },
        inwardIssue: { key: testKey },
        outwardIssue: { key: bugKey }
      };
      
      const response = await axios.post(
        `${this.baseUrl}/rest/api/3/issueLink`,
        payload,
        { 
          auth: this.auth,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      logger.info(`Bug ${bugKey} linked to test ${testKey} successfully`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to link bug ${bugKey} to test ${testKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unlink a bug from a test issue
   * @param {string} testKey - Test issue key
   * @param {string} bugKey - Bug issue key to unlink
   * @returns {Promise<boolean>} True if successful
   */
  async unlinkIssue(testKey, bugKey) {
    try {
      logger.info(`Unlinking bug ${bugKey} from test ${testKey}`);
      
      // Get test details to find the link ID
      const testDetails = await this.getTestDetails(testKey);
      const issueLinks = testDetails.fields.issuelinks || [];
      
      // Find the link to delete
      for (const link of issueLinks) {
        const linkedKey = link.outwardIssue?.key || link.inwardIssue?.key;
        if (linkedKey === bugKey) {
          await axios.delete(
            `${this.baseUrl}/rest/api/3/issueLink/${link.id}`,
            { auth: this.auth }
          );
          logger.info(`Bug ${bugKey} unlinked from test ${testKey} successfully`);
          return true;
        }
      }
      
      logger.warn(`No link found between test ${testKey} and bug ${bugKey}`);
      return false;
    } catch (error) {
      logger.error(`Failed to unlink bug ${bugKey} from test ${testKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all test cases with details for AI matching (with caching)
   * @param {string} executionKey - Test Execution key
   * @param {boolean} forceRefresh - Force cache refresh (optional)
   * @returns {Promise<Array>} Array of test cases with full details
   */
  async getTestsWithDetails(executionKey, forceRefresh = false) {
    try {
      // Check cache first
      const cacheKey = cacheService.constructor.getTestsCacheKey(executionKey);
      
      if (!forceRefresh) {
        const cachedData = await cacheService.get(cacheKey);
        if (cachedData) {
          logger.info(`Using cached test cases for execution ${executionKey} (${cachedData.length} tests)`);
          return cachedData;
        }
      }

      logger.info(`Fetching fresh test cases from Xray for execution ${executionKey}`);
      const tests = await this.getTests(executionKey);
      const testsWithDetails = [];

      // Fetch full details for each test (with rate limiting)
      for (const test of tests) {
        try {
          const testDetails = await this.getTestDetails(test.key);
          
          // Extract test definition fields (Xray stores test steps in custom fields)
          const testDefinition = testDetails.fields.customfield_10000 || {}; // Adjust field ID based on your Xray setup
          
          testsWithDetails.push({
            test_id: test.key,
            case_id: test.key,
            key: test.key,
            title: testDetails.fields.summary,
            description: testDetails.fields.description?.content?.[0]?.content?.[0]?.text || testDetails.fields.description || '',
            test_type: testDetails.fields.customfield_10100?.value || 'Manual', // Test Type field
            steps: testDefinition.steps || [],
            preconditions: testDefinition.precondition || '',
            labels: testDetails.fields.labels || [],
            components: testDetails.fields.components?.map(c => c.name) || []
          });
          
          // Rate limiting: configurable delay to avoid rate limit errors
          await new Promise(resolve => setTimeout(resolve, config.xray.rateLimitMs));
        } catch (error) {
          logger.warn(`Failed to fetch details for test ${test.key}: ${error.message}`);
          // Add test without full details
          testsWithDetails.push({
            test_id: test.key,
            case_id: test.key,
            key: test.key,
            title: test.title,
            description: test.description || ''
          });
        }
      }

      // Cache the results for future use
      await cacheService.set(cacheKey, testsWithDetails);
      logger.info(`Cached ${testsWithDetails.length} test cases for execution ${executionKey}`);

      return testsWithDetails;
    } catch (error) {
      logger.error(`Failed to get tests with details: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark test as Failed in execution
   * @param {string} testKey - Test issue key
   * @param {string} executionKey - Test execution key
   * @param {string} comment - Failure comment
   * @param {Array} defects - Array of defect keys
   */
  async markAsFailed(testKey, executionKey, comment = '', defects = []) {
    return this.addTestRun(testKey, executionKey, 'FAIL', comment, defects);
  }

  /**
   * Mark test as Passed in execution
   * @param {string} testKey - Test issue key
   * @param {string} executionKey - Test execution key
   * @param {string} comment - Pass comment
   * @param {Array} defects - Array of defect keys (for clearing links)
   */
  async markAsPassed(testKey, executionKey, comment = '', defects = []) {
    return this.addTestRun(testKey, executionKey, 'PASS', comment, defects);
  }

  /**
   * Get test execution key from parent issue (replaces findRunId)
   * Looks for Test Execution linked to the parent story/task
   * @param {string} parentKey - Parent issue key
   * @returns {Promise<string|null>} Test Execution key or null
   */
  async findTestExecutionKey(parentKey) {
    try {
      logger.info(`Finding Test Execution for parent issue: ${parentKey}`);
      
      // Get parent issue
      const response = await axios.get(
        `${this.baseUrl}/rest/api/3/issue/${parentKey}`,
        { auth: this.auth }
      );
      
      const issue = response.data;
      
      // Check issue links for Test Execution
      const issueLinks = issue.fields.issuelinks || [];
      for (const link of issueLinks) {
        const linkedIssue = link.outwardIssue || link.inwardIssue;
        if (linkedIssue && linkedIssue.fields.issuetype.name === 'Test Execution') {
          logger.info(`Found Test Execution: ${linkedIssue.key}`);
          return linkedIssue.key;
        }
      }
      
      // Check subtasks for Test Execution
      const subtasks = issue.fields.subtasks || [];
      for (const subtask of subtasks) {
        if (subtask.fields.issuetype.name === 'Test Execution') {
          logger.info(`Found Test Execution in subtasks: ${subtask.key}`);
          return subtask.key;
        }
      }
      
      // Check custom field (if configured)
      if (config.xray.executionKeyField) {
        const executionKey = issue.fields[config.xray.executionKeyField];
        if (executionKey) {
          logger.info(`Found Test Execution in custom field: ${executionKey}`);
          return executionKey;
        }
      }
      
      logger.warn(`No Test Execution found for parent ${parentKey}`);
      return null;
    } catch (error) {
      logger.error(`Failed to find Test Execution: ${error.message}`);
      return null;
    }
  }
}

module.exports = new XrayService();
