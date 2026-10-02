export type WordCategory = {
  id: string;
  displayName: string;
  words: string[];
  difficulty: number;
  parent?: string;
};
const category = (
  id: string,
  displayName: string,
  words: string,
  difficulty = 1,
  parent?: string,
): WordCategory => ({
  id,
  displayName,
  words: words.split('|'),
  difficulty,
  parent,
});
export const categories: WordCategory[] = [
  category(
    'mammals',
    'Mammals',
    'Dog|Cat|Horse|Elephant|Rabbit|Tiger|Otter|Zebra|Giraffe|Dolphin',
    3,
    'animals',
  ),
  category(
    'birds',
    'Birds',
    'Robin|Eagle|Sparrow|Owl|Penguin|Swan|Raven|Parrot|Falcon|Flamingo',
    3,
    'animals',
  ),
  category(
    'reptiles',
    'Reptiles',
    'Cobra|Iguana|Crocodile|Gecko|Python|Tortoise|Alligator|Chameleon|Skink|Boa',
    3,
    'animals',
  ),
  category(
    'fruit',
    'Fruit',
    'Apple|Banana|Pear|Peach|Plum|Mango|Orange|Grape|Apricot|Pineapple',
    3,
    'foods',
  ),
  category(
    'vegetables',
    'Vegetables',
    'Carrot|Lettuce|Spinach|Cabbage|Celery|Kale|Broccoli|Cauliflower|Parsnip|Radish',
    3,
    'foods',
  ),
  category(
    'grains',
    'Grains',
    'Rice|Wheat|Barley|Oats|Rye|Millet|Sorghum|Spelt',
    3,
    'foods',
  ),
  category(
    'tools',
    'Workshop tools',
    'Hammer|Wrench|Pliers|Hacksaw|Screwdriver|Chisel|Crowbar|Anvil|Vise|Drill',
  ),
  category(
    'clothing',
    'Clothing',
    'Coat|Sock|Scarf|Shirt|Skirt|Jacket|Glove|Sweater|Trousers|Waistcoat',
  ),
  category(
    'vehicles',
    'Vehicles',
    'Truck|Bicycle|Bus|Tram|Motorcycle|Taxi|Van|Scooter|Train|Helicopter',
  ),
  category(
    'plants',
    'Trees',
    'Oak|Birch|Pine|Elm|Willow|Maple|Cedar|Spruce|Fir|Redwood',
  ),
  category(
    'furniture',
    'Furniture',
    'Sofa|Armchair|Desk|Wardrobe|Bookcase|Dresser|Stool|Bed|Crib|Sideboard',
  ),
  category(
    'colors',
    'Colors',
    'Red|Blue|Yellow|Purple|Green|Indigo|Violet|Beige|Maroon|Turquoise',
  ),
  category(
    'weather',
    'Weather',
    'Rain|Snow|Hail|Sleet|Fog|Drizzle|Thunderstorm|Blizzard|Tornado|Hurricane',
  ),
  category(
    'strings',
    'String instruments',
    'Violin|Cello|Viola|Guitar|Harp|Banjo|Mandolin|Ukulele|Double bass|Lute',
    3,
    'instruments',
  ),
  category(
    'winds',
    'Wind instruments',
    'Clarinet|Flute|Oboe|Bassoon|Saxophone|Trumpet|Trombone|Tuba|Piccolo|Cornet',
    3,
    'instruments',
  ),
];
export function getCategory(id: string) {
  const c = categories.find((c) => c.id === id);
  if (!c) throw Error(`Unknown category ${id}`);
  return c;
}
// Curated disjoint groups prevent botanical/culinary and multi-purpose object ambiguities.
export const distinctGroups = [
  ['mammals', 'fruit', 'tools'],
  ['tools', 'clothing', 'birds'],
  ['vehicles', 'plants', 'furniture'],
  ['colors', 'weather', 'strings'],
];
export const relatedGroups = [
  ['mammals', 'birds', 'reptiles'],
  ['fruit', 'vegetables', 'grains'],
  ['strings', 'winds'],
];
export const wordPool = [...new Set(categories.flatMap((c) => c.words))];
