const axios = require('axios');
const config = require('../config');
const logger = require('../logger');
const cacheService = require('./cacheService');

/**
 * TestRail Service - Handles all TestRail API interactions
 */
class TestRailService {
  constructor() {
    this.baseUrl = config.testRail.baseUrl;
    this.auth = {
      username: config.testRail.username,
      password: config.testRail.password
    };
  }

  /**
   * Get section details
   * @param {string} sectionId - TestRail Section ID
   * @returns {Promise<Object>} Section data
   */
  async getSection(sectionId) {
    try {
      logger.info(`Fetching TestRail section: ${sectionId}`);
      const response = await axios.get(
        `${this.baseUrl}/index.php?/api/v2/get_section/${sectionId}`,
        { auth: this.auth }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch TestRail section ${sectionId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all sections in a project/suite
   * @param {string} projectId - TestRail Project ID
   * @param {string} suiteId - TestRail Suite ID (optional)
   * @returns {Promise<Array>} Array of sections
   */
  async getSections(projectId, suiteId = null) {
    try {
      let url = `${this.baseUrl}/index.php?/api/v2/get_sections/${projectId}`;
      if (suiteId) {
        url += `&suite_id=${suiteId}`;
      }
      const response = await axios.get(url, { auth: this.auth });
      return response.data.sections || response.data || [];
    } catch (error) {
      logger.error(`Failed to fetch sections: ${error.message}`);
      return [];
    }
  }

  /**
   * Get test run details
   * @param {string} runId - TestRail Run ID
   * @returns {Promise<Object>} Run data
   */
  async getRun(runId) {
    try {
      logger.info(`Fetching TestRail run: ${runId}`);
      const response = await axios.get(
        `${this.baseUrl}/index.php?/api/v2/get_run/${runId}`,
        { auth: this.auth }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch TestRail run ${runId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all tests in a run
   * @param {string} runId - TestRail Run ID
   * @returns {Promise<Array>} Array of tests
   */
  async getTests(runId) {
    try {
      logger.info(`Fetching tests from run: ${runId}`);
      const response = await axios.get(
        `${this.baseUrl}/index.php?/api/v2/get_tests/${runId}`,
        { auth: this.auth }
      );
      return response.data.tests || response.data;
    } catch (error) {
      logger.error(`Failed to fetch tests from run ${runId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get test results for a test
   * @param {string} testId - TestRail Test ID
   * @returns {Promise<Array>} Array of results
   */
  async getResults(testId) {
    try {
      logger.info(`Fetching results for test: ${testId}`);
      const response = await axios.get(
        `${this.baseUrl}/index.php?/api/v2/get_results/${testId}`,
        { auth: this.auth }
      );
      return response.data.results || response.data;
    } catch (error) {
      logger.error(`Failed to fetch results for test ${testId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get test case details including custom fields
   * @param {string} testId - TestRail Test ID
   * @returns {Promise<Object>} Test details
   */
  async getTestDetails(testId) {
    try {
      logger.info(`Fetching test details: ${testId}`);
      const response = await axios.get(
        `${this.baseUrl}/index.php?/api/v2/get_test/${testId}`,
        { auth: this.auth }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch test details ${testId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a bug is already linked to a test
   * @param {string} testId - TestRail Test ID
   * @param {string} bugId - Bug ID to check
   * @returns {Promise<boolean>} True if bug is already linked
   */
  async isBugAlreadyLinked(testId, bugId) {
    try {
      const results = await this.getResults(testId);
      
      // Check if any result has this bug in the defects field
      for (const result of results) {
        if (result.defects) {
          const defects = result.defects.split(',').map(d => d.trim());
          if (defects.includes(bugId)) {
            logger.info(`Bug ${bugId} is already linked to test ${testId}`);
            return true;
          }
        }
      }
      
      logger.info(`Bug ${bugId} is not linked to test ${testId}`);
      return false;
    } catch (error) {
      logger.error(`Failed to check bug link: ${error.message}`);
      return false;
    }
  }

  /**
   * Find all test IDs that have a specific bug linked in their results
   * This is the most reliable way to find linked tests, as it checks actual TestRail data
   * @param {string} runId - TestRail Run ID
   * @param {string} bugId - JIRA Bug ID to search for
   * @returns {Promise<Array>} Array of test IDs that have this bug linked
   */
  async findTestsWithBug(runId, bugId) {
    try {
      logger.info(`Searching TestRail run ${runId} for tests with bug ${bugId}`);
      
      // Get all tests in the run
      const tests = await this.getTests(runId);
      const testIdsWithBug = [];
      
      // Check each test's results for the bug
      for (const test of tests) {
        const results = await this.getResults(test.id);
        
        for (const result of results) {
          if (result.defects) {
            const defects = result.defects.split(',').map(d => d.trim());
            if (defects.includes(bugId)) {
              testIdsWithBug.push(test.id);
              logger.info(`Found bug ${bugId} in test ${test.id} (result ${result.id})`);
              break; // No need to check more results for this test
            }
          }
        }
      }
      
      logger.info(`Found ${testIdsWithBug.length} test(s) with bug ${bugId}`);
      return testIdsWithBug;
    } catch (error) {
      logger.error(`Failed to find tests with bug ${bugId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get test case details
   * @param {string} caseId - TestRail Case ID
   * @returns {Promise<Object>} Case data
   */
  async getCase(caseId) {
    try {
      logger.info(`Fetching TestRail case: ${caseId}`);
      const response = await axios.get(
        `${this.baseUrl}/index.php?/api/v2/get_case/${caseId}`,
        { auth: this.auth }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch TestRail case ${caseId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get test results for a test
   * @param {string} testId - TestRail Test ID
   * @returns {Promise<Array>} Array of test results (sorted by most recent first)
   */
  async getTestResults(testId) {
    try {
      logger.info(`Fetching results for test: ${testId}`);
      const response = await axios.get(
        `${this.baseUrl}/index.php?/api/v2/get_results/${testId}`,
        { auth: this.auth }
      );
      return response.data.results || response.data;
    } catch (error) {
      logger.error(`Failed to fetch results for test ${testId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update test result status
   * @param {string} testId - TestRail Test ID (from run)
   * @param {number} statusId - Status ID (1=Passed, 5=Failed, etc.)
   * @param {string} comment - Optional comment
   * @param {string} defects - Optional defects/bug IDs (comma-separated)
   * @returns {Promise<Object>} Result data
   */
  async addResult(testId, statusId, comment = '', defects = '') {
    try {
      if (config.server.dryRunMode) {
        logger.info(`[DRY RUN] Would update test ${testId} to status ${statusId}`);
        return { dry_run: true, test_id: testId, status_id: statusId, defects: defects };
      }

      logger.info(`Updating TestRail test ${testId} to status ${statusId}`);
      
      const payload = {
        status_id: statusId,
        comment: comment
      };
      
      // Add defects field if provided (pass empty string to clear)
      if (defects !== undefined && defects !== null) {
        payload.defects = defects;
      }
      
      const response = await axios.post(
        `${this.baseUrl}/index.php?/api/v2/add_result/${testId}`,
        payload,
        { auth: this.auth }
      );
      
      logger.info(`Test ${testId} updated successfully`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to update test ${testId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing test result
   * @param {string} resultId - TestRail Result ID
   * @param {string} defects - Updated defects/bug IDs (comma-separated)
   * @param {string} comment - Optional comment
   * @returns {Promise<Object>} Result data
   */
  /**
   * Find test case by title (fuzzy match)
   * @param {string} runId - TestRail Run ID
   * @param {string} title - Test case title to search for
   * @returns {Promise<Object|null>} Matching test or null
   */
  async findTestByTitle(runId, title) {
    try {
      const tests = await this.getTests(runId);
      const normalizedTitle = title.toLowerCase().trim();

      // Exact match first
      let match = tests.find(t => t.title.toLowerCase().trim() === normalizedTitle);
      if (match) return match;

      // Partial match
      match = tests.find(t => t.title.toLowerCase().includes(normalizedTitle));
      if (match) return match;

      // Reverse partial match
      match = tests.find(t => normalizedTitle.includes(t.title.toLowerCase()));
      return match || null;
    } catch (error) {
      logger.error(`Failed to find test by title: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all test cases with details for AI matching (with caching)
   * @param {string} runId - TestRail Run ID
   * @param {boolean} forceRefresh - Force cache refresh (optional)
   * @returns {Promise<Array>} Array of test cases with full details
   */
  async getTestsWithDetails(runId, forceRefresh = false) {
    try {
      // Check cache first
      const cacheKey = cacheService.constructor.getTestsCacheKey(runId);
      
      if (!forceRefresh) {
        const cachedData = await cacheService.get(cacheKey);
        if (cachedData) {
          logger.info(`Using cached test cases for run ${runId} (${cachedData.length} tests)`);
          return cachedData;
        }
      }

      logger.info(`Fetching fresh test cases from TestRail for run ${runId}`);
      const tests = await this.getTests(runId);
      const testsWithDetails = [];

      // Fetch case details for each test (with rate limiting)
      for (const test of tests) {
        try {
          const caseDetails = await this.getCase(test.case_id);
          testsWithDetails.push({
            test_id: test.id,
            case_id: test.case_id,
            title: test.title,
            section_id: caseDetails.section_id,
            custom_steps_separated: caseDetails.custom_steps_separated || [],
            custom_preconds: caseDetails.custom_preconds || '',
            custom_expected: caseDetails.custom_expected || '',
            refs: caseDetails.refs || ''
          });
          
          // Rate limiting: configurable delay to avoid 429 errors
          await new Promise(resolve => setTimeout(resolve, config.testRail.rateLimitMs));
        } catch (error) {
          logger.warn(`Failed to fetch details for case ${test.case_id}: ${error.message}`);
          // Add test without full details
          testsWithDetails.push({
            test_id: test.id,
            case_id: test.case_id,
            title: test.title,
            section_id: null
          });
        }
      }

      // Cache the results for future use
      await cacheService.set(cacheKey, testsWithDetails);
      logger.info(`Cached ${testsWithDetails.length} test cases for run ${runId}`);

      return testsWithDetails;
    } catch (error) {
      logger.error(`Failed to get tests with details: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark test as Failed
   * @param {string} testId - TestRail Test ID
   * @param {string} comment - Failure comment
   * @param {string} defects - Bug IDs (comma-separated)
   */
  async markAsFailed(testId, comment = '', defects = '') {
    return this.addResult(testId, config.testRail.statusFailed, comment, defects);
  }

  /**
   * Mark test as Passed
   * @param {string} testId - TestRail Test ID
   * @param {string} comment - Pass comment
   * @param {string} defects - Bug IDs (comma-separated)
   */
  async markAsPassed(testId, comment = '', defects = '') {
    return this.addResult(testId, config.testRail.statusPassed, comment, defects);
  }
}

module.exports = new TestRailService();
