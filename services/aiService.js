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
   * Match a bug to the most relevant test case(s) using AI
   * @param {Object} bugData - Bug information (summary, description)
   * @param {Array} testCases - Array of test cases from TestRail
   * @returns {Promise<Object|Array>} Match result(s) with test_id, confidence, and reasoning
   */
  async matchBugToTestCase(bugData, testCases) {
    try {
      logger.info(`AI matching bug "${bugData.summary}" against ${testCases.length} test cases`);

      // Check learning data
      if (!config.openai.enableMultiMatch) {
        // Single match mode - use existing learning logic
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
      } else {
        // Multi-match mode - get multiple learned matches if available
        const learnedMatches = await learningService.findSimilarMatches(bugData);
        if (learnedMatches.length > 0) {
          logger.info(`Found ${learnedMatches.length} learned matches from similar bugs`);
          // Verify all learned matches exist in current test cases
          const validLearnedMatches = learnedMatches.filter(lm => 
            testCases.some(tc => tc.test_id.toString() === lm.test_id.toString())
          );
          
          if (validLearnedMatches.length === learnedMatches.length) {
            // All learned matches are valid, use them
            logger.info(`All ${validLearnedMatches.length} learned matches are valid, using learned results`);
            return validLearnedMatches;
          } else if (validLearnedMatches.length > 0) {
            // Some learned matches are valid, but not all - still use AI for full analysis
            logger.info(`Only ${validLearnedMatches.length}/${learnedMatches.length} learned matches are valid, using AI for complete analysis`);
          } else {
            logger.info(`No learned matches are valid in this run, using AI`);
          }
        }
      }      // Prepare test cases for AI
      logger.info(`Sending ${testCases.length} test cases to AI`);
      
      // Log a few examples with their IDs for debugging
      if (testCases.length > 0) {
        const examples = testCases.slice(0, 3).map(tc => 
          `"${tc.title}" (Test ID: ${tc.test_id}, Case ID: C${tc.case_id})`
        );
        logger.info(`Sample test cases: ${examples.join(' | ')}`);
      }
      
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

      // Determine system prompt based on multi-match mode
      const enableMultiMatch = config.openai.enableMultiMatch;
      const systemPrompt = enableMultiMatch
        ? 'You are an expert in 508c accessibility testing. For each UNIQUE test case that would fail, return it ONCE. If multiple issues in the bug would cause the SAME test case to fail, group them together and return that test case only once with all issues in the reasoning. Match based on: 1) Test case title testing that specific issue type, 2) Bug description details. NEVER match a focus issue to a page title test or vice versa.'
        : 'You are an expert in 508c accessibility testing. Match based on: 1) Issue type alignment (focus→focus, title→title, form→form, etc.), 2) Test case title/steps testing that specific issue, 3) Bug description details. Focus on which test case would have caught this specific bug type during testing.';

      logger.info(`Calling OpenAI with ${enableMultiMatch ? 'multi-match' : 'single-match'} mode`);
      const startTime = Date.now();

      // Call OpenAI with timeout
      const response = await Promise.race([
        this.openai.chat.completions.create({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('OpenAI API timeout after 120 seconds')), 120000)
        )
      ]);
      
      const elapsed = Date.now() - startTime;
      logger.info(`OpenAI responded in ${elapsed}ms`);

      const result = JSON.parse(response.choices[0].message.content);
      
      // Validate result structure and test_id existence
      const validateMatch = (match, testCases) => {
        if (!match.test_id || !match.case_id) {
          logger.warn('AI returned match without test_id or case_id');
          return false;
        }
        
        // Verify test_id exists in provided test cases
        const testExists = testCases.some(tc => tc.test_id.toString() === match.test_id.toString());
        if (!testExists) {
          logger.warn(`AI returned test_id ${match.test_id} which doesn't exist in the test cases list`);
          return false;
        }
        
        return true;
      };
      
      // Check if multi-match is enabled and result has matches array
      if (config.openai.enableMultiMatch && result.matches && Array.isArray(result.matches)) {
        // Log what AI returned
        logger.info(`AI returned ${result.matches.length} matches:`);
        result.matches.forEach(m => {
          logger.info(`  - Test ID: ${m.test_id}, Case ID: ${m.case_id}, Title: "${m.title}", Confidence: ${m.confidence}`);
        });
        
        // Validate and filter matches
        const validMatches = result.matches.filter(m => {
          const isValid = validateMatch(m, testCases);
          const meetsThreshold = m.confidence >= config.openai.multiMatchThreshold;
          if (!isValid) {
            logger.warn(`Invalid match filtered out: Test ID ${m.test_id}, Title: "${m.title}"`);
          }
          if (isValid && !meetsThreshold) {
            logger.info(`Match below threshold filtered out: Test ID ${m.test_id}, Confidence: ${m.confidence}`);
          }
          return isValid && meetsThreshold;
        });
        
        // Deduplicate by test_id - keep highest confidence match for each test
        const deduplicatedMatches = [];
        const seenTestIds = new Set();
        
        // Sort by confidence descending
        validMatches.sort((a, b) => b.confidence - a.confidence);
        
        for (const match of validMatches) {
          if (!seenTestIds.has(match.test_id)) {
            deduplicatedMatches.push(match);
            seenTestIds.add(match.test_id);
          } else {
            logger.info(`Skipping duplicate test_id ${match.test_id} (lower confidence)`);
          }
        }
        
        logger.info(`AI matched ${deduplicatedMatches.length} unique test cases (from ${result.matches.length} candidates, ${validMatches.length} valid, ${validMatches.length - deduplicatedMatches.length} duplicates removed)`);
        
        if (deduplicatedMatches.length === 0) {
          logger.error('No valid matches found after filtering. AI may have returned invalid test IDs.');
          throw new Error('AI returned no valid matches. Please check AI prompt and response format.');
        }
        
        // Store all matches for learning
        for (const match of deduplicatedMatches) {
          await learningService.storeMatch({
            bug: bugData,
            match: match,
            timestamp: new Date().toISOString()
          });
        }
        
        return deduplicatedMatches;
      } else {
        // Single match mode
        if (!validateMatch(result, testCases)) {
          logger.error(`AI returned invalid test_id: ${result.test_id}`);
          throw new Error(`AI returned test_id ${result.test_id} which doesn't exist in the test cases`);
        }
        
        logger.info(`AI match result: Test ${result.test_id} with confidence ${result.confidence}`);
        
        // Store match for learning
        await learningService.storeMatch({
          bug: bugData,
          match: result,
          timestamp: new Date().toISOString()
        });
        
        return result;
      }
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
    const enableMultiMatch = config.openai.enableMultiMatch;
    const wcagInfo = bugData.wcagCategory 
      ? `\nWCAG Issue Category: ${bugData.wcagCategory}\n**Note:** This bug is categorized as "${bugData.wcagCategory}". Prioritize test cases related to this category.`
      : '';
      
    const instructionText = enableMultiMatch 
      ? 'I need you to match this accessibility bug to ALL relevant test cases. The bug may describe multiple distinct issues.'
      : 'I need you to match this accessibility bug to the most relevant test case.';
      
    return `
${instructionText}

**Bug Details:**
Title: ${bugData.summary}
Description: ${bugData.description || 'No detailed description provided'}${wcagInfo}

**CRITICAL: PRIORITIZE BUG DESCRIPTION OVER TITLE**
The bug DESCRIPTION contains the detailed issues - this is your PRIMARY source for matching. The TITLE provides general context and WCAG category only.

**Important:** ${enableMultiMatch ? 'Parse the description for EACH specific issue (numbered items, separate paragraphs). Match EACH issue to test cases that would specifically catch that issue.' : 'Read the description carefully to understand the specific failure, then match to a test case that would catch this exact issue.'}

**Test Cases:**
${testCases.map(tc => `
[${tc.index}] Test ID: ${tc.test_id} | Case ID: ${tc.case_id}
Title: ${tc.title}
Steps: ${JSON.stringify(tc.steps).substring(0, 500)}
Preconditions: ${tc.preconditions}
Expected Result: ${tc.expected}
---
`).join('\n')}

**Matching Instructions:**
1. **Read bug DESCRIPTION first**: Identify each specific issue described (numbered items, distinct problems)
2. **Group similar issues**: If multiple issues in the description would fail the SAME test case, group them together - only return that test case ONCE
3. **Match issue TYPE correctly**: 
   - Focus issues → ONLY focus management tests (keywords: focus, keyboard navigation, tab order)
   - Page title issues → ONLY page title tests
   - Language issues → ONLY language/lang attribute tests
   - Form issues → ONLY form/input tests
   - Image issues → ONLY alt text/image tests
   - DO NOT match focus issues to page title tests or vice versa!
4. **Match to SPECIFIC test cases**: Find test cases whose titles/steps directly test the SAME issue type
5. **Use title for category context**: Extract WCAG criteria from title to validate matches are in correct category
6. **Quote ALL grouped issues**: In reasoning, quote all specific issues from the description that this test case would catch
7. **Assign confidence**: 
   - 0.9-1.0: Test case title/steps directly test the EXACT SAME issue type from description
   - 0.7-0.89: Test would likely catch the issue and is the SAME issue type
   - 0.5-0.69: Same category but different specific issue type
   - Below 0.5: Wrong issue type (e.g., focus issue matched to page title test)

**Response Format (JSON):**
${enableMultiMatch ? `{
  "matches": [
    {
      "test_id": "<test_id>",
      "case_id": "<case_id>",
      "title": "<test case title>",
      "confidence": <float between 0.0 and 1.0>,
      "reasoning": "'<QUOTE all specific issues from description that this test catches>'"
    }
  ]
}

**CRITICAL:** 
- You MUST return the EXACT test_id and case_id from the [Test Cases] list above
- DO NOT make up or guess test IDs
- If a test case title is "Verify errors are Clearly Identified" with Test ID: 31834485, you MUST return test_id: "31834485" (the exact ID shown)
- Return each test case ONLY ONCE, even if it catches multiple issues from the description
- If multiple issues would fail the same test case, group them in the reasoning and return that test case once
- Quote all grouped issue texts in reasoning
- Only include matches >= 0.75 confidence` : `{
  "test_id": "<the test_id>",
  "case_id": "<the case_id>",
  "title": "<test case title>",
  "confidence": <float between 0.0 and 1.0>,
  "reasoning": "Catches issue: '<QUOTE specific issue from description>'"
}

**CRITICAL:** You MUST return the EXACT test_id and case_id from the [Test Cases] list above. DO NOT make up or guess test IDs.`}

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
