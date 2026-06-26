// src/content.js
// Bridge the Gap questions sourced from bridge_the_gap_questions.txt
// Parsed into categories for better organization.

import raw from '../bridge_the_gap_questions.txt?raw';

export const bridgeCategories = parseBridgeCategories(raw);

export const allBridgeQuestions = bridgeCategories.flatMap(c => c.questions);

function parseBridgeCategories(text) {
  const lines = text.split(/\r?\n/);
  const categories = [];
  let current = null;

  for (const line of lines) {
    const catMatch = line.match(/^Category \d+:\s*(.+)$/i);
    if (catMatch) {
      if (current) categories.push(current);
      current = { title: catMatch[1].trim(), questions: [] };
      continue;
    }
    const qMatch = line.match(/^\d+\.\s*(.+)$/);
    if (qMatch && current) {
      current.questions.push(qMatch[1].trim());
    }
  }
  if (current) categories.push(current);

  // Fallback if parsing fails
  if (categories.length === 0 || categories.every(c => c.questions.length === 0)) {
    return fallbackCategories();
  }
  return categories;
}

function fallbackCategories() {
  return [
    {
      title: "Emotional Connection & Vulnerability",
      questions: [
        "When you are feeling sad or overwhelmed, what do you need most from a partner?",
        "How comfortable are you with expressing deep emotions?",
        "What makes you feel truly seen and understood by someone?",
        "How important is it for you to feel emotionally safe in a relationship?",
        "What childhood experience shaped how you express emotions today?"
      ]
    },
    {
      title: "Conflict, Communication & Repair",
      questions: [
        "How do you typically behave during an argument?",
        "What is your biggest fear when you and your partner disagree?",
        "How do you prefer to resolve conflicts — immediately or after cooling down?",
        "How do you repair after a fight?",
        "What is one communication habit you want to improve?"
      ]
    }
  ];
}
