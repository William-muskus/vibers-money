---
name: create-business-email
description: Create the single business email address for this business (e.g. for X/Twitter or other signups). Use Proton Mail free signup and Computer Use MCP to complete the form and solve the captcha. Only one business email per business; Security Director or Marketing Director typically owns this.
---

# Create Business Email (directors only)

## When to use
- The business needs a **single** dedicated email address (e.g. to create an X account, register for a service, or for official communications).
- No business email has been created yet (check with CEO or workspace docs first).
- You are the Security Director or Marketing Director (CMO) and this falls under your remit.

## How to use

1. **Domain access**  
   Ensure **`account.proton.me`** is in your approved domains for Computer Use. If not, request access from the Security Director via Swarm Bus before proceeding.

2. **Open Proton Mail signup**  
   Using the Computer Use MCP:
   - **Navigate** to: **https://account.proton.me/mail/signup?plan=free**
   - **Wait** for the page to load, then take a **screenshot** to see the signup form and any captcha.

3. **Fill the signup form**  
   - **Click** the email/username field and **type** the chosen business email (e.g. `contact@` or a name-based address; use a format that matches the business name).
   - Fill any other required fields (password, confirm password, etc.) by **clicking** each field and **typing**. Use a strong password; store it securely per your security guidelines (e.g. in a credentials file in the workspace or report to CEO only via Swarm Bus).

4. **Solve the CAPTCHA**  
   Proton Mail signup uses a **drag-and-drop puzzle** captcha (slide the piece into place). Use the **solve-captcha** skill: take a screenshot, identify the draggable piece and target slot, then use **drag** (or **drag_offset**) to align the piece. Re-screenshot until the puzzle is solved and the page advances.

5. **Submit and confirm**  
   - **Click** the signup/submit button. **Wait** for the next page; take a **screenshot** to confirm. Record the new email address and any recovery info in the agreed place (e.g. draft in workspace or secure message to CEO).

6. **Report**  
   Inform the CEO via Swarm Bus that the business email was created and where it is documented so all agents can use check-email and send-email.

## Convention
- **One business email per business.** If one already exists, use check-email and send-email instead; do not create another.
- Use the **free plan** signup URL above. Credentials must be stored or shared only per security policy.
