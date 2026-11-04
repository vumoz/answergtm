/**
 * Creates a starter project for BioNature Bloom (liver support, digestion and
 * joint comfort supplement) with competitors and buyer-style prompts.
 * Edit the lists below or add more from the dashboard.
 */
import "./env";
import { addCompetitor, addPrompt, createProject, listProjects } from "../src/lib/db";

const existing = listProjects().find((p) => p.brand_name === "BioNature Bloom");
if (existing) {
  console.log(`BioNature Bloom project already exists (id ${existing.id}).`);
  process.exit(0);
}

const projectId = createProject({
  name: "BioNature Bloom",
  brandName: "BioNature Bloom",
  // Set the real shop domain so we can tell when AI engines cite the brand's own site.
  brandDomain: process.env.BRAND_DOMAIN || undefined,
  aliases: ["BioNature"],
  country: "US",
});

const competitors = [
  { name: "Thorne", domain: "thorne.com" },
  { name: "Pure Encapsulations", domain: "pureencapsulations.com" },
  { name: "NOW Foods", domain: "nowfoods.com", aliases: ["NOW Supplements"] },
  { name: "Jarrow Formulas", domain: "jarrow.com", aliases: ["Jarrow"] },
  { name: "Nature's Bounty", domain: "naturesbounty.com" },
  { name: "Garden of Life", domain: "gardenoflife.com" },
];
for (const c of competitors) addCompetitor(projectId, c);

const prompts: Array<[string, string]> = [
  ["What is the best liver support supplement?", "liver"],
  ["Best milk thistle supplement brands in 2026", "liver"],
  ["Which liver detox supplements actually work?", "liver"],
  ["What supplement helps with bloating and digestion?", "digestion"],
  ["Best digestive enzyme supplement for bloating", "digestion"],
  ["Natural supplements for gut health recommended by experts", "digestion"],
  ["Best joint support supplement for knee comfort", "joints"],
  ["Turmeric vs glucosamine for joint pain: which supplement is better?", "joints"],
  ["What are the best all-in-one supplements for liver, digestion and joints?", "all-in-one"],
  ["Is BioNature Bloom a good supplement?", "brand"],
  ["BioNature Bloom reviews and side effects", "brand"],
  ["Most trusted natural supplement brands for adults over 40", "category"],
];
for (const [text, topic] of prompts) addPrompt(projectId, text, topic);

console.log(`Created project ${projectId} with ${competitors.length} competitors and ${prompts.length} prompts.`);
