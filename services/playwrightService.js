const { chromium } = require('playwright');
const config = require('../config');
const logger = require('../logger');

/**
 * Playwright Service - Automates TestRail UI interactions
 * Used for operations not supported by the API (like editing existing results)
 */
class PlaywrightService {
  constructor() {
    this.baseUrl = config.testRail.baseUrl;
    this.username = config.testRail.username;
    this.password = config.testRail.password;
    this.browser = null;
    this.page = null;
  }

  /**
   * Initialize browser and login to TestRail
   */
  async init() {
    if (this.page) return; // Already initialized
    
    try {
      logger.info(`[Playwright] Launching browser in headless mode`);
      this.browser = await chromium.launch({ 
        headless: true,
        timeout: 60000
      });
      const context = await this.browser.newContext();
      this.page = await context.newPage();
      
      // Set default timeout to 60 seconds
      this.page.setDefaultTimeout(60000);
      
      // Login to TestRail
      logger.info(`[Playwright] Navigating to TestRail login page`);
      await this.page.goto(`${this.baseUrl}/index.php?/auth/login`, { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      logger.info(`[Playwright] Filling login credentials`);
      await this.page.fill('input[name="name"]', this.username);
      await this.page.fill('input[name="password"]', this.password);
      
      logger.info(`[Playwright] Clicking login button`);
      // Try multiple possible selectors for the login button
      const loginButton = await this.page.locator('button[type="submit"], input[type="submit"], button:has-text("Log In"), .button-positive, #button_primary').first();
      await loginButton.click();
      
      // Wait for navigation after login - be more flexible
      logger.info(`[Playwright] Waiting for successful login`);
      await this.page.waitForURL('**/index.php?**', { timeout: 60000 });
      
      logger.info(`[Playwright] Logged in successfully to ${this.page.url()}`);
    } catch (error) {
      logger.error(`[Playwright] Failed to initialize: ${error.message}`);
      await this.close();
      throw error;
    }
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Remove a bug from a test result's defects field
   * @param {string} testId - TestRail Test ID
   * @param {string} resultId - TestRail Result ID  
   * @param {string} bugId - Bug ID to remove
   * @returns {Promise<boolean>} Success status
   */
  async removeBugFromResult(testId, resultId, bugId) {
    try {
      await this.init();
      
      logger.info(`[Playwright] Navigating to test ${testId}`);
      const testUrl = `${this.baseUrl}/index.php?/tests/view/${testId}`;
      await this.page.goto(testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });
      
      logger.info(`[Playwright] Current URL: ${this.page.url()}`);
      logger.info(`[Playwright] Page title: ${await this.page.title()}`);
      
      // Wait for the test results container to load
      logger.info(`[Playwright] Waiting for test results container to load`);
      await this.page.waitForSelector('[data-testid="testResultContainer"], .change-container', { timeout: 10000 });
      
      // Wait a bit for dynamic content to fully render
      await this.page.waitForTimeout(1000);
      
      // Log all test result containers
      const allChangeDivs = await this.page.locator('div.change[id^="testChange-"]').all();
      logger.info(`[Playwright] Found ${allChangeDivs.length} test result containers`);
      for (const div of allChangeDivs) {
        const divId = await div.getAttribute('id');
        logger.info(`[Playwright]   - Container: ${divId}`);
      }
      
      // Find the specific result container
      const resultContainer = await this.page.locator(`#testChange-${resultId}`);
      const containerExists = await resultContainer.count() > 0;
      
      if (!containerExists) {
        logger.warn(`[Playwright] Result container #testChange-${resultId} not found`);
        // Take a screenshot for debugging
        const screenshotPath = `test-${testId}-notfound-${Date.now()}.png`;
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        logger.info(`[Playwright] Screenshot saved to ${screenshotPath}`);
        logger.info(`[Playwright] Keeping browser open for 10 seconds for inspection...`);
        await this.page.waitForTimeout(10000);
        return false;
      }
      
      logger.info(`[Playwright] Found result container #testChange-${resultId}`);
      
      // Find the edit link within this specific container
      // <a class="link" href="javascript:void(0)" onclick="this.blur(); App.Tests.editResult(7, 50125094, 5); return false;">Edit</a>
      const editButton = await resultContainer.locator('a.link:has-text("Edit")');
      
      if (await editButton.count() === 0) {
        logger.warn(`[Playwright] Edit link not found in container #testChange-${resultId}`);
        logger.info(`[Playwright] Keeping browser open for 10 seconds for inspection...`);
        await this.page.waitForTimeout(10000);
        return false;
      }
      
      logger.info(`[Playwright] Found Edit link, clicking...`);
      await editButton.click();
      logger.info(`[Playwright] Waiting for edit dialog to appear...`);
      
      // Wait for the edit dialog to appear
      await this.page.waitForSelector('#addResultDialog, [data-testid="addResultDialog"]', { timeout: 10000 });
      logger.info(`[Playwright] Edit dialog appeared`);
      await this.page.waitForTimeout(1000);
      
      // Find the defects field (it's a contenteditable div)
      const defectsField = await this.page.locator('#addResultDefects, [data-testid="addResultDefects"]');
      
      // Look for the specific bug tag and its remove button
      // Bug tags are in: <span class="search-refs-selector--tag">ROLL-1424</span>
      logger.info(`[Playwright] Looking for bug tag ${bugId}`);
      const bugTag = await this.page.locator(`.search-refs-selector--tag:has-text("${bugId}")`);
      const tagExists = await bugTag.count() > 0;
      
      if (!tagExists) {
        logger.warn(`[Playwright] Bug tag ${bugId} not found in defects field`);
        
        // Log what tags are present
        const allTags = await this.page.locator('.search-refs-selector--tag').allTextContents();
        logger.info(`[Playwright] Found tags: ${allTags.join(', ')}`);
        
        // Close dialog and return
        await this.page.locator('#addResultClose, .dialog-action-close').click();
        await this.page.waitForTimeout(1000);
        return false;
      }
      
      logger.info(`[Playwright] Found bug tag ${bugId}, looking for remove button`);
      
      // Find the remove button for this specific tag (it's the next sibling button)
      const tagWrap = await this.page.locator(`.search-refs-selector--tag-wrap:has(.search-refs-selector--tag:has-text("${bugId}"))`);
      const removeButton = await tagWrap.locator('.search-refs-selector--tag-remove');
      
      if (await removeButton.count() === 0) {
        logger.warn(`[Playwright] Remove button not found for bug ${bugId}`);
        await this.page.locator('#addResultClose, .dialog-action-close').click();
        await this.page.waitForTimeout(1000);
        return false;
      }
      
      logger.info(`[Playwright] Clicking remove button for bug ${bugId}`);
      await removeButton.click();
      await this.page.waitForTimeout(500);
      
      // Click the submit button to save changes (use specific ID to avoid disabled button)
      logger.info(`[Playwright] Saving changes`);
      const submitButton = await this.page.locator('#addResultSubmit');
      await submitButton.click();
      
      // Wait for dialog to close
      logger.info(`[Playwright] Waiting for dialog to close`);
      await this.page.waitForSelector('#addResultDialog', { state: 'hidden', timeout: 10000 }).catch(() => {
        logger.warn(`[Playwright] Dialog did not close within timeout`);
      });
      
      await this.page.waitForTimeout(2000);
      
      logger.info(`[Playwright] Successfully removed bug ${bugId} from result ${resultId}`);
      return true;
      
    } catch (error) {
      logger.error(`[Playwright] Failed to remove bug from result: ${error.message}`);
      return false;
    }
  }

  /**
   * Remove a bug from all results of a test
   * @param {string} testId - TestRail Test ID
   * @param {string} bugId - Bug ID to remove
   * @param {Array} results - Test results array from getResults()
   * @returns {Promise<number>} Number of results updated
   */
  async removeBugFromTest(testId, bugId, results) {
    try {
      logger.info(`[Playwright] Removing bug ${bugId} from test ${testId}`);
      
      // Find all results that have this bug
      const resultsWithBug = results.filter(result => {
        if (!result.defects) return false;
        const bugs = result.defects.split(',').map(d => d.trim());
        return bugs.includes(bugId);
      });
      
      if (resultsWithBug.length === 0) {
        logger.info(`[Playwright] Bug ${bugId} not found in any result for test ${testId}`);
        return 0;
      }
      
      logger.info(`[Playwright] Found ${resultsWithBug.length} result(s) with bug ${bugId}`);
      
      let updatedCount = 0;
      for (const result of resultsWithBug) {
        const success = await this.removeBugFromResult(testId, result.id, bugId);
        if (success) {
          updatedCount++;
        }
      }
      
      // Close browser after we're done
      await this.close();
      
      logger.info(`[Playwright] Updated ${updatedCount} result(s) for test ${testId}`);
      return updatedCount;
      
    } catch (error) {
      logger.error(`[Playwright] Failed to remove bug from test: ${error.message}`);
      await this.close();
      return 0;
    }
  }
}

module.exports = new PlaywrightService();
