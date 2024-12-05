interface FormattingStyles {
    [key: string]: string;
}

const MINECRAFT_FORMATTING: FormattingStyles = {
    '§0': 'text-black',
    '§1': 'text-dark-blue',
    '§2': 'text-dark-green',
    '§3': 'text-dark-aqua',
    '§4': 'text-dark-red',
    '§5': 'text-dark-purple',
    '§6': 'text-gold',
    '§7': 'text-gray',
    '§8': 'text-dark-gray',
    '§9': 'text-blue',
    '§a': 'text-green',
    '§b': 'text-aqua',
    '§c': 'text-red',
    '§d': 'text-light-purple',
    '§e': 'text-yellow',
    '§f': 'text-white',
    '§l': 'font-bold',
    '§m': 'line-through',
    '§n': 'underline',
    '§o': 'italic',
    '§r': ''
};

export function formatMinecraftText(text: string): string {
    let formattedText = text.replace(/\\n/g, '<br>');

    let currentClasses: string[] = [];

    formattedText = formattedText.replace(/§[0-9a-fk-or]/g, (match) => {
        if (match === '§r') {
            currentClasses = [];
            return '</span>';
        }

        const className = MINECRAFT_FORMATTING[match];
        if (className) {
            currentClasses.push(className);
            return `<span class="${className}">`;
        }
        return '';
    });

    const openSpans = (formattedText.match(/<span/g) || []).length;
    const closeSpans = (formattedText.match(/<\/span>/g) || []).length;
    if (openSpans > closeSpans) {
        formattedText += '</span>'.repeat(openSpans - closeSpans);
    }

    return formattedText;
}