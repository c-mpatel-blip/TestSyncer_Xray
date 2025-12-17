const fs = require('fs').promises;
const path = require('path');
const logger = require('../logger');

/**
 * Learning Service - Manages AI learning from corrections
 */
class LearningService {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'learning-data');
    this.matchesFile = path.join(this.dataDir, 'matches.json');
    this.correctionsFile = path.join(this.dataDir, 'corrections.json');
  }

  /**
   * Initialize data files if they don't exist
   */
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Initialize matches.json
      try {
        await fs.access(this.matchesFile);
      } catch {
        await fs.writeFile(this.matchesFile, JSON.stringify([], null, 2));
        logger.info('Initialized matches.json');
      }

      // Initialize corrections.json
      try {
        await fs.access(this.correctionsFile);
      } catch {
        await fs.writeFile(this.correctionsFile, JSON.stringify([], null, 2));
        logger.info('Initialized corrections.json');
      }
    } catch (error) {
      logger.error(`Failed to initialize learning data: ${error.message}`);
    }
  }

  /**
   * Store a match result for future learning
   * @param {Object} matchData - Match data to store
   */
  async storeMatch(matchData) {
    try {
      // Check if learning is enabled
      const config = require('../config');
      if (!config.openai.learningEnabled) {
        logger.info('AI learning disabled, skipping match storage');
        return;
      }

      await this.initialize();
      const matches = await this.loadMatches();
      
      matches.push({
        id: this.generateId(),
        ...matchData,
        stored_at: new Date().toISOString()
      });

      await fs.writeFile(this.matchesFile, JSON.stringify(matches, null, 2));
      logger.info('Match stored in learning data');
    } catch (error) {
      logger.error(`Failed to store match: ${error.message}`);
    }
  }

  /**
   * Store a user correction
   * @param {Object} correctionData - Correction data
   */
  async storeCorrection(correctionData) {
    try {
      // Check if learning is enabled
      const config = require('../config');
      if (!config.openai.learningEnabled) {
        logger.info('AI learning disabled, skipping correction storage');
        return;
      }

      await this.initialize();
      const corrections = await this.loadCorrections();
      
      corrections.push({
        id: this.generateId(),
        ...correctionData,
        corrected_at: new Date().toISOString()
      });

      await fs.writeFile(this.correctionsFile, JSON.stringify(corrections, null, 2));
      logger.info('Correction stored in learning data');
    } catch (error) {
      logger.error(`Failed to store correction: ${error.message}`);
    }
  }

  /**
   * Find similar match in learning data
   * @param {Object} bugData - Bug information
   * @returns {Promise<Object|null>} Similar match or null
   */
  async findSimilarMatch(bugData) {
    try {
      await this.initialize();
      const corrections = await this.loadCorrections();
      
      if (corrections.length === 0) {
        return null;
      }

      // Extract keywords from bug
      const bugKeywords = this.extractKeywords(bugData.summary + ' ' + (bugData.description || ''));

      // Find corrections with matching keywords
      for (const correction of corrections.reverse()) { // Most recent first
        const correctionKeywords = this.extractKeywords(
          correction.bug.summary + ' ' + (correction.bug.description || '')
        );

        const matchScore = this.calculateKeywordMatch(bugKeywords, correctionKeywords);
        
        if (matchScore > 0.6) { // 60% keyword match threshold
          return {
            test_id: correction.correct_test_id,
            case_id: correction.correct_case_id,
            title: correction.correct_title,
            confidence: 0.85 + (matchScore * 0.15), // 0.85-1.0 range
            reasoning: `Similar to previous bug: "${correction.bug.summary}"`
          };
        }
      }

      return null;
    } catch (error) {
      logger.error(`Failed to find similar match: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract keywords from text (simplified)
   * @param {string} text - Text to extract keywords from
   * @returns {Set} Set of keywords
   */
  extractKeywords(text) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    return new Set(words);
  }

  /**
   * Calculate keyword match score between two sets
   * @param {Set} set1 - First keyword set
   * @param {Set} set2 - Second keyword set
   * @returns {number} Match score (0-1)
   */
  calculateKeywordMatch(set1, set2) {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Load all matches from file
   * @returns {Promise<Array>} Array of matches
   */
  async loadMatches() {
    try {
      const data = await fs.readFile(this.matchesFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Load all corrections from file
   * @returns {Promise<Array>} Array of corrections
   */
  async loadCorrections() {
    try {
      const data = await fs.readFile(this.correctionsFile, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Get learning statistics
   * @returns {Promise<Object>} Statistics
   */
  async getStatistics() {
    try {
      const matches = await this.loadMatches();
      const corrections = await this.loadCorrections();

      return {
        total_matches: matches.length,
        total_corrections: corrections.length,
        correction_rate: matches.length > 0 ? (corrections.length / matches.length * 100).toFixed(2) + '%' : '0%',
        last_match: matches.length > 0 ? matches[matches.length - 1].stored_at : null,
        last_correction: corrections.length > 0 ? corrections[corrections.length - 1].corrected_at : null
      };
    } catch (error) {
      logger.error(`Failed to get statistics: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate a unique ID
   * @returns {string} Unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

module.exports = new LearningService();
