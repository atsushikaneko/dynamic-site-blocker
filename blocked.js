const messages = [
  "Nice try. Back to work.",
  "This site can wait. Your deadlines can't.",
  "Your future self will thank you.",
  "Focus is a superpower. Use it.",
  "You already decided to block this. Trust yourself.",
  "Distraction detected. Neutralized.",
  "Not today.",
  "Your goals called. They said get back to work.",
  "Plot twist: you don't actually need this site.",
  "Every minute counts. This wasn't one of them.",
  "Remember why you started this session.",
  "Willpower is overrated. That's why you have me.",
  "You're better than this. Literally \u2014 you built a blocker.",
  "The internet will still be here after your session.",
];

const params = new URLSearchParams(window.location.search);
const domain = params.get("domain") || "Unknown";
const attempts = parseInt(params.get("attempts") || "1", 10);

document.getElementById("domain").textContent = domain;
document.getElementById("message").textContent = '"' + messages[Math.floor(Math.random() * messages.length)] + '"';
document.getElementById("attempts").textContent = "Attempt #" + attempts + " this session";
