const axios = require('axios');
const OpenAI = require('openai');
const config = require('./config');
const logger = require('./logger');

console.log('\n========================================');
console.log('Connection Test - JIRA-TestRail Service');
console.log('========================================\n');

// Track test results
const results = {
  jira: { status: 'pending', message: '' },
  testRail: { status: 'pending', message: '' },
  openAI: { status: 'pending', message: '' }
};

async function testJiraConnection() {
  console.log('🔄 Testing JIRA connection...');
  
  try {
    // Check config
    if (!config.jira.baseUrl || !config.jira.email || !config.jira.apiToken) {
      throw new Error('JIRA credentials not configured in .env');
    }

    // Test API call - get current user
    const response = await axios.get(
      `${config.jira.baseUrl}/rest/api/3/myself`,
      {
        auth: {
          username: config.jira.email,
          password: config.jira.apiToken
        }
      }
    );

    results.jira.status = 'success';
    results.jira.message = `Connected as: ${response.data.displayName} (${response.data.emailAddress})`;
    console.log(`✅ JIRA: ${results.jira.message}\n`);
  } catch (error) {
    results.jira.status = 'failed';
    
    if (error.response) {
      if (error.response.status === 401) {
        results.jira.message = 'Authentication failed - Check JIRA_EMAIL and JIRA_API_TOKEN';
      } else if (error.response.status === 404) {
        results.jira.message = 'Invalid JIRA_BASE_URL';
      } else {
        results.jira.message = `HTTP ${error.response.status}: ${error.response.statusText}`;
      }
    } else if (error.message.includes('not configured')) {
      results.jira.message = error.message;
    } else {
      results.jira.message = `Connection error: ${error.message}`;
    }
    
    console.log(`❌ JIRA: ${results.jira.message}\n`);
  }
}

async function testTestRailConnection() {
  console.log('🔄 Testing TestRail connection...');
  
  try {
    // Check config
    if (!config.testRail.baseUrl || !config.testRail.username || !config.testRail.password) {
      throw new Error('TestRail credentials not configured in .env');
    }

    // Test API call - get user info
    const response = await axios.get(
      `${config.testRail.baseUrl}/index.php?/api/v2/get_user_by_email&email=${config.testRail.username}`,
      {
        auth: {
          username: config.testRail.username,
          password: config.testRail.password
        }
      }
    );

    results.testRail.status = 'success';
    results.testRail.message = `Connected as: ${response.data.name || response.data.email}`;
    console.log(`✅ TestRail: ${results.testRail.message}\n`);
  } catch (error) {
    results.testRail.status = 'failed';
    
    if (error.response) {
      if (error.response.status === 401) {
        results.testRail.message = 'Authentication failed - Check TESTRAIL_USERNAME and TESTRAIL_PASSWORD';
      } else if (error.response.status === 404) {
        results.testRail.message = 'Invalid TESTRAIL_BASE_URL or user not found';
      } else {
        results.testRail.message = `HTTP ${error.response.status}: ${error.response.statusText}`;
      }
    } else if (error.message.includes('not configured')) {
      results.testRail.message = error.message;
    } else {
      results.testRail.message = `Connection error: ${error.message}`;
    }
    
    console.log(`❌ TestRail: ${results.testRail.message}\n`);
  }
}

async function testOpenAIConnection() {
  console.log('🔄 Testing OpenAI connection...');
  
  try {
    // Check config
    if (!config.openai.apiKey) {
      throw new Error('OpenAI API key not configured in .env');
    }

    const openai = new OpenAI({
      apiKey: config.openai.apiKey
    });

    // Test API call - simple completion
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'user', content: 'Respond with just "OK"' }
      ],
      max_tokens: 10
    });

    results.openAI.status = 'success';
    results.openAI.message = `Connected using model: ${config.openai.model}`;
    console.log(`✅ OpenAI: ${results.openAI.message}\n`);
  } catch (error) {
    results.openAI.status = 'failed';
    
    if (error.status === 401) {
      results.openAI.message = 'Authentication failed - Check OPENAI_API_KEY';
    } else if (error.status === 404) {
      results.openAI.message = `Model not found or not accessible: ${config.openai.model}`;
    } else if (error.status === 429) {
      results.openAI.message = 'Rate limit exceeded or quota exceeded';
    } else if (error.message.includes('not configured')) {
      results.openAI.message = error.message;
    } else {
      results.openAI.message = `Error: ${error.message}`;
    }
    
    console.log(`❌ OpenAI: ${results.openAI.message}\n`);
  }
}

async function runTests() {
  console.log('Testing connections to all services...\n');
  
  // Run tests sequentially
  await testJiraConnection();
  await testTestRailConnection();
  await testOpenAIConnection();
  
  // Summary
  console.log('========================================');
  console.log('Summary');
  console.log('========================================\n');
  
  const allSuccess = Object.values(results).every(r => r.status === 'success');
  
  console.log(`JIRA:     ${results.jira.status === 'success' ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`TestRail: ${results.testRail.status === 'success' ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`OpenAI:   ${results.openAI.status === 'success' ? '✅ PASS' : '❌ FAIL'}`);
  
  console.log('\n========================================\n');
  
  if (allSuccess) {
    console.log('🎉 All connections successful! You can now start the service.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some connections failed. Please check your .env configuration.\n');
    console.log('📝 Configuration file: .env');
    console.log('📋 Example file: .env.example\n');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Unexpected error during testing:', error);
  process.exit(1);
});
