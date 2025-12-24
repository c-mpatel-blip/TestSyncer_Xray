const config = require('../config');
const logger = require('../logger');

/**
 * Test Management Adapter - Unified interface for TestRail and Xray
 * Automatically routes to the correct service based on configuration
 */
class TestManagementAdapter {
  constructor() {
    this.system = config.testManagement.system.toLowerCase();
    logger.info(`Test Management System: ${this.system}`);
    
    if (this.system === 'xray') {
      this.service = require('./xrayService');
      this.isXray = true;
      this.isTestRail = false;
    } else if (this.system === 'testrail') {
      this.service = require('./testRailService');
      this.isXray = false;
      this.isTestRail = true;
    } else {
      throw new Error(`Unsupported test management system: ${this.system}. Use 'testrail' or 'xray'.`);
    }
  }

  /**
   * Get the run/execution identifier from parent issue
   * TestRail: Returns Run ID (numeric string)
   * Xray: Returns Test Execution Key (issue key)
   */
  async findRunOrExecutionKey(issueKey) {
    if (this.isXray) {
      return await this.service.findTestExecutionKey(issueKey);
    } else {
      // Use jiraService for TestRail
      const jiraService = require('./jiraService');
      return await jiraService.findRunId(issueKey);
    }
  }

  /**
   * Get all tests with details
   * @param {string} runOrExecutionKey - Run ID (TestRail) or Execution Key (Xray)
   * @param {boolean} forceRefresh - Force cache refresh
   */
  async getTestsWithDetails(runOrExecutionKey, forceRefresh = false) {
    return await this.service.getTestsWithDetails(runOrExecutionKey, forceRefresh);
  }

  /**
   * Check if a bug is already linked to a test
   * @param {string} testIdOrKey - Test ID (TestRail) or Test Key (Xray)
   * @param {string} bugKey - Bug key
   */
  async isBugAlreadyLinked(testIdOrKey, bugKey) {
    return await this.service.isBugAlreadyLinked(testIdOrKey, bugKey);
  }

  /**
   * Mark test as failed
   * @param {string} testIdOrKey - Test ID (TestRail) or Test Key (Xray)
   * @param {string} runOrExecutionKey - Run ID or Execution Key (Xray only)
   * @param {string} comment - Comment
   * @param {string|Array} defects - Bug key(s)
   */
  async markAsFailed(testIdOrKey, runOrExecutionKey, comment, defects) {
    if (this.isXray) {
      // Xray expects array of defects and execution key
      const defectsArray = Array.isArray(defects) ? defects : [defects];
      return await this.service.markAsFailed(testIdOrKey, runOrExecutionKey, comment, defectsArray);
    } else {
      // TestRail expects string of defects (comma-separated) and no execution key
      const defectsString = Array.isArray(defects) ? defects.join(',') : defects;
      return await this.service.markAsFailed(testIdOrKey, comment, defectsString);
    }
  }

  /**
   * Mark test as passed
   * @param {string} testIdOrKey - Test ID (TestRail) or Test Key (Xray)
   * @param {string} runOrExecutionKey - Run ID or Execution Key (Xray only)
   * @param {string} comment - Comment
   * @param {string|Array} defects - Bug key(s) to clear
   */
  async markAsPassed(testIdOrKey, runOrExecutionKey, comment, defects = '') {
    if (this.isXray) {
      // Xray expects array and execution key
      const defectsArray = Array.isArray(defects) ? defects : (defects ? [defects] : []);
      return await this.service.markAsPassed(testIdOrKey, runOrExecutionKey, comment, defectsArray);
    } else {
      // TestRail expects string and no execution key
      const defectsString = Array.isArray(defects) ? defects.join(',') : defects;
      return await this.service.markAsPassed(testIdOrKey, comment, defectsString);
    }
  }

  /**
   * Find all tests that have a bug linked
   * @param {string} runOrExecutionKey - Run ID or Execution Key
   * @param {string} bugKey - Bug key
   */
  async findTestsWithBug(runOrExecutionKey, bugKey) {
    return await this.service.findTestsWithBug(runOrExecutionKey, bugKey);
  }

  /**
   * Get system name for display
   */
  getSystemName() {
    return this.system === 'xray' ? 'Xray' : 'TestRail';
  }

  /**
   * Get identifier label for display
   */
  getIdentifierLabel() {
    return this.system === 'xray' ? 'Test Execution' : 'Run';
  }

  /**
   * Get test identifier label for display
   */
  getTestIdentifierLabel() {
    return this.system === 'xray' ? 'Test Key' : 'Test ID';
  }

  /**
   * Get all tests (basic info)
   * @param {string} runOrExecutionKey - Run ID or Execution Key
   */
  async getTests(runOrExecutionKey) {
    return await this.service.getTests(runOrExecutionKey);
  }

  /**
   * Get test details
   * @param {string} testIdOrKey - Test ID or Key
   */
  async getTestDetails(testIdOrKey) {
    if (this.isXray) {
      return await this.service.getTestDetails(testIdOrKey);
    } else {
      return await this.service.getCase(testIdOrKey);
    }
  }

  /**
   * Get test results/runs
   * @param {string} testIdOrKey - Test ID or Key
   * @param {string} executionKey - Execution Key (Xray only)
   */
  async getTestResults(testIdOrKey, executionKey = null) {
    if (this.isXray) {
      if (!executionKey) {
        throw new Error('Execution key is required for Xray');
      }
      return await this.service.getTestRuns(testIdOrKey, executionKey);
    } else {
      return await this.service.getResults(testIdOrKey);
    }
  }

  /**
   * Xray-specific: Link issue to test
   * TestRail: No-op (uses defects field instead)
   */
  async linkIssue(testKey, bugKey, linkType = 'Blocks') {
    if (this.isXray) {
      return await this.service.linkIssue(testKey, bugKey, linkType);
    }
    // TestRail doesn't have separate link operation
    return null;
  }

  /**
   * Xray-specific: Unlink issue from test
   * TestRail: No-op (uses defects field instead)
   */
  async unlinkIssue(testKey, bugKey) {
    if (this.isXray) {
      return await this.service.unlinkIssue(testKey, bugKey);
    }
    // TestRail doesn't have separate unlink operation
    return null;
  }
}

module.exports = new TestManagementAdapter();
