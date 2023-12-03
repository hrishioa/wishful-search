/**
 * From https://mtgjson.com/data-models/
 */

import { DDLTable } from '../src/types';

export type LeadershipSkills = {
  brawl: boolean;
  commander: boolean;
  oathbreaker: boolean;
};

export type ForeignData = {
  faceName?: string;
  flavorText?: string;
  language: string;
  name: string;
  text?: string;
  type?: string;
};

export type Rulings = {
  date: string;
  text: string;
};

export type RelatedCards = {
  reverseRelated?: string[];
  spellbook?: string[];
};

export type Legalities = {
  alchemy?: string;
  brawl?: string;
  commander?: string;
  duel?: string;
  explorer?: string;
  future?: string;
  gladiator?: string;
  historic?: string;
  historicbrawl?: string;
  legacy?: string;
  modern?: string;
  oathbreaker?: string;
  oldschool?: string;
  pauper?: string;
  paupercommander?: string;
  penny?: string;
  pioneer?: string;
  predh?: string;
  premodern?: string;
  standard?: string;
  vintage?: string;
};

export type MagicTheGatheringCard = {
  attractionLights?: string[];
  colorIdentity: string[];
  colorIndicator?: string[];
  colors: string[];
  defense?: string;
  edhrecRank?: number;
  faceManaValue?: number;
  faceName?: string;
  foreignData?: ForeignData[];
  hand?: string;
  keywords?: string[];
  layout: string;
  leadershipSkills?: LeadershipSkills;
  legalities: Legalities;
  life?: string;
  loyalty?: string;
  manaCost?: string;
  manaValue: number;
  name: string;
  power?: string;
  printings?: string[];
  relatedCards: RelatedCards;
  rulings?: Rulings[];
  side?: string;
  subtypes: string[];
  supertypes: string[];
  text?: string;
  toughness?: string;
  type: string;
  types: string[];
};

export const STRING_MTG_CARD_TYPESPEC = `
export type LeadershipSkills = {
  brawl: boolean;
  commander: boolean;
  oathbreaker: boolean;
};

export type ForeignData = {
  faceName?: string;
  flavorText?: string;
  language: string;
  name: string;
  text?: string;
  type?: string;
};

export type Rulings = {
  date: string;
  text: string;
};

export type RelatedCards = {
  reverseRelated?: string[];
  spellbook?: string[];
};

export type Legalities = {
  alchemy?: string;
  brawl?: string;
  commander?: string;
  duel?: string;
  explorer?: string;
  future?: string;
  gladiator?: string;
  historic?: string;
  historicbrawl?: string;
  legacy?: string;
  modern?: string;
  oathbreaker?: string;
  oldschool?: string;
  pauper?: string;
  paupercommander?: string;
  penny?: string;
  pioneer?: string;
  predh?: string;
  premodern?: string;
  standard?: string;
  vintage?: string;
};

export type MagicTheGatheringCard = {
  attractionLights?: string[];
  colorIdentity: string[];
  colorIndicator?: string[];
  colors: string[];
  defense?: string;
  edhrecRank?: number;
  faceManaValue?: number;
  faceName?: string;
  foreignData?: ForeignData[];
  hand?: string;
  keywords?: string[];
  layout: string;
  leadershipSkills?: LeadershipSkills;
  legalities: Legalities;
  life?: string;
  loyalty?: string;
  manaCost?: string;
  manaValue: number;
  name: string;
  power?: string;
  printings?: string[];
  relatedCards: RelatedCards;
  rulings?: Rulings[];
  side?: string;
  subtypes: string[];
  supertypes: string[];
  text?: string;
  toughness?: string;
  type: string;
  types: string[];
};
`;

const cardsTable: DDLTable = {
  name: 'Cards',
  columns: [
    {
      name: 'id',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Card name',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 3,
      },
    },
    {
      name: 'mana_cost',
      columnSpec: 'TEXT',
      visibleToLLM: true,
      description: 'Mana cost to play the card',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 10,
      },
    },
    {
      name: 'mana_value',
      columnSpec: 'INTEGER',
      visibleToLLM: true,
      description: 'Converted mana cost',
      dynamicEnumSettings: {
        type: 'MIN_MAX',
        format: 'NUMBER',
      },
    },
    {
      name: 'type',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Creature, sorcery, etc',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 10,
      },
    },
    {
      name: 'subtypes',
      columnSpec: 'TEXT',
      visibleToLLM: true,
      description: 'Creature types, spell types, etc',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 10,
      },
    },
    {
      name: 'text',
      columnSpec: 'TEXT',
      visibleToLLM: true,
      description: 'Rules text for the card',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE_CHAR_LIMITED',
        charLimit: 1000,
      },
    },
    {
      name: 'layout',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Normal, split, flip, etc',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 10,
      },
    },
  ],
};

const facesTable: DDLTable = {
  name: 'Faces',
  columns: [
    {
      name: 'card_id',
      columnSpec: 'INTEGER NOT NULL',
      visibleToLLM: true,
      description: 'ID linking to main Cards table',
      foreignKey: {
        table: 'Cards',
        column: 'card_id',
      },
    },
    {
      name: 'face_name',
      columnSpec: 'TEXT',
      visibleToLLM: true,
      description: 'Name of this face',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 3,
      },
    },
    {
      name: 'face_mana_value',
      columnSpec: 'INTEGER',
      visibleToLLM: true,
      description: 'Mana value of this face',
      dynamicEnumSettings: {
        type: 'MIN_MAX',
        format: 'NUMBER',
      },
    },
    {
      name: 'face_text',
      columnSpec: 'TEXT',
      visibleToLLM: true,
      description: 'Rules text',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE_CHAR_LIMITED',
        charLimit: 1000,
      },
    },
  ],
};

const printingsTable: DDLTable = {
  name: 'Printings',
  columns: [
    {
      name: 'card_id',
      columnSpec: 'INTEGER NOT NULL',
      visibleToLLM: true,
      description: 'ID linking to main Cards table',
      foreignKey: {
        table: 'Cards',
        column: 'card_id',
      },
    },
    {
      name: 'set_name',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Name of set printed in',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 10,
      },
    },
  ],
};

const foreignDataTable: DDLTable = {
  name: 'Foreign_Data',
  columns: [
    {
      name: 'card_id',
      columnSpec: 'INTEGER NOT NULL',
      visibleToLLM: true,
      description: 'ID linking to main Cards table',
      foreignKey: {
        table: 'Cards',
        column: 'card_id',
      },
    },
    {
      name: 'language',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Language of this text',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 10,
      },
    },
    {
      name: 'name',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Name in this language',
    },
    {
      name: 'text',
      columnSpec: 'TEXT',
      visibleToLLM: true,
      description: 'Rules text in this language',
    },
  ],
};

const rulingsTable: DDLTable = {
  name: 'Rulings',
  columns: [
    {
      name: 'card_id',
      columnSpec: 'INTEGER NOT NULL',
      visibleToLLM: true,
      description: 'ID linking to main Cards table',
      foreignKey: {
        table: 'Cards',
        column: 'card_id',
      },
    },
    {
      name: 'ruling_date',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Date of ruling',
    },
    {
      name: 'ruling_text',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Ruling text',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE_CHAR_LIMITED',
        charLimit: 1000,
      },
    },
  ],
};

const relatedCardsTable: DDLTable = {
  name: 'Related_Cards',
  columns: [
    {
      name: 'card_id',
      columnSpec: 'INTEGER NOT NULL',
      visibleToLLM: true,
      description: 'ID linking to main Cards table',
      foreignKey: {
        table: 'Cards',
        column: 'card_id',
      },
    },
    {
      name: 'related_card_id',
      columnSpec: 'INTEGER NOT NULL',
      visibleToLLM: true,
      description: 'ID of related card',
    },
    {
      name: 'relation_type',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: '"spellbook", "reverse_related", etc',
    },
  ],
};

const legalitiesTable: DDLTable = {
  name: 'Legalities',
  columns: [
    {
      name: 'card_id',
      columnSpec: 'INTEGER NOT NULL',
      visibleToLLM: true,
      description: 'ID linking to main Cards table',
      foreignKey: {
        table: 'Cards',
        column: 'card_id',
      },
    },
    {
      name: 'format_name',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: 'Format name',
    },
    {
      name: 'legality',
      columnSpec: 'TEXT NOT NULL',
      visibleToLLM: true,
      description: '"legal", "banned", etc',
      dynamicEnumSettings: {
        type: 'EXHAUSTIVE',
        topK: 10,
      },
    },
  ],
};

export const MTGTables: DDLTable[] = [
  cardsTable,
  facesTable,
  printingsTable,
  foreignDataTable,
  rulingsTable,
  relatedCardsTable,
  legalitiesTable,
];

export function cardToRows(card: MagicTheGatheringCard): any[][][] {
  const cardRows: any[][] = [];

  // Cards table
  const cardData: any[] = [];
  cardData.push(card.name);
  cardData.push(card.manaCost || null);
  cardData.push(card.manaValue);
  cardData.push(card.type);
  cardData.push((card.subtypes && card.subtypes.join(',')) || null);
  cardData.push(card.text || null);
  cardData.push(card.layout);
  cardRows.push(cardData);

  // Faces table
  const faceRows: any[][] = [];
  faceRows.push([
    card.name,
    card.faceName || 'NULL',
    card.faceManaValue || 'NULL',
    card.text || 'NULL',
  ]);

  // Printings table
  const printingRows: any[][] = card.printings
    ? card.printings.map((set) => [card.name, set])
    : [];

  // Foreign Data table
  const foreignRows: any[][] = card.foreignData
    ? card.foreignData.map((data) => [
        card.name,
        data.language,
        data.name,
        data.text || null,
      ])
    : [];

  // Rulings table
  const rulingRows: any[][] = card.rulings
    ? card.rulings.map((ruling) => [
        card.name,
        ruling.date ? new Date(ruling.date).toISOString() : null,
        ruling.text,
      ])
    : [];

  // Related Cards table
  const relatedRows: any[][] =
    card.relatedCards && card.relatedCards.reverseRelated
      ? card.relatedCards.reverseRelated.map((related) => [
          card.name,
          related,
          'reverse_related',
        ])
      : [];

  // Legalities table
  const legalityRows: any[][] = [];
  for (const format in card.legalities) {
    legalityRows.push([
      card.name,
      format,
      card.legalities[format as keyof typeof card.legalities],
    ]);
  }

  // console.log('Returning ', cardRows);

  return [
    cardRows,
    faceRows,
    printingRows,
    foreignRows,
    rulingRows,
    relatedRows,
    legalityRows,
  ];
}

export function cardToString(card: MagicTheGatheringCard) {
  let retStr = `Name: ${card.name}\n`;
  if (card.manaCost) retStr += `Mana cost: ${card.manaCost}\n`;
  retStr += `Mana value: ${card.manaValue}\n`;
  retStr += `Type: ${card.type}\n`;
  if (card.supertypes) retStr += `Supertypes: ${card.supertypes.join(', ')}\n`;
  if (card.types) retStr += `Types: ${card.types.join(', ')}\n`;
  if (card.colorIdentity)
    retStr += `Color identity: ${card.colorIdentity.join(', ')}\n`;
  if (card.colors) retStr += `Colors: ${card.colors.join(', ')}\n`;
  if (card.leadershipSkills)
    retStr += `Leadership skills: ${Object.entries(card.leadershipSkills)
      .map(([format, skill]) => `${format}: ${skill}`)
      .join(', ')}\n`;
  if (card.hand) retStr += `Hand: ${card.hand}\n`;
  if (card.life) retStr += `Life: ${card.life}\n`;
  if (card.loyalty) retStr += `Loyalty: ${card.loyalty}\n`;
  if (card.power) retStr += `Power: ${card.power}\n`;
  if (card.toughness) retStr += `Toughness: ${card.toughness}\n`;
  if (card.defense) retStr += `Defense: ${card.defense}\n`;
  if (card.keywords) retStr += `Keywords: ${card.keywords.join(', ')}\n`;
  if (card.attractionLights)
    retStr += `Attraction lights: ${card.attractionLights.join(', ')}\n`;
  if (card.colorIndicator)
    retStr += `Color indicator: ${card.colorIndicator.join(', ')}\n`;
  if (card.edhrecRank) retStr += `EDHREC rank: ${card.edhrecRank}\n`;
  if (card.faceManaValue) retStr += `Face mana value: ${card.faceManaValue}\n`;
  if (card.faceName) retStr += `Face name: ${card.faceName}\n`;
  if (card.subtypes) retStr += `Subtypes: ${card.subtypes.join(', ')}\n`;
  if (card.text) retStr += `Text: ${card.text}\n`;
  retStr += `Layout: ${card.layout}\n`;
  if (card.printings) retStr += `Printings: ${card.printings.join(', ')}\n`;
  if (card.foreignData)
    retStr += `Foreign data: ${card.foreignData
      .map((data) => `${data.language}: ${data.name}`)
      .join(', ')}\n`;
  if (card.rulings)
    retStr += `Rulings: ${card.rulings
      .map((ruling) => `${ruling.date}: ${ruling.text}`)
      .join(', ')}\n`;
  if (card.relatedCards && card.relatedCards.reverseRelated)
    retStr += `Reverse related: ${card.relatedCards.reverseRelated.join(
      ', ',
    )}\n`;
  if (card.legalities)
    retStr += `Legalities: ${Object.entries(card.legalities)
      .map(([format, legality]) => `${format}: ${legality}`)
      .join(', ')}\n`;

  return retStr;
}
