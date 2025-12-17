const OpenAI = require('openai');
const config = require('../config');
const logger = require('../logger');
const learningService = require('./learningService');

/**
 * AI Service - Uses OpenAI to match bugs to test cases
 */
class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.model;
  }

  /**
   * Match a bug to the most relevant test case using AI
   * @param {Object} bugData - Bug information (summary, description)
   * @param {Array} testCases - Array of test cases from TestRail
   * @returns {Promise<Object>} Match result with test_id, confidence, and reasoning
   */
  async matchBugToTestCase(bugData, testCases) {
    try {
      logger.info(`AI matching bug "${bugData.summary}" against ${testCases.length} test cases`);

      // Check learning data first
      const learnedMatch = await learningService.findSimilarMatch(bugData);
      if (learnedMatch) {
        logger.info(`Found similar match in learning data with confidence ${learnedMatch.confidence}`);
        return {
          test_id: learnedMatch.test_id,
          case_id: learnedMatch.case_id,
          title: learnedMatch.title,
          confidence: learnedMatch.confidence,
          reasoning: `Learned from previous correction: ${learnedMatch.reasoning}`,
          learned: true
        };
      }

      // Prepare test cases for AI
      const testCasesFormatted = testCases.map((tc, index) => ({
        index: index,
        test_id: tc.test_id,
        case_id: tc.case_id,
        title: tc.title,
        steps: tc.custom_steps_separated || [],
        preconditions: tc.custom_preconds || '',
        expected: tc.custom_expected || ''
      }));

      // Create AI prompt
      const prompt = this.createMatchingPrompt(bugData, testCasesFormatted);

      // Call OpenAI
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert in 508c accessibility testing. Your task is to match bug reports to the most relevant test cases based on the bug description and test case details. Focus on identifying which test case would have caught this bug during testing.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      logger.info(`AI match result: Test ${result.test_id} with confidence ${result.confidence}`);

      // Store match for learning
      await learningService.storeMatch({
        bug: bugData,
        match: result,
        timestamp: new Date().toISOString()
      });

      return result;
    } catch (error) {
      logger.error(`AI matching failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create the AI prompt for bug-to-test-case matching
   * @param {Object} bugData - Bug information
   * @param {Array} testCases - Formatted test cases
   * @returns {string} Prompt text
   */
  createMatchingPrompt(bugData, testCases) {
    return `
I need you to match this accessibility bug to the most relevant test case.

**Bug Details:**
Summary: ${bugData.summary}
Description: ${bugData.description || 'No description provided'}

**Test Cases:**
${testCases.map(tc => `
[${tc.index}] Test ID: ${tc.test_id} | Case ID: ${tc.case_id}
Title: ${tc.title}
Steps: ${JSON.stringify(tc.steps).substring(0, 500)}
Preconditions: ${tc.preconditions}
Expected Result: ${tc.expected}
---
`).join('\n')}

**Instructions:**
1. Analyze the bug summary and description
2. Compare against each test case's title, steps, and expected results
3. Identify which test case would have detected this bug during execution
4. Consider 508c accessibility testing patterns and terminology
5. Provide a confidence score (0.0 to 1.0)

**Response Format (JSON):**
{
  "test_id": "<the test_id from the best matching test case>",
  "case_id": "<the case_id from the best matching test case>",
  "title": "<the title of the matching test case>",
  "confidence": <float between 0.0 and 1.0>,
  "reasoning": "<brief explanation of why this test case matches the bug>"
}

Respond with ONLY the JSON object, no additional text.
`;
  }

  /**
   * Validate AI match confidence against threshold
   * @param {Object} matchResult - AI match result
   * @returns {boolean} True if confidence meets threshold
   */
  isConfidentMatch(matchResult) {
    return matchResult.confidence >= config.openai.confidenceThreshold;
  }
}

module.exports = new AIService();
