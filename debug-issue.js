const jiraService = require('./services/jiraService');
const config = require('./config');

async function debugIssue(issueKey) {
  console.log('\n========================================');
  console.log('Debug Issue Structure');
  console.log('========================================\n');
  
  try {
    console.log(`🔍 Fetching issue: ${issueKey}\n`);
    
    // Get the issue
    const issue = await jiraService.getIssue(issueKey);
    
    console.log('Basic Info:');
    console.log(`  Key: ${issue.key}`);
    console.log(`  Type: ${issue.fields.issuetype.name}`);
    console.log(`  Summary: ${issue.fields.summary}`);
    console.log('');
    
    // Check parent field
    console.log('Parent Field:');
    if (issue.fields.parent) {
      console.log(`  ✅ Has parent: ${issue.fields.parent.key}`);
    } else {
      console.log(`  ❌ No parent field`);
    }
    console.log('');
    
    // Check issue links
    console.log('Issue Links:');
    if (issue.fields.issuelinks && issue.fields.issuelinks.length > 0) {
      console.log(`  Found ${issue.fields.issuelinks.length} links:`);
      issue.fields.issuelinks.forEach((link, index) => {
        console.log(`\n  Link ${index + 1}:`);
        console.log(`    Type Name: "${link.type.name}"`);
        console.log(`    Type Inward: "${link.type.inward}"`);
        console.log(`    Type Outward: "${link.type.outward}"`);
        
        if (link.outwardIssue) {
          console.log(`    Direction: Outward`);
          console.log(`    Linked Issue: ${link.outwardIssue.key} (${link.outwardIssue.fields.issuetype.name})`);
          console.log(`    Linked Summary: ${link.outwardIssue.fields.summary}`);
        }
        
        if (link.inwardIssue) {
          console.log(`    Direction: Inward`);
          console.log(`    Linked Issue: ${link.inwardIssue.key} (${link.inwardIssue.fields.issuetype.name})`);
          console.log(`    Linked Summary: ${link.inwardIssue.fields.summary}`);
        }
      });
    } else {
      console.log(`  ❌ No issue links`);
    }
    console.log('');
    
    // Find parent
    console.log('Finding Parent:');
    const parent = await jiraService.getParentIssue(issueKey);
    if (parent) {
      console.log(`  ✅ Parent found: ${parent.key}`);
      console.log('');
      
      // Get parent details
      console.log('Parent Details:');
      const parentDetails = await jiraService.getIssue(parent.key);
      console.log(`  Key: ${parentDetails.key}`);
      console.log(`  Type: ${parentDetails.fields.issuetype.name}`);
      console.log(`  Summary: ${parentDetails.fields.summary}`);
      console.log('');
      
      // Check custom field
      console.log('Custom Field Check:');
      console.log(`  Config field: ${config.jira.runIdCustomField || 'NOT CONFIGURED'}`);
      
      if (config.jira.runIdCustomField) {
        const customFieldValue = parentDetails.fields[config.jira.runIdCustomField];
        console.log(`  Field raw type: ${typeof customFieldValue}`);
        console.log(`  Field raw value: ${JSON.stringify(customFieldValue, null, 2)}`);
        
        if (customFieldValue) {
          // Try to extract Run ID
          let runId = null;
          if (typeof customFieldValue === 'string') {
            runId = customFieldValue;
          } else if (typeof customFieldValue === 'number') {
            runId = customFieldValue.toString();
          } else if (typeof customFieldValue === 'object' && customFieldValue !== null) {
            runId = customFieldValue.value || customFieldValue.id || customFieldValue.name;
          }
          
          if (runId) {
            console.log(`  ✅ Extracted Run ID: ${runId}`);
          } else {
            console.log(`  ❌ Could not extract Run ID from object`);
          }
        } else {
          console.log(`  ❌ Custom field is empty`);
          
          // List all custom fields that have values
          console.log('\n  Available custom fields with values:');
          Object.keys(parentDetails.fields).forEach(key => {
            if (key.startsWith('customfield_') && parentDetails.fields[key]) {
              const value = parentDetails.fields[key];
              const displayValue = typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : value;
              console.log(`    ${key}: ${displayValue}`);
            }
          });
        }
      } else {
        console.log('  ⚠️  No custom field configured in .env');
      }
      console.log('');
      
      // Check comments
      console.log('Checking Comments:');
      const runId = await jiraService.findRunIdInComments(parent.key);
      if (runId) {
        console.log(`  ✅ Run ID in comments: ${runId}`);
      } else {
        console.log(`  ❌ No Run ID found in comments`);
      }
      
    } else {
      console.log(`  ❌ No parent found`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  console.log('\n========================================\n');
}

const issueKey = process.argv[2] || 'ROLL-1396';
debugIssue(issueKey);
