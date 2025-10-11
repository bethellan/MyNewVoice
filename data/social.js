// Easily editable config for Social / Chit-Chat press-and-speak
// Add or remove items; each has an icon, a display text, and an optional spoken variant (say)
const SOCIAL_PRESS = {
  greetings: [
    { icon: "👋", text: "Hello!" },
    { icon: "🌞", text: "Good morning!" },
    { icon: "🌤️", text: "Good afternoon!" },
    { icon: "🌙", text: "Good evening!" },
    { icon: "🫶", text: "Nice to see you!" },
    { icon: "🙏", text: "Thank you!" },
    { icon: "💕", text: "Love you!" },
    { icon: "👋", text: "Goodbye!" }
  ],
  smalltalk: [
    { icon: "☀️", text: "Beautiful day!" },
    { icon: "⛅", text: "How's the weather?" },
    { icon: "🍵", text: "Want a drink?" },
    { icon: "🍽️", text: "Are you hungry?" },
    { icon: "👨‍👩‍👧‍👦", text: "How is the family?" },
    { icon: "📺", text: "What are you watching?" },
    { icon: "🎵", text: "What music is this?" },
    { icon: "📱", text: "Can you call me?" }
  ],
  reactions: [
    { icon: "😊", text: "I like that!" },
    { icon: "👍", text: "Yes" },
    { icon: "👎", text: "No" },
    { icon: "🤷", text: "I don't know" , say: "I don't know."},
    { icon: "🤩", text: "Awesome!" },
    { icon: "😐", text: "Boring…" },
    { icon: "😟", text: "I'm worried" },
    { icon: "🛑", text: "Please stop" }
  ]
};
