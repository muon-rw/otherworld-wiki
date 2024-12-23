import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { formatMinecraftText } from './formatMinecraft';

interface SubraceData {
    name: string;
    description: string;
    powers?: {
        name: string;
        description: string;
    }[];
}

interface RaceData {
    name: string;
    description: string;
    subraces: {
        [key: string]: SubraceData;
    };
}

interface SubclassData {
    name: string;
    description: string;
    powers?: {
        name: string;
        description: string;
    }[];
}

interface ClassData {
    name: string;
    description: string;
    subclasses: {
        [key: string]: SubclassData;
    };
}

interface FeatData {
    name: string;
    description: string;
}

interface CantripData {
    name: string;
    description: string;
}

interface LangData {
    races: { [key: string]: RaceData };
    classes: { [key: string]: ClassData };
    cantrips: { [key: string]: CantripData };
    feats: { [key: string]: FeatData };
}

interface EnchantmentMapping {
    enchantment: string;
    className: string;
    modId: string;
}


type RawLangData = Record<string, string>;

function processText(text: string): string {
    return formatMinecraftText(text);
}

function removeSubCategoryList(description: string): string {
    return description.split(/§nSubraces§r|§nSubclasses§r/)[0].trim();
}

const CACHE_DURATION = 24 * 60 * 60 * 1000;
const GITHUB_TOKEN = import.meta.env.GITHUB_TOKEN;
const MOD_CACHE_PATH = join(process.cwd(), 'src/data/cache/otherworld-origins');

async function getCachedData(): Promise<LangData | null> {
    try {
        const cacheFile = join(MOD_CACHE_PATH, 'lang-data-cache.json');
        const cacheMetaFile = join(MOD_CACHE_PATH, 'lang-data-meta.json');

        const meta = JSON.parse(await readFile(cacheMetaFile, 'utf-8'));
        if (Date.now() - meta.timestamp < CACHE_DURATION) {
            return JSON.parse(await readFile(cacheFile, 'utf-8'));
        }
        return null;
    } catch (error) {
        return null;
    }
}
async function setCachedData(data: LangData): Promise<void> {
    try {
        await mkdir(MOD_CACHE_PATH, { recursive: true });

        await writeFile(
            join(MOD_CACHE_PATH, 'lang-data-cache.json'),
            JSON.stringify(data)
        );
        await writeFile(
            join(MOD_CACHE_PATH, 'lang-data-meta.json'),
            JSON.stringify({ timestamp: Date.now() })
        );
    } catch (error) {
        console.error('Error caching data:', error);
    }
}

async function fetchEnchantmentMappings(): Promise<EnchantmentMapping[]> {
    try {
        const response = await fetch(
            'https://raw.githubusercontent.com/muon-rw/Otherworld-Origins/refs/heads/master/src/main/java/dev/muon/otherworldorigins/restrictions/EnchantmentRestrictions.java',
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch enchantment mappings: ${response.status}`);
        }

        const javaContent = await response.text();

        const staticBlock = javaContent.match(/static\s*{([\s\S]*?)}/)?.[1] || '';

        const mappings: EnchantmentMapping[] = staticBlock
            .split('\n')
            .filter(line => line.includes('ENCHANTMENT_CLASS_MAP.put'))
            .map(line => {
                const match = line.match(/ResourceLocation\("([^"]+)"\),\s*"([^"]+)"/);
                if (!match) return null;
                const [_, fullEnchantment, className] = match;
                const [modId, enchantment] = fullEnchantment.split(':');
                return {
                    enchantment,
                    className,
                    modId
                };
            })
            .filter((mapping): mapping is EnchantmentMapping => mapping !== null);

        return mappings;
    } catch (error) {
        console.error('Error fetching enchantment mappings:', error);
        return [];
    }
}


export async function fetchLangData(): Promise<LangData> {
    try {
        const cachedData = await getCachedData();
        const enchantmentMappings = await fetchEnchantmentMappings();
        if (cachedData) {
            return cachedData;
        }

        let data: RawLangData;

        if (import.meta.env.DEV) {
            try {
                const filePath = join(process.cwd(), 'src/data/otherworld-origins/en_us.json');
                const fileContent = await readFile(filePath, 'utf-8');
                data = JSON.parse(fileContent);
            } catch (error) {
                // Let it fall through to GitHub fetch
            }
        }

        // @ts-ignore
        if (!data) {
            const response = await fetch(
                'https://raw.githubusercontent.com/muon-rw/Otherworld-Origins/refs/heads/master/src/main/resources/assets/otherworldorigins/lang/en_us.json',
                {
                    headers: {
                        'Authorization': `token ${GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    }
                }
            );
            if (!response.ok) {
                throw new Error(`Failed to fetch lang data: ${response.status}`);
            }
            data = await response.json();
        }

        const processed: LangData = {
            races: {} as Record<string, RaceData>,
            classes: {} as Record<string, ClassData>,
            cantrips: {} as Record<string, CantripData>,
            feats: {} as Record<string, FeatData>
        };

        // First pass processing: Primary Objects (Race, Class, Cantrip, Feat)
        Object.entries(data).forEach(([key, value]) => {
            if (key.startsWith('origin.otherworldorigins.race/')) {
                const parts = key.split('/');
                if (parts.length > 1) {
                    const racePart = parts[parts.length - 1];
                    const raceName = racePart.split('.')[0];

                    if (!processed.races[raceName]) {
                        processed.races[raceName] = {
                            name: '',
                            description: '',
                            subraces: {}
                        };
                    }

                    if (key.endsWith('.name')) {
                        processed.races[raceName].name = formatMinecraftText(value);
                    } else if (key.endsWith('.description')) {
                        processed.races[raceName].description = formatMinecraftText(
                            removeSubCategoryList(value)
                        );
                    }
                }
            }

            if (key.startsWith('origin.otherworldorigins.class/')) {
                const parts = key.split('/');
                if (parts.length > 1) {
                    const classPart = parts[parts.length - 1];
                    if (classPart) {
                        const className = classPart.split('.')[0];
                        if (!processed.classes[className]) {
                            processed.classes[className] = {
                                name: value as string,
                                description: data[`origin.otherworldorigins.class/${className}.description`] || '',
                                subclasses: {}
                            };
                        }

                        if (key.endsWith('.name')) {
                            processed.classes[className].name = processText(value as string);
                        } else if (key.endsWith('.description')) {
                            processed.classes[className].description = formatMinecraftText(
                                removeSubCategoryList(value)
                            );
                        }
                    }
                }
            }

            if (key.startsWith('origin.otherworldorigins.cantrips/two/')) {
                const parts = key.split('/');
                if (parts.length > 2) {  // Make sure we have enough parts after splitting
                    const cantripPart = parts[parts.length - 1];
                    const cantripId = cantripPart.split('.')[0];

                    if (!processed.cantrips[cantripId]) {
                        processed.cantrips[cantripId] = {
                            name: '',
                            description: ''
                        };
                    }

                    if (key.endsWith('.name')) {
                        processed.cantrips[cantripId].name = formatMinecraftText(value as string);
                    } else if (key.endsWith('.description')) {
                        processed.cantrips[cantripId].description = formatMinecraftText(value as string);
                    }
                }
            }

            if (key.startsWith('origin.otherworldorigins.feats/')) {
                const parts = key.split('/');
                if (parts.length > 1) {
                    const featPart = parts[parts.length - 1];
                    const featId = featPart.split('.')[0];

                    if (!processed.feats[featId]) {
                        processed.feats[featId] = {
                            name: '',
                            description: ''
                        };
                    }

                    if (key.endsWith('.name')) {
                        processed.feats[featId].name = formatMinecraftText(value as string);
                    } else if (key.endsWith('.description')) {
                        processed.feats[featId].description = formatMinecraftText(value as string);
                    }
                }
            }
        });

        for (const mapping of enchantmentMappings) {
            if (processed.classes[mapping.className]) {
                const enchantName = mapping.enchantment
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');

                const className = mapping.className.charAt(0).toUpperCase() + mapping.className.slice(1);

                let restrictionText = '';
                if (mapping.modId === 'minecraft') {
                    restrictionText = `Only ${className}s can make use of the ${enchantName} enchantment`;
                } else {
                    const modName = mapping.modId.charAt(0).toUpperCase() + mapping.modId.slice(1);
                    restrictionText = `If ${modName} is installed, only ${className}s can make use of the ${enchantName} enchantment`;
                }

                processed.classes[mapping.className].description +=
                    `\n<span class="italic">${restrictionText}</span>`;
            }
        }

        // Second pass: Add subraces and subclasses
        Object.entries(data).forEach(([key, value]) => {
            if (key.startsWith('origin.otherworldorigins.subrace/')) {
                const parts = key.split('/');
                if (parts.length >= 3) {
                    const race = parts[parts.length - 2];
                    const subracePart = parts[parts.length - 1];
                    const subraceName = subracePart.split('.')[0];

                    if (processed.races[race] && !processed.races[race].subraces[subraceName]) {
                        processed.races[race].subraces[subraceName] = {
                            name: '',
                            description: '',
                            powers: []
                        };
                    }

                    if (key.endsWith('.name')) {
                        processed.races[race].subraces[subraceName].name = processText(value as string);
                    } else if (key.endsWith('.description')) {
                        processed.races[race].subraces[subraceName].description = processText(value as string);
                    }
                }
            }

            if (key.startsWith('origin.otherworldorigins.subclass/')) {
                const parts = key.split('/');
                if (parts.length >= 3) {
                    const baseClass = parts[parts.length - 2];
                    const subclassPart = parts[parts.length - 1];
                    const subclassName = subclassPart.split('.')[0];

                    if (processed.classes[baseClass] && !processed.classes[baseClass].subclasses[subclassName]) {
                        processed.classes[baseClass].subclasses[subclassName] = {
                            name: '',
                            description: '',
                            powers: []
                        };
                    }

                    if (key.endsWith('.name')) {
                        processed.classes[baseClass].subclasses[subclassName].name = processText(value as string);
                    } else if (key.endsWith('.description')) {
                        processed.classes[baseClass].subclasses[subclassName].description = processText(value as string);
                    }
                }
            }
        });
        await setCachedData(processed);
        return processed;

    } catch (error) {
        console.error('Error loading lang data:', error);
        const cachedData = await getCachedData();
        if (cachedData) {
            return cachedData;
        }
        return {
            races: {},
            classes: {},
            cantrips: {},
            feats: {}
        };
    }

}