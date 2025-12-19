const axios = require('axios');
const config = require('../config');
const logger = require('../logger');

/**
 * JIRA Service - Handles all JIRA API interactions
 */
class JiraService {
  constructor() {
    this.baseUrl = config.jira.baseUrl;
    this.auth = {
      username: config.jira.email,
      password: config.jira.apiToken
    };
  }

  /**
   * Get issue details from JIRA
   * @param {string} issueKey - JIRA issue key (e.g., PROJ-123)
   * @returns {Promise<Object>} Issue data
   */
  async getIssue(issueKey) {
    try {
      logger.info(`Fetching JIRA issue: ${issueKey}`);
      const response = await axios.get(
        `${this.baseUrl}/rest/api/3/issue/${issueKey}`,
        { auth: this.auth }
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch JIRA issue ${issueKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add a comment to a JIRA issue
   * @param {string} issueKey - JIRA issue key
   * @param {string} comment - Comment text
   */
  async addComment(issueKey, comment) {
    try {
      logger.info(`Adding comment to JIRA issue: ${issueKey}`);
      await axios.post(
        `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`,
        {
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: comment
                  }
                ]
              }
            ]
          }
        },
        { auth: this.auth }
      );
      logger.info(`Comment added to ${issueKey}`);
    } catch (error) {
      logger.error(`Failed to add comment to ${issueKey}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the parent task/story of an issue
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<Object|null>} Parent issue or null
   */
  async getParentIssue(issueKey) {
    try {
      const issue = await this.getIssue(issueKey);
      
      // Check parent field first (for subtasks)
      if (issue.fields.parent) {
        logger.info(`Found parent via parent field: ${issue.fields.parent.key}`);
        return issue.fields.parent;
      }

      // Check issue links for "discovered while testing", "is caused by", etc.
      if (issue.fields.issuelinks && issue.fields.issuelinks.length > 0) {
        const linkTypes = [
          'discovered while testing',
          'is caused by',
          'relates to',
          'bonfire testing',
          'blocks',
          'is blocked by',
          'testing'
        ];
        
        for (const link of issue.fields.issuelinks) {
          const linkType = link.type.name.toLowerCase();
          
          // Check if this link type indicates a parent relationship
          if (linkTypes.some(type => linkType.includes(type))) {
            const parentIssue = link.outwardIssue || link.inwardIssue;
            if (parentIssue && ['Story', 'Task', 'Epic'].includes(parentIssue.fields.issuetype.name)) {
              logger.info(`Found parent via link (${link.type.name}): ${parentIssue.key}`);
              return parentIssue;
            }
          }
        }
      }

      logger.info(`No parent issue found for ${issueKey}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get parent issue for ${issueKey}: ${error.message}`);
      return null;
    }
  }

  /**
   * Find TestRail Run ID from parent task
   * Priority: 1) Custom field, 2) Comments
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<string|null>} Run ID or null
   */
  async findRunId(issueKey) {
    try {
      // Get parent issue
      const parent = await this.getParentIssue(issueKey);
      if (!parent) {
        logger.info('No parent issue found, cannot find Run ID');
        return null;
      }

      const parentKey = parent.key;
      logger.info(`Searching for Run ID in parent: ${parentKey}`);

      // Option A: Check custom field
      if (config.jira.runIdCustomField) {
        const parentDetails = await this.getIssue(parentKey);
        const runIdField = parentDetails.fields[config.jira.runIdCustomField];
        
        if (runIdField) {
          // Handle different field types
          let runId = null;
          
          if (typeof runIdField === 'string') {
            runId = runIdField;
          } else if (typeof runIdField === 'number') {
            runId = runIdField.toString();
          } else if (typeof runIdField === 'object' && runIdField !== null) {
            // Check if it's an Atlassian Document Format (ADF) field
            if (runIdField.type === 'doc' && runIdField.content) {
              runId = this.extractTextFromComment(runIdField).trim();
            } else {
              // Check common object properties
              runId = runIdField.value || runIdField.id || runIdField.name;
            }
          }
          
          if (runId) {
            logger.info(`Found Run ID in custom field: ${runId}`);
            return runId.toString();
          }
        }
      }

      // Option B: Search comments
      const runId = await this.findRunIdInComments(parentKey);
      if (runId) {
        logger.info(`Found Run ID in comments: ${runId}`);
        return runId;
      }

      logger.info('Run ID not found in custom field or comments');
      return null;
    } catch (error) {
      logger.error(`Failed to find Run ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Search for Run ID in issue comments
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<string|null>} Run ID or null
   */
  async findRunIdInComments(issueKey) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`,
        { auth: this.auth }
      );

      const comments = response.data.comments || [];
      
      // Regex patterns for Run ID
      const patterns = [
        /Run:\s*(\d+)/i,
        /TestRail Run:\s*(\d+)/i,
        /Run ID:\s*(\d+)/i,
        /R(\d+)/
      ];

      for (const comment of comments) {
        const commentText = this.extractTextFromComment(comment.body);
        
        for (const pattern of patterns) {
          const match = commentText.match(pattern);
          if (match && match[1]) {
            return match[1];
          }
        }
      }

      return null;
    } catch (error) {
      logger.error(`Failed to search comments for Run ID: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract plain text from JIRA comment body (ADF format or plain string)
   * @param {Object|string} body - Comment body in ADF format or plain string
   * @returns {string} Plain text
   */
  extractTextFromComment(body) {
    // Handle plain string
    if (typeof body === 'string') {
      return body;
    }
    
    // Handle ADF format
    if (!body || !body.content) return '';
    
    let text = '';
    
    const extractText = (node) => {
      if (node.type === 'text') {
        text += node.text + ' ';
      }
      if (node.content) {
        node.content.forEach(extractText);
      }
    };
    
    body.content.forEach(extractText);
    return text;
  }

  /**
   * Extract plain text from JIRA description field (ADF format)
   * Handles paragraphs, lists, and nested content
   * @param {Object} description - Description in ADF format
   * @returns {string} Plain text with line breaks preserved
   */
  extractTextFromDescription(description) {
    if (!description) return '';
    
    // Handle plain string
    if (typeof description === 'string') {
      return description;
    }
    
    // Handle ADF format
    if (!description.content) return '';
    
    const lines = [];
    
    const extractNode = (node, level = 0) => {
      switch (node.type) {
        case 'paragraph':
          let paragraphText = '';
          if (node.content) {
            node.content.forEach(child => {
              paragraphText += extractTextOnly(child);
            });
          }
          if (paragraphText.trim()) {
            lines.push(paragraphText.trim());
          }
          break;
          
        case 'table':
          // Extract table data - focus on "Actual" column if present
          if (node.content) {
            const tableData = extractTable(node);
            if (tableData.length > 0) {
              lines.push(...tableData);
            }
          }
          break;
          
        case 'orderedList':
        case 'bulletList':
          if (node.content) {
            node.content.forEach((item, index) => {
              const prefix = node.type === 'orderedList' ? `${index + 1}. ` : '• ';
              const itemText = extractListItem(item);
              if (itemText) {
                lines.push(prefix + itemText);
              }
            });
          }
          break;
          
        case 'heading':
          let headingText = '';
          if (node.content) {
            node.content.forEach(child => {
              headingText += extractTextOnly(child);
            });
          }
          if (headingText.trim()) {
            lines.push(headingText.trim());
          }
          break;
          
        default:
          if (node.content) {
            node.content.forEach(child => extractNode(child, level));
          }
      }
    };
    
    const extractTable = (tableNode) => {
      const rows = [];
      let headerRow = null;
      let actualColumnIndex = -1;
      
      if (!tableNode.content) return rows;
      
      // Process table rows
      tableNode.content.forEach((row, rowIndex) => {
        if (row.type !== 'tableRow' || !row.content) return;
        
        const cells = [];
        row.content.forEach(cell => {
          if ((cell.type === 'tableCell' || cell.type === 'tableHeader') && cell.content) {
            const cellText = cell.content.map(extractTextOnly).join(' ').trim();
            cells.push(cellText);
          }
        });
        
        // First row is usually header
        if (rowIndex === 0) {
          headerRow = cells;
          // Find "Actual" column index (prioritize "Actual" over "No")
          actualColumnIndex = cells.findIndex(header => 
            header.toLowerCase().includes('actual')
          );
          
          // If no "Actual" column found, try "No" column as fallback
          if (actualColumnIndex === -1) {
            actualColumnIndex = cells.findIndex(header => 
              header.toLowerCase() === 'no'
            );
          }
          
          logger.info(`Table header: [${cells.join(', ')}] - Actual column index: ${actualColumnIndex}`);
        } else {
          // Extract only the Actual column if found, otherwise get all non-empty cells
          if (actualColumnIndex >= 0 && cells[actualColumnIndex]) {
            const actualText = cells[actualColumnIndex].trim();
            if (actualText) {
              rows.push(`${rowIndex}. ${actualText}`);
            }
          } else {
            // Fallback: extract all non-empty cells
            const nonEmptyCells = cells.filter(c => c.trim().length > 0);
            if (nonEmptyCells.length > 0) {
              rows.push(`${rowIndex}. ${nonEmptyCells.join(' - ')}`);
            }
          }
        }
      });
      
      return rows;
    };
    
    const extractTextOnly = (node) => {
      if (node.type === 'text') {
        return node.text || '';
      }
      if (node.content) {
        return node.content.map(extractTextOnly).join('');
      }
      return '';
    };
    
    const extractListItem = (node) => {
      if (node.type === 'listItem' && node.content) {
        return node.content.map(child => extractTextOnly(child)).join(' ').trim();
      }
      return '';
    };
    
    description.content.forEach(node => extractNode(node));
    
    return lines.join('\n');
  }

  /**
   * Get all issue links for an issue
   * @param {string} issueKey - JIRA issue key
   * @returns {Promise<Array>} Array of linked issues
   */
  async getIssueLinks(issueKey) {
    try {
      const issue = await this.getIssue(issueKey);
      return issue.fields.issuelinks || [];
    } catch (error) {
      logger.error(`Failed to get issue links: ${error.message}`);
      return [];
    }
  }
}

module.exports = new JiraService();
