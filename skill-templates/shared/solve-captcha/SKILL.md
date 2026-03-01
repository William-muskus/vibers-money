---
name: solve-captcha
description: Solve a CAPTCHA on a web page using Computer Use MCP. Use when a form or signup shows a captcha (checkbox, image grid, drag-and-drop puzzle, or text challenge). All agents can use this.
---

# Solve Captcha (shared skill)

## When to use
- A page shows a **CAPTCHA** (e.g. "I'm not a robot", image selection, **drag-and-drop puzzle**, or type-the-characters) and you must complete it to proceed (signup, login, download, etc.).
- You are following another skill (e.g. **create-business-email** — Proton Mail signup uses a **drag-and-drop puzzle** — or create-qr-code) and a captcha appears during the flow.

## How to use

1. **Screenshot**  
   Take a **screenshot** so you see the current state of the page and the captcha. The tool returns an image and a list of **interactive elements with numbers**.

2. **Identify the captcha**  
   From the element list, find the captcha:
   - **Checkbox** (e.g. "I'm human", "I'm not a robot"): note its element number.
   - **Image grid** (e.g. "Select all images with …"): note the numbers for the correct image tiles.
   - **Drag-and-drop puzzle** (e.g. "Slide the piece into place", jigsaw-style — **Proton Mail signup uses this**): note the **draggable piece** (slider or puzzle piece) and the **target slot/area** (gap or track). You will **drag** the piece into alignment.
   - **Text challenge** (e.g. type distorted letters/numbers): note the input field and the characters shown.

3. **Interact**  
   - **Checkbox**: **Click** the element number of the checkbox. Sometimes a challenge then appears (e.g. image grid or puzzle); continue with the next step.
   - **Image grid**: **Click** each correct image (by element number). If the grid refreshes, take a new **screenshot** and use the new numbers. Repeat until "Verify" or similar appears, then **click** it.
   - **Drag-and-drop puzzle** (e.g. Proton Mail): Use **drag** (or **drag_offset**) to move the **piece** (element number of the slider/puzzle piece) into the **target** (slot or track). Click and hold on the piece, then drag horizontally (or as the puzzle indicates) until the piece aligns with the gap/target. Release; take a **screenshot** to confirm. If it did not align, try again with a small **drag_offset**. The Computer Use MCP has **drag** and **drag_offset** — use the element_id of the draggable element and the appropriate offset/destination so the piece slots in. **Wait** 1–2 seconds and **screenshot** again; when the puzzle is solved, the page usually advances.
   - **Text challenge**: **Click** the input field, then **type** the characters exactly as shown (use **type** with the string). Then **click** Submit or **press** Enter.

4. **Wait and re-screenshot**  
   After your action, use **wait** (e.g. 2–3 seconds), then take another **screenshot**. If the captcha is solved, the page usually advances (e.g. form unlocks, next step loads). If a new challenge appears (e.g. more images), repeat from step 2.

5. **Retry if it fails**  
   If the captcha fails (wrong answer, expired, or "Try again"):
   - Take a fresh **screenshot** and try again with the new elements.
   - Use **wait** between attempts if the page seems to rate-limit.

## Convention
- One action at a time: screenshot → choose element → click or type → screenshot again.
- Always use the **latest** screenshot's element numbers; the page can change after each action.
- If the captcha cannot be solved after a few attempts, report to your manager or CEO via Swarm Bus and suggest manual completion or an alternative flow.
