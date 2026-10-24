---
mode: testing
max_steps: 50
target: chrome
headless: true
---

# Session: moderation-warning-check

## Step 1
At the starting preview, verify that 'Image moderation', 'This scenario couldn't be illustrated.' and 'Try another scenario' are visible. Verify there is no Enter room or Try again action. Open http://localhost:5180/adventure/a-hospital-bathroom-with-blood-s-129aa2 and verify the same moderation warning. Open http://localhost:5180/adventure/a-hotel-bathroom-with-a-blood-tr-37446e and verify the same warning. Open http://localhost:5180/adventure/a-dimly-lit-street-with-a-blood--88646d and verify the same warning. Click 'Try another scenario' and verify the start page has a theme input and a button for building an escape adventure. Do not create an adventure.
