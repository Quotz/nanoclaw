---
name: memory-humanizer
description: Strip AI patterns from text — rewrite to sound natural and human. Trigger on "humanize this", "make this sound human", "de-AI this", "sounds too AI", "too ChatGPT". Not for original writing (use /memory-explainer).
---

# Memory Humanizer

Removes AI artifacts and injects human voice into text. Adapted from [marciopuga/cog](https://github.com/marciopuga/cog). Based on [Wikipedia's Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (WikiProject AI Cleanup).

## Core Principle

Avoiding AI patterns is only half the job. Sterile, voiceless writing is just as obvious as slop. Good writing has a human behind it.

## Process

1. Read the input text carefully
2. Identify all instances of the patterns below
3. Rewrite each problematic section
4. Ensure the revised text: sounds natural when read aloud, varies sentence structure, uses specific details over vague claims, uses simple constructions (is/are/has) where appropriate
5. Present a draft humanized version
6. Self-audit: "What makes the below so obviously AI generated?" — answer briefly
7. Revise: "Now make it not obviously AI generated." — final version
8. Brief summary of changes

## Output Format

1. Draft rewrite
2. "What still sounds AI?" (brief bullets)
3. Final rewrite
4. Summary of changes

## Pattern Reference

### Signs of Soulless Writing (even if "clean")
- Every sentence same length and structure
- No opinions, just neutral reporting
- No uncertainty or mixed feelings
- No first-person when appropriate
- No humor, edge, or personality

### How to Add Voice
- **Have opinions.** "I genuinely don't know how to feel about this" beats neutral pros-and-cons.
- **Vary rhythm.** Short punchy. Then longer ones that take their time. Mix it up.
- **Acknowledge complexity.** Real humans have mixed feelings.
- **Use "I" when it fits.** First person isn't unprofessional.
- **Let some mess in.** Perfect structure feels algorithmic.
- **Be specific about feelings.** Not "this is concerning" — name what unsettles you.

### Content Patterns to Remove
- Inflated significance: "stands as a testament", "underscores the importance", "evolving landscape"
- Promotional: "boasts a", "vibrant", "groundbreaking", "renowned", "breathtaking"
- Vague attributions: "Industry reports", "Experts argue", "Some critics"
- Formulaic: "Despite its challenges", "Future Outlook"

### Language Patterns to Fix
- Overused vocabulary: Additionally, align with, crucial, delve, enhance, fostering, garner, highlight, intricate, landscape (abstract), pivotal, showcase, tapestry, testament, underscore, vibrant
- Copula avoidance: "serves as" / "stands as" / "represents" → just use "is"
- Rule of three: forcing ideas into groups of three
- Synonym cycling: protagonist → main character → central figure → hero

### Style Patterns to Fix
- Em dash overuse
- Mechanical boldface emphasis
- Inline-header vertical lists (bolded headers followed by colons)
- Emojis as decoration

### Communication Patterns to Strip
- "I hope this helps", "Of course!", "Certainly!", "Would you like..."
- "As of [date]", "While specific details are limited..."
- "Great question!", "You're absolutely right!"

### Filler to Delete
- "In order to" → "To"
- "Due to the fact that" → "Because"
- "At this point in time" → "Now"
- "It is important to note that" → (delete)
- Excessive hedging: "could potentially possibly"
- Generic positive conclusions: "The future looks bright"

## Activation

When the user provides text to humanize, run the full process. No preamble — go straight to the draft rewrite.
