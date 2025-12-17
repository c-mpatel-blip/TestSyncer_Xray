require('dotenv').config();

module.exports = {
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    runIdCustomField: process.env.JIRA_TESTRAIL_RUN_FIELD || process.env.JIRA_RUN_ID_CUSTOM_FIELD,
    webhookSecret: process.env.JIRA_WEBHOOK_SECRET,
    statusOpen: process.env.STATUS_OPEN || 'Open',
    statusReadyForDev: process.env.STATUS_READY_FOR_DEV || 'Ready for Dev',
    statusDeployedToQA: process.env.STATUS_DEPLOYED_TO_QA || 'Deployed to QA',
    statusQueuedMerged: process.env.STATUS_QUEUED_MERGED || 'Queued Merged to Release'
  },
  testRail: {
    baseUrl: process.env.TESTRAIL_BASE_URL,
    username: process.env.TESTRAIL_USERNAME,
    password: process.env.TESTRAIL_PASSWORD || process.env.TESTRAIL_API_KEY,
    apiKey: process.env.TESTRAIL_API_KEY,
    rateLimitMs: parseInt(process.env.TESTRAIL_RATE_LIMIT_MS) || 250,
    statusPassed: parseInt(process.env.TESTRAIL_STATUS_PASSED) || 1,
    statusFailed: parseInt(process.env.TESTRAIL_STATUS_FAILED) || 5,
    statusRetest: parseInt(process.env.TESTRAIL_STATUS_RETEST) || 4
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    confidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.7,
    learningEnabled: process.env.ENABLE_AI_LEARNING !== 'false'
  },
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    dryRunMode: process.env.DRY_RUN_MODE === 'true',
    webhookSecret: process.env.WEBHOOK_SECRET || process.env.JIRA_WEBHOOK_SECRET
  }
};
