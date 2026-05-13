const CONFIG = {
  TARGET_MAILBOX_PROPERTY_KEY: 'TARGET_MAILBOX',
  LABELS: {
    READY: 'AI返信作成済',
    DONE: 'Slack通知済'
  },
  SLACK: {
    WEBHOOK_PROPERTY_KEY: 'SLACK_WEBHOOK_URL'
  },
  SEARCH: {
    MAX_THREADS: 20
  }
};

function notifyPreparedAiRepliesToSlack() {
  const readyLabel = getOrCreateLabel_(CONFIG.LABELS.READY);
  const doneLabel = getOrCreateLabel_(CONFIG.LABELS.DONE);
  const webhookUrl = getSlackWebhookUrl_();
  const draftMap = buildDraftMap_();
  const query = buildThreadQuery_();
  const threads = GmailApp.search(query, 0, CONFIG.SEARCH.MAX_THREADS);

  threads.forEach(function(thread) {
    if (threadHasLabel_(thread, doneLabel.getName())) {
      return;
    }

    const sourceMessage = findTargetMessage_(thread);
    if (!sourceMessage) {
      return;
    }

    const payload = buildSlackPayload_(sourceMessage, draftMap[thread.getId()] || '');
    postToSlack_(webhookUrl, payload);
    thread.addLabel(doneLabel);
  });
}

function setupHourlySlackNotificationTrigger() {
  deleteExistingTrigger_('notifyPreparedAiRepliesToSlack');
  ScriptApp.newTrigger('notifyPreparedAiRepliesToSlack')
    .timeBased()
    .everyHours(1)
    .create();
}

function saveSlackWebhookUrl() {
  const webhookUrl = Browser.inputBox(
    'Slack Incoming Webhook URL を入力してください',
    Browser.Buttons.OK_CANCEL
  );

  if (webhookUrl === 'cancel' || !webhookUrl) {
    return;
  }

  PropertiesService.getScriptProperties()
    .setProperty(CONFIG.SLACK.WEBHOOK_PROPERTY_KEY, webhookUrl.trim());
}

function buildThreadQuery_() {
  const targetMailbox = getTargetMailbox_();
  return [
    'label:"' + CONFIG.LABELS.READY + '"',
    '-label:"' + CONFIG.LABELS.DONE + '"',
    'to:' + targetMailbox
  ].join(' ');
}

function buildDraftMap_() {
  const draftMap = {};

  GmailApp.getDrafts().forEach(function(draft) {
    const message = draft.getMessage();
    const threadId = message.getThread().getId();
    draftMap[threadId] = sanitizeText_(message.getPlainBody());
  });

  return draftMap;
}

function findTargetMessage_(thread) {
  const messages = thread.getMessages();

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (matchesTargetMailbox_(message)) {
      return message;
    }
  }

  return messages.length ? messages[messages.length - 1] : null;
}

function matchesTargetMailbox_(message) {
  const targetMailbox = getTargetMailbox_();
  const to = message.getTo() || '';
  const cc = message.getCc() || '';
  const bcc = message.getBcc() || '';
  const haystack = [to, cc, bcc].join('\n').toLowerCase();
  return haystack.indexOf(targetMailbox.toLowerCase()) !== -1;
}

function buildSlackPayload_(message, draftBody) {
  const sender = sanitizeText_(message.getFrom());
  const subject = sanitizeText_(message.getSubject());
  const body = truncateText_(sanitizeText_(message.getPlainBody()), 2500);
  const normalizedDraft = truncateText_(sanitizeText_(draftBody || '返信下書きなし'), 2500);
  const permalink = message.getThread().getPermalink();

  return {
    text: 'AI返信作成済メールを通知',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'AI返信作成済メール'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: '*送信者*\n' + escapeSlackMrkdwn_(sender)
          },
          {
            type: 'mrkdwn',
            text: '*件名*\n' + escapeSlackMrkdwn_(subject || '(件名なし)')
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*本文*\n```' + escapeSlackCodeBlock_(body || '(本文なし)') + '```'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*返信下書き本文*\n```' + escapeSlackCodeBlock_(normalizedDraft) + '```'
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '<' + permalink + '|Gmailスレッドを開く>'
          }
        ]
      }
    ]
  };
}

function postToSlack_(webhookUrl, payload) {
  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Slack notification failed: ' + statusCode + ' ' + response.getContentText());
  }
}

function getSlackWebhookUrl_() {
  const webhookUrl = PropertiesService.getScriptProperties()
    .getProperty(CONFIG.SLACK.WEBHOOK_PROPERTY_KEY);

  if (!webhookUrl) {
    throw new Error('Script Properties に SLACK_WEBHOOK_URL を設定してください。');
  }

  return webhookUrl;
}

function getTargetMailbox_() {
  const targetMailbox = PropertiesService.getScriptProperties()
    .getProperty(CONFIG.TARGET_MAILBOX_PROPERTY_KEY);

  if (!targetMailbox) {
    throw new Error('Script Properties に TARGET_MAILBOX を設定してください。');
  }

  return targetMailbox;
}

function getOrCreateLabel_(labelName) {
  return GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
}

function threadHasLabel_(thread, labelName) {
  return thread.getLabels().some(function(label) {
    return label.getName() === labelName;
  });
}

function deleteExistingTrigger_(functionName) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === functionName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function sanitizeText_(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function truncateText_(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength - 3) + '...';
}

function escapeSlackMrkdwn_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeSlackCodeBlock_(text) {
  return escapeSlackMrkdwn_(text).replace(/```/g, "'''");
}
