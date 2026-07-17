# Profile Setup

The user profile system captures personal context through 7 categories and 21 questions.

## Categories (from `src/modules/memory/profile-config.ts`)

| Category | Label | Focus |
|----------|-------|-------|
| `identity` | Identity | What to call you, pronouns, preferred name |
| `communication` | Communication Style | Preferred tone, formality level |
| `expertise` | Expertise | Technical skills, domains |
| `interests` | Interests | Hobbies, topics of interest |
| `work` | Work Context | Job role, projects |
| `learning` | Learning Style | How you prefer explanations to be structured |
| `preferences` | Preferences | UI, AI behavior preferences |

## How It Works

1. User answers profile questions through the settings UI
2. Profile responses become structured memory nodes with origin `profile_setup`
3. These nodes receive a retrieval boost for relevant queries
4. Profile memories are protected from eviction (origin check in `isProtectedMemory`)
5. The profile config is stored in `src/modules/memory/profile-config.ts`

## Profile-Aware Boosting

During memory retrieval, profile-aligned nodes receive extra scoring weight, helping the AI personalize responses based on user context.
