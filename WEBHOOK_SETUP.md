# JIRA Webhook Setup Guide

Complete guide for setting up JIRA webhooks to enable automatic workflows.

## Overview

JIRA webhooks allow the service to automatically respond to events:
- **Bug status changed** → Auto-trigger workflows
- **Comment added** → Process corrections

## Prerequisites

- JIRA administrator access (to create webhooks)
- Service deployed and accessible (local with ngrok, or cloud)
- Service URL (e.g., `https://your-service.azurewebsites.net`)

## Setup Steps

### 1. Get Your Service URL

#### Option A: Local Development with ngrok

1. Start your service:
   ```powershell
   npm run dev
   ```

2. In a new terminal, start ngrok:
   ```powershell
   ngrok http 3000
   ```

3. Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok.io`)

4. Your webhook URL will be: `https://abc123.ngrok.io/webhook/jira`

**Note:** ngrok URLs change each restart. For permanent testing, use a paid ngrok plan or deploy to cloud.

#### Option B: Azure App Service

1. Deploy to Azure (see Deployment section below)
2. Your webhook URL will be: `https://your-app-name.azurewebsites.net/webhook/jira`

#### Option C: Other Cloud/Server

Use your server's public URL: `https://your-domain.com/webhook/jira`

---

### 2. Create JIRA Webhook

1. **Go to JIRA Administration:**
   - Click Settings (⚙️) → System
   - In left sidebar, under "Advanced" section, click **Webhooks**

2. **Create Webhook:**
   - Click **Create a webhook** button

3. **Configure Webhook:**

   **Name:**
   ```
   TestRail Integration - Bug Workflows
   ```

   **Status:** ✅ Enabled

   **URL:**
   ```
   https://your-service-url/webhook/jira
   ```
   
   Example: `https://abc123.ngrok.io/webhook/jira`

   **Description:**
   ```
   Automatically links accessibility bugs to TestRail test cases using AI.
   Triggers on status changes and correction comments.
   ```

   **Events to Subscribe:**
   - ✅ Issue: **updated**
   - ✅ Comment: **created**

   **JQL Filter (Optional but Recommended):**
   ```
   project = "YOUR_PROJECT" AND issuetype = Bug
   ```
   
   Replace `YOUR_PROJECT` with your actual project key. This limits webhooks to bugs only.

4. **Advanced Settings (Optional):**

   If you configured `WEBHOOK_SECRET` in your `.env`:
   
   - Expand **Show advanced settings**
   - Under **Custom headers**, add:
     ```
     Header name: X-Webhook-Secret
     Header value: your_webhook_secret_here
     ```

5. **Save:**
   - Click **Create** button

---

### 3. Test Webhook

#### Test 1: Status Change

1. Create or find a test bug in JIRA
2. Ensure it has a parent Story/Task with Run ID in comments
3. Change bug status to "Ready for Dev"
4. Check:
   - Service logs show webhook received
   - JIRA comment added with match details
   - TestRail test marked as Failed

#### Test 2: Correction

1. Add a JIRA comment to the bug:
   ```
   CORRECT: 12346 - Correct test case title
   ```
2. Check:
   - Service logs show correction processed
   - JIRA comment acknowledges correction
   - Learning data updated

#### Test 3: Resolution

1. Change bug status to "Queued Merged to Release"
2. Check:
   - Service logs show webhook received
   - JIRA comment confirms TestRail update
   - TestRail test marked as Passed

---

### 4. View Webhook Activity

**In JIRA:**
1. Go to System → Webhooks
2. Click your webhook name
3. Scroll to **Recent deliveries**
4. View request/response logs

**In Service:**
1. Check `logs/combined.log` for all activity
2. Check `logs/error.log` for failures

---

## Webhook Payload Examples

### Issue Updated (Status Change)

```json
{
  "webhookEvent": "jira:issue_updated",
  "timestamp": 1702819200000,
  "issue": {
    "id": "10001",
    "key": "ACC-123",
    "fields": {
      "summary": "Keyboard focus not visible on search button",
      "description": {
        "content": [{
          "content": [{
            "type": "text",
            "text": "When using keyboard navigation..."
          }]
        }]
      },
      "status": {
        "name": "Ready for Dev"
      },
      "issuetype": {
        "name": "Bug"
      }
    }
  },
  "changelog": {
    "items": [
      {
        "field": "status",
        "fieldtype": "jira",
        "from": "10000",
        "fromString": "To Do",
        "to": "10001",
        "toString": "Ready for Dev"
      }
    ]
  }
}
```

### Comment Created

```json
{
  "webhookEvent": "comment_created",
  "timestamp": 1702819200000,
  "issue": {
    "key": "ACC-123"
  },
  "comment": {
    "id": "10050",
    "author": {
      "displayName": "John Doe",
      "emailAddress": "john@company.com"
    },
    "body": {
      "type": "doc",
      "version": 1,
      "content": [
        {
          "type": "paragraph",
          "content": [
            {
              "type": "text",
              "text": "CORRECT: 12346 - Verify keyboard focus indicator on buttons"
            }
          ]
        }
      ]
    },
    "created": "2024-12-17T10:30:45.123+0000"
  }
}
```

---

## Troubleshooting

### Webhook Not Triggering

**Problem:** No response from service when JIRA event occurs

**Solutions:**

1. **Check webhook is enabled:**
   - JIRA → System → Webhooks
   - Verify status is "Enabled"

2. **Verify URL is accessible:**
   ```powershell
   Invoke-RestMethod https://your-service-url/health
   ```
   Should return: `{"status": "ok"}`

3. **Check ngrok is running:**
   - If using ngrok, ensure it hasn't expired
   - Restart ngrok if URL changed

4. **Check JQL filter:**
   - If filter is too restrictive, webhook won't fire
   - Try removing filter temporarily

5. **Check JIRA webhook logs:**
   - System → Webhooks → Your webhook → Recent deliveries
   - Look for failed deliveries or errors

---

### Webhook Receives 401 Unauthorized

**Problem:** JIRA shows "401 Unauthorized" in webhook logs

**Solutions:**

1. **Webhook secret mismatch:**
   - Verify `WEBHOOK_SECRET` in `.env` matches JIRA header
   - Check header name is `X-Webhook-Secret` (case-sensitive)

2. **Remove webhook secret:**
   - Comment out `WEBHOOK_SECRET` in `.env`
   - Remove custom header from JIRA webhook
   - Test without security first

---

### Webhook Receives 500 Error

**Problem:** Service returns 500 error to JIRA

**Solutions:**

1. **Check service logs:**
   ```powershell
   Get-Content logs/error.log -Tail 50
   ```

2. **Common causes:**
   - Invalid API credentials in `.env`
   - OpenAI API key issues
   - TestRail connection problems

3. **Test manually:**
   ```powershell
   .\scripts\Trigger-BugCreated.ps1 -IssueKey "ACC-123"
   ```
   This will show the actual error

---

### Workflows Not Running

**Problem:** Webhook received but workflows don't execute

**Solutions:**

1. **Check status names match:**
   - `.env` file: `JIRA_STATUS_READY_FOR_DEV=Ready for Dev`
   - JIRA actual status: Must match exactly (case-sensitive)

2. **Check issue type:**
   - Workflows only trigger for Bugs
   - Verify JQL filter includes issue type

3. **Check Run ID:**
   - Parent task must have Run ID
   - Test with: `.\scripts\Test-FindRunId.ps1 -IssueKey "ACC-123"`

4. **Check logs:**
   ```powershell
   Get-Content logs/combined.log -Tail 100
   ```
   Look for "Triggering Bug Created workflow" messages

---

### Corrections Not Processing

**Problem:** CORRECT: comments don't trigger correction workflow

**Solutions:**

1. **Check comment format:**
   - Must be: `CORRECT: <test_id> - <title>`
   - Space after colon is required
   - Test ID must be numeric

2. **Check webhook subscribed to comment events:**
   - JIRA → Webhooks → Your webhook
   - Verify "Comment: created" is checked

3. **Check logs:**
   - Look for "Detected correction comment" message
   - May show parsing errors

---

## Security Considerations

### Webhook Secret

**Why use it:**
- Prevents unauthorized requests to your service
- Validates requests are from your JIRA instance

**How to set up:**

1. Generate a strong random secret:
   ```powershell
   -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
   ```

2. Add to `.env`:
   ```env
   WEBHOOK_SECRET=your_generated_secret
   ```

3. Add to JIRA webhook custom header:
   ```
   X-Webhook-Secret: your_generated_secret
   ```

### HTTPS Only

- **Always use HTTPS** for webhook URLs in production
- ngrok provides HTTPS automatically
- Azure App Service provides HTTPS by default

### IP Whitelisting (Advanced)

If your server supports it, whitelist JIRA's IP ranges:
- Check Atlassian's documentation for current IP ranges
- Configure firewall to accept only from those IPs

---

## Azure App Service Deployment

### Prerequisites

- Azure account
- Azure CLI installed

### Deployment Steps

1. **Create App Service:**
   ```powershell
   az login
   
   az group create --name rg-jira-testrail --location eastus
   
   az appservice plan create `
     --name plan-jira-testrail `
     --resource-group rg-jira-testrail `
     --sku B1 `
     --is-linux
   
   az webapp create `
     --name your-app-name `
     --resource-group rg-jira-testrail `
     --plan plan-jira-testrail `
     --runtime "NODE|16-lts"
   ```

2. **Configure Environment Variables:**
   ```powershell
   az webapp config appsettings set `
     --name your-app-name `
     --resource-group rg-jira-testrail `
     --settings `
       JIRA_BASE_URL="https://company.atlassian.net" `
       JIRA_EMAIL="user@company.com" `
       JIRA_API_TOKEN="your_token" `
       TESTRAIL_BASE_URL="https://company.testrail.io" `
       TESTRAIL_USERNAME="username" `
       TESTRAIL_PASSWORD="api_key" `
       OPENAI_API_KEY="sk-..." `
       OPENAI_MODEL="gpt-4o"
   ```

3. **Deploy Code:**
   ```powershell
   # Initialize git if not already
   git init
   git add .
   git commit -m "Initial commit"
   
   # Configure Azure remote
   az webapp deployment source config-local-git `
     --name your-app-name `
     --resource-group rg-jira-testrail
   
   # Get deployment URL and push
   $deployUrl = az webapp deployment list-publishing-credentials `
     --name your-app-name `
     --resource-group rg-jira-testrail `
     --query scmUri -o tsv
   
   git remote add azure $deployUrl
   git push azure main
   ```

4. **Get Your Webhook URL:**
   ```powershell
   az webapp show `
     --name your-app-name `
     --resource-group rg-jira-testrail `
     --query defaultHostName -o tsv
   ```
   
   Webhook URL: `https://your-app-name.azurewebsites.net/webhook/jira`

5. **Test Deployment:**
   ```powershell
   Invoke-RestMethod https://your-app-name.azurewebsites.net/health
   ```

### View Azure Logs

```powershell
az webapp log tail `
  --name your-app-name `
  --resource-group rg-jira-testrail
```

---

## Monitoring & Maintenance

### Check Webhook Health

**Daily:**
- Verify webhook deliveries in JIRA
- Check for failed deliveries

**Weekly:**
- Review service logs for errors
- Check learning statistics

**Monthly:**
- Review correction rate
- Update AI confidence threshold if needed

### Webhook Best Practices

1. **Use JQL filters** - Reduce unnecessary webhook calls
2. **Monitor recent deliveries** - Catch issues early
3. **Keep ngrok running** - Or use permanent URL
4. **Test after changes** - Verify webhook still works
5. **Document your setup** - Note your specific configuration

---

## Quick Setup Checklist

- [ ] Service deployed and accessible
- [ ] Get service webhook URL
- [ ] Create JIRA webhook
- [ ] Configure webhook URL and events
- [ ] Add JQL filter (optional)
- [ ] Add webhook secret (optional)
- [ ] Test with status change
- [ ] Test with correction comment
- [ ] Test with resolution
- [ ] Monitor webhook deliveries
- [ ] Check service logs

---

## Support

If webhooks still aren't working after following this guide:

1. Enable detailed logging in service
2. Check JIRA webhook "Recent deliveries"
3. Review service logs (`logs/error.log`)
4. Test manually with PowerShell scripts
5. Verify all credentials are correct

For additional help, include:
- Webhook delivery logs from JIRA
- Service error logs
- `.env` configuration (redact secrets)
- Steps to reproduce the issue
