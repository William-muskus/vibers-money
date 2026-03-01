---
name: check-email
description: Check the business inbox (e.g. Proton Mail). Use Computer Use MCP on account.proton.me. All agents can use this to read the shared business email.
---

# Check Email (shared skill)

## When to use
- You need to read the **business email inbox** (e.g. to see signup verifications, partner replies, or support emails).
- Your task requires knowing what was sent to or from the business email address.

## How to use

1. **Credentials**  
   The business has **one** shared email (created via the create-business-email skill, typically Proton Mail). Get the login details from the agreed place (e.g. workspace credentials file, or ask Security Director / CEO via Swarm Bus if you don't have access).

2. **Domain access**  
   Ensure **`account.proton.me`** is in your approved domains. If not, request access from the Security Director via Swarm Bus.

3. **Open inbox with Computer Use**  
   - **Navigate** to **https://mail.proton.me** (or https://account.proton.me).
   - **Screenshot** to see the page. If you are not logged in, **click** the sign-in area and **type** the business email and password; submit and **wait** for the inbox to load.
   - **Screenshot** again to see the inbox. Identify the list of emails (each row may have an element number). **Click** an email to open it; **screenshot** to read the body. Use **scroll** if needed.
   - Note senders, subjects, and key content. Use **click** on Back or Inbox to return to the list.

4. **Act on what you read**  
   Summarize or report findings via Swarm Bus, add todos for follow-up (e.g. reply via send-email), or complete your task.

## Convention
- One business email per business; all agents use the same inbox for check-email.
- Do not change the password or security settings unless instructed. If you need to mark messages read or archive, do so sparingly and only when it helps the workflow.
