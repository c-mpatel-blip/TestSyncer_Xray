const express = require('express');
const workflowService = require('./services/workflowService');
const learningService = require('./services/learningService');
const cacheService = require('./services/cacheService');
const jiraService = require('./services/jiraService');
const testRailService = require('./services/testRailService');
const config = require('./config');
const logger = require('./logger');

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'JIRA-TestRail Integration',
    dryRunMode: config.server.dryRunMode
  });
});

// Statistics endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await learningService.getStatistics();
    res.json(stats);
  } catch (error) {
    logger.error(`Failed to get statistics: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// JIRA Webhook endpoint
app.post('/webhook/jira', async (req, res) => {
  try {
    logger.info('Received JIRA webhook');
    
    // Validate webhook secret if configured
    if (config.server.webhookSecret) {
      const receivedSecret = req.headers['x-webhook-secret'];
      if (receivedSecret !== config.server.webhookSecret) {
        logger.warn('Invalid webhook secret');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const webhookEvent = req.body;
    const eventType = webhookEvent.webhookEvent;

    logger.info(`Webhook event type: ${eventType}`);

    // Respond quickly to avoid timeout
    res.status(202).json({ message: 'Webhook received, processing...' });

    // Process webhook asynchronously
    processWebhook(webhookEvent, eventType);

  } catch (error) {
    logger.error(`Webhook processing error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger endpoint - Bug Created workflow
app.post('/api/trigger/bug-created', async (req, res) => {
  try {
    const { issueKey } = req.body;
    
    if (!issueKey) {
      return res.status(400).json({ error: 'issueKey is required' });
    }

    logger.info(`Manual trigger: Bug Created for ${issueKey}`);
    const result = await workflowService.handleBugCreated(issueKey);
    
    res.json(result);
  } catch (error) {
    logger.error(`Manual trigger failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger endpoint - Bug Resolved workflow
app.post('/api/trigger/bug-resolved', async (req, res) => {
  try {
    const { issueKey } = req.body;
    
    if (!issueKey) {
      return res.status(400).json({ error: 'issueKey is required' });
    }

    logger.info(`Manual trigger: Bug Resolved for ${issueKey}`);
    const result = await workflowService.handleBugResolved(issueKey);
    
    res.json(result);
  } catch (error) {
    logger.error(`Manual trigger failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger endpoint - Process correction
app.post('/api/trigger/correction', async (req, res) => {
  try {
    const { issueKey, comment } = req.body;
    
    if (!issueKey || !comment) {
      return res.status(400).json({ error: 'issueKey and comment are required' });
    }

    logger.info(`Manual trigger: Correction for ${issueKey}`);
    const result = await workflowService.handleCorrection(issueKey, comment);
    
    res.json(result);
  } catch (error) {
    logger.error(`Manual trigger failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Cache management endpoints
app.get('/api/cache/stats', async (req, res) => {
  try {
    const cacheService = require('./services/cacheService');
    const stats = cacheService.getStats();
    res.json(stats);
  } catch (error) {
    logger.error(`Failed to get cache stats: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cache/clear', async (req, res) => {
  try {
    const cacheService = require('./services/cacheService');
    const { runId } = req.body;
    
    if (runId) {
      // Clear specific run cache
      const cacheKey = cacheService.constructor.getTestsCacheKey(runId);
      await cacheService.delete(cacheKey);
      res.json({ success: true, message: `Cache cleared for run ${runId}` });
    } else {
      // Clear all cache
      await cacheService.clearAll();
      res.json({ success: true, message: 'All cache cleared' });
    }
  } catch (error) {
    logger.error(`Failed to clear cache: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/cache/refresh', async (req, res) => {
  try {
    const { runId } = req.body;
    
    if (!runId) {
      return res.status(400).json({ error: 'runId is required' });
    }

    logger.info(`Refreshing cache for run ${runId}`);
    const testRailService = require('./services/testRailService');
    const tests = await testRailService.getTestsWithDetails(runId, true); // Force refresh
    
    res.json({ 
      success: true, 
      message: `Cache refreshed for run ${runId}`,
      testCount: tests.length
    });
  } catch (error) {
    logger.error(`Failed to refresh cache: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint - Find Run ID for an issue
app.get('/api/test/find-run/:issueKey', async (req, res) => {
  try {
    const { issueKey } = req.params;
    const runId = await jiraService.findRunId(issueKey);
    
    res.json({ 
      issueKey, 
      runId,
      found: !!runId
    });
  } catch (error) {
    logger.error(`Test endpoint failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint - Get test cases for a run
app.get('/api/test/run/:runId/tests', async (req, res) => {
  try {
    const { runId } = req.params;
    const tests = await testRailService.getTests(runId);
    
    res.json({ 
      runId, 
      count: tests.length,
      tests: tests.slice(0, 10) // Return first 10 for preview
    });
  } catch (error) {
    logger.error(`Test endpoint failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process JIRA webhook asynchronously
 * @param {Object} webhookEvent - Webhook payload
 * @param {string} eventType - Event type
 */
async function processWebhook(webhookEvent, eventType) {
  try {
    // Handle issue updated event
    if (eventType === 'jira:issue_updated') {
      const issue = webhookEvent.issue;
      const issueKey = issue.key;
      const changelog = webhookEvent.changelog;

      // Check if status changed
      const statusChange = changelog.items.find(item => item.field === 'status');
      
      if (statusChange) {
        const newStatus = statusChange.toString;
        logger.info(`Status changed to: ${newStatus}`);

        // Bug Created workflow
        if (newStatus === config.jira.statusReadyForDev) {
          logger.info(`Triggering Bug Created workflow for ${issueKey}`);
          await workflowService.handleBugCreated(issueKey);
        }

        // Bug Resolved workflow
        if (newStatus === config.jira.statusQueuedMerged) {
          logger.info(`Triggering Bug Resolved workflow for ${issueKey}`);
          await workflowService.handleBugResolved(issueKey);
        }
      }
    }

    // Handle comment added event
    if (eventType === 'comment_created' || eventType === 'jira:issue_updated') {
      const comment = webhookEvent.comment;
      if (comment) {
        const commentText = jiraService.extractTextFromComment(comment.body);
        
        // Check for correction format
        if (commentText.includes('CORRECT:')) {
          const issueKey = webhookEvent.issue.key;
          logger.info(`Detected correction comment on ${issueKey}`);
          await workflowService.handleCorrection(issueKey, commentText);
        }
      }
    }

  } catch (error) {
    logger.error(`Async webhook processing failed: ${error.message}`);
  }
}

// Initialize services on startup
async function initializeServices() {
  await learningService.initialize();
  logger.info('Learning service initialized');
  
  await cacheService.initialize();
  logger.info('Cache service initialized');
}

initializeServices().catch(error => {
  logger.error(`Failed to initialize services: ${error.message}`);
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  logger.info(`=================================================`);
  logger.info(`JIRA-TestRail Integration Service`);
  logger.info(`=================================================`);
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Mode: ${config.server.dryRunMode ? 'DRY RUN' : 'PRODUCTION'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Statistics: http://localhost:${PORT}/api/stats`);
  logger.info(`Cache stats: http://localhost:${PORT}/api/cache/stats`);
  logger.info(`=================================================`);
});

module.exports = app;
