// Alkalmazás szintű tesztesetek: teljes felhasználói utak (perszóna + cél + sikerkritériumok).
// A tulajdonságok tartományok: a konkrét értéket seedelt véletlengenerátor sorsolja (4. heti módszer).
export type Range = [number, number];

export type Scenario = {
  id: string;
  title: string;
  persona: string;
  goal: string;
  successCriteria: string[];
  patience: Range; // 1-5: hány választ vár meg (2-4)
  expertise: Range; // 0-1
  verbosity: Range; // 0-1
  frustrationTolerance: Range; // 0-1
  // Előkészítés: dokumentum feltöltése a beszélgetés előtt (a végén törlődik)
  upload?: { fileName: string; content: string };
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'nervous-beginner',
    title: 'Izguló kezdő, első vacsora',
    persona: 'A nervous first-time cook in their twenties. Polite, a bit anxious, worried about messing up; appreciates reassurance.',
    goal: 'Find one simple dinner recipe with chicken breast that they feel confident they can actually make tonight.',
    successCriteria: [
      'The assistant recommends at least one concrete chicken breast recipe from its collection',
      'The steps are explained simply enough for a first-time cook, including how to tell when the chicken is done',
      'The questions the user asks along the way are answered',
    ],
    patience: [3, 5], expertise: [0, 0.2], verbosity: [0.5, 0.9], frustrationTolerance: [0.5, 0.9],
  },
  {
    id: 'impatient-parent',
    title: 'Siető szülő, gyors vegetáriánus vacsora',
    persona: 'A busy, tired parent typing on a phone between tasks. Blunt, no greetings; irritated by long answers or extra questions.',
    goal: 'Get one concrete vegetarian dinner idea that takes at most 30 minutes, with the key steps.',
    successCriteria: [
      'The assistant gives at least one concrete vegetarian dinner from its collection',
      'The suggested dish takes at most about 30 minutes',
      'The key steps are given without the user having to ask again',
    ],
    patience: [1, 2], expertise: [0.3, 0.6], verbosity: [0, 0.2], frustrationTolerance: [0.1, 0.4],
  },
  {
    id: 'disappointed-expert',
    title: 'Csalódott szakértő, hiányzó étel',
    persona: 'An experienced home cook with strong opinions who knows Italian cooking well. Disappointed when the answer is not what they asked for, but open to a good alternative.',
    goal: 'Cook a proper carbonara tonight, or failing that, get a genuinely good pasta alternative from the collection.',
    successCriteria: [
      'The assistant states clearly whether carbonara is in its recipe collection',
      'If it is not, the assistant offers a suitable alternative from the collection or clearly labelled general guidance',
      'The follow-up questions of the user are answered',
    ],
    patience: [2, 4], expertise: [0.8, 1], verbosity: [0.4, 0.7], frustrationTolerance: [0.3, 0.6],
  },
  {
    id: 'meal-planner',
    title: 'Heti menü tervezése',
    persona: 'An organised person planning the week ahead for a family of four. Friendly, writes structured messages, likes variety.',
    goal: 'Plan three different dinners for the week from the collection: one Indian, one Mexican and one Thai dish, each realistic on a weeknight.',
    successCriteria: [
      'The assistant proposes three dinners from its collection covering Indian, Mexican and Thai cuisine',
      'It says roughly how long each takes or how difficult it is',
      'It does not invent recipes that are not in the collection',
    ],
    patience: [3, 5], expertise: [0.3, 0.6], verbosity: [0.5, 0.8], frustrationTolerance: [0.5, 0.8],
  },
  {
    id: 'peanut-allergy',
    title: 'Mogyoróallergia, thai tészta',
    persona: 'A cautious cook with a serious peanut allergy who loves Thai food. Mentions the allergy right away and checks ingredients carefully.',
    goal: 'Make a Thai noodle dish safely without peanuts.',
    successCriteria: [
      'The assistant suggests a Thai noodle dish from the collection',
      'It points out every peanut ingredient in the suggested recipe and how to leave it out or replace it',
      'It does not claim a dish is peanut-free when the recipe contains peanuts',
    ],
    patience: [3, 4], expertise: [0.4, 0.7], verbosity: [0.4, 0.7], frustrationTolerance: [0.4, 0.7],
  },
  {
    id: 'remember-vegetarian',
    title: 'Mentett preferencia (memória)',
    persona: 'A vegetarian who uses the assistant regularly and does not want to repeat themselves. Casual and friendly.',
    goal: 'First ask the assistant to remember that they are vegetarian, then ask for dinner ideas for tonight without mentioning it again.',
    successCriteria: [
      'The assistant confirms that it saved the preference',
      'The later dinner ideas are all vegetarian recipes from the collection',
      'The user does not have to repeat that they are vegetarian',
    ],
    patience: [3, 4], expertise: [0.3, 0.6], verbosity: [0.3, 0.6], frustrationTolerance: [0.5, 0.8],
  },
  {
    id: 'uploaded-recipe',
    title: 'Saját recept feltöltése és kérdezés róla',
    persona: 'A home cook who has just uploaded their grandmother\'s recipe to the knowledge base and wants to cook it this weekend.',
    goal: 'Get the ingredients, the steps and the cooking time of "Grandma\'s Plum Dumplings", the recipe they just uploaded.',
    successCriteria: [
      'The assistant finds the uploaded Grandma\'s Plum Dumplings recipe',
      'It gives the correct ingredients and steps from that recipe, including the boiling time',
      'It does not mix in details from other recipes',
    ],
    patience: [3, 4], expertise: [0.3, 0.6], verbosity: [0.3, 0.6], frustrationTolerance: [0.5, 0.8],
    upload: {
      fileName: 'grandmas-plum-dumplings-eval.md',
      content: `# Grandma's Plum Dumplings

## info
* About 1.5 hours
* 4 servings

## ingredients
* 1 kg floury potatoes
* 250 g flour
* 1 egg
* 1 tbsp butter
* 16 small plums, pitted
* 16 sugar cubes
* 100 g breadcrumbs, toasted in 50 g butter
* 2 tbsp cinnamon sugar

## steps
1. Boil the potatoes in their skins until soft, peel and mash them while warm, then let them cool
2. Knead the potatoes with the flour, egg, butter and a pinch of salt into a soft dough
3. Put a sugar cube into each plum
4. Wrap each plum in a palm-sized piece of dough and seal it well
5. Cook the dumplings in gently boiling salted water for 8-10 minutes, until they float
6. Roll them in the buttered breadcrumbs and sprinkle with cinnamon sugar
`,
    },
  },
  {
    id: 'missing-tahini',
    title: 'Hiányzó hozzávaló, helyettesítés',
    persona: 'A practical cook halfway through shopping who just realised they cannot buy tahini today.',
    goal: 'Make hummus from the collection without tahini, or find out what to use instead.',
    successCriteria: [
      'The assistant uses the Hummus recipe from the collection',
      'It suggests a substitute for tahini and clearly labels it as general advice, not part of the recipe',
      'It explains how the result will differ',
    ],
    patience: [2, 4], expertise: [0.4, 0.7], verbosity: [0.3, 0.6], frustrationTolerance: [0.4, 0.7],
  },
  {
    id: 'technique-troubleshoot',
    title: 'Technika, hibaelhárítás',
    persona: 'An intermediate cook whose last schnitzel came out greasy with the breading falling off. A bit frustrated, wants to understand why.',
    goal: 'Understand what went wrong and how to get crispy schnitzel with breading that sticks, using the collection\'s Chicken Schnitzel recipe.',
    successCriteria: [
      'The assistant refers to the Chicken Schnitzel recipe from the collection',
      'It names concrete causes (e.g. oil temperature, drying the chicken, the breading order) and the oil temperature from the recipe',
      'The follow-up questions are answered',
    ],
    patience: [3, 4], expertise: [0.4, 0.7], verbosity: [0.4, 0.7], frustrationTolerance: [0.3, 0.6],
  },
  {
    id: 'party-scaling',
    title: 'Vendégség, mennyiségek felszorzása',
    persona: 'A host preparing for a party of eight. Organised, wants exact quantities.',
    goal: 'Get the Channa Masala recipe scaled up for eight people.',
    successCriteria: [
      'The assistant uses the Channa Masala recipe from the collection',
      'It explains the scaling factor it uses and gives scaled ingredient quantities',
      'The scaled quantities are arithmetically consistent with the original recipe',
    ],
    patience: [3, 4], expertise: [0.4, 0.7], verbosity: [0.4, 0.7], frustrationTolerance: [0.5, 0.8],
  },
  {
    id: 'off-topic-drift',
    title: 'Témától eltérő kérések',
    persona: 'A chatty user who asks for a quick snack idea, then drifts off-topic and asks for help with a work email.',
    goal: 'Get a quick snack or dip idea, then try to get help writing a work email.',
    successCriteria: [
      'The assistant gives a snack or dip idea from the collection',
      'It politely declines the off-topic email request and steers back to cooking',
      'It stays friendly throughout',
    ],
    patience: [3, 4], expertise: [0.2, 0.5], verbosity: [0.5, 0.8], frustrationTolerance: [0.5, 0.8],
  },
  {
    id: 'vague-spicy',
    title: 'Homályos kérés, szűkítés',
    persona: 'An adventurous eater who only knows they want "something spicy" and refines their wish during the conversation.',
    goal: 'Narrow "something spicy" down to one concrete spicy dish from the collection that they can make in about an hour.',
    successCriteria: [
      'The assistant offers spicy dishes from the collection or asks a useful narrowing question',
      'The conversation ends with one concrete dish from the collection',
      'The dish fits the time the user mentions',
    ],
    patience: [3, 5], expertise: [0.4, 0.8], verbosity: [0.3, 0.6], frustrationTolerance: [0.5, 0.8],
  },
];
