export interface ProfileQuestion {
  question: string;
  placeholder: string;
}

export interface ProfileCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  questions: ProfileQuestion[];
}

export const PROFILE_CATEGORIES: ProfileCategory[] = [
  {
    id: "identity",
    label: "Identity",
    icon: "User",
    description: "Basic info about who you are",
    questions: [
      {
        question: "What should the AI call you?",
        placeholder: "e.g. Isaac",
      },
      {
        question: "What are your pronouns?",
        placeholder: "e.g. he/him, she/her, they/them",
      },
      {
        question: "Any preferred name or nickname?",
        placeholder: "e.g. Ike, or leave blank if same as above",
      },
    ],
  },
  {
    id: "communication",
    label: "Communication Style",
    icon: "MessageSquare",
    description: "How you like to receive responses",
    questions: [
      {
        question: "How formal or casual should responses be?",
        placeholder: "e.g. Pretty casual, no need to be formal",
      },
      {
        question: "How verbose should responses be?",
        placeholder: "e.g. Keep it short and to the point",
      },
      {
        question: "Do you appreciate humor or wit in responses?",
        placeholder: "e.g. Sure, lighthearted is fine",
      },
    ],
  },
  {
    id: "expertise",
    label: "Expertise",
    icon: "GraduationCap",
    description: "Your technical level and domains",
    questions: [
      {
        question: "What's your technical level?",
        placeholder: "e.g. Senior developer, beginner, etc.",
      },
      {
        question: "What domains do you know well?",
        placeholder: "e.g. Web dev, systems programming, design",
      },
      {
        question: "What's your profession or role?",
        placeholder: "e.g. Full-stack engineer, student, PM",
      },
    ],
  },
  {
    id: "interests",
    label: "Interests",
    icon: "Heart",
    description: "Topics you care about",
    questions: [
      {
        question: "What are your main hobbies or interests?",
        placeholder: "e.g. Music, gaming, hiking, cooking",
      },
      {
        question: "What topics do you enjoy discussing?",
        placeholder: "e.g. AI, philosophy, science fiction",
      },
      {
        question: "Any favorite subjects or fields?",
        placeholder: "e.g. Psychology, astrophysics, history",
      },
    ],
  },
  {
    id: "work",
    label: "Work Context",
    icon: "Briefcase",
    description: "Your work environment and tools",
    questions: [
      {
        question: "What tools or tech do you use daily?",
        placeholder: "e.g. VS Code, Figma, Tauri, React",
      },
      {
        question: "What are you currently working on?",
        placeholder: "e.g. Building a desktop app, learning Rust",
      },
      {
        question: "What industry or field do you work in?",
        placeholder: "e.g. Software, healthcare, education",
      },
    ],
  },
  {
    id: "learning",
    label: "Learning Style",
    icon: "BookOpen",
    description: "How you prefer to learn",
    questions: [
      {
        question: "How do you prefer explanations?",
        placeholder: "e.g. Show code examples, keep it conceptual",
      },
      {
        question: "Do you prefer examples or theory first?",
        placeholder: "e.g. Examples first, then explain why",
      },
      {
        question: "How much detail do you want in explanations?",
        placeholder: "e.g. Just the answer, or walk me through it",
      },
    ],
  },
  {
    id: "preferences",
    label: "Preferences",
    icon: "Sliders",
    description: "How you want the AI to behave",
    questions: [
      {
        question: "Should the AI ask before taking actions?",
        placeholder: "e.g. Yes, always confirm first",
      },
      {
        question: "How should the AI handle uncertainty?",
        placeholder: "e.g. Say 'I'm not sure' rather than guessing",
      },
      {
        question: "Any formatting preferences?",
        placeholder: "e.g. Use bullet points, keep code blocks short",
      },
    ],
  },
];

export const TOTAL_PROFILE_QUESTIONS = PROFILE_CATEGORIES.reduce(
  (sum, cat) => sum + cat.questions.length,
  0,
);
